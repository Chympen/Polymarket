import {
    logger,
    getDatabase,
    PerformanceReport,
    ConfidenceCalibrationBucket,
    StrategyPerformance,
} from 'shared-lib';

/**
 * PerformanceTracker — Calculates and records trading performance metrics.
 *
 * Tracks: PnL, Sharpe ratio, drawdown, strategy ROI, trade accuracy,
 * and confidence calibration.
 */
export class PerformanceTracker {
    private readonly log = logger.child({ module: 'PerformanceTracker' });
    private readonly db = getDatabase();

    /**
     * Generate a comprehensive performance report.
     */
    async generateReport(): Promise<PerformanceReport> {
        const [trades, portfolio, decisions, strategyScores] = await Promise.all([
            this.db.trade.findMany({
                where: { status: 'FILLED' },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
            this.db.portfolio.findFirst({ orderBy: { createdAt: 'desc' } }),
            this.db.aiDecision.findMany({
                orderBy: { createdAt: 'desc' },
                take: 500,
            }),
            this.db.strategyScore.findMany({ where: { active: true } }),
        ]);

        // ── PnL Calculations ──
        const totalPnl = portfolio?.totalPnl || 0;
        const dailyPnl = portfolio?.dailyPnl || 0;

        // ── Win Rate ──
        const profitableTrades = trades.filter(
            (t) => t.filledPrice && t.price && t.filledPrice > t.price
        );
        const winRate = trades.length > 0 ? profitableTrades.length / trades.length : 0;

        // ── Sharpe Ratio ──
        const sharpeRatio = this.calculateRollingSharpee(trades);

        // ── Max Drawdown ──
        const maxDrawdown = portfolio?.maxDrawdown || 0;

        // ── Trade Accuracy ──
        const accurateDecisions = decisions.filter((d) => d.approved);
        const tradeAccuracy =
            decisions.length > 0 ? accurateDecisions.length / decisions.length : 0;

        // ── Average Confidence ──
        const avgConfidence =
            decisions.length > 0
                ? decisions.reduce((s, d) => s + d.confidence, 0) / decisions.length
                : 0;

        // ── Confidence Calibration ──
        const calibration = this.calculateConfidenceCalibration(decisions);

        // ── Strategy Breakdown ──
        const strategyBreakdown: StrategyPerformance[] = strategyScores.map((s) => ({
            strategyId: s.strategyId,
            strategyName: s.strategyName,
            pnl: s.totalPnl,
            winRate: s.winRate,
            sharpeRatio: s.sharpeRatio,
            trades: s.totalTrades,
            weight: s.weight,
        }));

        const report: PerformanceReport = {
            totalPnl,
            dailyPnl,
            sharpeRatio,
            maxDrawdown,
            winRate,
            totalTrades: trades.length,
            tradeAccuracy,
            avgConfidence,
            confidenceCalibration: calibration,
            strategyBreakdown,
        };

        // Save daily metric snapshot
        await this.saveMetricSnapshot(report, portfolio?.totalCapital || 0);

        return report;
    }

    /**
     * Calculate confidence calibration — how well confidence predicts success.
     */
    private calculateConfidenceCalibration(
        decisions: { confidence: number; approved: boolean; executedTradeId: string | null }[]
    ): ConfidenceCalibrationBucket[] {
        const buckets: ConfidenceCalibrationBucket[] = [
            { confidenceRange: [0.0, 0.2], predictedRate: 0.1, actualRate: 0, sampleSize: 0 },
            { confidenceRange: [0.2, 0.4], predictedRate: 0.3, actualRate: 0, sampleSize: 0 },
            { confidenceRange: [0.4, 0.6], predictedRate: 0.5, actualRate: 0, sampleSize: 0 },
            { confidenceRange: [0.6, 0.8], predictedRate: 0.7, actualRate: 0, sampleSize: 0 },
            { confidenceRange: [0.8, 1.0], predictedRate: 0.9, actualRate: 0, sampleSize: 0 },
        ];

        for (const decision of decisions) {
            for (const bucket of buckets) {
                if (
                    decision.confidence >= bucket.confidenceRange[0] &&
                    decision.confidence < bucket.confidenceRange[1]
                ) {
                    bucket.sampleSize += 1;
                    if (decision.executedTradeId) {
                        bucket.actualRate += 1;
                    }
                    break;
                }
            }
        }

        // Normalize actual rates
        for (const bucket of buckets) {
            if (bucket.sampleSize > 0) {
                bucket.actualRate = bucket.actualRate / bucket.sampleSize;
            }
        }

        return buckets;
    }

    /**
     * Calculate Sharpe ratio from recent trade returns.
     */
    private calculateRollingSharpee(
        trades: { sizeUsd: number; filledSizeUsd: number | null; filledPrice: number | null; price: number }[]
    ): number {
        const returns = trades
            .filter((t) => t.filledPrice && t.sizeUsd > 0)
            .map((t) => ((t.filledPrice! - t.price) / t.price));

        if (returns.length < 2) return 0;

        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance =
            returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
    }

    /**
     * Save a daily performance metric snapshot.
     */
    private async saveMetricSnapshot(
        report: PerformanceReport,
        portfolioValue: number
    ): Promise<void> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        try {
            await this.db.performanceMetric.upsert({
                where: { metricDate: today },
                create: {
                    metricDate: today,
                    totalPnl: report.totalPnl,
                    dailyPnl: report.dailyPnl,
                    sharpeRatio: report.sharpeRatio,
                    maxDrawdown: report.maxDrawdown,
                    winRate: report.winRate,
                    totalTrades: report.totalTrades,
                    tradeAccuracy: report.tradeAccuracy,
                    avgConfidence: report.avgConfidence,
                    portfolioValue,
                    deployedPercent: portfolioValue > 0 ? report.totalPnl / portfolioValue : 0,
                },
                update: {
                    totalPnl: report.totalPnl,
                    dailyPnl: report.dailyPnl,
                    sharpeRatio: report.sharpeRatio,
                    maxDrawdown: report.maxDrawdown,
                    winRate: report.winRate,
                    totalTrades: report.totalTrades,
                    tradeAccuracy: report.tradeAccuracy,
                    avgConfidence: report.avgConfidence,
                    portfolioValue,
                },
            });
        } catch (error) {
            this.log.warn({ error: (error as Error).message }, 'Failed to save metric snapshot');
        }
    }
}
