import {
    logger,
    getDatabase,
    SimulationConfig,
    SimulationResult,
    MarketSnapshot,
    PortfolioState,
    TradeSignal,
    StrategyPerformance,
    PricePoint,
} from 'shared-lib';

/**
 * SimulationEngine — Historical market replay and portfolio simulation.
 *
 * Supports MODE=live | simulation.
 * In simulation mode:
 *  - Replays historical market data
 *  - Models slippage realistically
 *  - Tracks portfolio equity curve
 *  - Scores strategy performance
 */
export class SimulationEngine {
    private readonly log = logger.child({ module: 'SimulationEngine' });
    private readonly db = getDatabase();

    /**
     * Run a full backtest simulation.
     */
    async runBacktest(
        config: SimulationConfig,
        signalGenerator: (
            market: MarketSnapshot,
            portfolio: PortfolioState
        ) => Promise<TradeSignal[]>
    ): Promise<SimulationResult> {
        this.log.info(
            {
                initialCapital: config.initialCapital,
                strategies: config.strategies,
                slippageBps: config.slippageModelBps,
            },
            'Starting backtest simulation'
        );

        // Initialize portfolio
        let portfolio: PortfolioState = {
            totalCapital: config.initialCapital,
            availableCapital: config.initialCapital,
            deployedCapital: 0,
            totalPnl: 0,
            dailyPnl: 0,
            dailyPnlPercent: 0,
            highWaterMark: config.initialCapital,
            maxDrawdown: 0,
            killSwitchActive: false,
            capitalPreservation: false,
            positions: [],
        };

        // Load historical market snapshots
        const markets = await this.loadHistoricalMarkets(config);

        const equityCurve: { timestamp: number; equity: number }[] = [];
        const strategyPnl = new Map<string, number>();
        const strategyTrades = new Map<string, { wins: number; total: number }>();
        let totalTrades = 0;
        let winCount = 0;

        // ── Simulate each time step ──
        for (const snapshot of markets) {
            // Generate signals
            const signals = await signalGenerator(snapshot, portfolio);

            for (const signal of signals) {
                if (!signal.trade) continue;

                // Apply slippage model
                const slippage = this.modelSlippage(
                    signal.positionSizeUsd,
                    snapshot.liquidity,
                    config.slippageModelBps
                );

                const effectivePrice = signal.side === 'YES' ? snapshot.priceYes : snapshot.priceNo;
                const adjustedPrice =
                    signal.direction === 'BUY'
                        ? effectivePrice * (1 + slippage)
                        : effectivePrice * (1 - slippage);

                // Execute simulated trade
                const profit = this.simulateTrade(signal, adjustedPrice, snapshot);
                portfolio.totalPnl += profit;
                portfolio.totalCapital += profit;
                portfolio.availableCapital += profit;

                // Track strategy performance
                const currentPnl = strategyPnl.get(signal.strategyId) || 0;
                strategyPnl.set(signal.strategyId, currentPnl + profit);

                const stats = strategyTrades.get(signal.strategyId) || {
                    wins: 0,
                    total: 0,
                };
                stats.total += 1;
                if (profit > 0) stats.wins += 1;
                strategyTrades.set(signal.strategyId, stats);

                totalTrades += 1;
                if (profit > 0) winCount += 1;
            }

            // Update equity curve
            equityCurve.push({
                timestamp: Date.now(),
                equity: portfolio.totalCapital,
            });

            // Update high water mark and drawdown
            if (portfolio.totalCapital > portfolio.highWaterMark) {
                portfolio.highWaterMark = portfolio.totalCapital;
            }
            const drawdown =
                (portfolio.highWaterMark - portfolio.totalCapital) / portfolio.highWaterMark;
            if (drawdown > portfolio.maxDrawdown) {
                portfolio.maxDrawdown = drawdown;
            }
        }

        // ── Calculate results ──
        const totalReturn =
            (portfolio.totalCapital - config.initialCapital) / config.initialCapital;
        const sharpeRatio = this.calculateSharpeRatio(equityCurve);

        // Build strategy scores
        const strategyScores: StrategyPerformance[] = [];
        for (const [strategyId, pnl] of strategyPnl) {
            const tradeStats = strategyTrades.get(strategyId) || { wins: 0, total: 0 };
            strategyScores.push({
                strategyId,
                strategyName: strategyId,
                pnl,
                winRate: tradeStats.total > 0 ? tradeStats.wins / tradeStats.total : 0,
                sharpeRatio: 0,
                trades: tradeStats.total,
                weight: 1.0,
            });
        }

        const result: SimulationResult = {
            finalCapital: portfolio.totalCapital,
            totalReturn,
            sharpeRatio,
            maxDrawdown: portfolio.maxDrawdown,
            totalTrades,
            winRate: totalTrades > 0 ? winCount / totalTrades : 0,
            equityCurve,
            strategyScores,
        };

        this.log.info(
            {
                finalCapital: result.finalCapital.toFixed(2),
                totalReturn: `${(result.totalReturn * 100).toFixed(2)}%`,
                sharpeRatio: result.sharpeRatio.toFixed(3),
                maxDrawdown: `${(result.maxDrawdown * 100).toFixed(2)}%`,
                totalTrades: result.totalTrades,
                winRate: `${(result.winRate * 100).toFixed(1)}%`,
            },
            'Simulation complete'
        );

        return result;
    }

