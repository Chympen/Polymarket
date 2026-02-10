import { logger, getDatabase } from 'shared-lib';

/**
 * VolatilityAdjuster — Adjusts position sizes based on market volatility.
 * Uses recent price history standard deviation to scale positions.
 *
 * High volatility → smaller positions, low volatility → normal positions.
 * Purely mechanical — no AI.
 */
export class VolatilityAdjuster {
    private readonly log = logger.child({ module: 'VolatilityAdjuster' });
    private readonly db = getDatabase();

    // Volatility cache to avoid repeated DB queries
    private cache = new Map<string, { adjustment: number; expiresAt: number }>();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Returns a sizing multiplier based on volatility.
     * Range: 0.3 (very high vol) to 1.0 (low vol).
     */
    async getAdjustment(marketId: string): Promise<number> {
        // Check cache
        const cached = this.cache.get(marketId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.adjustment;
        }

        const volatility = await this.calculateVolatility(marketId);
        const adjustment = this.volatilityToMultiplier(volatility);

        // Cache the result
        this.cache.set(marketId, {
            adjustment,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
        });

        this.log.debug(
            { marketId, volatility: volatility.toFixed(4), adjustment: adjustment.toFixed(3) },
            'Volatility adjustment calculated'
        );

        return adjustment;
    }

    /**
     * Calculate price volatility as standard deviation of recent price changes.
     */
    private async calculateVolatility(marketId: string): Promise<number> {
        // Get recent trades for this market to estimate volatility
        const recentTrades = await this.db.trade.findMany({
            where: {
                marketId,
                status: 'FILLED',
                filledPrice: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { filledPrice: true },
        });

        if (recentTrades.length < 5) {
            // Not enough data — return neutral
            return 0.05;
        }

        const prices = recentTrades
            .map((t) => t.filledPrice!)
            .filter((p) => p > 0);

        // Calculate returns
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }

        // Standard deviation of returns
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance =
            returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        return stdDev;
    }

    /**
     * Map volatility to a position size multiplier.
     *
     * vol < 0.02  → 1.0 (normal)
     * vol 0.02-0.05 → 0.8
     * vol 0.05-0.10 → 0.6
     * vol 0.10-0.20 → 0.4
     * vol > 0.20  → 0.3 (minimum)
     */
    private volatilityToMultiplier(volatility: number): number {
        if (volatility < 0.02) return 1.0;
        if (volatility < 0.05) return 0.8;
        if (volatility < 0.10) return 0.6;
        if (volatility < 0.20) return 0.4;
        return 0.3;
    }

    /**
     * Clear the volatility cache.
     */
    clearCache(): void {
        this.cache.clear();
    }
}
