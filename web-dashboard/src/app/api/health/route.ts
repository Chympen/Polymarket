import { NextResponse } from 'next/server';
import { agentApi, riskApi, executorApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    const [agent, risk, executor] = await Promise.all([
        agentApi.health(),
        riskApi.health(),
        executorApi.health(),
    ]);

    return NextResponse.json({
        services: {
            agent: agent ? { ...agent, status: 'online' } : { status: 'offline' },
            risk: risk ? { ...risk, status: 'online' } : { status: 'offline' },
            executor: executor ? { ...executor, status: 'online' } : { status: 'offline' },
        },
        timestamp: Date.now(),
    });
}
