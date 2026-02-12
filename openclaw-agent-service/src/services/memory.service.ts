import {
    logger,
    getDatabase,
    getConfig,
} from 'shared-lib';
import OpenAI from 'openai';

/**
 * MemoryService — Case-Based Reasoning / Long-Term Memory (Feature 2)
 *
 * Retrieves similar past market decisions and injects them into the LLM
 * prompt so the agent can "remember" what happened in comparable situations.
 */
export class MemoryService {
    private readonly log = logger.child({ module: 'MemoryService' });
    private readonly db = getDatabase();

    /**
     * Find the most similar past trade outcomes based on keyword matching
     * in the market question. Returns up to `limit` cases.
     */
    async findSimilarCases(
        marketQuestion: string,
        limit: number = 3
    ): Promise<Array<{
        question: string;
        side: string;
        outcome: string;
        reasoning: string;
        lessonsLearned: string | null;
        pnlPercent: number;
    }>> {
        try {
            // Extract keywords from the question
            const keywords = this.extractKeywords(marketQuestion);

            if (keywords.length === 0) return [];

            // Search for resolved outcomes with similar keywords
            const allOutcomes = await this.db.tradeOutcome.findMany({
                where: {
                    outcome: { in: ['WIN', 'LOSS'] },
                    marketQuestion: { not: null },
                },
                orderBy: { createdAt: 'desc' },
                take: 200,
            });

            // Score each outcome by keyword similarity
            const scored = allOutcomes
                .map((o: any) => ({
                    ...o,
                    score: this.calculateSimilarity(keywords, o.marketQuestion || ''),
                }))
                .filter((o: any) => o.score > 0.15) // Minimum similarity threshold
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, limit);

            return scored.map((o: any) => ({
                question: o.marketQuestion || 'Unknown',
                side: o.side,
                outcome: o.outcome,
                reasoning: o.originalReasoning || 'No reasoning recorded.',
                lessonsLearned: o.lessonsLearned,
                pnlPercent: o.pnlPercent,
            }));
        } catch (error) {
            this.log.error({ error: (error as Error).message }, 'Failed to find similar cases');
            return [];
        }
    }

    /**
     * Get active correction notes relevant to the current market.
     */
    async getRelevantCorrections(
        marketQuestion: string,
        strategyId?: string
    ): Promise<Array<{
        correctionRule: string;
        whatWentWrong: string;
        category: string | null;
        severity: string;
    }>> {
        try {
            const corrections = await this.db.correctionNote.findMany({
                where: {
                    active: true,
                    ...(strategyId ? { strategyId } : {}),
                },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });

            const keywords = this.extractKeywords(marketQuestion);

            return corrections
                .map((c: any) => ({
                    ...c,
                    score: this.calculateSimilarity(keywords, c.marketQuestion || ''),
                }))
                .filter((c: any) => c.score > 0.1)
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 5)
                .map((c: any) => ({
                    correctionRule: c.correctionRule,
                    whatWentWrong: c.whatWentWrong,
                    category: c.category,
                    severity: c.severity,
                }));
        } catch (error) {
            this.log.error({ error: (error as Error).message }, 'Failed to fetch corrections');
            return [];
        }
    }

    /**
     * Build a memory context block for injection into LLM prompts.
     */
    async buildMemoryContext(marketQuestion: string, strategyId?: string): Promise<string> {
        const [cases, corrections] = await Promise.all([
            this.findSimilarCases(marketQuestion),
            this.getRelevantCorrections(marketQuestion, strategyId),
        ]);

        let context = '';

        if (cases.length > 0) {
            context += '\n### Historical Memory (Similar Past Trades)\n';
            context += '⚠️ Learn from these past results:\n';
            for (const c of cases) {
                const emoji = c.outcome === 'WIN' ? '✅' : '❌';
                context += `- ${emoji} **"${c.question.slice(0, 60)}..."** → ${c.side} → ${c.outcome} (${(c.pnlPercent * 100).toFixed(1)}%)\n`;
                if (c.lessonsLearned) {
                    context += `  Lesson: ${c.lessonsLearned}\n`;
                }
            }
        }

        if (corrections.length > 0) {
            context += '\n### Active Correction Rules\n';
            context += '🚫 Avoid repeating these mistakes:\n';
            for (const c of corrections) {
                context += `- [${c.severity}] ${c.correctionRule}\n`;
                context += `  Context: ${c.whatWentWrong.slice(0, 100)}\n`;
            }
        }

        // Increment applied count for used corrections
        if (corrections.length > 0) {
            try {
                const correctionIds = corrections.map((c: any) => c.id).filter(Boolean);
                if (correctionIds.length > 0) {
                    await this.db.correctionNote.updateMany({
                        where: { id: { in: correctionIds } },
                        data: { appliedCount: { increment: 1 } },
                    });
                }
            } catch { /* non-critical */ }
        }

        return context;
    }

    /**
     * Extract meaningful keywords from a market question.
     */
    private extractKeywords(text: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'is', 'are', 'was', 'were', 'be',
            'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'this',
            'that', 'these', 'those', 'it', 'its', 'not', 'no', 'yes', 'than',
            'more', 'most', 'very', 'just', 'only', 'also', 'how', 'what',
            'which', 'who', 'whom', 'when', 'where', 'why',
        ]);

        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    /**
     * Calculate keyword-based similarity between a set of keywords and a text.
     */
    private calculateSimilarity(keywords: string[], text: string): number {
        const textWords = new Set(this.extractKeywords(text));
        if (textWords.size === 0 || keywords.length === 0) return 0;

        let matchCount = 0;
        for (const kw of keywords) {
            for (const tw of textWords) {
                if (tw.includes(kw) || kw.includes(tw)) {
                    matchCount++;
                    break;
                }
            }
        }

        return matchCount / Math.max(keywords.length, textWords.size);
    }

    /**
     * Get stats for the dashboard.
     */
    async getMemoryStats(): Promise<{
        totalCases: number;
        totalCorrections: number;
        activeCorrections: number;
        topCategories: Array<{ category: string; count: number }>;
        recentCorrections: any[];
    }> {
        const [outcomes, corrections, activeCorrections] = await Promise.all([
            this.db.tradeOutcome.count({ where: { outcome: { in: ['WIN', 'LOSS'] } } }),
            this.db.correctionNote.count(),
            this.db.correctionNote.findMany({
                where: { active: true },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
        ]);

        // Count by category
        const categoryMap = new Map<string, number>();
        for (const c of activeCorrections) {
            const cat = (c as any).category || 'UNCATEGORIZED';
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        }

        return {
            totalCases: outcomes,
            totalCorrections: corrections,
            activeCorrections: activeCorrections.length,
            topCategories: Array.from(categoryMap.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count),
            recentCorrections: activeCorrections,
        };
    }
}
