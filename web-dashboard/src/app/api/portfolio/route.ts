import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executorApi, agentApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. Fetch fast DB data & Agent Status in parallel
        const [portfolio, positions, todayTrades, totalTrades, recentActivity, agentStatus] = await Promise.all([
            prisma.portfolio.findFirst({ orderBy: { createdAt: 'desc' } }),
            prisma.position.findMany({ where: { status: 'OPEN' }, include: { market: true } }),
            prisma.trade.count({ where: { createdAt: { gte: todayStart } } }),
            prisma.trade.count(),
            prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
            agentApi.status().catch(() => null), // Graceful fallback
        ]);

        const isPaper = agentStatus?.paper || false;

        // 2. Determine Portfolio Source (Paper vs Live)
        let displayPortfolio;
        let positionsList = [];
        let walletInfo = null;

        if (isPaper) {
            // 📝 PAPER MODE: Fetch from Agent Memory
            // console.log('📝 fetching paper portfolio...');
            const paperData = await agentApi.getPaperPortfolio();

            if (paperData) {
                displayPortfolio = paperData;
                positionsList = paperData.positions || [];
                // Mock wallet response for frontend consistency
                walletInfo = {
                    polBalance: "0",
                    usdcBalance: (paperData.availableCapital * 1000000).toString(),
                    nativeUsdcBalance: "0"
                };
            }
        } else {
            // 🔌 LIVE MODE: Fetch Wallet Balance (RPC Call)
            // Only fetch real wallet if we are NOT in paper mode
            // console.log('🔌 fetching live portfolio...');
            const walletData = await executorApi.wallet().catch(() => null);
            walletInfo = walletData;

            let dbPortfolio = portfolio || {
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
                // USDC has 6 decimals
                const realUsdc = parseFloat(walletData.usdcBalance || '0') / 1_000_000;
                const nativeUsdc = parseFloat(walletData.nativeUsdcBalance || '0');

                if (nativeUsdc > 0 && realUsdc === 0) {
                    console.log('🚨 WRONG USDC DETECTED! You have Native USDC.');
                }

                const deployed = positions.reduce((sum, p) => sum + p.sizeUsd, 0);

                dbPortfolio = {
                    ...dbPortfolio,
                    availableCapital: realUsdc,
                    totalCapital: realUsdc + deployed,
                    deployedCapital: deployed,
                };
            }

            displayPortfolio = dbPortfolio;
            positionsList = positions;
        }

        return NextResponse.json({
            portfolio: displayPortfolio,
            positions: positionsList,
            todayTrades,
            totalTrades,
            recentActivity,
            wallet: walletInfo,
        });
    } catch (error) {
        console.error('Portfolio fetch error:', error);

        // Diagnostic info for Amplify/Cloud environments
        const diagnosticInfo = {
            hasDbUrl: !!process.env.DATABASE_URL,
            dbUrlLength: process.env.DATABASE_URL?.length || 0,
            nodeEnv: process.env.NODE_ENV,
            agentUrl: process.env.AGENT_SERVICE_URL,
            error: (error as Error).message,
            stack: (error as Error).stack,
        };

        return NextResponse.json(
            {
                error: 'Failed to fetch portfolio data',
                message: (error as Error).message,
                diagnostics: diagnosticInfo
            },
            { status: 500 }
        );
    }
}
