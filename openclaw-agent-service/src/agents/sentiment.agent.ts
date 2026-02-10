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
 * SentimentAgent — News and sentiment analysis via LLM.
 *
 * Analyzes external signals (news, social media, expert opinions)
 * to generate trade signals based on sentiment shifts.
 * Uses the LLM Decision Engine for natural language understanding.
 */
export class SentimentAgent extends BaseAgent {
    readonly strategyId = STRATEGY_IDS.SENTIMENT;
    readonly strategyName = STRATEGY_NAMES[STRATEGY_IDS.SENTIMENT];
    private weight = 1.0;
    private readonly log = logger.child({ agent: this.strategyId });

    async analyze(
        market: MarketSnapshot,
        portfolio: PortfolioState,
        externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null> {
        if (externalSignals.length === 0) return null;

        // ── Aggregate sentiment from all external signals ──
        const relevantSignals = externalSignals.filter(
            (s) => s.confidence > 0.3
        );

        if (relevantSignals.length === 0) return null;

        // ── Weighted sentiment aggregation ──
        let totalWeightedSentiment = 0;
        let totalWeight = 0;

        for (const signal of relevantSignals) {
            const weight = signal.confidence;
            totalWeightedSentiment += signal.sentiment * weight;
            totalWeight += weight;
        }

        const avgSentiment = totalWeight > 0 ? totalWeightedSentiment / totalWeight : 0;

        // Require meaningful sentiment signal
        if (Math.abs(avgSentiment) < 0.2) return null;

        // ── Determine trade direction based on sentiment ──
        const side: 'YES' | 'NO' = avgSentiment > 0 ? 'YES' : 'NO';

        // ── Check if sentiment is priced in ──
        const currentPrice = side === 'YES' ? market.priceYes : market.priceNo;
        const sentimentImpliedPrice = 0.5 + avgSentiment * 0.4; // Map sentiment to price range

        const priceDifference = sentimentImpliedPrice - currentPrice;
        if (Math.abs(priceDifference) < 0.03) {
            // Sentiment is already priced in
            return null;
        }

        // Only trade if sentiment suggests price should be higher than current
        if (priceDifference <= 0) return null;

        // ── Confidence based on signal agreement and strength ──
        let confidence = 0.4;
        confidence += Math.abs(avgSentiment) * 0.3;     // Stronger sentiment
        confidence += Math.min(relevantSignals.length / 5, 0.2); // More signals = higher confidence
        confidence = Math.min(0.85, Math.max(0.4, confidence));

        // ── Decay confidence for stale signals ──
        const newestSignal = Math.max(...relevantSignals.map((s) => s.timestamp));
        const ageHours = (Date.now() - newestSignal) / (1000 * 60 * 60);
        if (ageHours > 6) {
            confidence *= 0.8; // Reduce for older signals
        }

        // ── Position sizing ──
        const sizeUsd = Math.min(
            portfolio.totalCapital * 0.012 * confidence,
            portfolio.availableCapital * 0.08
        );

        const signalSummary = relevantSignals
            .slice(0, 3)
            .map((s) => `${s.source}: ${s.sentiment > 0 ? '+' : ''}${s.sentiment.toFixed(2)}`)
            .join(', ');

        this.log.info(
            {
                market: market.question.slice(0, 50),
                avgSentiment: avgSentiment.toFixed(3),
                signalCount: relevantSignals.length,
                side,
                confidence: confidence.toFixed(3),
            },
            'Sentiment signal detected'
        );

        return this.buildSignal(market, {
            trade: true,
            side,
            direction: 'BUY',
            confidence,
            positionSizeUsd: sizeUsd,
            reasoning: `Sentiment analysis: avg sentiment ${avgSentiment > 0 ? '+' : ''}${avgSentiment.toFixed(2)} from ${relevantSignals.length} sources (${signalSummary}). Implied price ${sentimentImpliedPrice.toFixed(3)} vs current ${currentPrice.toFixed(3)}.`,
        });
    }

    getWeight(): number { return this.weight; }
    setWeight(w: number): void { this.weight = w; }
}
