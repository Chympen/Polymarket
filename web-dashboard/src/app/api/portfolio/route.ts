import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executorApi, agentApi } from '@/lib/api';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. Fetch Agent Status & Recent Activity in parallel
        const [agentStatus, recentActivity] = await Promise.all([
            agentApi.status().catch(() => null),
            prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
        ]);

        const isPaper = agentStatus?.paper || false;

        // 2. Fetch statistics filtered by Paper/Live mode
        const [modePortfolio, modePositions, modeTodayTrades, modeTotalTrades] = await Promise.all([
            prisma.portfolio.findFirst({ where: { isPaper }, orderBy: { createdAt: 'desc' } }),
            prisma.position.findMany({ where: { status: 'OPEN', isPaper }, include: { market: true } }),
            prisma.trade.count({ where: { isPaper, createdAt: { gte: todayStart } } }),
            prisma.trade.count({ where: { isPaper } }),
        ]);

        let displayPortfolio;
        let positionsList = [];
        let walletInfo = null;

        if (isPaper) {
            // 📝 PAPER MODE: Use Database Snapshots
            displayPortfolio = modePortfolio || {
                totalCapital: 1000000,
                availableCapital: 1000000,
                deployedCapital: 0,
                totalPnl: 0,
                dailyPnl: 0,
                dailyPnlPercent: 0,
                highWaterMark: 1000000,
                maxDrawdown: 0,
                killSwitchActive: false,
                capitalPreservation: false,
            };
            positionsList = modePositions;
            walletInfo = {
                polBalance: "0",
                usdcBalance: ((displayPortfolio?.availableCapital || 0) * 1000000).toString(),
                nativeUsdcBalance: "0"
            };
        } else {
            // 🔌 LIVE MODE: Fetch Wallet Balance (RPC Call)
            const walletData = await executorApi.wallet().catch(() => null);
            walletInfo = walletData;

            let dbPortfolio = modePortfolio || {
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

            if (walletData) {
                const realUsdc = parseFloat(walletData.usdcBalance || '0') / 1_000_000;
                const deployed = modePositions.reduce((sum: number, p: any) => sum + p.sizeUsd, 0);

                dbPortfolio = {
                    ...dbPortfolio,
                    availableCapital: realUsdc,
                    totalCapital: realUsdc + deployed,
                    deployedCapital: deployed,
                };
            }

            displayPortfolio = dbPortfolio;
            positionsList = modePositions;
        }

        return successResponse({
            portfolio: displayPortfolio,
            positions: positionsList,
            todayTrades: modeTodayTrades,
            totalTrades: modeTotalTrades,
            recentActivity,
            wallet: walletInfo,
        });
    } catch (error) {
        return handleApiError(error as Error, 'Portfolio API');
    }
}