    /**
     * Model realistic slippage based on position size and liquidity.
     */
    private modelSlippage(
        sizeUsd: number,
        liquidity: number,
        baseSlippageBps: number
    ): number {
        // Base slippage + market impact
        const basePct = baseSlippageBps / 10000;
        const impactPct = liquidity > 0 ? (sizeUsd / liquidity) * 0.1 : 0.01;

        // Add random noise for realism
        const noise = (Math.random() - 0.5) * basePct * 0.5;

        return Math.max(0, basePct + impactPct + noise);
    }

    /**
     * Simulate a trade and return the profit/loss.
     */
    private simulateTrade(
        signal: TradeSignal,
        adjustedPrice: number,
        market: MarketSnapshot
    ): number {
        // Simple profit model:
        // Buy YES at adjustedPrice, market resolves → profit = (1 - adjustedPrice) * size if correct
        // For now, use a probabilistic outcome based on current price
        const impliedProbability = signal.side === 'YES' ? market.priceYes : market.priceNo;

        // Random resolution based on implied probability
        const resolved = Math.random() < impliedProbability;

        if (signal.direction === 'BUY') {
            if (resolved) {
                // Won: paid adjustedPrice, received 1.0
                return (1 - adjustedPrice) * signal.positionSizeUsd;
            } else {
                // Lost: paid adjustedPrice, received 0
                return -adjustedPrice * signal.positionSizeUsd;
            }
        } else {
            // SELL: opposite of BUY
            if (resolved) {
                return -(1 - adjustedPrice) * signal.positionSizeUsd;
            } else {
                return adjustedPrice * signal.positionSizeUsd;
            }
        }
    }

    /**
     * Calculate annualized Sharpe ratio from equity curve.
     */
    private calculateSharpeRatio(
        equityCurve: { timestamp: number; equity: number }[]
    ): number {
        if (equityCurve.length < 2) return 0;

        const returns: number[] = [];
        for (let i = 1; i < equityCurve.length; i++) {
            const prev = equityCurve[i - 1].equity;
            if (prev > 0) {
                returns.push((equityCurve[i].equity - prev) / prev);
            }
        }

        if (returns.length < 2) return 0;

        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance =
            returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) return 0;

        // Annualize (assuming ~252 trading days)
        return (mean / stdDev) * Math.sqrt(252);
    }

    /**
     * Load historical market data for simulation.
     */
    private async loadHistoricalMarkets(
        config: SimulationConfig
    ): Promise<MarketSnapshot[]> {
        const markets = await this.db.market.findMany({
            where: {
                active: true,
                ...(config.startDate && { createdAt: { gte: new Date(config.startDate) } }),
                ...(config.endDate && { createdAt: { lte: new Date(config.endDate) } }),
            },
            take: 100,
        });

        return markets.map((m) => ({
            conditionId: m.conditionId,
            questionId: m.questionId,
            question: m.question,
            priceYes: m.priceYes,
            priceNo: m.priceNo,
            volume24h: m.volume24h,
            liquidity: m.liquidity,
            endDate: m.endDate?.toISOString() || null,
            spread: Math.abs(m.priceYes + m.priceNo - 1),
            priceHistory: [],
            orderBookDepth: [],
        }));
    }
}
