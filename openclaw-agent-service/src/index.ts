import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cron from 'node-cron';
import axios from 'axios';
import {
    logger,
    loadConfig,
    getConfig,
    getDatabase,
    disconnectDatabase,
    generateServiceToken,
    serviceAuthMiddleware,
    SERVICE_PORTS,
    POLYMARKET,
    MarketSnapshot,
    PortfolioState,
    TradeSignal,
    RiskCheckRequest,
    RiskCheckResult,
    TradeExecutionRequest,
    SimulationConfig,
} from 'shared-lib';
import { ArbitrageAgent } from './agents/arbitrage.agent';
import { MomentumAgent } from './agents/momentum.agent';
import { MeanReversionAgent } from './agents/mean-reversion.agent';
import { SentimentAgent } from './agents/sentiment.agent';
import { PortfolioOptimizationAgent } from './agents/portfolio-optimization.agent';
import { MetaAllocatorAgent } from './agents/meta-allocator.agent';
import { BaseAgent } from './agents/base.agent';
import { DecisionEngine } from './engine/decision-engine';
import { SimulationEngine } from './simulation/simulation-engine';
import { PerformanceTracker } from './analytics/performance-tracker';

const log = logger.child({ module: 'AgentServiceMain' });

// ── Initialize all agents ──
const agents: BaseAgent[] = [
    new ArbitrageAgent(),
    new MomentumAgent(),
    new MeanReversionAgent(),
    new SentimentAgent(),
    new PortfolioOptimizationAgent(),
];

const metaAllocator = new MetaAllocatorAgent();
const decisionEngine = new DecisionEngine();
const simulationEngine = new SimulationEngine();
const performanceTracker = new PerformanceTracker();

/**
 * Main trading cycle — runs on schedule or on-demand.
 *
 * Flow:
 *  1. Fetch active markets from Polymarket
 *  2. For each market, run all agents to generate signals
 *  3. Meta Allocator builds consensus from signals
 *  4. LLM Decision Engine provides additional analysis
 *  5. Send approved trades to Risk Guardian for validation
 *  6. Forward validated trades to Trade Executor
 */
async function runTradingCycle(): Promise<void> {
    const config = getConfig();
    const db = getDatabase();

    log.info('🔄 Starting trading cycle...');

    try {
        // ── Step 1: Fetch active markets ──
        const markets = await fetchActiveMarkets();
        log.info({ marketCount: markets.length }, 'Active markets fetched');

        // ── Step 2: Get portfolio state ──
        const portfolio = await getPortfolioState();

        if (portfolio.killSwitchActive) {
            log.error('🚨 Kill switch active — skipping trading cycle');
            return;
        }

        // ── Step 3: Run agents on each market ──
        let totalSignals = 0;
        let totalTrades = 0;

        for (const market of markets.slice(0, 20)) {
            // Limit to top 20 markets per cycle
            try {
                // Collect signals from all agents
                const signals: TradeSignal[] = [];

                for (const agent of agents) {
                    const signal = await agent.analyze(market, portfolio, []);
                    if (signal && signal.trade) {
                        signals.push(signal);
                    }
                }

                if (signals.length === 0) continue;
                totalSignals += signals.length;

                // ── Step 4: Build consensus ──
                const consensus = await metaAllocator.buildConsensus(signals, market, portfolio);

                if (!consensus.shouldTrade) continue;

                // ── Step 5: Validate with Risk Guardian ──
                const tradeSignal: TradeSignal = {
                    trade: true,
                    marketId: market.conditionId,
                    conditionId: market.conditionId,
                    side: consensus.side,
                    direction: 'BUY',
                    confidence: consensus.aggregateConfidence,
                    positionSizeUsd: consensus.positionSizeUsd,
                    reasoning: consensus.reasoning,
                    strategyId: 'meta-allocator',
                    strategyName: 'Meta Strategy Allocator',
                    timestamp: Date.now(),
                };

                const riskResult = await validateWithRiskGuardian(tradeSignal, portfolio);

                if (!riskResult.approved) {
                    log.info(
                        {
                            market: market.question.slice(0, 50),
                            reasons: riskResult.rejectionReasons,
                        },
                        'Trade rejected by Risk Guardian'
                    );
                    continue;
                }

                // ── Step 6: Execute trade ──
                const executionRequest: TradeExecutionRequest = {
                    marketId: market.conditionId,
                    conditionId: market.conditionId,
                    side: consensus.side,
                    direction: 'BUY',
                    type: 'MARKET',
                    sizeUsd: riskResult.adjustedSizeUsd,
                    maxSlippageBps: 200,
                    strategyId: 'meta-allocator',
                    confidence: consensus.aggregateConfidence,
                    reasoning: consensus.reasoning,
                };

                await executeTrade(executionRequest);
                totalTrades += 1;

                log.info(
                    {
                        market: market.question.slice(0, 50),
                        side: consensus.side,
                        size: riskResult.adjustedSizeUsd.toFixed(2),
                        confidence: consensus.aggregateConfidence.toFixed(3),
                    },
                    '✅ Trade executed'
                );
            } catch (error) {
                log.error(
                    { market: market.question?.slice(0, 50), error: (error as Error).message },
                    'Error processing market'
                );
            }
        }

        // ── Step 7: Run self-reflection ──
        await metaAllocator.selfReflect();

        // ── Step 8: Generate performance report ──
        const report = await performanceTracker.generateReport();

        log.info(
            {
                marketsProcessed: Math.min(markets.length, 20),
                signalsGenerated: totalSignals,
                tradesExecuted: totalTrades,
                sharpeRatio: report.sharpeRatio.toFixed(3),
                totalPnl: report.totalPnl.toFixed(2),
            },
            '✅ Trading cycle complete'
        );
    } catch (error) {
        log.error({ error: (error as Error).message }, '❌ Trading cycle failed');
    }
}

