import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVICE_NAME = process.env.SERVICE_NAME || 'unknown-service';

/**
 * Structured logger using Pino.
 * Configured for CloudWatch-compatible JSON output.
 * IMPORTANT: Never log sensitive data (wallet keys, secrets).
 */
export const logger = pino({
    name: SERVICE_NAME,
    level: LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level(label: string) {
            return { level: label };
        },
        bindings(bindings: pino.Bindings) {
            return {
                service: bindings.name,
                pid: bindings.pid,
                hostname: bindings.hostname,
            };
        },
    },
    redact: {
        paths: [
            'privateKey',
            'secret',
            'password',
            'apiKey',
            'wallet.privateKey',
            'headers.authorization',
        ],
        censor: '[REDACTED]',
    },
});

export function createChildLogger(context: Record<string, unknown>): pino.Logger {
    return logger.child(context);
}
