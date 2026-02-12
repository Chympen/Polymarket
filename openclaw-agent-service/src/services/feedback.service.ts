import {
    logger,
    getDatabase,
    logActivity,
} from 'shared-lib';

/**
 * FeedbackService — Dynamic Performance Feedback Loop (Feature 1)
 *
 * Monitors trade outcomes and automatically updates Bayesian priors
 * for each strategy based on real P&L results. This closes the
 * feedback loop that was previously missing.
 */
export class FeedbackService {
    private readonly log = logger.child({ module: 'FeedbackService' });
    private readonly db = getDatabase();

    /**
     * Process all pending trade outcomes and update strategy weights.
     * Called after each trading cycle and when markets resolve.
     */
    async processOutcomes(): Promise<{ processed: number; wins: number; losses: number }> {
        this.log.info('Processing trade outcomes for feedback loop...');
        let processed = 0;
        let wins = 0;
        let losses = 0;

        try {
            // Find filled trades that don't yet have a TradeOutcome record
            const filledTrades = await this.db.trade.findMany({
                where: {
                    status: 'FILLED',
                    NOT: {
                        id: {
                            in: (await this.db.tradeOutcome.findMany({ select: { tradeId: true } }))
                                .map((o: { tradeId: string }) => o.tradeId),
                        },
                    },
                },
                include: { market: true },
                take: 50,
            });

            for (const trade of filledTrades) {
                await this.db.tradeOutcome.create({
                    data: {
                        tradeId: trade.id,
                        marketId: trade.marketId,
                        strategyId: trade.strategyId || 'unknown',
                        side: trade.side,
                        entryPrice: trade.price,
                        exitPrice: trade.filledPrice,
                        pnlUsd: (trade.filledPrice || trade.price) - trade.price,
                        pnlPercent: trade.price > 0
                            ? ((trade.filledPrice || trade.price) - trade.price) / trade.price
                            : 0,
                        outcome: 'PENDING',
                        originalReasoning: trade.reasoning,
                        marketQuestion: trade.market?.question,
                    },
                });
            }

            // Evaluate pending outcomes for resolved markets
            const pendingOutcomes = await this.db.tradeOutcome.findMany({
                where: { outcome: 'PENDING' },
            });

            for (const outcome of pendingOutcomes) {
                const market = await this.db.market.findFirst({
                    where: { id: outcome.marketId },
                });

                if (!market) continue;

                // Check if market is resolved
                if (market.resolved && market.resolutionOutcome) {
                    const won = (outcome.side === market.resolutionOutcome);
                    const pnl = won ? outcome.entryPrice * 0.95 : -outcome.entryPrice; // ~5% fee
                    const result = won ? 'WIN' : 'LOSS';

                    await this.db.tradeOutcome.update({
                        where: { id: outcome.id },
                        data: {
                            outcome: result,
                            exitPrice: won ? 1.0 : 0.0,
                            pnlUsd: pnl,
                            pnlPercent: outcome.entryPrice > 0 ? pnl / outcome.entryPrice : 0,
                            resolvedAt: new Date(),
                        },
                    });

                    // Update strategy scores
                    await this.updateStrategyFromOutcome(outcome.strategyId, result, pnl);

                    processed++;
                    if (result === 'WIN') wins++;
                    else losses++;

                    this.log.info({
                        tradeId: outcome.tradeId,
                        strategyId: outcome.strategyId,
                        result,
                        pnl: pnl.toFixed(2),
                    }, `Trade outcome processed: ${result}`);
                }
                // Also check for P&L-based stop-loss outcomes (unrealized)
                else if (!market.resolved) {
                    const currentPrice = outcome.side === 'YES' ? market.priceYes : market.priceNo;
                    const entryPrice = outcome.entryPrice;
                    const unrealizedPnl = currentPrice - entryPrice;
                    const unrealizedPnlPct = entryPrice > 0 ? unrealizedPnl / entryPrice : 0;

                    // If drawdown exceeds 15%, mark as a loss for learning
                    if (unrealizedPnlPct < -0.15) {
                        await this.db.tradeOutcome.update({
                            where: { id: outcome.id },
                            data: {
                                outcome: 'LOSS',
                                exitPrice: currentPrice,
                                pnlUsd: unrealizedPnl,
                                pnlPercent: unrealizedPnlPct,
                                resolvedAt: new Date(),
                                lessonsLearned: `Stop-loss triggered at ${(unrealizedPnlPct * 100).toFixed(1)}% drawdown`,
                            },
                        });

                        await this.updateStrategyFromOutcome(outcome.strategyId, 'LOSS', unrealizedPnl);
                        processed++;
                        losses++;
                    }
                }
            }

            if (processed > 0) {
                await logActivity(
                    'INFO',
                    'SYSTEM',
                    `Feedback loop processed ${processed} outcomes: ${wins} wins, ${losses} losses`,
                    { processed, wins, losses }
                );
            }
        } catch (error) {
            this.log.error({ error: (error as Error).message }, 'Feedback processing failed');
        }

        return { processed, wins, losses };
    }

    /**
     * Update strategy scores based on trade outcome.
     */
    private async updateStrategyFromOutcome(
        strategyId: string,
        result: string,
        pnlUsd: number
    ): Promise<void> {
        const existing = await this.db.strategyScore.findFirst({
            where: { strategyId },
        });

        if (existing) {
            const newTotalTrades = existing.totalTrades + 1;
            const newWins = existing.winRate * existing.totalTrades + (result === 'WIN' ? 1 : 0);
            const newWinRate = newTotalTrades > 0 ? newWins / newTotalTrades : 0;
            const newPnl = existing.totalPnl + pnlUsd;

            // Adaptive weight: EMA with decay toward performance
            const performanceFactor = result === 'WIN' ? 1.05 : 0.92;
            const newWeight = Math.max(0.1, Math.min(2.0, existing.weight * performanceFactor));

            await this.db.strategyScore.update({
                where: { id: existing.id },
                data: {
                    totalTrades: newTotalTrades,
                    winRate: newWinRate,
                    totalPnl: newPnl,
                    weight: newWeight,
                    scoredAt: new Date(),
                },
            });

            this.log.info({
                strategyId,
                result,
                oldWeight: existing.weight.toFixed(3),
                newWeight: newWeight.toFixed(3),
                winRate: newWinRate.toFixed(3),
            }, 'Strategy weight updated via feedback loop');
        }
    }

    /**
     * Get feedback summary for dashboard display.
     */
    async getFeedbackSummary(): Promise<{
        totalOutcomes: number;
        wins: number;
        losses: number;
        pending: number;
        recentOutcomes: any[];
        strategyPerformance: any[];
    }> {
        const [outcomes, strategies] = await Promise.all([
            this.db.tradeOutcome.findMany({
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            this.db.strategyScore.findMany({
                where: { active: true },
                orderBy: { weight: 'desc' },
            }),
        ]);

        const wins = outcomes.filter((o: { outcome: string }) => o.outcome === 'WIN').length;
        const losses = outcomes.filter((o: { outcome: string }) => o.outcome === 'LOSS').length;
        const pending = outcomes.filter((o: { outcome: string }) => o.outcome === 'PENDING').length;

        return {
            totalOutcomes: outcomes.length,
            wins,
            losses,
            pending,
            recentOutcomes: outcomes.slice(0, 20),
            strategyPerformance: strategies.map((s: any) => ({
                strategyId: s.strategyId,
                strategyName: s.strategyName,
                weight: s.weight,
                winRate: s.winRate,
                totalTrades: s.totalTrades,
                totalPnl: s.totalPnl,
            })),
        };
    }
}
