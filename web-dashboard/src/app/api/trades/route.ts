import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        // Check Agent Status for Mode filtering
        const agentStatus = await agentApi.status().catch(() => null);
        const isPaperMode = agentStatus?.paper || false;

        const where: Record<string, unknown> = { isPaper: isPaperMode };
        if (status) where.status = status;
        if (strategy) where.strategyId = strategy;

        const [trades, total] = await Promise.all([
            prisma.trade.findMany({
                where,
                include: { market: { select: { question: true, conditionId: true } } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.trade.count({ where }),
        ]);

        return successResponse({ trades, total, limit, offset });
    } catch (error) {
        return handleApiError(error as Error, 'Trades API');
    }
}
