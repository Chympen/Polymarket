import { Request } from 'next/server';
import { agentApi } from '@/lib/api';
import { handleApiError, successResponse } from '@/lib/api-utils';

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

        const res = await agentApi.toggle();
        if (!res) throw new Error('Agent service unreachable for toggle');
        return successResponse(res);
    } catch (error) {
        return handleApiError(error as Error, 'Control API (POST)');
    }
}
