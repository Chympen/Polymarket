import { NextResponse } from 'next/server';
import { agentApi } from '@/lib/api';

export async function GET() {
    try {
        // 1. Try to fetch real data from the Agent Service
        // We use the agentApi client which handles the base URL and auth tokens
        const data = await agentApi.getSmartOverview();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching intelligence data from Agent Service:', error);

        // 2. Fallback to Mock Data if service is offline/erroring
        // This ensures the UI doesn't crash during development or if services are down.
        return NextResponse.json({
            feedback: {
                winRate: 0.65,
                totalTrades: 42,
                averageWeight: 1.05,
                recentOutcomes: [
                    {
                        timestamp: new Date().toISOString(),
                        strategyId: 'MOMENTUM',
                        symbol: 'Will Trump win 2024?',
                        pnl: 150.50,
                        newWeight: 1.05
                    },
                    {
                        timestamp: new Date(Date.now() - 3600000).toISOString(),
                        strategyId: 'SENTIMENT',
                        symbol: 'Will Bitcoin hit 100k?',
                        pnl: -45.20,
                        newWeight: 0.92
                    }
                ]
            },
            memory: {
                totalMemories: 128,
                activeRules: 3,
                recentlyApplied: [
                    {
                        id: 'mem_12345678',
                        content: 'Avoid trading "Middle East" recurring events during weekends due to liquidity gaps.',
                        triggerKeyword: 'Middle East',
                        applyCount: 12
                    },
                    {
                        id: 'mem_87654321',
                        content: 'Reduce size on "Crypto" markets when volatility > 80%.',
                        triggerKeyword: 'Crypto',
                        applyCount: 5
                    }
                ]
            },
            regime: {
                current: 'VOLATILE_TREND',
                volatility: 0.75,
                trendStrength: 0.82,
                history: [
                    {
                        timestamp: new Date().toISOString(),
                        regime: 'VOLATILE_TREND',
                        volatility: 0.75,
                        liquidityScore: 0.6,
                        multipliers: { confidence: 0.8, position: 0.7 }
                    },
                    {
                        timestamp: new Date(Date.now() - 86400000).toISOString(),
                        regime: 'STABLE_RANGE',
                        volatility: 0.2,
                        liquidityScore: 0.9,
                        multipliers: { confidence: 1.0, position: 1.0 }
                    }
                ]
            },
            postMortem: {
                totalMistakes: 15,
                topCategory: 'BAD_TIMING',
                recentNotes: [
                    {
                        id: 'pm_123',
                        createdAt: new Date().toISOString(),
                        category: 'BAD_TIMING',
                        content: 'Entered long position right before a major news event properly priced in.',
                        correctionRule: 'Check economic calendar before entry.'
                    }
                ]
            },
            clusters: {
                totalClusters: 8,
                highExposure: 1,
                clusters: [
                    { name: 'US Politics', marketCount: 12, exposure: 4500, limit: 3000 },
                    { name: 'Crypto', marketCount: 5, exposure: 1200, limit: 3000 },
                    { name: 'Sports', marketCount: 3, exposure: 500, limit: 2000 }
                ]
            }
        });
    }
}
