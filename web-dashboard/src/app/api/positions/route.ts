import { prisma } from '@/lib/db';
import { agentApi } from '@/lib/api';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Check Agent Status for Paper Mode
        const agentStatus = await agentApi.status().catch(() => null);
        const isPaper = agentStatus?.paper || false;

        let positionsList = [];

        if (isPaper) {
            // 📝 PAPER MODE: Fetch from Database (Unified)
            positionsList = await prisma.position.findMany({
                where: {
                    status: 'OPEN',
                    isPaper: true
                },
                include: { market: { select: { question: true, conditionId: true, priceYes: true, priceNo: true } } },
                orderBy: { createdAt: 'desc' },
            });
        } else {
            // 🔌 LIVE MODE: Fetch from Database
            positionsList = await prisma.position.findMany({
                where: {
                    status: 'OPEN',
                    isPaper: false
                },
                include: { market: { select: { question: true, conditionId: true, priceYes: true, priceNo: true } } },
                orderBy: { createdAt: 'desc' },
            });
        }

        return successResponse({ positions: positionsList });
    } catch (error) {
        return handleApiError(error as Error, 'Positions API');
    }
}
