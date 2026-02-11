import {
    MarketSnapshot,
    PortfolioState,
    ExternalSignal,
    TradeSignal,
    StrategyVote,
    ConsensusResult,
    STRATEGY_IDS,
    STRATEGY_NAMES,
    logger,
    getDatabase,
} from 'shared-lib';
import { BaseAgent } from './base.agent';

/**
 * MetaAllocatorAgent — Multi-agent consensus scoring and ensemble weighting.
 *
 * This is the top-level orchestrator that:
 *  1. Collects signals from all other agents
 *  2. Weights them based on historical performance
 *  3. Applies Bayesian probability updating
 *  4. Produces a consensus trade decision
 *  5. Self-reflects on past decisions for continuous improvement
 */
export class MetaAllocatorAgent extends BaseAgent {
    readonly strategyId = STRATEGY_IDS.META_ALLOCATOR;
    readonly strategyName = STRATEGY_NAMES[STRATEGY_IDS.META_ALLOCATOR];
    private weight = 1.0;
    private readonly log = logger.child({ agent: this.strategyId });
    private readonly db = getDatabase();

    // Strategy performance priors (Bayesian)
    private priors = new Map<string, { alpha: number; beta: number }>();

    constructor() {
        super();
        // Initialize Bayesian priors (uniform)
        Object.values(STRATEGY_IDS).forEach((id) => {
            this.priors.set(id, { alpha: 2, beta: 2 }); // Weak prior centered at 0.5
        });
    }

    async analyze(
        _market: MarketSnapshot,
        _portfolio: PortfolioState,
        _externalSignals: ExternalSignal[]
    ): Promise<TradeSignal | null> {
        // Meta allocator doesn't analyze individual markets
        // It aggregates signals from other agents
        return null;
    }

    /**
     * Build consensus from multiple agent signals for a single market.
     */
    async buildConsensus(
        signals: TradeSignal[],
        market: MarketSnapshot,
        _portfolio: PortfolioState
    ): Promise<ConsensusResult> {
        if (signals.length === 0) {
            return this.noTradeConsensus();
        }

        // ── Load strategy weights from database ──
        await this.loadStrategyWeights();

        // ── Build weighted votes ──
        const votes: StrategyVote[] = signals.map((signal) => ({
            strategyId: signal.strategyId,
            strategyName: signal.strategyName,
            signal,
            weight: this.getStrategyWeight(signal.strategyId),
        }));

        // ── Group votes by side ──
        const yesVotes = votes.filter((v) => v.signal.side === 'YES');
        const noVotes = votes.filter((v) => v.signal.side === 'NO');

        // ── Weighted confidence aggregation ──
        const yesScore = yesVotes.reduce(
            (sum, v) => sum + v.signal.confidence * v.weight,
            0
        );
        const noScore = noVotes.reduce(
            (sum, v) => sum + v.signal.confidence * v.weight,
            0
        );
        const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);

        // ── Determine winning side ──
        const side: 'YES' | 'NO' = yesScore >= noScore ? 'YES' : 'NO';
        const winningScore = Math.max(yesScore, noScore);
        const losingScore = Math.min(yesScore, noScore);

        // ── Consensus gap — how much do agents agree? ──
        const consensusGap = totalWeight > 0 ? (winningScore - losingScore) / totalWeight : 0;

        // ── Aggregate confidence ──
        let aggregateConfidence = totalWeight > 0 ? winningScore / totalWeight : 0;

        // ── Apply Bayesian update ──
        aggregateConfidence = this.bayesianUpdate(
            aggregateConfidence,
            signals.map((s) => s.strategyId)
        );

        // ── Consensus strength factor ──
        // Require meaningful consensus gap
        if (consensusGap < 0.1) {
            aggregateConfidence *= 0.5; // Weak consensus → reduce confidence
        }

        // ── Aggregate position size ──
        const winningVotes = side === 'YES' ? yesVotes : noVotes;
        const avgSizeUsd =
            winningVotes.reduce((sum, v) => sum + v.signal.positionSizeUsd * v.weight, 0) /
            Math.max(winningVotes.reduce((sum, v) => sum + v.weight, 0), 0.01);

        // ── Build reasoning ──
        const reasoning = this.buildReasoningSummary(votes, side, aggregateConfidence, consensusGap);

        const shouldTrade = aggregateConfidence >= 0.55 && avgSizeUsd >= 1.0;

        this.log.info(
            {
                market: market.question.slice(0, 50),
                side,
                aggregateConfidence: aggregateConfidence.toFixed(3),
                consensusGap: consensusGap.toFixed(3),
                votesYes: yesVotes.length,
                votesNo: noVotes.length,
                shouldTrade,
            },
            'Consensus built'
        );

