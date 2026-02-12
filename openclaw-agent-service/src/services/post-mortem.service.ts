import {
    logger,
    getDatabase,
    getConfig,
    logActivity,
} from 'shared-lib';
import OpenAI from 'openai';

/**
 * PostMortemService — Automated Loss Post-Mortem (Feature 4)
 *
 * When a trade results in a significant loss, this service uses the LLM
 * to analyze what went wrong, and generates "Correction Notes" that are
 * injected into future trade decisions to prevent repeating mistakes.
 */
export class PostMortemService {
    private readonly log = logger.child({ module: 'PostMortemService' });
    private readonly db = getDatabase();
    private openai: OpenAI | null = null;

    constructor() {
        const config = getConfig();
        if (config.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
        }
    }

    /**
     * Run post-mortem analysis on recent losing trades.
     */
    async analyzeRecentLosses(): Promise<number> {
        let analyzed = 0;

        try {
            // Find losses that don't have correction notes yet
            const losses = await this.db.tradeOutcome.findMany({
                where: {
                    outcome: 'LOSS',
                    pnlPercent: { lt: -0.05 }, // Only losses > 5%
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
            });

            // Get existing correction note trade outcome IDs
            const existingNotes = await this.db.correctionNote.findMany({
                select: { tradeOutcomeId: true },
            });
            const existingIds = new Set(existingNotes.map((n: { tradeOutcomeId: string }) => n.tradeOutcomeId));

            for (const loss of losses) {
                if (existingIds.has(loss.id)) continue;

                const note = await this.generatePostMortem(loss);
                if (note) {
                    await this.db.correctionNote.create({ data: note });
                    analyzed++;

                    await logActivity(
                        'WARN',
                        'ANALYSIS',
                        `Post-mortem generated for "${(loss.marketQuestion || 'Unknown').slice(0, 40)}..."`,
                        {
                            category: note.category,
                            pnlPercent: (loss.pnlPercent * 100).toFixed(1) + '%',
                        }
                    );
                }
            }

            if (analyzed > 0) {
                this.log.info({ count: analyzed }, 'Post-mortem analyses completed');
            }
        } catch (error) {
            this.log.error({ error: (error as Error).message }, 'Post-mortem analysis failed');
        }

        return analyzed;
    }

    /**
     * Generate a post-mortem for a specific losing trade.
     */
    private async generatePostMortem(loss: any): Promise<{
        tradeOutcomeId: string;
        marketQuestion: string;
        originalReasoning: string;
        whatWentWrong: string;
        correctionRule: string;
        severity: string;
        strategyId: string;
        category: string;
    } | null> {
        const marketQuestion = loss.marketQuestion || 'Unknown market';
        const reasoning = loss.originalReasoning || 'No reasoning recorded';

        // If LLM is available, use it for analysis
        if (this.openai) {
            try {
                const config = getConfig();
                const response = await this.openai.chat.completions.create({
                    model: config.LLM_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a trading post-mortem analyst. Analyze losing trades to determine what went wrong and create correction rules. Output JSON:
{
  "what_went_wrong": "concise explanation of the failure",
  "correction_rule": "specific rule to prevent this in the future",
  "category": "one of: OVERCONFIDENCE | BAD_TIMING | IGNORED_RISK | SENTIMENT_BIAS | LIQUIDITY_TRAP | TREND_REVERSAL | CORRELATION_MISS",
  "severity": "LOW | MEDIUM | HIGH"
}`,
                        },
                        {
                            role: 'user',
                            content: `Analyze this losing trade:
- Market: "${marketQuestion}"
- Side: ${loss.side}
- Entry Price: ${loss.entryPrice.toFixed(3)}
- Exit Price: ${loss.exitPrice?.toFixed(3) || 'N/A'}
- P&L: ${(loss.pnlPercent * 100).toFixed(1)}%
- Original Reasoning: ${reasoning}
- Strategy: ${loss.strategyId}

What went wrong and how should we avoid this in the future?`,
                        },
                    ],
                    temperature: 0.4,
                    max_tokens: 300,
                    response_format: { type: 'json_object' },
                });

                const content = response.choices[0]?.message?.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    return {
                        tradeOutcomeId: loss.id,
                        marketQuestion,
                        originalReasoning: reasoning,
                        whatWentWrong: parsed.what_went_wrong || 'Analysis failed',
                        correctionRule: parsed.correction_rule || 'Review trade criteria',
                        severity: parsed.severity || 'MEDIUM',
                        strategyId: loss.strategyId,
                        category: parsed.category || 'OVERCONFIDENCE',
                    };
                }
            } catch (error) {
                this.log.warn({ error: (error as Error).message }, 'LLM post-mortem failed, using heuristic');
            }
        }

        // Heuristic fallback
        const category = this.classifyLossHeuristic(loss);
        return {
            tradeOutcomeId: loss.id,
            marketQuestion,
            originalReasoning: reasoning,
            whatWentWrong: `Trade lost ${(Math.abs(loss.pnlPercent) * 100).toFixed(1)}%. Entry at ${loss.entryPrice.toFixed(3)}, exit at ${loss.exitPrice?.toFixed(3) || 'unresolved'}.`,
            correctionRule: this.getCorrectionRuleForCategory(category),
            severity: Math.abs(loss.pnlPercent) > 0.15 ? 'HIGH' : 'MEDIUM',
            strategyId: loss.strategyId,
            category,
        };
    }

    /**
     * Classify loss using heuristics when LLM is unavailable.
     */
    private classifyLossHeuristic(loss: any): string {
        if (Math.abs(loss.pnlPercent) > 0.20) return 'IGNORED_RISK';
        if (loss.entryPrice > 0.85 || loss.entryPrice < 0.15) return 'BAD_TIMING';
        return 'OVERCONFIDENCE';
    }

    /**
     * Get a correction rule for a given category.
     */
    private getCorrectionRuleForCategory(category: string): string {
        const rules: Record<string, string> = {
            OVERCONFIDENCE: 'Reduce position size when confidence exceeds 80%. Verify signals from multiple sources.',
            BAD_TIMING: 'Avoid entering positions at extreme prices (>0.85 or <0.15). Wait for pullbacks.',
            IGNORED_RISK: 'Always check correlation with existing positions. Use stop-losses.',
            SENTIMENT_BIAS: 'Cross-verify sentiment signals with price action. Discount single-source sentiment.',
            LIQUIDITY_TRAP: 'Skip markets with liquidity below $5,000. Check order book depth.',
            TREND_REVERSAL: 'Use shorter lookback periods in volatile markets. Add trend-reversal detection.',
            CORRELATION_MISS: 'Check cluster exposure before entering. Reduce size for correlated positions.',
        };
        return rules[category] || 'Review trade criteria and confirmation signals.';
    }

    /**
     * Get post-mortem stats for dashboard.
     */
    async getPostMortemStats(): Promise<{
        totalNotes: number;
        activeNotes: number;
        byCategory: Array<{ category: string; count: number }>;
        bySeverity: Array<{ severity: string; count: number }>;
        recentNotes: any[];
    }> {
        const [totalNotes, notes] = await Promise.all([
            this.db.correctionNote.count(),
            this.db.correctionNote.findMany({
                where: { active: true },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
        ]);

        const categoryMap = new Map<string, number>();
        const severityMap = new Map<string, number>();

        for (const note of notes) {
            const cat = (note as any).category || 'UNKNOWN';
            const sev = (note as any).severity || 'MEDIUM';
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
            severityMap.set(sev, (severityMap.get(sev) || 0) + 1);
        }

        return {
            totalNotes,
            activeNotes: notes.length,
            byCategory: Array.from(categoryMap.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count),
            bySeverity: Array.from(severityMap.entries())
                .map(([severity, count]) => ({ severity, count })),
            recentNotes: notes.slice(0, 10),
        };
    }
}
