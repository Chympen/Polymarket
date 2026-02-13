import { NextResponse } from 'next/server';
import { prisma } from './db';

export async function handleApiError(error: Error, routeName: string) {
    console.error(`${routeName} error:`, error);

    // Diagnostic info for Amplify/Cloud environments
    let dbConnected = false;
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbConnected = true;
    } catch (dbError) {
        console.error('Centralized DB connection check failed:', dbError);
    }

    const diagnosticInfo = {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlLength: process.env.DATABASE_URL?.length || 0,
        dbConnected,
        nodeEnv: process.env.NODE_ENV,
        error: error.message,
        prismaError: (error as any)?.code || 'N/A',
        troubleshooting: !dbConnected
            ? "Database connection failed. 1. Verify DATABASE_URL in Amplify Console. 2. If using Neon, ensure 0.0.0.0/0 is allowed in IP Allowlist for testing. 3. Check if migrations were run."
            : "Database connected, but route failed. Check logs for specific query errors."
    };

    return NextResponse.json(
        {
            error: `Failed in ${routeName}`,
            message: error.message,
            diagnostics: diagnosticInfo
        },
        { status: 500 }
    );
}

export function successResponse(data: any) {
    return NextResponse.json(data);
}
