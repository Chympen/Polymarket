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
 * MomentumAgent — Price momentum and trend-following strategy.
 *
 * Detects and rides trending markets by analyzing recent price action.
 * Uses multiple timeframe momentum signals and volume confirmation.
 */
export class MomentumAgent extends BaseAgent {
    readonly strategyId = STRATEGY_IDS.MOMENTUM;
    readonly strategyName = STRATEGY_NAMES[STRATEGY_IDS.MOMENTUM];
    private weight = 1.0;
    private readonly log = logger.child({ agent: this.strategyId });

    async analyze(
        market: MarketSnapshot,
        portfolio: PortfolioState,
        _externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null> {
        const history = market.priceHistory;
        if (history.length < 10) return null;

        // ── Calculate momentum signals across timeframes ──
        const shortMomentum = this.calculateMomentum(history, 5);   // 5-period
        const mediumMomentum = this.calculateMomentum(history, 10);  // 10-period
        const longMomentum = this.calculateMomentum(history, 20);    // 20-period

        // ── Volume confirmation ──
        const recentVolume = history.slice(-5).reduce((s, p) => s + p.volume, 0);
        const avgVolume = history.reduce((s, p) => s + p.volume, 0) / history.length;
        const volumeRatio = avgVolume > 0 ? recentVolume / (avgVolume * 5) : 1;

        // ── Momentum alignment check ──
        const allBullish = shortMomentum > 0 && mediumMomentum > 0 && longMomentum > 0;
        const allBearish = shortMomentum < 0 && mediumMomentum < 0 && longMomentum < 0;

        if (!allBullish && !allBearish) return null;

        // ── Momentum strength ──
        const avgMomentum = (Math.abs(shortMomentum) + Math.abs(mediumMomentum) + Math.abs(longMomentum)) / 3;

        // Require minimum momentum threshold
        if (avgMomentum < 0.02) return null;

        // ── Volume must confirm the move ──
        if (volumeRatio < 0.8) return null;

        // ── Calculate confidence ──
        let confidence = 0.5;
        confidence += avgMomentum * 3;        // Stronger momentum → higher confidence
        confidence += (volumeRatio - 1) * 0.1; // Above average volume → higher confidence
        confidence = Math.min(0.9, Math.max(0.4, confidence));

        // ── Determine trade direction ──
        const side: 'YES' | 'NO' = allBullish ? 'YES' : 'NO';
        const currentPrice = side === 'YES' ? market.priceYes : market.priceNo;

        // Don't chase prices too close to extremes
        if (currentPrice > 0.92 || currentPrice < 0.08) return null;

        // ── Position sizing ──
        const sizeUsd = Math.min(
            portfolio.totalCapital * 0.015 * confidence,
            portfolio.availableCapital * 0.1
        );

        const momentumStr = [
            `short=${(shortMomentum * 100).toFixed(1)}%`,
            `med=${(mediumMomentum * 100).toFixed(1)}%`,
            `long=${(longMomentum * 100).toFixed(1)}%`,
        ].join(', ');

        this.log.info(
            {
                market: market.question.slice(0, 50),
                side,
                confidence: confidence.toFixed(3),
                momentum: momentumStr,
                volumeRatio: volumeRatio.toFixed(2),
            },
            'Momentum signal detected'
        );

        return this.buildSignal(market, {
            trade: true,
            side,
            direction: 'BUY',
            confidence,
            positionSizeUsd: sizeUsd,
            reasoning: `Momentum aligned across timeframes (${momentumStr}). Volume ratio: ${volumeRatio.toFixed(2)}x. Trend ${allBullish ? 'bullish' : 'bearish'} on ${side} side at ${currentPrice.toFixed(3)}.`,
        });
    }

    private calculateMomentum(history: MarketSnapshot['priceHistory'], periods: number): number {
        if (history.length < periods) return 0;
        const recent = history.slice(-periods);
        const start = recent[0].priceYes;
        const end = recent[recent.length - 1].priceYes;
        return start > 0 ? (end - start) / start : 0;
    }

    getWeight(): number { return this.weight; }
    setWeight(w: number): void { this.weight = w; }
}
