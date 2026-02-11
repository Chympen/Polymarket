import { logger, MonteCarloConfig, MonteCarloResult, getDatabase } from 'shared-lib';

/**
 * MonteCarloService — Monte Carlo risk simulations.
 * Pure statistical computation, no AI.
 *
 * Simulates future portfolio paths using historical return distributions
 * to estimate Value-at-Risk (VaR) and Conditional VaR (CVaR).
 */
export class MonteCarloService {
    private readonly log = logger.child({ module: 'MonteCarlo' });
    private readonly db = getDatabase();

    /**
     * Run Monte Carlo simulation for portfolio risk assessment.
     */
    async runSimulation(
        currentPortfolioValue: number,
        config: MonteCarloConfig
    ): Promise<MonteCarloResult> {
        this.log.info(
            {
                simulations: config.simulations,
                horizon: config.horizonDays,
                confidence: config.confidenceLevel,
            },
            'Starting Monte Carlo simulation'
        );

        // Get historical daily returns
        const dailyReturns = await this.getHistoricalReturns();

        if (dailyReturns.length < 10) {
            // Not enough data - use default assumptions
            return this.defaultResult(currentPortfolioValue, config);
        }

        // Calculate return statistics
        const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
        const variance =
            dailyReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) /
            dailyReturns.length;
        const stdDev = Math.sqrt(variance);

        // Run simulations
        const finalValues: number[] = [];

        for (let sim = 0; sim < config.simulations; sim++) {
            let portfolioValue = currentPortfolioValue;

            for (let day = 0; day < config.horizonDays; day++) {
                // Generate normally distributed random return
                const randomReturn = this.normalRandom(meanReturn, stdDev);
                portfolioValue *= 1 + randomReturn;
            }

            finalValues.push(portfolioValue);
        }

        // Sort for percentile calculations
        finalValues.sort((a, b) => a - b);

        const n = finalValues.length;
        const returns = finalValues.map((v) => (v - currentPortfolioValue) / currentPortfolioValue);
        returns.sort((a, b) => a - b);

        // VaR: loss at the confidence percentile
        const varIndex = Math.floor(n * (1 - config.confidenceLevel));
        const valueAtRisk = currentPortfolioValue - finalValues[varIndex];

        // CVaR: expected loss beyond VaR
        const tailLosses = finalValues.slice(0, varIndex);
        const conditionalVaR =
            tailLosses.length > 0
                ? currentPortfolioValue -
                tailLosses.reduce((s, v) => s + v, 0) / tailLosses.length
                : valueAtRisk;

        const result: MonteCarloResult = {
            expectedReturn:
                (finalValues.reduce((s, v) => s + v, 0) / n - currentPortfolioValue) /
                currentPortfolioValue,
            valueAtRisk,
            conditionalVaR,
            worstCase: currentPortfolioValue - finalValues[0],
            bestCase: finalValues[n - 1] - currentPortfolioValue,
            percentiles: {
                p5: finalValues[Math.floor(n * 0.05)],
                p25: finalValues[Math.floor(n * 0.25)],
                p50: finalValues[Math.floor(n * 0.5)],
                p75: finalValues[Math.floor(n * 0.75)],
                p95: finalValues[Math.floor(n * 0.95)],
            },
            simulations: config.simulations,
        };

        this.log.info(
            {
                expectedReturn: `${(result.expectedReturn * 100).toFixed(2)}%`,
                var: `$${result.valueAtRisk.toFixed(2)}`,
                cvar: `$${result.conditionalVaR.toFixed(2)}`,
            },
            'Monte Carlo simulation complete'
        );

        return result;
    }

    /**
     * Get historical daily returns from performance metrics.
     */
    private async getHistoricalReturns(): Promise<number[]> {
        const metrics = await this.db.performanceMetric.findMany({
            orderBy: { metricDate: 'asc' },
            take: 252,
            select: { dailyPnl: true, portfolioValue: true },
        });

        return metrics
            .filter((m: { portfolioValue: number }) => m.portfolioValue > 0)
            .map((m: { dailyPnl: number; portfolioValue: number }) => m.dailyPnl / m.portfolioValue);
    }

    /**
     * Box-Muller transform for normally distributed random numbers.
     */
    private normalRandom(mean: number, stdDev: number): number {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    /**
     * Default result when insufficient historical data.
     */
    private defaultResult(
        portfolioValue: number,
        config: MonteCarloConfig
    ): MonteCarloResult {
        return {
            expectedReturn: 0,
            valueAtRisk: portfolioValue * 0.05,
            conditionalVaR: portfolioValue * 0.08,
            worstCase: portfolioValue * 0.15,
            bestCase: portfolioValue * 0.10,
            percentiles: {
                p5: portfolioValue * 0.85,
                p25: portfolioValue * 0.95,
                p50: portfolioValue,
                p75: portfolioValue * 1.05,
                p95: portfolioValue * 1.12,
            },
            simulations: config.simulations,
        };
    }
}
