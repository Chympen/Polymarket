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
    logActivity,
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
import { RegimeDetector } from './services/regime-detector.service';
import { MemoryService } from './services/memory.service';
import { PostMortemService } from './services/post-mortem.service';
import { FeedbackService } from './services/feedback.service';
import { CorrelationService } from './services/correlation.service';

const log = logger.child({ module: 'AgentServiceMain' });

// ── Service State (Initialized in main) ──
let agents: BaseAgent[] = [];
let metaAllocator: MetaAllocatorAgent;
let decisionEngine: DecisionEngine;
let simulationEngine: SimulationEngine;
let performanceTracker: PerformanceTracker;
let regimeDetector: RegimeDetector;
let memoryService: MemoryService;
let postMortemService: PostMortemService;
let feedbackService: FeedbackService;
let correlationService: CorrelationService;

// Control Switch
let isTradingActive = false; // Default to OFF as requested
let isPaperTrading = process.env.PAPER_TRADING === 'true'; // Controlled by env var
let isCycleRunning = false; // Prevent overlapping AI cycles

// Paper Trading State
let paperPortfolio: PortfolioState = {
    totalCapital: 1000, // $1,000 Starting Cash
    availableCapital: 1000,
    deployedCapital: 0,
    totalPnl: 0,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    highWaterMark: 1000,
    maxDrawdown: 0,
    killSwitchActive: false,
    capitalPreservation: false,
    positions: []
};

/**
 * Update Paper Portfolio values based on live market prices.
 */
function updatePaperPortfolio(markets: MarketSnapshot[]) {
    let currentPortfolioValue = paperPortfolio.availableCapital;
    let deployed = 0;

    // Update each position with current market price
    paperPortfolio.positions = paperPortfolio.positions.map(pos => {
        const market = markets.find(m => m.conditionId === pos.conditionId);
        if (market) {
            pos.currentPrice = pos.side === 'YES' ? market.priceYes : market.priceNo;
            const value = pos.sizeUsd * (pos.currentPrice / pos.avgEntryPrice); // Simplified mark-to-market
            pos.unrealizedPnl = value - pos.sizeUsd;
            currentPortfolioValue += value;
            deployed += value;
        }
        return pos;
    });

    paperPortfolio.totalCapital = currentPortfolioValue;
    paperPortfolio.deployedCapital = deployed;
    paperPortfolio.totalPnl = paperPortfolio.totalCapital - 1000;
    paperPortfolio.dailyPnl = paperPortfolio.totalPnl; // Simplified for now
    paperPortfolio.dailyPnlPercent = (paperPortfolio.totalPnl / 1000) * 100;
}

