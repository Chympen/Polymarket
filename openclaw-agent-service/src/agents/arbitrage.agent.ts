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
 * ArbitrageAgent — Detects cross-market price discrepancies.
 *
 * Strategy: Identifies when the sum of YES + NO prices deviates from 1.0,
 * or when correlated markets have significant price divergence.
 * Exploits mispricing for low-risk profit opportunities.
 */
export class ArbitrageAgent extends BaseAgent {
    readonly strategyId = STRATEGY_IDS.ARBITRAGE;
    readonly strategyName = STRATEGY_NAMES[STRATEGY_IDS.ARBITRAGE];
    private weight = 1.0;
    private readonly log = logger.child({ agent: this.strategyId });

    // Related markets cache for correlation analysis
    private relatedMarkets = new Map<string, MarketSnapshot[]>();

    async analyze(
        market: MarketSnapshot,
        portfolio: PortfolioState,
        _externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null> {
        // ── Check 1: YES + NO sum arbitrage ──
        const priceSum = market.priceYes + market.priceNo;
        const deviation = Math.abs(priceSum - 1.0);

        if (deviation > 0.02) {
            // Significant deviation from fair value
            const side = priceSum < 1.0 ? 'YES' : 'NO';
            const cheaperPrice = side === 'YES' ? market.priceYes : market.priceNo;
            const fairPrice = side === 'YES' ? 1 - market.priceNo : 1 - market.priceYes;

            const confidence = Math.min(0.95, 0.6 + deviation * 5);
            const edgePercent = (fairPrice - cheaperPrice) / cheaperPrice;
            const sizeUsd = this.calculateSize(portfolio, confidence, edgePercent);

            this.log.info(
                {
                    market: market.question.slice(0, 50),
                    priceSum: priceSum.toFixed(4),
                    deviation: deviation.toFixed(4),
                    side,
                    confidence: confidence.toFixed(3),
                },
                'Arbitrage opportunity detected'
            );

            return this.buildSignal(market, {
                trade: true,
                side,
                direction: 'BUY',
                confidence,
                positionSizeUsd: sizeUsd,
                reasoning: `Price sum arbitrage: YES(${market.priceYes.toFixed(3)}) + NO(${market.priceNo.toFixed(3)}) = ${priceSum.toFixed(3)}, deviation ${(deviation * 100).toFixed(1)}% from fair value. Edge: ${(edgePercent * 100).toFixed(1)}%.`,
            });
        }

        // ── Check 2: Spread-based micro-arbitrage ──
        if (market.spread > 0.05 && market.liquidity > 5000) {
            const midPrice = (market.priceYes + (1 - market.priceNo)) / 2;
            const side = market.priceYes < midPrice ? 'YES' : 'NO';
            const confidence = Math.min(0.75, 0.5 + market.spread * 2);

            return this.buildSignal(market, {
                trade: true,
                side,
                direction: 'BUY',
                confidence,
                positionSizeUsd: this.calculateSize(portfolio, confidence, market.spread),
                reasoning: `Spread arbitrage: spread ${(market.spread * 100).toFixed(1)}% with sufficient liquidity ($${market.liquidity.toFixed(0)}).`,
            });
        }

        return null;
    }

    private calculateSize(
        portfolio: PortfolioState,
        confidence: number,
        edge: number
    ): number {
        // Kelly criterion sizing: f = edge / odds
        const kellyFraction = Math.max(0, edge) * confidence;
        const maxSize = portfolio.totalCapital * 0.02;
        return Math.min(maxSize, portfolio.availableCapital * kellyFraction * 0.5);
    }

    getWeight(): number { return this.weight; }
    setWeight(w: number): void { this.weight = w; }

    setRelatedMarkets(conditionId: string, markets: MarketSnapshot[]): void {
        this.relatedMarkets.set(conditionId, markets);
    }
}
