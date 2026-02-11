import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const status = searchParams.get('status');
        const strategy = searchParams.get('strategy');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        const where: Record<string, unknown> = {};
        if (status) where.status = status;
        if (strategy) where.strategyId = strategy;

        const [trades, total] = await Promise.all([
            prisma.trade.findMany({
                where,
                include: { market: { select: { question: true, conditionId: true } } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.trade.count({ where }),
        ]);

        return NextResponse.json({ trades, total, limit, offset });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch trades', details: (error as Error).message },
            { status: 500 }
        );
    }
}
