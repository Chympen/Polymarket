import OpenAI from 'openai';
import {
    logger,
    getConfig,
    getDatabase,
    AIDecisionInput,
    AIDecisionOutput,
} from 'shared-lib';

import { MemoryService } from '../services/memory.service';

/**
 * LLM Decision Engine — AI-powered trading brain.
 *
 * Uses GPT-4 to analyze market conditions and produce trade signals.
 * Implements:
 *  - Structured prompt templates
 *  - JSON output parsing
 *  - Confidence gating
 *  - Decision logging with latency tracking
 *  - Memory injection (RAG) for learning from past mistakes
 */
export class DecisionEngine {
    private readonly log = logger.child({ module: 'DecisionEngine' });
    private readonly db = getDatabase();
    private openai: OpenAI | null = null;
    private memory: MemoryService;

    constructor() {
        const config = getConfig();
        if (config.OPENAI_API_KEY || config.LLM_BASE_URL) {
            this.openai = new OpenAI({
                apiKey: config.OPENAI_API_KEY || 'ollama',
                baseURL: config.LLM_BASE_URL,
            });
        }
        this.memory = new MemoryService();
    }

    /**
     * Analyze a market using LLM and produce a trade decision.
     */
    async analyze(input: AIDecisionInput): Promise<AIDecisionOutput> {
        const config = getConfig();

        // Retrieve long-term memory / corruption notes
        const memoryContext = await this.memory.buildMemoryContext(
            input.marketSnapshot.question,
            input.strategyContext.strategyId
        );

        // Build the prompt with memory injection
        const prompt = this.buildPrompt(input, memoryContext);

        // If no LLM configured, use fallback heuristic
        if (!this.openai) {
            this.log.warn('No LLM configured — using heuristic fallback');
            return this.heuristicFallback(input);
        }

        const startTime = Date.now();

        try {
            const response = await this.openai.chat.completions.create({
                model: config.LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: this.getSystemPrompt(),
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.3,
                max_tokens: 500,
                response_format: { type: 'json_object' },
            });

            const latencyMs = Date.now() - startTime;
            const content = response.choices[0]?.message?.content;

            if (!content) {
                throw new Error('Empty LLM response');
            }

            const decision = this.parseDecision(content);

            // Log the decision
            await this.logDecision(input, decision, prompt, config.LLM_MODEL, latencyMs);

            this.log.info(
                {
                    market: input.marketSnapshot.question.slice(0, 50),
                    trade: decision.trade,
                    side: decision.side,
                    confidence: decision.confidence.toFixed(3),
                    latencyMs,
                    memoryUsed: !!memoryContext
                },
                'LLM decision made'
            );

            return decision;
        } catch (error) {
            const latencyMs = Date.now() - startTime;
            this.log.error(
                { error: (error as Error).message, latencyMs },
                'LLM decision failed — falling back to heuristic'
            );
            return this.heuristicFallback(input);
        }
    }

    /**
     * System prompt defining the AI's role and output format.
     */
    private getSystemPrompt(): string {
        return `You are an expert quantitative prediction market trader. You analyze market data and produce precise trading decisions.

Your output MUST be valid JSON with this exact structure:
{
  "trade": boolean,
  "side": "YES" or "NO",
  "confidence": number between 0.0 and 1.0,
  "position_size_usd": number (suggested position size in USD),
  "reasoning": "concise explanation of your decision"
}

Decision framework:
1. ANALYZE the market question, current prices, and implied probabilities
2. EVALUATE recent price action for momentum or reversion signals
3. ASSESS volume and liquidity for execution feasibility
4. CONSIDER external signals (news, sentiment) for information edge
5. EXAMINE portfolio state for concentration risk
6. CONSULT MEMORY (past similar trades/mistakes) to avoid repeating errors
7. DECIDE whether to trade, which side, and with what confidence

Key rules:
- Only trade when you have a clear edge (confidence > 0.55)
- Factor in slippage and fees (~2-5% round trip in prediction markets)
- Consider the time to market resolution
- Be skeptical of extreme moves without fundamental catalysts
- Size positions proportional to confidence (Kelly-inspired)
- NEVER trade if the market is illiquid (< $1000 liquidity)
- NEVER chase prices at extremes (>0.92 or <0.08)`;
    }