        return {
            shouldTrade,
            side,
            aggregateConfidence,
            positionSizeUsd: shouldTrade ? avgSizeUsd : 0,
            reasoning,
            votes,
            consensusMethod: 'WEIGHTED_AVERAGE',
        };
    }

    /**
     * Bayesian probability updating using strategy priors.
     */
    private bayesianUpdate(confidence: number, strategyIds: string[]): number {
        // Calculate aggregate prior from participating strategies
        let totalAlpha = 0;
        let totalBeta = 0;

        for (const id of strategyIds) {
            const prior = this.priors.get(id) || { alpha: 2, beta: 2 };
            totalAlpha += prior.alpha;
            totalBeta += prior.beta;
        }

        // Bayesian update: posterior = prior * likelihood
        const priorMean = totalAlpha / (totalAlpha + totalBeta);
        const priorStrength = totalAlpha + totalBeta;

        // Weight the posterior between prior and new evidence
        const evidenceWeight = Math.min(1, 10 / priorStrength); // More data → less prior weight
        const posterior = priorMean * (1 - evidenceWeight) + confidence * evidenceWeight;

        return Math.max(0, Math.min(1, posterior));
    }

    /**
     * Update Bayesian priors based on trade outcomes.
     * Call this after trades resolve.
     */
    async updatePriors(strategyId: string, success: boolean): Promise<void> {
        const prior = this.priors.get(strategyId) || { alpha: 2, beta: 2 };

        if (success) {
            prior.alpha += 1;
        } else {
            prior.beta += 1;
        }

        this.priors.set(strategyId, prior);

        // Update strategy score in database
        const winRate = prior.alpha / (prior.alpha + prior.beta);
        await this.db.strategyScore.updateMany({
            where: { strategyId },
            data: {
                winRate,
                totalTrades: prior.alpha + prior.beta - 4, // Subtract initial priors
            },
        });

        this.log.info(
            {
                strategyId,
                success,
                alpha: prior.alpha,
                beta: prior.beta,
                posteriorWinRate: winRate.toFixed(3),
            },
            'Bayesian prior updated'
        );
    }

    /**
     * Self-reflection: review past decisions and adjust weights.
     */
    async selfReflect(): Promise<void> {
        this.log.info('Running self-reflection loop...');

        const recentDecisions = await this.db.aiDecision.findMany({
            where: {
                createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        // Group by strategy and compute accuracy
        const strategyStats = new Map<string, { correct: number; total: number }>();

        for (const decision of recentDecisions) {
            const stats = strategyStats.get(decision.strategyId) || { correct: 0, total: 0 };
            stats.total += 1;
            if (decision.approved && decision.executedTradeId) {
                stats.correct += 1;
            }
            strategyStats.set(decision.strategyId, stats);
        }

        // Adjust weights based on recent performance
        for (const [strategyId, stats] of strategyStats) {
            if (stats.total >= 5) {
                const accuracy = stats.correct / stats.total;
                // Exponential moving average weight update
                const currentWeight = this.getStrategyWeight(strategyId);
                const newWeight = currentWeight * 0.8 + accuracy * 0.2;

                await this.db.strategyScore.updateMany({
                    where: { strategyId },
                    data: { weight: Math.max(0.1, Math.min(2.0, newWeight)) },
                });

                this.log.info(
                    {
                        strategyId,
                        accuracy: accuracy.toFixed(3),
                        oldWeight: currentWeight.toFixed(3),
                        newWeight: newWeight.toFixed(3),
                    },
                    'Strategy weight adjusted via self-reflection'
                );
            }
        }
    }

    /**
     * Load strategy weights from database.
     */
    private async loadStrategyWeights(): Promise<void> {
        const scores = await this.db.strategyScore.findMany({
            where: { active: true },
        });

        for (const score of scores) {
            this.priors.set(score.strategyId, {
                alpha: Math.max(1, score.winRate * (score.totalTrades + 4)),
                beta: Math.max(1, (1 - score.winRate) * (score.totalTrades + 4)),
            });
        }
    }

    private getStrategyWeight(strategyId: string): number {
        const prior = this.priors.get(strategyId);
        if (!prior) return 1.0;
        return prior.alpha / (prior.alpha + prior.beta);
    }

    private buildReasoningSummary(
        votes: StrategyVote[],
        side: 'YES' | 'NO',
        confidence: number,
        gap: number
    ): string {
        const voteDetails = votes
            .map(
                (v) =>
                    `${v.strategyName}: ${v.signal.side} @ ${v.signal.confidence.toFixed(2)} (w=${v.weight.toFixed(2)})`
            )
            .join(', ');

        return `Consensus: ${side} with ${(confidence * 100).toFixed(1)}% confidence (gap=${(gap * 100).toFixed(1)}%). Votes: ${voteDetails}`;
    }

    private noTradeConsensus(): ConsensusResult {
        return {
            shouldTrade: false,
            side: 'YES',
            aggregateConfidence: 0,
            positionSizeUsd: 0,
            reasoning: 'No agent signals received.',
            votes: [],
            consensusMethod: 'WEIGHTED_AVERAGE',
        };
    }

    getWeight(): number { return this.weight; }
    setWeight(w: number): void { this.weight = w; }
}
