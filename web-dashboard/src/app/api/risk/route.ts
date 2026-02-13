import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError, successResponse } from '@/lib/api-utils';

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

        return successResponse({
            riskEvents,
            killSwitchActive: portfolio?.killSwitchActive || false,
            capitalPreservation: portfolio?.capitalPreservation || false,
            maxDrawdown: portfolio?.maxDrawdown || 0,
            dailyPnlPercent: portfolio?.dailyPnlPercent || 0,
        });
    } catch (error) {
        return handleApiError(error as Error, 'Risk API (GET)');
    }
}

export async function POST(req: NextRequest) {
    try {
        const { action } = await req.json();

        if (action === 'activate-kill-switch') {
            await prisma.portfolio.updateMany({
                data: { killSwitchActive: true },
            });
            return successResponse({ success: true, message: 'Kill switch activated' });
        }

        if (action === 'reset-kill-switch') {
            await prisma.portfolio.updateMany({
                data: { killSwitchActive: false },
            });
            return successResponse({ success: true, message: 'Kill switch reset' });
        }

        return successResponse({ error: 'Unknown action' }); // sucessResponse but with error message as data
    } catch (error) {
        return handleApiError(error as Error, 'Risk API (POST)');
    }
}
