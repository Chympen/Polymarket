import {
    logger,
    getDatabase,
    RISK_LIMITS,
    TradeSignal,
    PortfolioState,
    RiskCheckRequest,
    RiskCheckResult,
} from 'shared-lib';
import { ExposureTracker } from './exposure-tracker.service';
import { DrawdownMonitor } from './drawdown-monitor.service';
import { VolatilityAdjuster } from './volatility-adjuster.service';

/**
 * PositionSizer — Mechanical position sizing with hard limits.
 *
 * NO AI, NO ML, NO LLM. Pure arithmetic safety controls.
 *
 * Rules:
 *  1. Max trade size = 2% of bankroll
 *  2. Max exposure per market = 10%
 *  3. Max daily drawdown = 3% → kill switch
 *  4. Volatility-adjusted sizing
 *  5. Capital preservation mode when drawdown > 1.5%
 */
export class PositionSizer {
    private readonly log = logger.child({ module: 'PositionSizer' });
    private readonly db = getDatabase();
    private readonly exposureTracker: ExposureTracker;
    private readonly drawdownMonitor: DrawdownMonitor;
    private readonly volatilityAdjuster: VolatilityAdjuster;

    constructor(
        exposureTracker: ExposureTracker,
        drawdownMonitor: DrawdownMonitor,
        volatilityAdjuster: VolatilityAdjuster
    ) {
        this.exposureTracker = exposureTracker;
        this.drawdownMonitor = drawdownMonitor;
        this.volatilityAdjuster = volatilityAdjuster;
    }

    /**
     * Validate and size a trade signal. Returns approved/rejected with reasons.
     */
    async validateTrade(request: RiskCheckRequest): Promise<RiskCheckResult> {
        const { signal, portfolio } = request;
        const rejectionReasons: string[] = [];
        const warnings: string[] = [];

        // ── Check 1: Kill switch ──
        if (portfolio.killSwitchActive) {
            rejectionReasons.push('KILL_SWITCH_ACTIVE: All trading halted');
            return this.buildResult(false, 0, rejectionReasons, warnings, signal, portfolio);
        }

        // ── Check 2: Minimum confidence threshold ──
        if (signal.confidence < RISK_LIMITS.MIN_CONFIDENCE_THRESHOLD) {
            rejectionReasons.push(
                `CONFIDENCE_TOO_LOW: ${signal.confidence.toFixed(3)} < ${RISK_LIMITS.MIN_CONFIDENCE_THRESHOLD}`
            );
        }

        // ── Check 3: Max trade size (2% of bankroll) ──
        const maxTradeSize = portfolio.totalCapital * RISK_LIMITS.MAX_TRADE_SIZE_PERCENT;
        let adjustedSize = Math.min(signal.positionSizeUsd, maxTradeSize);

        if (signal.positionSizeUsd > maxTradeSize) {
            warnings.push(
                `TRADE_SIZE_CAPPED: ${signal.positionSizeUsd.toFixed(2)} -> ${maxTradeSize.toFixed(2)} (2% limit)`
            );
        }

        // ── Check 4: Market exposure (10% max) ──
        const currentExposure = await this.exposureTracker.getMarketExposure(
            signal.marketId,
            portfolio.totalCapital
        );
        const maxExposure = portfolio.totalCapital * RISK_LIMITS.MAX_MARKET_EXPOSURE_PERCENT;
        const remainingExposure = maxExposure - currentExposure;

        if (remainingExposure <= 0) {
            rejectionReasons.push(
                `MARKET_EXPOSURE_EXCEEDED: ${(currentExposure / portfolio.totalCapital * 100).toFixed(1)}% >= ${RISK_LIMITS.MAX_MARKET_EXPOSURE_PERCENT * 100}%`
            );
        } else if (adjustedSize > remainingExposure) {
            adjustedSize = remainingExposure;
            warnings.push(
                `SIZE_REDUCED_FOR_EXPOSURE: capped to ${adjustedSize.toFixed(2)} (remaining exposure room)`
            );
        }

        // ── Check 5: Daily drawdown (3% max) ──
        const drawdownResult = await this.drawdownMonitor.checkDrawdown(portfolio);

        if (drawdownResult.killSwitch) {
            rejectionReasons.push(
                `DAILY_DRAWDOWN_BREACH: ${(drawdownResult.currentDrawdown * 100).toFixed(2)}% >= ${RISK_LIMITS.MAX_DAILY_DRAWDOWN_PERCENT * 100}%`
            );
            // Activate kill switch
            await this.activateKillSwitch(drawdownResult.currentDrawdown);
        }

        // ── Check 6: Capital preservation mode ──
        if (drawdownResult.capitalPreservation) {
            adjustedSize *= RISK_LIMITS.CAPITAL_PRESERVATION_SIZE_FACTOR;
            warnings.push(
                `CAPITAL_PRESERVATION: Size reduced by ${(1 - RISK_LIMITS.CAPITAL_PRESERVATION_SIZE_FACTOR) * 100}% (drawdown > ${RISK_LIMITS.CAPITAL_PRESERVATION_DRAWDOWN_THRESHOLD * 100}%)`
            );
        }

        // ── Check 7: Volatility-adjusted sizing ──
        const volAdjustment = await this.volatilityAdjuster.getAdjustment(signal.marketId);
        if (volAdjustment < 1.0) {
            adjustedSize *= volAdjustment;
            warnings.push(
                `VOLATILITY_ADJUSTED: Size multiplied by ${volAdjustment.toFixed(3)}`
            );
        }

        // ── Check 8: Sufficient available capital ──
        if (adjustedSize > portfolio.availableCapital) {
            if (portfolio.availableCapital <= 0) {
                rejectionReasons.push('INSUFFICIENT_CAPITAL: No available capital');
            } else {
                adjustedSize = portfolio.availableCapital * 0.95; // Leave 5% buffer
                warnings.push(
                    `SIZE_REDUCED_FOR_CAPITAL: capped to ${adjustedSize.toFixed(2)}`
                );
            }
        }

        // ── Check 9: Minimum trade size ──
        if (adjustedSize < 1.0) {
            rejectionReasons.push(`TRADE_TOO_SMALL: $${adjustedSize.toFixed(2)} < $1.00 minimum`);
        }

        // ── Check 10: Max open positions ──
        const openPositions = await this.db.position.count({
            where: { status: 'OPEN' },
        });
        if (openPositions >= RISK_LIMITS.MAX_OPEN_POSITIONS) {
            rejectionReasons.push(
                `MAX_POSITIONS_REACHED: ${openPositions} >= ${RISK_LIMITS.MAX_OPEN_POSITIONS}`
            );
        }

        const approved = rejectionReasons.length === 0;

        // Log the decision
        this.log.info(
            {
                approved,
                originalSize: signal.positionSizeUsd,
                adjustedSize,
                rejectionReasons,
                warnings,
                marketId: signal.marketId,
            },
            approved ? 'Trade APPROVED' : 'Trade REJECTED'
        );

        // Record risk event if rejected
        if (!approved) {
            await this.recordRiskEvent(signal, rejectionReasons);
        }

        return this.buildResult(approved, adjustedSize, rejectionReasons, warnings, signal, portfolio);
    }

