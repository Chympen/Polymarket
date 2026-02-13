import { prisma } from '@/lib/db';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [metrics, strategies] = await Promise.all([
            prisma.performanceMetric.findMany({
                orderBy: { metricDate: 'desc' },
                take: 90,
            }),
            prisma.strategyScore.findMany({
                where: { active: true },
                orderBy: { totalPnl: 'desc' },
            }),
        ]);

        return successResponse({
            metrics: metrics.reverse(),
            strategies,
        });
    } catch (error) {
        return handleApiError(error as Error, 'Performance API');
    }
}
