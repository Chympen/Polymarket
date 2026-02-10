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
 * PortfolioOptimizationAgent — Portfolio-level rebalancing signals.
 *
 * Analyzes the current portfolio composition and suggests trades to:
 *  - Reduce concentration risk
 *  - Harvest profits from successful positions
 *  - Cut losses on underperforming positions
 *  - Maintain diversification across markets
 */
export class PortfolioOptimizationAgent extends BaseAgent {
    readonly strategyId = STRATEGY_IDS.PORTFOLIO_OPTIMIZATION;
    readonly strategyName = STRATEGY_NAMES[STRATEGY_IDS.PORTFOLIO_OPTIMIZATION];
    private weight = 1.0;
    private readonly log = logger.child({ agent: this.strategyId });

    async analyze(
        market: MarketSnapshot,
        portfolio: PortfolioState,
        _externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null> {
        // Find existing position in this market
        const position = portfolio.positions.find(
            (p) => p.marketId === market.conditionId || p.conditionId === market.conditionId
        );

        if (!position) {
            // No position — check for new diversification opportunity
            return this.checkDiversificationOpportunity(market, portfolio);
        }

        // ── Profit taking ──
        if (position.unrealizedPnl > 0) {
            const pnlPercent = position.unrealizedPnl / position.sizeUsd;

            // Take partial profits when unrealized PnL > 30%
            if (pnlPercent > 0.30) {
                const sellSize = position.sizeUsd * 0.5; // Sell half
                const confidence = Math.min(0.8, 0.6 + pnlPercent * 0.3);

                this.log.info(
                    {
                        market: market.question.slice(0, 50),
                        pnlPercent: `${(pnlPercent * 100).toFixed(1)}%`,
                        sellSize,
                    },
                    'Profit taking signal'
                );

                return this.buildSignal(market, {
                    trade: true,
                    side: position.side as 'YES' | 'NO',
                    direction: 'SELL',
                    confidence,
                    positionSizeUsd: sellSize,
                    reasoning: `Profit taking: position has ${(pnlPercent * 100).toFixed(1)}% unrealized gain ($${position.unrealizedPnl.toFixed(2)}). Selling 50% to lock in profits.`,
                });
            }
        }

        // ── Stop loss ──
        if (position.unrealizedPnl < 0) {
            const lossPercent = Math.abs(position.unrealizedPnl) / position.sizeUsd;

            // Cut position when loss exceeds 25%
            if (lossPercent > 0.25) {
                const confidence = Math.min(0.85, 0.65 + lossPercent * 0.2);

                this.log.info(
                    {
                        market: market.question.slice(0, 50),
                        lossPercent: `${(lossPercent * 100).toFixed(1)}%`,
                    },
                    'Stop loss signal'
                );

                return this.buildSignal(market, {
                    trade: true,
                    side: position.side as 'YES' | 'NO',
                    direction: 'SELL',
                    confidence,
                    positionSizeUsd: position.sizeUsd, // Full exit
                    reasoning: `Stop loss: position has ${(lossPercent * 100).toFixed(1)}% unrealized loss ($${position.unrealizedPnl.toFixed(2)}). Exiting to preserve capital.`,
                });
            }
        }

        // ── Concentration reduction ──
        const positionWeight = position.sizeUsd / portfolio.totalCapital;
        if (positionWeight > 0.08) {
            const excessSize = position.sizeUsd - portfolio.totalCapital * 0.06;

            return this.buildSignal(market, {
                trade: true,
                side: position.side as 'YES' | 'NO',
                direction: 'SELL',
                confidence: 0.65,
                positionSizeUsd: excessSize,
                reasoning: `Concentration risk: position is ${(positionWeight * 100).toFixed(1)}% of portfolio (target: <6%). Reducing by $${excessSize.toFixed(2)}.`,
            });
        }

        return null;
    }

    /**
     * Check if this market offers a diversification opportunity.
     */
    private checkDiversificationOpportunity(
        market: MarketSnapshot,
        portfolio: PortfolioState
    ): TradeSignal | null {
        // Check if we have room for more positions
        if (portfolio.positions.length >= 15) return null;

        // Check for markets with strong value (prices near extremes in liquid markets)
        const deployedPercent = portfolio.deployedCapital / portfolio.totalCapital;
        if (deployedPercent > 0.7) return null; // Don't over-deploy

        // Look for value: price significantly away from 0.5 with good liquidity
        const isValue =
            (market.priceYes < 0.25 || market.priceYes > 0.75) &&
            market.liquidity > 5000 &&
            market.volume24h > 1000;

        if (!isValue) return null;

        const side: 'YES' | 'NO' = market.priceYes > 0.75 ? 'YES' : 'NO';
        const sizeUsd = Math.min(
            portfolio.totalCapital * 0.01,
            portfolio.availableCapital * 0.05
        );

        return this.buildSignal(market, {
            trade: true,
            side,
            direction: 'BUY',
            confidence: 0.55,
            positionSizeUsd: sizeUsd,
            reasoning: `Diversification: adding small position in ${side} at ${(side === 'YES' ? market.priceYes : market.priceNo).toFixed(3)} with good liquidity ($${market.liquidity.toFixed(0)}).`,
        });
    }

    getWeight(): number { return this.weight; }
    setWeight(w: number): void { this.weight = w; }
}
