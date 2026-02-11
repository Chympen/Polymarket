import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const portfolio = await prisma.portfolio.findFirst({
            orderBy: { createdAt: 'desc' },
        });

        const positions = await prisma.position.findMany({
            where: { status: 'OPEN' },
            include: { market: true },
        });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [todayTrades, totalTrades, recentActivity] = await Promise.all([
            prisma.trade.count({ where: { createdAt: { gte: todayStart } } }),
            prisma.trade.count(),
            prisma.activityLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
        ]);

        return NextResponse.json({
            portfolio: portfolio || {
                totalCapital: 10000,
                availableCapital: 10000,
                deployedCapital: 0,
                totalPnl: 0,
                dailyPnl: 0,
                dailyPnlPercent: 0,
                highWaterMark: 10000,
                maxDrawdown: 0,
                killSwitchActive: false,
                capitalPreservation: false,
            },
            positions,
            todayTrades,
            totalTrades,
            recentActivity,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch portfolio data', details: (error as Error).message },
            { status: 500 }
        );
    }
}
