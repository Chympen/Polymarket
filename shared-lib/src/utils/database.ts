import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

let prisma: PrismaClient | null = null;

/**
 * Returns a singleton PrismaClient instance.
 * Logs connection events and query performance in development.
 */
export function getDatabase(): PrismaClient {
    if (prisma) return prisma;

    prisma = new PrismaClient({
        log:
            process.env.NODE_ENV === 'development'
                ? [
                    { emit: 'event', level: 'query' },
                    { emit: 'event', level: 'error' },
                    { emit: 'event', level: 'warn' },
                ]
                : [{ emit: 'event', level: 'error' }],
    });

    prisma.$on('error' as never, (e: unknown) => {
        logger.error({ error: e }, 'Prisma error');
    });

    logger.info('Database client initialized');
    return prisma;
}

/**
 * Gracefully disconnect the database client.
 */
export async function disconnectDatabase(): Promise<void> {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
        logger.info('Database client disconnected');
    }
}
