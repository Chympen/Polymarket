
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const strategy = await prisma.tradingStrategy.findUnique({
            where: { id },
            include: {
                trades: {
                    take: 50,
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!strategy) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        // Calculate Performance Metrics
        const allTrades = await prisma.trade.findMany({
            where: { userStrategyId: id, status: 'FILLED' }
        });

        let totalPnl = 0;
        let wins = 0;
        let losses = 0;
        let totalTradesCount = 0;

        for (const trade of allTrades) {
            if (trade.pnlUsd !== null) {
                totalPnl += trade.pnlUsd;
                if (trade.pnlUsd > 0) wins++;
                else if (trade.pnlUsd < 0) losses++;
            }
            totalTradesCount++;
        }

        const closedTrades = wins + losses;
        const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

        // Perform simplified aggregation for now
        const performance = {
            totalPnl,
            winRate,
            totalTrades: totalTradesCount,
            positions: 0 // Placeholder, or query count of open positions
        };

        // Query open positions count
        const openPositionsCount = await prisma.position.count({
            where: { userStrategyId: id, status: 'OPEN' }
        });
        performance.positions = openPositionsCount;

        return NextResponse.json({ strategy, performance });
    } catch (error) {
        console.error('Failed to fetch strategy:', error);
        return NextResponse.json({ error: 'Failed to fetch strategy' }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();

        // Allowed updates
        const { name, description, keywords, maxDailyTrades, maxPositionSizeUsd, active } = body;

        const updated = await prisma.tradingStrategy.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(keywords && { keywords }), // Assumes array
                ...(maxDailyTrades !== undefined && { maxDailyTrades }),
                ...(maxPositionSizeUsd !== undefined && { maxPositionSizeUsd }),
                ...(active !== undefined && { active }),
            },
        });

        return NextResponse.json({ strategy: updated });
    } catch (error) {
        console.error('Failed to update strategy:', error);
        return NextResponse.json({ error: 'Failed to update strategy' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.tradingStrategy.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete strategy:', error);
        return NextResponse.json({ error: 'Failed to delete strategy' }, { status: 500 });
    }
}