function initializeServices() {
    log.info('Initializing agents and services...');

    agents = [
        new ArbitrageAgent(),
        new MomentumAgent(),
        new MeanReversionAgent(),
        new MeanReversionAgent(),
        new SentimentAgent(),
        new PortfolioOptimizationAgent(),
    ];

    metaAllocator = new MetaAllocatorAgent();
    decisionEngine = new DecisionEngine();
    simulationEngine = new SimulationEngine();
    performanceTracker = new PerformanceTracker();
    regimeDetector = new RegimeDetector();
    memoryService = new MemoryService();
    postMortemService = new PostMortemService();
    feedbackService = new FeedbackService();
    correlationService = new CorrelationService();

    log.info({ agentCount: agents.length }, 'Services initialized');
}

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
    // 1. Concurrency Guard
    if (isCycleRunning) {
        log.warn('⚠️ Trading cycle already in progress — skipping trigger to save CPU');
        return;
    }

    // 2. Control Switch Check
    if (!isTradingActive) {
        log.info('⏸️ Trading cycle skipped: Bot is PAUSED.');
        return;
    }

    isCycleRunning = true;
    try {

        // Ensure services are initialized
        if (!metaAllocator) {
            throw new Error('Services not initialized. Call initializeServices() first.');
        }

        log.info('🔄 Starting trading cycle...');
        if (isPaperTrading) {
            log.info('📝 PAPER TRADING MODE ACTIVE — No real funds will be used.');
        } else {
            log.warn('⚠️ LIVE TRADING MODE ACTIVE — Real funds AT RISK.');
        }
        await logActivity('INFO', 'SYSTEM', `Starting trading cycle (${isPaperTrading ? 'PAPER' : 'LIVE'})...`);


        // ── Step 1: Fetch active markets ──
        const markets = await fetchActiveMarkets();

        // Update Paper Portfolio Prices
        updatePaperPortfolio(markets);

        log.info({ marketCount: markets.length }, 'Active markets fetched');
        await logActivity('INFO', 'ANALYSIS', `Fetched ${markets.length} active markets. Analyzing top 20...`, {
            marketsAnalyzed: markets.slice(0, 20).map(m => ({
                question: m.question,
                conditionId: m.conditionId,
                priceYes: m.priceYes,
                volume24h: m.volume24h,
                liquidity: m.liquidity,
            })),
        });

        // ── Step 2: Get portfolio state ──
        const portfolio = await getPortfolioState();

        if (portfolio.killSwitchActive) {
            log.error('🚨 Kill switch active — skipping trading cycle');
            await logActivity('WARN', 'SYSTEM', 'Kill switch is ACTIVE. Skipping trading cycle.');
            return;
        }

        // ── Step 3: Run agents on each market ──
        let totalSignals = 0;
        let totalTrades = 0;
        const processedMarketSummaries: Array<{ question: string; signals: number; traded: boolean; outcome?: string }> = [];

        for (const market of markets.slice(0, 20)) {
            // Debug first market
            if (markets.indexOf(market) === 0) {
                log.info({
                    question: market.question,
                    priceYes: market.priceYes,
                    historyLen: market.priceHistory.length,
                    firstPoint: market.priceHistory[0],
                    lastPoint: market.priceHistory[market.priceHistory.length - 1],
                    liquidity: market.liquidity
                }, '🔍 First Market Debug');
            }
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

                if (signals.length === 0) {
                    processedMarketSummaries.push({ question: market.question, signals: 0, traded: false, outcome: 'no_signal' });
                    continue;
                }
                totalSignals += signals.length;

                // ── Step 4: Build consensus ──
                const consensus = await metaAllocator.buildConsensus(signals, market, portfolio);

                if (!consensus.shouldTrade) {
                    processedMarketSummaries.push({ question: market.question, signals: signals.length, traded: false, outcome: 'no_consensus' });
                    continue;
                }

                // ── AI Decision Engine with Memory ──
                // If the math consensus says "Go", let the AI double check it AND potentially learn from memory
                await logActivity('INFO', 'ANALYSIS', `🤖 Asking AI Brain about "${market.question.slice(0, 50)}..."`, {
                    consensusSide: consensus.side
                });

                const aiDecision = await decisionEngine.analyze({
                    marketSnapshot: market,
                    recentPriceAction: market.priceHistory,
                    portfolioState: portfolio,
                    externalSignals: [],
                    strategyContext: {
                        strategyId: 'meta-allocator',
                        strategyName: 'Meta Consensus',
                        historicalAccuracy: 0.6,
                        currentWeight: 1.0,
                        recentPerformance: 0 // Dummy value, likely avg return or similar
                    }
                });

                if (!aiDecision.trade || aiDecision.side !== consensus.side) {
                    log.info({ aiReason: aiDecision.reasoning }, '🤖 AI Vetoed the trade or changed side');
                    processedMarketSummaries.push({ question: market.question, signals: signals.length, traded: false, outcome: 'ai_veto' });
                    continue;
                }

                // Use AI confidence if higher/better? For now, stick to consensus but maybe average them
                // const finalConfidence = (consensus.aggregateConfidence + aiDecision.confidence) / 2;

                // Update consensus reasoning with AI reasoning
                consensus.reasoning = `[AI Brain]: ${aiDecision.reasoning} | [Math]: ${consensus.reasoning}`;


                await logActivity('INFO', 'ANALYSIS', `Found trade consensus for "${market.question.slice(0, 50)}..."`, {
                    side: consensus.side,
                    confidence: consensus.aggregateConfidence,
                    signals: signals.length
                });

                // ── Step 5: Validate with Risk Guardian ──
                const tradeSignal: TradeSignal = {
                    trade: true,
                    marketId: market.conditionId,
                    conditionId: market.conditionId,
                    side: consensus.side,
                    direction: consensus.direction || 'BUY', // Default to BUY if missing
                    confidence: consensus.aggregateConfidence,
                    positionSizeUsd: consensus.positionSizeUsd,
                    reasoning: consensus.reasoning,
                    strategyId: 'meta-allocator',
                    strategyName: 'Meta Strategy Allocator',
                    timestamp: Date.now(),
                };

                // PAPER TRADING CHECK
                if (isPaperTrading) {
                    const direction = consensus.direction || 'BUY';

                    log.info(
                        {
                            market: market.question.slice(0, 50),
                            side: consensus.side,
                            direction,
                            size: consensus.positionSizeUsd.toFixed(2),
                            confidence: consensus.aggregateConfidence.toFixed(3),
                        },
                        `📝 PAPER TRADE SIMULATED (${direction})`
                    );

                    // Execute Paper Trade
                    if (direction === 'BUY') {
                        if (paperPortfolio.availableCapital >= consensus.positionSizeUsd) {
                            paperPortfolio.availableCapital -= consensus.positionSizeUsd;
                            paperPortfolio.deployedCapital += consensus.positionSizeUsd;

                            const entryPrice = consensus.side === 'YES' ? market.priceYes : market.priceNo;

                            paperPortfolio.positions.push({
                                marketId: market.conditionId,
                                conditionId: market.conditionId,
                                side: consensus.side,
                                sizeUsd: consensus.positionSizeUsd,
                                avgEntryPrice: entryPrice,
                                currentPrice: entryPrice,
                                unrealizedPnl: 0,
                                realizedPnl: 0
                            });

                            await logActivity('TRADE', 'PAPER', `[PAPER] Bought ${consensus.side} on "${market.question.slice(0, 30)}..." @ ${entryPrice.toFixed(2)}`, {
                                size: consensus.positionSizeUsd,
                                confidence: consensus.aggregateConfidence,
                                newBalance: paperPortfolio.availableCapital
                            });
                        } else {
                            log.warn('📝 Paper Trading: Insufficient funds');
                        }
                    } else if (direction === 'SELL') {
                        // Handle SELL (Exit)
                        // Find position to sell
                        const posIndex = paperPortfolio.positions.findIndex(p => p.marketId === market.conditionId && p.side === consensus.side);

                        if (posIndex !== -1) {
                            const position = paperPortfolio.positions[posIndex];
                            const currentPrice = consensus.side === 'YES' ? market.priceYes : market.priceNo;
                            const exitValue = position.sizeUsd * (currentPrice / position.avgEntryPrice);
                            const pnl = exitValue - position.sizeUsd;

                            paperPortfolio.availableCapital += exitValue;
                            paperPortfolio.deployedCapital -= position.sizeUsd;
                            paperPortfolio.realizedPnl = (paperPortfolio.realizedPnl || 0) + pnl; // Add realized PnL tracking if needed, mainly strictly capital

                            // For now, assume full exit for simplicity in paper mode or handle partial?
                            // Strategy usually sends full size for stop loss, partial for profit. 
                            // Let's assume consensus.positionSizeUsd determines amount to reduce basis.
                            // But usually PortfolioAgent sends specific size.

                            // Simplified: Remove entire position for now to match 'strategy usually sends full exit on stop loss'.
                            paperPortfolio.positions.splice(posIndex, 1);

                            await logActivity('TRADE', 'PAPER', `[PAPER] Sold ${consensus.side} on "${market.question.slice(0, 30)}..." @ ${currentPrice.toFixed(2)} (PnL: $${pnl.toFixed(2)})`, {
                                exitValue: exitValue,
                                pnl: pnl,
                                newBalance: paperPortfolio.availableCapital
                            });
                        } else {
                            log.warn(`📝 Paper Trading: Cannot SELL, position not found for ${market.question.slice(0, 20)}`);
                        }
                    }

                    processedMarketSummaries.push({ question: market.question, signals: signals.length, traded: true, outcome: `paper_${direction.toLowerCase()}` });
                    continue; // Skip real validation and execution
                }

                const riskResult = await validateWithRiskGuardian(tradeSignal, portfolio);

                if (!riskResult.approved) {
                    log.info(
                        {
                            market: market.question.slice(0, 50),
                            reasons: riskResult.rejectionReasons,
                        },
                        'Trade rejected by Risk Guardian'
                    );
                    await logActivity('WARN', 'RISK', `Risk Guardian rejected trade for "${market.question.slice(0, 30)}..."`, {
                        reasons: riskResult.rejectionReasons
                    });
                    processedMarketSummaries.push({ question: market.question, signals: signals.length, traded: false, outcome: 'risk_rejected' });
                    continue;
                }

                await logActivity('SUCCESS', 'RISK', `Risk Guardian approved trade for "${market.question.slice(0, 30)}..."`, {
                    size: riskResult.adjustedSizeUsd
                });

                // ── Step 6: Execute trade ──
                // ── Step 6: Execute trade ──
                const executionRequest: TradeExecutionRequest = {
                    marketId: market.conditionId,
                    conditionId: market.conditionId,
                    side: consensus.side,
                    direction: consensus.direction || 'BUY',
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
                        direction: consensus.direction || 'BUY',
                        size: riskResult.adjustedSizeUsd.toFixed(2),
                        confidence: consensus.aggregateConfidence.toFixed(3),
                    },
                    '✅ Trade executed'
                );
                await logActivity('TRADE', 'EXECUTION', `Executed ${consensus.direction || 'BUY'} ${consensus.side} for "${market.question.slice(0, 30)}..."`, {
                    side: consensus.side,
                    direction: consensus.direction || 'BUY',
                    size: riskResult.adjustedSizeUsd
                });
                processedMarketSummaries.push({ question: market.question, signals: signals.length, traded: true, outcome: 'executed' });
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
        await logActivity('SUCCESS', 'SYSTEM', `Trading cycle complete. Processed 20 markets, executed ${totalTrades} trades.`, {
            marketsProcessed: processedMarketSummaries,
            signalsGenerated: totalSignals,
            tradesExecuted: totalTrades,
        });
    } catch (error) {
        log.error({ error: (error as Error).message }, '❌ Trading cycle failed');
        await logActivity('ERROR', 'SYSTEM', `Trading cycle FAILED: ${(error as Error).message}`);
    } finally {
        isCycleRunning = false;
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

        return dbMarkets.map((m: { conditionId: string; questionId: string; question: string; priceYes: number; priceNo: number; volume24h: number; liquidity: number; endDate: Date | null }) => ({
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

        return response.data.map((m: any, i: number) => {
            const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
            const priceYes = Number(prices?.[0] || m.bestBid || 0.5);
            const priceNo = Number(prices?.[1] || 1 - priceYes);

            return {
                conditionId: String(m.conditionId || m.condition_id || ''),
                questionId: String(m.questionId || m.question_id || ''),
                question: String(m.question || ''),
                priceYes,
                priceNo,
                volume24h: Number(m.volume24hr || m.volume || 0),
                liquidity: Number(m.liquidity || 0),
                endDate: m.endDate ? String(m.endDate) : null,
                spread: Number(m.spread || 0),
                priceHistory: [],
                orderBookDepth: [],
            };
        });
    } catch (error) {
        log.error({ error: (error as Error).message }, 'Failed to fetch markets');
        return [];
    }
}

/**
 * Generate synthetic price history for testing/simulation.
 * Creates a random walk ending at currentPrice.
 */
function generateSyntheticHistory(currentPrice: number, index: number): any[] {
    const history = [];
    const steps = 30; // 30 hours history (enough for all agents)
    const now = Date.now();

    // Pattern 0: Bull Trend (Triggers Momentum)
    // Pattern 1: Oversold Dip (Triggers Mean Reversion)
    // Pattern 2: Flat/Random (No Trade)
    const pattern = index % 3;



    // Generate backwards from now
    for (let i = 0; i < steps; i++) {
        const timeOffset = (steps - 1 - i) * 3600 * 1000;

        let val = 0;
        if (pattern === 0) {
            // Strong trend up: price was lower in the past
            // e.g. current 0.7 -> t-1 0.68 -> ...
            val = currentPrice * (1 - (steps - 1 - i) * 0.015);
        } else if (pattern === 1) {
            // Oversold: price was stable/higher then crashed
            // Mean ~ current * 1.2, but current is low
            if (i > steps - 5) {
                // Recent crash
                val = currentPrice;
            } else {
                // Was higher before
                val = currentPrice * 1.3;
            }
        } else {
            // Random walk
            val = currentPrice * (0.9 + Math.random() * 0.2);
        }

        // Add noise
        val = val * (0.98 + Math.random() * 0.04);
        val = Math.max(0.01, Math.min(0.99, val));

        history.push({
            timestamp: now - timeOffset,
            priceYes: val,
            priceNo: 1 - val,
            volume: 10000 + Math.random() * 50000
        });
    }

    // Ensure the last point matches current price exactly
    history[history.length - 1].priceYes = currentPrice;
    history[history.length - 1].priceNo = 1 - currentPrice;
    return history;
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
        positions: positions.map((p: { marketId: string; side: string; sizeUsd: number; avgEntryPrice: number; currentPrice: number; unrealizedPnl: number; realizedPnl: number }) => ({
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
    // 1. Load config FIRST
    const config = loadConfig();

    // 2. Initialize agents (connects to DB)
    initializeServices();

    const app = express();

    app.use(helmet());
    app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));

    // db initialized implicitly
    const auth = serviceAuthMiddleware(['admin']) as any;

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

    // ── Smart Overview (Combined Intelligence Data) ──
    app.get('/smart-overview', auth, async (_req, res) => {
        try {
            const [feedback, memory, regimeHistory, postMortem, clusters] = await Promise.all([
                feedbackService.getFeedbackSummary(),
                memoryService.getMemoryStats(),
                regimeDetector.getRegimeHistory(10),
                postMortemService.getPostMortemStats(),
                correlationService.getClusterStats(),
            ]);

            res.json({
                feedback,
                memory,
                regime: {
                    current: regimeDetector.getCurrentRegime()?.regime || 'STABLE_RANGE',
                    history: regimeHistory,
                },
                postMortem,
                clusters,
                timestamp: Date.now(),
            });
        } catch (error) {
            log.error({ error: (error as Error).message }, 'Failed to generate smart overview');
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Control Switch ──
    app.get('/status', (_req, res) => {
        res.json({ active: isTradingActive, paper: isPaperTrading });
    });

    app.post('/toggle', auth, (_req, res) => {
        isTradingActive = !isTradingActive;
        log.info({ active: isTradingActive }, 'Trading bot status toggled');
        res.json({ active: isTradingActive });
    });

    app.post('/toggle-mode', auth, (_req, res) => {
        isPaperTrading = !isPaperTrading;
        log.info({ paper: isPaperTrading }, 'Trading mode toggled');
        res.json({ paper: isPaperTrading });
    });

    app.get('/paper-portfolio', auth, (_req, res) => {
        res.json(paperPortfolio);
    });

    // ── Schedule trading cycle (every 1 minute) ──
    cron.schedule('*/1 * * * *', () => {
        log.info('⏰ Scheduled trading cycle triggered');
        runTradingCycle().catch((err) =>
            log.error({ error: err.message }, 'Scheduled trading cycle failed')
        );
    });

    // ── Schedule Post-Mortem Analysis (Every Hour) ──
    cron.schedule('0 * * * *', () => {
        log.info('💀 Starting Post-Mortem Analysis...');
        postMortemService.analyzeRecentLosses().then((count) => {
            if (count > 0) log.info({ count }, '💀 Post-Mortem complete: New lessons learned');
        }).catch((err) =>
            log.error({ error: err.message }, 'Post-Mortem Analysis failed')
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