    private buildResult(
        approved: boolean,
        adjustedSizeUsd: number,
        rejectionReasons: string[],
        warnings: string[],
        signal: TradeSignal,
        portfolio: PortfolioState
    ): RiskCheckResult {
        const currentExposure = portfolio.positions
            .filter((p) => p.marketId === signal.marketId)
            .reduce((sum, p) => sum + p.sizeUsd, 0);

        return {
            approved,
            adjustedSizeUsd: approved ? Math.floor(adjustedSizeUsd * 100) / 100 : 0,
            rejectionReasons,
            warnings,
            riskMetrics: {
                tradeToCapitalRatio: signal.positionSizeUsd / portfolio.totalCapital,
                marketExposureRatio: (currentExposure + adjustedSizeUsd) / portfolio.totalCapital,
                dailyDrawdownRatio: Math.abs(portfolio.dailyPnlPercent),
                volatilityAdjustment: 1.0,
            },
        };
    }

    private async activateKillSwitch(drawdown: number): Promise<void> {
        this.log.error(
            { drawdown: (drawdown * 100).toFixed(2) + '%' },
            '🚨 KILL SWITCH ACTIVATED — ALL TRADING HALTED'
        );

        await this.db.portfolio.updateMany({
            data: { killSwitchActive: true },
        });

        await this.db.riskEvent.create({
            data: {
                eventType: 'KILL_SWITCH',
                severity: 'CRITICAL',
                message: `Kill switch activated: daily drawdown ${(drawdown * 100).toFixed(2)}% exceeded ${RISK_LIMITS.MAX_DAILY_DRAWDOWN_PERCENT * 100}% limit`,
                details: { drawdown },
            },
        });
    }

    private async recordRiskEvent(signal: TradeSignal, reasons: string[]): Promise<void> {
        await this.db.riskEvent.create({
            data: {
                eventType: 'SIZE_REJECT',
                severity: 'MEDIUM',
                message: `Trade rejected: ${reasons.join('; ')}`,
                marketId: signal.marketId,
                details: {
                    signal: {
                        side: signal.side,
                        confidence: signal.confidence,
                        positionSizeUsd: signal.positionSizeUsd,
                        strategyId: signal.strategyId,
                    },
                    reasons,
                },
            },
        });
    }
}
