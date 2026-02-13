
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const strategies = await prisma.tradingStrategy.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                trades: {
                    select: {
                        pnlUsd: true,
                        status: true,
                    }
                },
                positions: {
                    where: { status: 'OPEN' },
                    select: { id: true }
                }
            }
        });

        const strategiesWithStats = strategies.map((s: any) => {
            let totalPnl = 0;
            let wins = 0;
            let losses = 0;
            const totalTrades = s.trades.length;

            s.trades.forEach((t: any) => {
                if (t.pnlUsd !== null) {
                    totalPnl += t.pnlUsd;
                    if (t.pnlUsd > 0) wins++;
                    else if (t.pnlUsd < 0) losses++;
                }
            });

            const closedTrades = wins + losses;
            const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

            // Remove potentially large relations from memory/response if not needed, 
            // but here we just return the calculated stats.
            const { trades, positions, ...rest } = s;

            return {
                ...rest,
                performance: {
                    totalPnl,
                    winRate,
                    totalTrades,
                    openPositions: positions.length
                }
            };
        });

        return NextResponse.json({ strategies: strategiesWithStats });
    } catch (error) {
        console.error('Failed to fetch strategies:', error);
        return NextResponse.json({ error: 'Failed to fetch strategies' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, description, keywords, maxDailyTrades, maxPositionSizeUsd, active } = body;

        if (!name || !keywords || !Array.isArray(keywords)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const strategy = await prisma.tradingStrategy.create({
            data: {
                name,
                description: description || null,
                keywords,
                maxDailyTrades: maxDailyTrades || 5,
                maxPositionSizeUsd: maxPositionSizeUsd || 100.0,
                active: active !== undefined ? active : true,
            },
        });

        return NextResponse.json({ strategy }, { status: 201 });
    } catch (error) {
        console.error('Failed to create strategy:', error);
        return NextResponse.json({ error: 'Failed to create strategy' }, { status: 500 });
    }
}
