// ────────────────────────────────────────
// Core domain types for the Polymarket AI Trading Platform
// ────────────────────────────────────────

// ── Trade Signal (output of every agent) ──
export interface TradeSignal {
    trade: boolean;
    marketId: string;
    conditionId: string;
    side: 'YES' | 'NO';
    direction: 'BUY' | 'SELL';
    confidence: number; // 0.0 - 1.0
    positionSizeUsd: number;
    reasoning: string;
    strategyId: string;
    strategyName: string;
    timestamp: number;
}

// ── Market Snapshot ──
export interface MarketSnapshot {
    conditionId: string;
    questionId: string;
    question: string;
    priceYes: number;
    priceNo: number;
    volume24h: number;
    liquidity: number;
    endDate: string | null;
    spread: number;
    priceHistory: PricePoint[];
    orderBookDepth: OrderBookLevel[];
}

export interface PricePoint {
    timestamp: number;
    priceYes: number;
    priceNo: number;
    volume: number;
}

export interface OrderBookLevel {
    price: number;
    size: number;
    side: 'BID' | 'ASK';
}

// ── Portfolio State ──
export interface PortfolioState {
    totalCapital: number;
    availableCapital: number;
    deployedCapital: number;
    totalPnl: number;
    dailyPnl: number;
    dailyPnlPercent: number;
    highWaterMark: number;
    maxDrawdown: number;
    killSwitchActive: boolean;
    capitalPreservation: boolean;
    positions: PositionState[];
}

export interface PositionState {
    marketId: string;
    conditionId: string;
    side: 'YES' | 'NO';
    sizeUsd: number;
    avgEntryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    realizedPnl: number;
}

// ── Risk Check ──
export interface RiskCheckRequest {
    signal: TradeSignal;
    portfolio: PortfolioState;
}

export interface RiskCheckResult {
    approved: boolean;
    adjustedSizeUsd: number;
    rejectionReasons: string[];
    warnings: string[];
    riskMetrics: {
        tradeToCapitalRatio: number;
        marketExposureRatio: number;
        dailyDrawdownRatio: number;
        volatilityAdjustment: number;
    };
}

// ── Trade Execution ──
export interface TradeExecutionRequest {
    marketId: string;
    conditionId: string;
    side: 'YES' | 'NO';
    direction: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    sizeUsd: number;
    limitPrice?: number;
    maxSlippageBps: number;
    strategyId: string;
    confidence: number;
    reasoning: string;
}

export interface TradeExecutionResult {
    success: boolean;
    tradeId: string;
    txHash?: string;
    filledPrice?: number;
    filledSizeUsd?: number;
    slippage?: number;
    gasUsed?: number;
    errorMessage?: string;
    status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'FAILED' | 'CANCELLED';
}

// ── AI Decision Engine ──
export interface AIDecisionInput {
    marketSnapshot: MarketSnapshot;
    recentPriceAction: PricePoint[];
    portfolioState: PortfolioState;
    externalSignals: ExternalSignal[];
    strategyContext: StrategyContext;
}

export interface ExternalSignal {
    source: string;
    signal: string;
    sentiment: number; // -1.0 to 1.0
    confidence: number;
    timestamp: number;
}

export interface StrategyContext {
    strategyId: string;
    strategyName: string;
    historicalAccuracy: number;
    recentPerformance: number;
    currentWeight: number;
}

export interface AIDecisionOutput {
    trade: boolean;
    side: 'YES' | 'NO';
    confidence: number;
    positionSizeUsd: number;
    reasoning: string;
}

// ── Strategy Consensus ──
export interface StrategyVote {
    strategyId: string;
    strategyName: string;
    signal: TradeSignal;
    weight: number;
}

export interface ConsensusResult {
    shouldTrade: boolean;
    side: 'YES' | 'NO';
    aggregateConfidence: number;
    positionSizeUsd: number;
    reasoning: string;
    votes: StrategyVote[];
    consensusMethod: 'WEIGHTED_AVERAGE' | 'MAJORITY' | 'UNANIMOUS';
}

// ── Performance Metrics ──
export interface PerformanceReport {
    totalPnl: number;
    dailyPnl: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    tradeAccuracy: number;
    avgConfidence: number;
    confidenceCalibration: ConfidenceCalibrationBucket[];
    strategyBreakdown: StrategyPerformance[];
}

export interface ConfidenceCalibrationBucket {
    confidenceRange: [number, number];
    predictedRate: number;
    actualRate: number;
    sampleSize: number;
}

export interface StrategyPerformance {
    strategyId: string;
    strategyName: string;
    pnl: number;
    winRate: number;
    sharpeRatio: number;
    trades: number;
    weight: number;
}

// ── Simulation ──
export interface SimulationConfig {
    mode: 'live' | 'simulation';
    startDate?: string;
    endDate?: string;
    initialCapital: number;
    slippageModelBps: number;
    strategies: string[];
}

export interface SimulationResult {
    finalCapital: number;
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
    winRate: number;
    equityCurve: { timestamp: number; equity: number }[];
    strategyScores: StrategyPerformance[];
}

// ── Monte Carlo ──
export interface MonteCarloConfig {
    simulations: number;
    horizonDays: number;
    confidenceLevel: number;
}

export interface MonteCarloResult {
    expectedReturn: number;
    valueAtRisk: number;
    conditionalVaR: number;
    worstCase: number;
    bestCase: number;
    percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
    simulations: number;
}

// ── Risk Events ──
export type RiskEventType =
    | 'DRAWDOWN_BREACH'
    | 'EXPOSURE_BREACH'
    | 'SIZE_REJECT'
    | 'KILL_SWITCH'
    | 'CAPITAL_PRESERVATION'
    | 'VOLATILITY_ADJUSTMENT';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ── Service Communication ──
export interface ServiceHealthStatus {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    version: string;
    timestamp: number;
}

// ── Environment ──
export type AppMode = 'live' | 'simulation';
