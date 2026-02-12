import { NextResponse } from 'next/server';
import { agentApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    const status = await agentApi.status();
    return NextResponse.json(status);
}

export async function POST() {
    const result = await agentApi.toggle();
    return NextResponse.json(result);
}
