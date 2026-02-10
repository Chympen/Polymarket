import {
    MarketSnapshot,
    PortfolioState,
    ExternalSignal,
    TradeSignal,
    STRATEGY_IDS,
    STRATEGY_NAMES,
    logger,
} from 'shared-lib';
import { BaseAgent } from './base.agent';

/**
 * MeanReversionAgent — Mean reversion strategy for prediction markets.
 *
 * Identifies when prices have deviated significantly from their recent average
 * and bets on a reversion to the mean. Works best in range-bound markets.
 */
export class MeanReversionAgent extends BaseAgent {
    readonly strategyId = STRATEGY_IDS.MEAN_REVERSION;
    readonly strategyName = STRATEGY_NAMES[STRATEGY_IDS.MEAN_REVERSION];
    private weight = 1.0;
    private readonly log = logger.child({ agent: this.strategyId });

    async analyze(
        market: MarketSnapshot,
        portfolio: PortfolioState,
        _externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null> {
        const history = market.priceHistory;
        if (history.length < 20) return null;

        // ── Calculate Bollinger Bands ──
        const prices = history.map((p) => p.priceYes);
        const windowSize = 20;
        const recentPrices = prices.slice(-windowSize);

        const mean = recentPrices.reduce((s, p) => s + p, 0) / recentPrices.length;
        const variance =
            recentPrices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / recentPrices.length;
        const stdDev = Math.sqrt(variance);

        const upperBand = mean + 2 * stdDev;
        const lowerBand = mean - 2 * stdDev;

        const currentPrice = market.priceYes;

        // ── Z-score: how many std devs from the mean ──
        const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

        // Require significant deviation (|z| > 1.5)
        if (Math.abs(zScore) < 1.5) return null;

        // ── Check for mean-reverting behavior (not trending) ──
        const isRangeBound = this.isRangeBound(prices.slice(-40));
        if (!isRangeBound) return null;

        // ── Reversion signal ──
        // Price above upper band → expect YES to fall → sell YES / buy NO
        // Price below lower band → expect YES to rise → buy YES
        const side: 'YES' | 'NO' = zScore > 0 ? 'NO' : 'YES';
        const direction: 'BUY' | 'SELL' = 'BUY';

        // ── Confidence based on z-score magnitude ──
        let confidence = 0.5 + (Math.abs(zScore) - 1.5) * 0.15;
        confidence = Math.min(0.85, Math.max(0.5, confidence));

        // ── Liquidity check ──
        if (market.liquidity < 1000) {
            confidence *= 0.7; // Reduce confidence in illiquid markets
        }

        // ── Position sizing ──
        const expectedMove = Math.abs(currentPrice - mean);
        const edgePercent = expectedMove / currentPrice;
        const sizeUsd = Math.min(
            portfolio.totalCapital * 0.012 * confidence,
            portfolio.availableCapital * 0.08
        );

        this.log.info(
            {
                market: market.question.slice(0, 50),
                zScore: zScore.toFixed(2),
                mean: mean.toFixed(3),
                currentPrice: currentPrice.toFixed(3),
                side,
                confidence: confidence.toFixed(3),
            },
            'Mean reversion signal detected'
        );

        return this.buildSignal(market, {
            trade: true,
            side,
            direction,
            confidence,
            positionSizeUsd: sizeUsd,
            reasoning: `Mean reversion: price ${currentPrice.toFixed(3)} is ${zScore.toFixed(1)} std devs from 20-period mean ${mean.toFixed(3)} (bands: ${lowerBand.toFixed(3)}-${upperBand.toFixed(3)}). Expected reversion of ${(edgePercent * 100).toFixed(1)}%. Market is range-bound.`,
        });
    }

    /**
     * Check if prices are range-bound (vs trending) using the Hurst exponent approximation.
     * H < 0.5 = mean-reverting, H ≈ 0.5 = random, H > 0.5 = trending
     */
    private isRangeBound(prices: number[]): boolean {
        if (prices.length < 20) return false;

        // Simplified check: compare short-term and long-term volatility
        const shortWindow = prices.slice(-10);
        const longWindow = prices;

        const shortVol = this.volatility(shortWindow);
        const longVol = this.volatility(longWindow);

        // If short-term volatility is similar to long-term, its mean-reverting
        // If short-term is much larger, it's trending
        const volRatio = longVol > 0 ? shortVol / longVol : 1;

        return volRatio < 1.5; // Range-bound threshold
    }

    private volatility(prices: number[]): number {
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i - 1] > 0) {
                returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
            }
        }
        if (returns.length === 0) return 0;
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
    }

    getWeight(): number { return this.weight; }
    setWeight(w: number): void { this.weight = w; }
}
