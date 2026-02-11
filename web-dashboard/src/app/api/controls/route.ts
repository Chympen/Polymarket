import { NextRequest, NextResponse } from 'next/server';
import { agentApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { action } = await req.json();

        if (action === 'trigger-cycle') {
            const result = await agentApi.triggerCycle();
            if (!result) {
                return NextResponse.json({ error: 'Agent service unreachable' }, { status: 503 });
            }
            return NextResponse.json(result);
        }

        if (action === 'self-reflect') {
            const result = await agentApi.selfReflect();
            if (!result) {
                return NextResponse.json({ error: 'Agent service unreachable' }, { status: 503 });
            }
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Control action failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
