import { getDatabase } from './database';
import { logger } from './logger';

export type ActivityLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'TRADE';
export type ActivityType = 'SYSTEM' | 'ANALYSIS' | 'RISK' | 'EXECUTION' | 'PAPER';

export async function logActivity(
    level: ActivityLevel,
    type: ActivityType,
    message: string,
    details?: any
) {
    const db = getDatabase();
    try {
        await db.activityLog.create({
            data: {
                level,
                type,
                message,
                details: details || {},
            },
        });
    } catch (error) {
        logger.error({ error: (error as Error).message }, 'Failed to write activity log to DB');
    }
}
