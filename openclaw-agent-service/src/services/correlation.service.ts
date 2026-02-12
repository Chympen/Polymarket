import {
    logger,
    getDatabase,
    getConfig,
    MarketSnapshot,
    PortfolioState,
    logActivity,
} from 'shared-lib';
import OpenAI from 'openai';

/**
 * CorrelationService — Multi-Market Correlation Awareness (Feature 5)
 *
 * Groups markets into clusters (e.g., "US Elections", "Crypto"),
 * tracks total exposure per cluster, and reduces confidence/size
 * when cluster exposure is too high.
 */
export class CorrelationService {
    private readonly log = logger.child({ module: 'CorrelationService' });
    private readonly db = getDatabase();
    private openai: OpenAI | null = null;
    private clusterCache: Map<string, any> = new Map();

    constructor() {
        const config = getConfig();
        if (config.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
        }
    }

    /**
     * Cluster markets into groups based on topic similarity.
     */
    async clusterMarkets(markets: MarketSnapshot[]): Promise<Map<string, string[]>> {
        const clusters = new Map<string, string[]>();

        if (this.openai && markets.length > 0) {
            try {
                const config = getConfig();
                const marketList = markets.slice(0, 30).map(m =>
                    `- [${m.conditionId.slice(0, 8)}] "${m.question.slice(0, 80)}"`
                ).join('\n');

                const response = await this.openai.chat.completions.create({
                    model: config.LLM_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: `You group prediction market questions into correlated clusters. Output JSON:
{ "clusters": [ { "name": "Cluster Name", "ids": ["id1", "id2"], "description": "brief description" } ] }
Group markets that would be affected by the same events. Use 3-6 clusters.`,
                        },
                        {
                            role: 'user',
                            content: `Group these markets:\n${marketList}`,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 500,
                    response_format: { type: 'json_object' },
                });

                const content = response.choices[0]?.message?.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    for (const cluster of parsed.clusters || []) {
                        clusters.set(cluster.name, cluster.ids || []);

                        // Persist cluster
                        await this.db.marketCluster.upsert({
                            where: { id: cluster.name },
                            create: {
                                clusterName: cluster.name,
                                description: cluster.description || '',
                                marketIds: cluster.ids || [],
                            },
                            update: {
                                marketIds: cluster.ids || [],
                                description: cluster.description || '',
                            },
                        }).catch(() => {
                            // Upsert by name instead
                            this.db.marketCluster.create({
                                data: {
                                    clusterName: cluster.name,
                                    description: cluster.description || '',
                                    marketIds: cluster.ids || [],
                                },
                            }).catch(() => { });
                        });
                    }
                }
            } catch (error) {
                this.log.warn({ error: (error as Error).message }, 'LLM clustering failed, using heuristic');
                return this.heuristicClustering(markets);
            }
        } else {
            return this.heuristicClustering(markets);
        }

