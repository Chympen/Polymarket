import { z } from 'zod';

const envSchema = z.object({
    // General
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MODE: z.enum(['live', 'simulation']).default('simulation'),
    SERVICE_NAME: z.string().min(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Database
    DATABASE_URL: z.string().url(),

    // Auth
    SERVICE_JWT_SECRET: z.string().min(32),

    // Polygon / Polymarket (optional for risk service)
    POLYGON_RPC_URL: z.string().url().optional(),
    POLYMARKET_API_KEY: z.string().optional(),
    POLYMARKET_API_SECRET: z.string().optional(),
    POLYMARKET_API_PASSPHRASE: z.string().optional(),

    // Wallet (only for executor)
    WALLET_SECRET_ARN: z.string().optional(),
    AWS_REGION: z.string().default('us-east-1'),

    // LLM (only for agent service)
    OPENAI_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().default('gpt-4-turbo-preview'),

    // Service URLs
    RISK_GUARDIAN_URL: z.string().url().optional(),
    TRADE_EXECUTOR_URL: z.string().url().optional(),
    AGENT_SERVICE_URL: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let _config: AppConfig | null = null;

/**
 * Loads and validates environment variables.
 * Throws on invalid configuration with detailed error messages.
 */
export function loadConfig(): AppConfig {
    if (_config) return _config;

    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.errors
            .map((e) => `  ${e.path.join('.')}: ${e.message}`)
            .join('\n');
        throw new Error(`Invalid configuration:\n${errors}`);
    }

    _config = result.data;
    return _config;
}

/**
 * Returns the cached config. Must call loadConfig() first.
 */
export function getConfig(): AppConfig {
    if (!_config) {
        throw new Error('Config not loaded. Call loadConfig() first.');
    }
    return _config;
}