/**
 * Fetch active markets from Polymarket.
 */
async function fetchActiveMarkets(): Promise<MarketSnapshot[]> {
    const config = getConfig();

    if (config.MODE === 'simulation') {
        // In simulation mode, load from database
        const db = getDatabase();
        const dbMarkets = await db.market.findMany({
            where: { active: true },
            take: 50,
        });

        return dbMarkets.map((m) => ({
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

    try {
        const response = await axios.get(`${POLYMARKET.GAMMA_API_BASE}/markets`, {
            params: {
                active: true,
                closed: false,
                limit: 50,
                order: 'volume24hr',
                ascending: false,
            },
            timeout: 15_000,
        });

        return response.data.map((m: Record<string, unknown>) => ({
            conditionId: String(m.conditionId || m.condition_id || ''),
            questionId: String(m.questionId || m.question_id || ''),
            question: String(m.question || ''),
            priceYes: Number(m.outcomePrices?.[0] || m.bestBid || 0.5),
            priceNo: Number(m.outcomePrices?.[1] || 1 - Number(m.bestBid || 0.5)),
            volume24h: Number(m.volume24hr || m.volume || 0),
            liquidity: Number(m.liquidity || 0),
            endDate: m.endDate ? String(m.endDate) : null,
            spread: Number(m.spread || 0),
            priceHistory: [],
            orderBookDepth: [],
        }));
    } catch (error) {
        log.error({ error: (error as Error).message }, 'Failed to fetch markets');
        return [];
    }
}

/**
 * Get current portfolio state from database.
 */
async function getPortfolioState(): Promise<PortfolioState> {
    const db = getDatabase();

    const portfolio = await db.portfolio.findFirst({
        orderBy: { createdAt: 'desc' },
    });

    const positions = await db.position.findMany({
        where: { status: 'OPEN' },
    });

    return {
        totalCapital: portfolio?.totalCapital || 10000,
        availableCapital: portfolio?.availableCapital || 10000,
        deployedCapital: portfolio?.deployedCapital || 0,
        totalPnl: portfolio?.totalPnl || 0,
        dailyPnl: portfolio?.dailyPnl || 0,
        dailyPnlPercent: portfolio?.dailyPnlPercent || 0,
        highWaterMark: portfolio?.highWaterMark || 10000,
        maxDrawdown: portfolio?.maxDrawdown || 0,
        killSwitchActive: portfolio?.killSwitchActive || false,
        capitalPreservation: portfolio?.capitalPreservation || false,
        positions: positions.map((p) => ({
            marketId: p.marketId,
            conditionId: p.marketId,
            side: p.side as 'YES' | 'NO',
            sizeUsd: p.sizeUsd,
            avgEntryPrice: p.avgEntryPrice,
            currentPrice: p.currentPrice,
            unrealizedPnl: p.unrealizedPnl,
            realizedPnl: p.realizedPnl,
        })),
    };
}

/**
 * Validate trade with Risk Guardian Service.
 */
async function validateWithRiskGuardian(
    signal: TradeSignal,
    portfolio: PortfolioState
): Promise<RiskCheckResult> {
    const config = getConfig();
    const url = config.RISK_GUARDIAN_URL || `http://localhost:${SERVICE_PORTS.RISK_GUARDIAN}`;

    const request: RiskCheckRequest = { signal, portfolio };
    const token = generateServiceToken('openclaw-agent-service');

    const response = await axios.post(`${url}/validate-trade`, request, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        timeout: 10_000,
    });

    return response.data;
}

/**
 * Execute trade via Trade Executor Service.
 */
async function executeTrade(request: TradeExecutionRequest): Promise<void> {
    const config = getConfig();
    const url = config.TRADE_EXECUTOR_URL || `http://localhost:${SERVICE_PORTS.TRADE_EXECUTOR}`;

    const token = generateServiceToken('openclaw-agent-service');

    await axios.post(`${url}/execute-trade`, request, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        timeout: 30_000,
    });
}

// ── Express Server ──

async function main(): Promise<void> {
    const config = loadConfig();
    const app = express();

    app.use(helmet());
    app.use(cors({ origin: false }));
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));

    const _db = getDatabase();
    const auth = serviceAuthMiddleware(['admin']);

    // ── Health Check ──
    app.get('/health', (_req, res) => {
        res.json({
            service: 'openclaw-agent-service',
            status: 'healthy',
            mode: config.MODE,
            agents: agents.map((a) => a.strategyId),
            uptime: process.uptime(),
            timestamp: Date.now(),
        });
    });

    // ── Trigger Trading Cycle ──
    app.post('/trigger-cycle', auth, async (_req, res) => {
        try {
            await runTradingCycle();
            res.json({ success: true, message: 'Trading cycle completed' });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Performance Report ──
    app.get('/performance', auth, async (_req, res) => {
        try {
            const report = await performanceTracker.generateReport();
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Run Simulation ──
    app.post('/simulate', auth, async (req, res) => {
        try {
            const simConfig: SimulationConfig = req.body;
            const result = await simulationEngine.runBacktest(
                simConfig,
                async (market, portfolio) => {
                    const signals: TradeSignal[] = [];
                    for (const agent of agents) {
                        const signal = await agent.analyze(market, portfolio, []);
                        if (signal?.trade) signals.push(signal);
                    }
                    return signals;
                }
            );
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Self-Reflection ──
    app.post('/self-reflect', auth, async (_req, res) => {
        try {
            await metaAllocator.selfReflect();
            res.json({ success: true, message: 'Self-reflection complete' });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Schedule trading cycle (every 5 mins) ──
    cron.schedule('*/5 * * * *', () => {
        log.info('⏰ Scheduled trading cycle triggered');
        runTradingCycle().catch((err) =>
            log.error({ error: err.message }, 'Scheduled trading cycle failed')
        );
    });

    // ── Start Server ──
    const port = SERVICE_PORTS.AGENT_SERVICE;
    app.listen(port, () => {
        log.info({ port, mode: config.MODE, agents: agents.length }, 'OpenClaw Agent Service started');
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
        log.info('Shutting down Agent Service...');
        await disconnectDatabase();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    log.error({ error: error.message }, 'Failed to start Agent Service');
    process.exit(1);
});
