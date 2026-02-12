import {
    logger,
    getDatabase,
    MarketSnapshot,
    STRATEGY_IDS,
    logActivity,
} from 'shared-lib';

export interface RegimeState {
    regime: string;
    confidence: number;
    avgVolatility: number;
    avgTrendStrength: number;
    avgLiquidity: number;
    strategyMultipliers: Record<string, number>;
}

/**
 * RegimeDetector — Market Regime Detection (Feature 3)
 *
 * Analyzes the overall market environment to detect regimes like
 * trending, mean-reverting, volatile, or low-liquidity periods.
 * Outputs strategy weight multipliers to adapt the agent's behavior.
 */
export class RegimeDetector {
    private readonly log = logger.child({ module: 'RegimeDetector' });
    private readonly db = getDatabase();
    private currentRegime: RegimeState | null = null;

    /**
     * Detect the current market regime from a set of market snapshots.
     */
    async detectRegime(markets: MarketSnapshot[]): Promise<RegimeState> {
        if (markets.length === 0) {
            return this.defaultRegime();
        }

        // ── Calculate aggregate market metrics ──
        const metrics = markets.map(m => this.computeMarketMetrics(m));

        const avgVolatility = metrics.reduce((s, m) => s + m.volatility, 0) / metrics.length;
        const avgTrendStrength = metrics.reduce((s, m) => s + m.trendStrength, 0) / metrics.length;
        const avgLiquidity = metrics.reduce((s, m) => s + m.liquidity, 0) / metrics.length;
        const avgSpread = metrics.reduce((s, m) => s + m.spread, 0) / metrics.length;

        // ── Classify regime ──
        let regime: string;
        let confidence: number;

        if (avgLiquidity < 5000) {
            regime = 'LOW_LIQUIDITY';
            confidence = 0.8;
        } else if (avgVolatility > 0.08 && avgTrendStrength > 0.6) {
            regime = 'VOLATILE_TREND';
            confidence = Math.min(0.9, avgTrendStrength);
        } else if (avgVolatility > 0.08 && avgTrendStrength < 0.4) {
            regime = 'MEAN_REVERTING';
            confidence = 0.7;
        } else if (avgTrendStrength > 0.5) {
            regime = 'HIGH_MOMENTUM';
            confidence = Math.min(0.85, avgTrendStrength);
        } else {
            regime = 'STABLE_RANGE';
            confidence = 0.6;
        }

        // ── Determine strategy multipliers ──
        const multipliers = this.getStrategyMultipliers(regime);

        const state: RegimeState = {
            regime,
            confidence,
            avgVolatility,
            avgTrendStrength,
            avgLiquidity,
            strategyMultipliers: multipliers,
        };

        this.currentRegime = state;

        // ── Persist snapshot ──
        try {
            await this.db.marketRegimeSnapshot.create({
                data: {
                    regime,
                    confidence,
                    avgVolatility,
                    avgTrendStrength,
                    avgLiquidity,
                    marketsSampled: markets.length,
                    strategyMultipliers: multipliers,
                    details: {
                        avgSpread,
                        topMarkets: markets.slice(0, 5).map(m => ({
                            question: m.question.slice(0, 50),
                            volume: m.volume24h,
                        })),
                    },
                },
            });

            await logActivity(
                'INFO',
                'ANALYSIS',
                `Market regime detected: ${regime} (${(confidence * 100).toFixed(0)}% confidence)`,
                { regime, multipliers }
            );
        } catch (error) {
            this.log.warn({ error: (error as Error).message }, 'Failed to save regime snapshot');
        }

        this.log.info({
            regime,
            confidence: confidence.toFixed(2),
            avgVolatility: avgVolatility.toFixed(4),
            avgTrendStrength: avgTrendStrength.toFixed(3),
            avgLiquidity: avgLiquidity.toFixed(0),
            multipliers,
        }, 'Market regime detected');

        return state;
    }

    /**
     * Get the current regime or detect a new one.
     */
    getCurrentRegime(): RegimeState | null {
        return this.currentRegime;
    }

