import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = await prisma.budgetConfig.findFirst();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [dailyCosts, monthlyCosts, recentCosts] = await Promise.all([
            prisma.aiCostLog.aggregate({
                where: { createdAt: { gte: todayStart } },
                _sum: { costUsd: true, totalTokens: true },
                _count: true,
            }),
            prisma.aiCostLog.aggregate({
                where: { createdAt: { gte: monthStart } },
                _sum: { costUsd: true, totalTokens: true },
                _count: true,
            }),
            prisma.aiCostLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
        ]);

        // Get per-purpose breakdown
        const purposeBreakdown = await prisma.aiCostLog.groupBy({
            by: ['purpose'],
            where: { createdAt: { gte: monthStart } },
            _sum: { costUsd: true },
            _count: true,
        });

        // Get total trade spend
        const totalTradeSpend = await prisma.trade.aggregate({
            where: { status: 'FILLED' },
            _sum: { sizeUsd: true },
        });

        return NextResponse.json({
            config: config || {
                maxDailyAiSpend: 10,
                maxMonthlyAiSpend: 200,
                maxTotalTradeSpend: 1000,
                maxTradeSize: 50,
                alertThresholdPercent: 80,
                aiSpendingPaused: false,
            },
            dailyAiSpend: dailyCosts._sum.costUsd || 0,
            dailyAiCalls: dailyCosts._count || 0,
            monthlyAiSpend: monthlyCosts._sum.costUsd || 0,
            monthlyAiCalls: monthlyCosts._count || 0,
            monthlyTokens: monthlyCosts._sum.totalTokens || 0,
            purposeBreakdown,
            totalTradeSpend: totalTradeSpend._sum.sizeUsd || 0,
            recentCosts,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch budget data', details: (error as Error).message },
            { status: 500 }
        );
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

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to update budget config', details: (error as Error).message },
            { status: 500 }
        );
    }
}