    /**
     * Build the analysis prompt from input data.
     */
    private buildPrompt(input: AIDecisionInput, memoryContext: string): string {
        const { marketSnapshot, recentPriceAction, portfolioState, externalSignals, strategyContext } = input;

        let prompt = `## Market Analysis Request

### Market
- **Question**: ${marketSnapshot.question}
- **YES Price**: ${marketSnapshot.priceYes.toFixed(3)}
- **NO Price**: ${marketSnapshot.priceNo.toFixed(3)}
- **Spread**: ${(marketSnapshot.spread * 100).toFixed(1)}%
- **24h Volume**: $${marketSnapshot.volume24h.toFixed(0)}
- **Liquidity**: $${marketSnapshot.liquidity.toFixed(0)}
- **End Date**: ${marketSnapshot.endDate || 'N/A'}

### Recent Price Action (last ${recentPriceAction.length} periods)
`;

        // Add price action summary
        if (recentPriceAction.length > 0) {
            const first = recentPriceAction[0];
            const last = recentPriceAction[recentPriceAction.length - 1];
            const priceChange = last.priceYes - first.priceYes;

            prompt += `- Price change: ${priceChange > 0 ? '+' : ''}${(priceChange * 100).toFixed(1)}%\n`;
            prompt += `- Start: ${first.priceYes.toFixed(3)} → End: ${last.priceYes.toFixed(3)}\n`;
            prompt += `- Avg volume: $${(recentPriceAction.reduce((s, p) => s + p.volume, 0) / recentPriceAction.length).toFixed(0)}\n`;
        }

        // Add portfolio context
        prompt += `
### Portfolio State
- Total Capital: $${portfolioState.totalCapital.toFixed(2)}
- Available: $${portfolioState.availableCapital.toFixed(2)}
- Deployed: $${portfolioState.deployedCapital.toFixed(2)} (${((portfolioState.deployedCapital / portfolioState.totalCapital) * 100).toFixed(1)}%)
- Daily PnL: $${portfolioState.dailyPnl.toFixed(2)} (${(portfolioState.dailyPnlPercent * 100).toFixed(2)}%)
- Open Positions: ${portfolioState.positions.length}
`;

        // Add external signals
        if (externalSignals.length > 0) {
            prompt += `\n### External Signals\n`;
            for (const signal of externalSignals.slice(0, 5)) {
                prompt += `- [${signal.source}] Sentiment: ${signal.sentiment > 0 ? '+' : ''}${signal.sentiment.toFixed(2)} (conf: ${signal.confidence.toFixed(2)}): ${signal.signal}\n`;
            }
        }

        // Add strategy context
        prompt += `
### Strategy Context
- Strategy: ${strategyContext.strategyName}
- Historical Accuracy: ${(strategyContext.historicalAccuracy * 100).toFixed(1)}%
- Current Weight: ${strategyContext.currentWeight.toFixed(2)}
`;

        // Add injected memory context
        if (memoryContext) {
            prompt += `
${memoryContext}
`;
        }

        prompt += `
Provide your trading decision as JSON.`;

        return prompt;
    }

    /**
     * Parse the LLM response into an AIDecisionOutput.
     */
    private parseDecision(content: string): AIDecisionOutput {
        try {
            const parsed = JSON.parse(content);

            return {
                trade: Boolean(parsed.trade),
                side: parsed.side === 'NO' ? 'NO' : 'YES',
                confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
                positionSizeUsd: Math.max(0, Number(parsed.position_size_usd) || 0),
                reasoning: String(parsed.reasoning || 'No reasoning provided'),
            };
        } catch (_error) {
            this.log.warn({ content: content.slice(0, 200) }, 'Failed to parse LLM response');
            return {
                trade: false,
                side: 'YES',
                confidence: 0,
                positionSizeUsd: 0,
                reasoning: 'Failed to parse LLM response',
            };
        }
    }

    /**
     * Heuristic fallback when LLM is not available.
     */
    private heuristicFallback(input: AIDecisionInput): AIDecisionOutput {
        const { marketSnapshot, recentPriceAction } = input;

        // Simple momentum heuristic
        if (recentPriceAction.length < 5) {
            return { trade: false, side: 'YES', confidence: 0, positionSizeUsd: 0, reasoning: 'Insufficient data' };
        }

        const first = recentPriceAction[0];
        const last = recentPriceAction[recentPriceAction.length - 1];
        const change = last.priceYes - first.priceYes;

        if (Math.abs(change) < 0.02) {
            return { trade: false, side: 'YES', confidence: 0, positionSizeUsd: 0, reasoning: 'Insufficient price movement' };
        }

        const side: 'YES' | 'NO' = change > 0 ? 'YES' : 'NO';
        const confidence = Math.min(0.7, 0.5 + Math.abs(change) * 3);
        const sizeUsd = input.portfolioState.totalCapital * 0.01 * confidence;

        return {
            trade: true,
            side,
            confidence,
            positionSizeUsd: sizeUsd,
            reasoning: `Heuristic: ${(change * 100).toFixed(1)}% price change in ${side} direction. Liquidity: $${marketSnapshot.liquidity.toFixed(0)}.`,
        };
    }

    /**
     * Log AI decision to database for auditing and self-reflection.
     */
    private async logDecision(
        input: AIDecisionInput,
        decision: AIDecisionOutput,
        prompt: string,
        model: string,
        latencyMs: number
    ): Promise<void> {
        try {
            await this.db.aiDecision.create({
                data: {
                    marketId: input.marketSnapshot.conditionId,
                    strategyId: input.strategyContext.strategyId,
                    trade: decision.trade,
                    side: decision.side,
                    confidence: decision.confidence,
                    positionSizeUsd: decision.positionSizeUsd,
                    reasoning: decision.reasoning,
                    inputSnapshot: {
                        priceYes: input.marketSnapshot.priceYes,
                        priceNo: input.marketSnapshot.priceNo,
                        volume24h: input.marketSnapshot.volume24h,
                        liquidity: input.marketSnapshot.liquidity,
                    },
                    promptUsed: prompt.slice(0, 2000),
                    llmModel: model,
                    llmLatencyMs: latencyMs,
                },
            });
        } catch (error) {
            this.log.warn({ error: (error as Error).message }, 'Failed to log AI decision');
        }
    }
}
