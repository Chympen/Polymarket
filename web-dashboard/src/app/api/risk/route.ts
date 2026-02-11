import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [riskEvents, portfolio] = await Promise.all([
            prisma.riskEvent.findMany({
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
            prisma.portfolio.findFirst({
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        return NextResponse.json({
            riskEvents,
            killSwitchActive: portfolio?.killSwitchActive || false,
            capitalPreservation: portfolio?.capitalPreservation || false,
            maxDrawdown: portfolio?.maxDrawdown || 0,
            dailyPnlPercent: portfolio?.dailyPnlPercent || 0,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch risk data', details: (error as Error).message },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const { action } = await req.json();

        if (action === 'activate-kill-switch') {
            await prisma.portfolio.updateMany({
                data: { killSwitchActive: true },
            });
            return NextResponse.json({ success: true, message: 'Kill switch activated' });
        }

        if (action === 'reset-kill-switch') {
            await prisma.portfolio.updateMany({
                data: { killSwitchActive: false },
            });
            return NextResponse.json({ success: true, message: 'Kill switch reset' });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Risk action failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
