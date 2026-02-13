import { NextResponse } from 'next/server';
import { agentApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    const status = await agentApi.status();
    return NextResponse.json(status);
}

export async function POST(req: Request) {
    // Check if it's a mode toggle or active toggle
    try {
        const body = await req.json().catch(() => ({}));
        if (body.action === 'toggleMode') {
            const res = await agentApi.toggleMode();
            if (!res) return NextResponse.json({ paper: false, error: 'Failed to toggle mode' }, { status: 500 });
            return NextResponse.json(res);
        }

        const res = await agentApi.toggle();
        if (!res) return NextResponse.json({ active: false, error: 'Failed to toggle bot' }, { status: 500 });
        return NextResponse.json(res);
    } catch {
        const res = await agentApi.toggle();
        return NextResponse.json(res);
    }
}
