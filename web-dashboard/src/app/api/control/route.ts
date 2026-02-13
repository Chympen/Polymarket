import { NextResponse } from 'next/server';
import { agentApi } from '@/lib/api';
import { handleApiError, successResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const status = await agentApi.status();
        return successResponse(status);
    } catch (error) {
        return handleApiError(error as Error, 'Control API (GET)');
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        if (body.action === 'toggleMode') {
            const res = await agentApi.toggleMode();
            if (!res) throw new Error('Agent service unreachable for toggleMode');
            return successResponse(res);
        }

        if (body.action === 'setPaperCapital') {
            const amount = parseFloat(body.amount);
            if (isNaN(amount) || amount < 0) throw new Error('Invalid capital amount');

            // Delegate to Agent Service to ensure memory state remains in sync
            const res = await agentApi.resetPaperPortfolio(amount);
            if (!res || !res.success) throw new Error('Failed to reset paper portfolio via Agent Service');

            return successResponse({ success: true, portfolio: res.portfolio });
        }

        if (body.action === 'setSchedule') {
            const { schedule } = body;
            if (!schedule) throw new Error('Schedule pattern is required');

            const res = await agentApi.updateSchedule(schedule);
            if (!res || !res.success) throw new Error('Failed to update schedule via Agent Service');

            return successResponse({ success: true, schedule: res.schedule });
        }

        const res = await agentApi.toggle();
        if (!res) throw new Error('Agent service unreachable for toggle');
        return successResponse(res);
    } catch (error) {
        return handleApiError(error as Error, 'Control API (POST)');
    }
}
