import { logger, getDatabase } from 'shared-lib';

/**
 * ExposureTracker — Tracks per-market exposure.
 * Purely mechanical: sums all open positions per market.
 */
export class ExposureTracker {
    private readonly log = logger.child({ module: 'ExposureTracker' });
    private readonly db = getDatabase();

    /**
     * Returns the total USD exposure for a specific market.
     */
    async getMarketExposure(marketId: string, _totalCapital: number): Promise<number> {
        const positions = await this.db.position.findMany({
            where: { marketId, status: 'OPEN' },
        });

        const totalExposure = positions.reduce((sum: number, pos: { sizeUsd: number }) => sum + pos.sizeUsd, 0);

        this.log.debug({ marketId, totalExposure }, 'Market exposure calculated');
        return totalExposure;
    }

    /**
     * Returns exposure breakdown for all markets.
     */
    async getAllExposures(): Promise<
        { marketId: string; exposure: number; positionCount: number }[]
    > {
        const positions = await this.db.position.findMany({
            where: { status: 'OPEN' },
        });

        const exposureMap = new Map<string, { exposure: number; count: number }>();

        for (const pos of positions) {
            const existing = exposureMap.get(pos.marketId) || { exposure: 0, count: 0 };
            existing.exposure += pos.sizeUsd;
            existing.count += 1;
            exposureMap.set(pos.marketId, existing);
        }

        return Array.from(exposureMap.entries()).map(([marketId, data]) => ({
            marketId,
            exposure: data.exposure,
            positionCount: data.count,
        }));
    }

    /**
     * Returns the total portfolio exposure (sum of all open positions).
     */
    async getTotalExposure(): Promise<number> {
        const result = await this.db.position.aggregate({
            where: { status: 'OPEN' },
            _sum: { sizeUsd: true },
        });
        return result._sum.sizeUsd || 0;
    }
}
