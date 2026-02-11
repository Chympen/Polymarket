import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const level = searchParams.get('level');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '100');
        const offset = parseInt(searchParams.get('offset') || '0');

        const where: Record<string, string> = {};
        if (level) where.level = level;
        if (type) where.type = type;

        const [items, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.activityLog.count({ where }),
        ]);

        return NextResponse.json({ items, total, limit, offset });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch activity logs', details: (error as Error).message },
            { status: 500 }
        );
    }
}
