import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

        return NextResponse.json({
            metrics: metrics.reverse(),
            strategies,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch performance data', details: (error as Error).message },
            { status: 500 }
        );
    }
}
