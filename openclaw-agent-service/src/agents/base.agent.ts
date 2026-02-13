import {
    TradeSignal,
    MarketSnapshot,
    PortfolioState,
    ExternalSignal,
} from 'shared-lib';

/**
 * BaseAgent — Abstract base class for all OpenClaw trading agents.
 * Each agent is implemented as an OpenClaw "skill" that:
 *  1. Receives market data + portfolio state
 *  2. Runs its strategy logic
 *  3. Produces trade signals with confidence & reasoning
 */
export abstract class BaseAgent {
    abstract readonly strategyId: string;
    abstract readonly strategyName: string;

    get name(): string {
        return this.strategyName;
    }

    /**
     * Analyze a market and produce a trade signal.
     */
    abstract analyze(
        market: MarketSnapshot,
        portfolio: PortfolioState,
        externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null>;

    /**
     * Get the agent's current weight in the ensemble.
     */
    abstract getWeight(): number;

    /**
     * Update the agent's weight based on recent performance.
     */
    abstract setWeight(weight: number): void;

    /**
     * Build a trade signal from analysis results.
     */
    protected buildSignal(
        market: MarketSnapshot,
        params: {
            trade: boolean;
            side: 'YES' | 'NO';
            direction: 'BUY' | 'SELL';
            confidence: number;
            positionSizeUsd: number;
            reasoning: string;
        }
    ): TradeSignal {
        return {
            trade: params.trade,
            marketId: market.conditionId,
            conditionId: market.conditionId,
            side: params.side,
            direction: params.direction,
            confidence: Math.max(0, Math.min(1, params.confidence)),
            positionSizeUsd: Math.max(0, params.positionSizeUsd),
            reasoning: params.reasoning,
            strategyId: this.strategyId,
            strategyName: this.strategyName,
            timestamp: Date.now(),
        };
    }
}
