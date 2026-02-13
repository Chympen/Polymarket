import { NextRequest } from 'next/server';
import { agentApi } from '@/lib/api';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { action } = await req.json();

        if (action === 'trigger-cycle') {
            const result = await agentApi.triggerCycle();
            if (!result) throw new Error('Agent service unreachable for trigger-cycle');
            return successResponse(result);
        }

        if (action === 'self-reflect') {
            const result = await agentApi.selfReflect();
            if (!result) throw new Error('Agent service unreachable for self-reflect');
            return successResponse(result);
        }

        return successResponse({ error: 'Unknown action' });
    } catch (error) {
        return handleApiError(error as Error, 'Controls API (POST)');
    }
}
