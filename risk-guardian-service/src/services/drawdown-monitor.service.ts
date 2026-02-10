import { logger, getDatabase, RISK_LIMITS, PortfolioState } from 'shared-lib';

export interface DrawdownCheckResult {
    currentDrawdown: number;
    killSwitch: boolean;
    capitalPreservation: boolean;
}

/**
 * DrawdownMonitor — Monitors daily drawdown and triggers kill-switch.
 * Mechanical logic only. No AI.
 *
 * Rules:
 *  - If daily drawdown > 3% → kill switch (halt all trading)
 *  - If daily drawdown > 1.5% → capital preservation mode
 */
export class DrawdownMonitor {
    private readonly log = logger.child({ module: 'DrawdownMonitor' });
    private readonly db = getDatabase();

    /**
     * Check current drawdown against limits.
     */
    async checkDrawdown(portfolio: PortfolioState): Promise<DrawdownCheckResult> {
        const dailyDrawdown = Math.abs(portfolio.dailyPnlPercent);

        const killSwitch = dailyDrawdown >= RISK_LIMITS.MAX_DAILY_DRAWDOWN_PERCENT;
        const capitalPreservation =
            dailyDrawdown >= RISK_LIMITS.CAPITAL_PRESERVATION_DRAWDOWN_THRESHOLD;

        if (killSwitch) {
            this.log.error(
                { dailyDrawdown: `${(dailyDrawdown * 100).toFixed(2)}%` },
                '🚨 KILL SWITCH THRESHOLD BREACHED'
            );
        } else if (capitalPreservation) {
            this.log.warn(
                { dailyDrawdown: `${(dailyDrawdown * 100).toFixed(2)}%` },
                '⚠️ Capital preservation mode activated'
            );
        }

        return { currentDrawdown: dailyDrawdown, killSwitch, capitalPreservation };
    }

    /**
     * Get the daily PnL from trades executed today.
     */
    async getDailyPnl(): Promise<{ pnl: number; pnlPercent: number }> {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const trades = await this.db.trade.findMany({
            where: {
                status: 'FILLED',
                createdAt: { gte: todayStart },
            },
        });

        // Calculate realized PnL from filled trades
        let dailyPnl = 0;
        for (const trade of trades) {
            if (trade.filledPrice && trade.filledSizeUsd) {
                // Simplified PnL: assume we're measuring from entry
                const pnl =
                    trade.direction === 'BUY'
                        ? (trade.filledPrice - trade.price) * trade.filledSizeUsd
                        : (trade.price - trade.filledPrice) * trade.filledSizeUsd;
                dailyPnl += pnl;
            }
        }

        // Get current portfolio value
        const portfolio = await this.db.portfolio.findFirst({
            orderBy: { createdAt: 'desc' },
        });

        const totalCapital = portfolio?.totalCapital || 10000;
        const pnlPercent = dailyPnl / totalCapital;

        return { pnl: dailyPnl, pnlPercent };
    }

    /**
     * Reset the kill switch (manual operation).
     */
    async resetKillSwitch(): Promise<void> {
        await this.db.portfolio.updateMany({
            data: { killSwitchActive: false },
        });

        await this.db.riskEvent.create({
            data: {
                eventType: 'KILL_SWITCH',
                severity: 'HIGH',
                message: 'Kill switch manually reset',
                resolved: true,
                resolvedAt: new Date(),
            },
        });

        this.log.info('Kill switch has been manually reset');
    }
}
