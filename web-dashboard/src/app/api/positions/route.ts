import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const positions = await prisma.position.findMany({
            where: { status: 'OPEN' },
            include: { market: { select: { question: true, conditionId: true, priceYes: true, priceNo: true } } },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ positions });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch positions', details: (error as Error).message },
            { status: 500 }
        );
    }
}
