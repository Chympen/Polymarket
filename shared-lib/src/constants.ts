// ────────────────────────────────────────
// Risk limit constants — hard-coded, not AI-configurable
// ────────────────────────────────────────

export const RISK_LIMITS = {
    /** Maximum trade size as percentage of total bankroll */
    MAX_TRADE_SIZE_PERCENT: 0.02,

    /** Maximum exposure per single market as percentage of total capital */
    MAX_MARKET_EXPOSURE_PERCENT: 0.10,

    /** Maximum daily drawdown as percentage of portfolio before kill switch */
    MAX_DAILY_DRAWDOWN_PERCENT: 0.03,

    /** Minimum confidence to allow a trade through */
    MIN_CONFIDENCE_THRESHOLD: 0.55,

    /** Maximum number of concurrent open positions */
    MAX_OPEN_POSITIONS: 20,

    /** Maximum slippage tolerance in basis points */
    MAX_SLIPPAGE_BPS: 200,

    /** Capital preservation: reduce trade sizes when drawdown exceeds this */
    CAPITAL_PRESERVATION_DRAWDOWN_THRESHOLD: 0.015,

    /** Capital preservation: size reduction factor */
    CAPITAL_PRESERVATION_SIZE_FACTOR: 0.5,

    /** Maximum retry count for trade execution */
    MAX_RETRY_COUNT: 3,

    /** Retry delay base in milliseconds (exponential backoff) */
    RETRY_DELAY_BASE_MS: 1000,
} as const;

// ── Strategy identifiers ──
export const STRATEGY_IDS = {
    ARBITRAGE: 'arbitrage',
    MOMENTUM: 'momentum',
    MEAN_REVERSION: 'mean-reversion',
    SENTIMENT: 'sentiment',
    PORTFOLIO_OPTIMIZATION: 'portfolio-optimization',
    META_ALLOCATOR: 'meta-allocator',
} as const;

export const STRATEGY_NAMES: Record<string, string> = {
    [STRATEGY_IDS.ARBITRAGE]: 'Arbitrage Agent',
    [STRATEGY_IDS.MOMENTUM]: 'Momentum Agent',
    [STRATEGY_IDS.MEAN_REVERSION]: 'Mean Reversion Agent',
    [STRATEGY_IDS.SENTIMENT]: 'News & Sentiment Agent',
    [STRATEGY_IDS.PORTFOLIO_OPTIMIZATION]: 'Portfolio Optimization Agent',
    [STRATEGY_IDS.META_ALLOCATOR]: 'Meta Strategy Allocator',
};

// ── Service ports ──
export const SERVICE_PORTS = {
    AGENT_SERVICE: 3001,
    RISK_GUARDIAN: 3002,
    TRADE_EXECUTOR: 3003,
} as const;

// ── Polygon / Polymarket ──
export const POLYMARKET = {
    API_BASE: 'https://clob.polymarket.com',
    GAMMA_API_BASE: 'https://gamma-api.polymarket.com',
    POLYGON_RPC_DEFAULT: 'https://polygon-rpc.com',
    CHAIN_ID: 137,
    USDC_ADDRESS: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
    NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
    NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
} as const;
