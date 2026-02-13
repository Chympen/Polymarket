import { prisma } from '@/lib/db';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const positions = await prisma.position.findMany({
            where: { status: 'OPEN' },
            include: { market: { select: { question: true, conditionId: true, priceYes: true, priceNo: true } } },
            orderBy: { createdAt: 'desc' },
        });

        return successResponse({ positions });
    } catch (error) {
        return handleApiError(error as Error, 'Positions API');
    }
}
