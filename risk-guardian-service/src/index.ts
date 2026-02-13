import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import {
    logger,
    loadConfig,
    getDatabase,
    disconnectDatabase,
    serviceAuthMiddleware,
    SERVICE_PORTS,
    RiskCheckRequest,
    MonteCarloConfig,
} from 'shared-lib';
import { PositionSizer } from './services/position-sizer.service';
import { ExposureTracker } from './services/exposure-tracker.service';
import { DrawdownMonitor } from './services/drawdown-monitor.service';
import { VolatilityAdjuster } from './services/volatility-adjuster.service';
import { MonteCarloService } from './services/monte-carlo.service';

const log = logger.child({ module: 'RiskGuardianMain' });

async function main(): Promise<void> {
    const config = loadConfig();
    const app = express();

    app.use(helmet());
    app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));

    // db initialized implicitly


    // Initialize services
    const exposureTracker = new ExposureTracker();
    const drawdownMonitor = new DrawdownMonitor();
    const volatilityAdjuster = new VolatilityAdjuster();
    const positionSizer = new PositionSizer(exposureTracker, drawdownMonitor, volatilityAdjuster);
    const monteCarloService = new MonteCarloService();

    // Auth: only agent service can request risk checks
    const auth: express.RequestHandler = serviceAuthMiddleware(['openclaw-agent-service']);
    // Admin auth for kill-switch operations
    const adminAuth = serviceAuthMiddleware(['openclaw-agent-service', 'admin']);

    // ── Health Check ──
    app.get('/health', (_req, res) => {
        res.json({
            service: 'risk-guardian-service',
            status: 'healthy',
            mode: config.MODE,
            uptime: process.uptime(),
            timestamp: Date.now(),
        });
    });

    // ── Validate Trade ──
    app.post('/validate-trade', auth, async (req, res) => {
        try {
            const request: RiskCheckRequest = req.body;

            log.info(
                {
                    marketId: request.signal.marketId,
                    side: request.signal.side,
                    confidence: request.signal.confidence,
                    sizeUsd: request.signal.positionSizeUsd,
                },
                'Risk validation request received'
            );

            const result = await positionSizer.validateTrade(request);
            res.json(result);
        } catch (error) {
            log.error({ error: (error as Error).message }, 'Risk validation error');
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Get Portfolio Risk ──
    app.get('/portfolio-risk', auth, async (_req, res) => {
        try {
            const exposures = await exposureTracker.getAllExposures();
            const totalExposure = await exposureTracker.getTotalExposure();
            const dailyPnl = await drawdownMonitor.getDailyPnl();

            res.json({
                totalExposure,
                marketExposures: exposures,
                dailyPnl: dailyPnl.pnl,
                dailyPnlPercent: dailyPnl.pnlPercent,
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Monte Carlo Risk Simulation ──
    app.post('/monte-carlo', auth, async (req, res) => {
        try {
            const { portfolioValue, config: mcConfig } = req.body as {
                portfolioValue: number;
                config: MonteCarloConfig;
            };

            const result = await monteCarloService.runSimulation(portfolioValue, mcConfig);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Kill Switch ──
    app.post('/kill-switch', adminAuth, async (req, res) => {
        try {
            const { action } = req.body as { action: 'activate' | 'reset' };

            if (action === 'activate') {
                await getDatabase().portfolio.updateMany({
                    data: { killSwitchActive: true },
                });
                log.error('🚨 KILL SWITCH MANUALLY ACTIVATED');
            } else if (action === 'reset') {
                await drawdownMonitor.resetKillSwitch();
                log.info('Kill switch manually reset');
            }

            res.json({ success: true, action });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Risk Events ──
    app.get('/risk-events', auth, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const events = await getDatabase().riskEvent.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
            res.json(events);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Start Server ──
    const port = SERVICE_PORTS.RISK_GUARDIAN;
    app.listen(port, () => {
        log.info({ port, mode: config.MODE }, 'Risk Guardian Service started');
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
        log.info('Shutting down Risk Guardian Service...');
        await disconnectDatabase();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    log.error({ error: error.message }, 'Failed to start Risk Guardian Service');
    process.exit(1);
});
