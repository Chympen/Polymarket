import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executorApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Fetch DB data and Wallat Balance in parallel
        const [portfolio, positions, walletData] = await Promise.all([
            prisma.portfolio.findFirst({ orderBy: { createdAt: 'desc' } }),
            prisma.position.findMany({ where: { status: 'OPEN' }, include: { market: true } }),
            executorApi.wallet(),
        ]);

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

        // Use real wallet balance if available
        let displayPortfolio = portfolio || {
            totalCapital: 0,
            availableCapital: 0,
            deployedCapital: 0,
            totalPnl: 0,
            dailyPnl: 0,
            dailyPnlPercent: 0,
            highWaterMark: 0,
            maxDrawdown: 0,
            killSwitchActive: false,
            capitalPreservation: false,
        };

        if (walletData && walletData.usdcBalance) {
            const realUsdc = parseFloat(walletData.usdcBalance);
            // Assuming deployed capital is calculated from open positions
            const deployed = positions.reduce((sum, p) => sum + p.sizeUsd, 0);

            displayPortfolio = {
                ...displayPortfolio,
                availableCapital: realUsdc,
                totalCapital: realUsdc + deployed,
                deployedCapital: deployed,
            };
        }

        return NextResponse.json({
            portfolio: displayPortfolio,
            positions,
            todayTrades,
            totalTrades,
            recentActivity,
            wallet: walletData, // Pass full wallet data (including MATIC) if needed by frontend
        });
    } catch (error) {
        console.error('Portfolio fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch portfolio data', details: (error as Error).message },
            { status: 500 }
        );
    }
}
