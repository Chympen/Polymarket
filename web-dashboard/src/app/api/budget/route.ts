import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = await prisma.budgetConfig.findFirst();

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        // Fetch metrics in parallel
        const [dailyPnl, weeklyPnl, openPositions, todayTrades] = await Promise.all([
            prisma.trade.aggregate({
                where: {
                    status: 'FILLED',
                    createdAt: { gte: todayStart }
                },
                _sum: { pnlUsd: true }
            }),
            prisma.trade.aggregate({
                where: {
                    status: 'FILLED',
                    createdAt: { gte: weekStart }
                },
                _sum: { pnlUsd: true }
            }),
            prisma.position.findMany({
                where: { status: 'OPEN' }
            }),
            prisma.trade.count({
                where: { createdAt: { gte: todayStart } }
            })
        ]);

        const currentExposure = openPositions.reduce((sum, p) => sum + p.sizeUsd, 0);

        return successResponse({
            config: config || {
                maxDailyLossUsd: 50,
                maxWeeklyLossUsd: 200,
                maxTotalExposureUsd: 1000,
                maxTradeSizeUsd: 50,
                minConfidence: 0.55,
                estimatedSlippagePercent: 3.5,
                minLiquidityUsd: 1000,
                minPriceThreshold: 0.08,
                maxPriceThreshold: 0.92,
                alertThresholdPercent: 80,
                tradingPaused: false,
            },
            metrics: {
                dailyLoss: Math.abs(Math.min(0, dailyPnl._sum.pnlUsd || 0)),
                weeklyLoss: Math.abs(Math.min(0, weeklyPnl._sum.pnlUsd || 0)),
                dailyPnl: dailyPnl._sum.pnlUsd || 0,
                weeklyPnl: weeklyPnl._sum.pnlUsd || 0,
                currentExposure,
                todayTrades,
            }
        });
    } catch (error) {
        return handleApiError(error as Error, 'Budget API (GET)');
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const existing = await prisma.budgetConfig.findFirst();

        if (existing) {
            await prisma.budgetConfig.update({
                where: { id: existing.id },
                data: body,
            });
        } else {
            await prisma.budgetConfig.create({ data: body });
        }

        return successResponse({ success: true });
    } catch (error) {
        return handleApiError(error as Error, 'Budget API (POST)');
    }
}