    /**
     * Compute volatility and trend metrics for a single market.
     */
    private computeMarketMetrics(market: MarketSnapshot): {
        volatility: number;
        trendStrength: number;
        liquidity: number;
        spread: number;
    } {
        const history = market.priceHistory || [];

        if (history.length < 5) {
            return {
                volatility: 0.03,
                trendStrength: 0.3,
                liquidity: market.liquidity,
                spread: market.spread,
            };
        }

        // Volatility: standard deviation of returns
        const prices = history.map((h: any) => h.priceYes || 0.5);
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i - 1] > 0) {
                returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
            }
        }

        const meanReturn = returns.length > 0
            ? returns.reduce((s, r) => s + r, 0) / returns.length
            : 0;
        const variance = returns.length > 0
            ? returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / returns.length
            : 0;
        const volatility = Math.sqrt(variance);

        // Trend Strength: directional consistency (ADX-like)
        let upMoves = 0;
        let downMoves = 0;
        for (const r of returns) {
            if (r > 0) upMoves++;
            else if (r < 0) downMoves++;
        }
        const totalMoves = upMoves + downMoves;
        const trendStrength = totalMoves > 0
            ? Math.abs(upMoves - downMoves) / totalMoves
            : 0;

        return {
            volatility,
            trendStrength,
            liquidity: market.liquidity,
            spread: market.spread,
        };
    }

    /**
     * Map regime to strategy weight multipliers.
     */
    private getStrategyMultipliers(regime: string): Record<string, number> {
        switch (regime) {
            case 'VOLATILE_TREND':
                return {
                    [STRATEGY_IDS.MOMENTUM]: 1.5,
                    [STRATEGY_IDS.MEAN_REVERSION]: 0.5,
                    [STRATEGY_IDS.ARBITRAGE]: 0.8,
                    [STRATEGY_IDS.SENTIMENT]: 1.2,
                    [STRATEGY_IDS.PORTFOLIO_OPTIMIZATION]: 1.0,
                };
            case 'HIGH_MOMENTUM':
                return {
                    [STRATEGY_IDS.MOMENTUM]: 1.8,
                    [STRATEGY_IDS.MEAN_REVERSION]: 0.4,
                    [STRATEGY_IDS.ARBITRAGE]: 0.7,
                    [STRATEGY_IDS.SENTIMENT]: 1.3,
                    [STRATEGY_IDS.PORTFOLIO_OPTIMIZATION]: 0.9,
                };
            case 'MEAN_REVERTING':
                return {
                    [STRATEGY_IDS.MOMENTUM]: 0.4,
                    [STRATEGY_IDS.MEAN_REVERSION]: 1.8,
                    [STRATEGY_IDS.ARBITRAGE]: 1.3,
                    [STRATEGY_IDS.SENTIMENT]: 0.8,
                    [STRATEGY_IDS.PORTFOLIO_OPTIMIZATION]: 1.1,
                };
            case 'LOW_LIQUIDITY':
                return {
                    [STRATEGY_IDS.MOMENTUM]: 0.3,
                    [STRATEGY_IDS.MEAN_REVERSION]: 0.5,
                    [STRATEGY_IDS.ARBITRAGE]: 0.3,
                    [STRATEGY_IDS.SENTIMENT]: 0.6,
                    [STRATEGY_IDS.PORTFOLIO_OPTIMIZATION]: 1.5,
                };
            case 'STABLE_RANGE':
            default:
                return {
                    [STRATEGY_IDS.MOMENTUM]: 0.7,
                    [STRATEGY_IDS.MEAN_REVERSION]: 1.4,
                    [STRATEGY_IDS.ARBITRAGE]: 1.2,
                    [STRATEGY_IDS.SENTIMENT]: 1.0,
                    [STRATEGY_IDS.PORTFOLIO_OPTIMIZATION]: 1.0,
                };
        }
    }

    private defaultRegime(): RegimeState {
        return {
            regime: 'STABLE_RANGE',
            confidence: 0.5,
            avgVolatility: 0,
            avgTrendStrength: 0,
            avgLiquidity: 0,
            strategyMultipliers: this.getStrategyMultipliers('STABLE_RANGE'),
        };
    }

    /**
     * Get regime history for dashboard.
     */
    async getRegimeHistory(limit: number = 30): Promise<any[]> {
        return this.db.marketRegimeSnapshot.findMany({
            orderBy: { snapshotDate: 'desc' },
            take: limit,
        });
    }
}