        return clusters;
    }

    /**
     * Check if adding a new position would exceed cluster exposure limits.
     */
    async checkClusterExposure(
        marketId: string,
        marketQuestion: string,
        proposedSizeUsd: number,
        portfolio: PortfolioState
    ): Promise<{
        approved: boolean;
        adjustedSize: number;
        clusterName: string | null;
        clusterExposure: number;
        maxExposure: number;
        reason: string;
    }> {
        try {
            // Find which cluster this market belongs to
            const clusters = await this.db.marketCluster.findMany({
                where: { active: true },
            });

            for (const cluster of clusters) {
                const ids = cluster.marketIds as string[];
                if (!ids || !ids.some((id: string) => marketId.startsWith(id) || id.startsWith(marketId.slice(0, 8)))) {
                    continue;
                }

                // Calculate current exposure in this cluster
                const positions = portfolio.positions.filter(p =>
                    ids.some((id: string) => p.marketId.startsWith(id) || id.startsWith(p.marketId.slice(0, 8)))
                );

                const currentExposure = positions.reduce((sum, p) => sum + p.sizeUsd, 0);
                const maxExposure = cluster.maxExposure || portfolio.totalCapital * 0.15;

                if (currentExposure + proposedSizeUsd > maxExposure) {
                    const adjustedSize = Math.max(0, maxExposure - currentExposure);
                    return {
                        approved: adjustedSize > 1,
                        adjustedSize,
                        clusterName: cluster.clusterName,
                        clusterExposure: currentExposure,
                        maxExposure,
                        reason: `Cluster "${cluster.clusterName}" exposure would exceed limit. Current: $${currentExposure.toFixed(2)}, Max: $${maxExposure.toFixed(2)}`,
                    };
                }

                return {
                    approved: true,
                    adjustedSize: proposedSizeUsd,
                    clusterName: cluster.clusterName,
                    clusterExposure: currentExposure,
                    maxExposure,
                    reason: 'Within cluster exposure limits',
                };
            }
        } catch (error) {
            this.log.warn({ error: (error as Error).message }, 'Cluster exposure check failed');
        }

        return {
            approved: true,
            adjustedSize: proposedSizeUsd,
            clusterName: null,
            clusterExposure: 0,
            maxExposure: portfolio.totalCapital * 0.15,
            reason: 'No cluster found for this market',
        };
    }

    /**
     * Keyword-based heuristic clustering when LLM is unavailable.
     */
    private heuristicClustering(markets: MarketSnapshot[]): Map<string, string[]> {
        const clusters = new Map<string, string[]>();
        const categoryKeywords: Record<string, string[]> = {
            'US Politics': ['trump', 'biden', 'election', 'president', 'congress', 'senate', 'democrat', 'republican', 'gop'],
            'Crypto & DeFi': ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'defi', 'token', 'blockchain', 'solana'],
            'Global Finance': ['fed', 'interest rate', 'inflation', 'gdp', 'stock', 'market', 'recession', 'economy', 'dow'],
            'Sports': ['nba', 'nfl', 'super bowl', 'champion', 'world cup', 'playoffs', 'mvp', 'score'],
            'Tech & AI': ['ai', 'openai', 'google', 'apple', 'tesla', 'spacex', 'microsoft', 'meta', 'nvidia'],
            'Geopolitics': ['war', 'china', 'russia', 'nato', 'ukraine', 'sanctions', 'trade war', 'conflict'],
        };

        for (const market of markets) {
            const q = market.question.toLowerCase();
            let assigned = false;

            for (const [category, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(kw => q.includes(kw))) {
                    const existing = clusters.get(category) || [];
                    existing.push(market.conditionId);
                    clusters.set(category, existing);
                    assigned = true;
                    break;
                }
            }

            if (!assigned) {
                const existing = clusters.get('Other') || [];
                existing.push(market.conditionId);
                clusters.set('Other', existing);
            }
        }

        // Persist clusters
        for (const [name, ids] of clusters) {
            this.db.marketCluster.create({
                data: {
                    clusterName: name,
                    description: `Auto-clustered: ${ids.length} markets`,
                    marketIds: ids,
                },
            }).catch(() => { });
        }

        return clusters;
    }

    /**
     * Get cluster stats for dashboard.
     */
    async getClusterStats(): Promise<{
        clusters: any[];
        totalClusters: number;
    }> {
        const clusters = await this.db.marketCluster.findMany({
            where: { active: true },
            orderBy: { createdAt: 'desc' },
        });

        return {
            clusters: clusters.map((c: any) => ({
                id: c.id,
                name: c.clusterName,
                description: c.description,
                marketCount: Array.isArray(c.marketIds) ? (c.marketIds as string[]).length : 0,
                totalExposure: c.totalExposure,
                maxExposure: c.maxExposure,
                correlationScore: c.correlationScore,
            })),
            totalClusters: clusters.length,
        };
    }
}
