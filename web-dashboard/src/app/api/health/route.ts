import { agentApi, riskApi, executorApi } from '@/lib/api';
import { handleApiError, successResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [agent, risk, executor] = await Promise.all([
            agentApi.health(),
            riskApi.health(),
            executorApi.health(),
        ]);

        return successResponse({
            services: {
                agent: agent ? { ...agent, status: 'online' } : { status: 'offline' },
                risk: risk ? { ...risk, status: 'online' } : { status: 'offline' },
                executor: executor ? { ...executor, status: 'online' } : { status: 'offline' },
            },
            timestamp: Date.now(),
        });
    } catch (error) {
        return handleApiError(error as Error, 'Health API');
    }
}
