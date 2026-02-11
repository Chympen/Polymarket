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
    TradeExecutionRequest,
} from 'shared-lib';
import { WalletService } from './services/wallet.service';
import { PolygonRpcService } from './services/polygon-rpc.service';
import { OrderExecutionService } from './services/order-execution.service';

const log = logger.child({ module: 'TradeExecutorMain' });

async function main(): Promise<void> {
    const config = loadConfig();
    const app = express();

    // Security middleware
    app.use(helmet());
    app.use(cors({ origin: false })); // No CORS — internal service only
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));

    // Initialize services
    const walletService = new WalletService();
    await walletService.initialize();

    const rpcService = new PolygonRpcService();
    const orderService = new OrderExecutionService(walletService, rpcService);

    // ── Health Check ──
    app.get('/health', (_req, res) => {
        res.json({
            service: 'trade-executor-service',
            status: 'healthy',
            mode: config.MODE,
            address: walletService.getAddress(),
            uptime: process.uptime(),
            timestamp: Date.now(),
        });
    });

    // ── Auth middleware for trade endpoints ──
    const auth = serviceAuthMiddleware(['risk-guardian-service', 'openclaw-agent-service']);

    // ── Execute Trade ──
    app.post('/execute-trade', auth, async (req, res) => {
        try {
            const request: TradeExecutionRequest = req.body;

            log.info(
                {
                    marketId: request.marketId,
                    side: request.side,
                    direction: request.direction,
                    sizeUsd: request.sizeUsd,
                },
                'Trade execution request received'
            );

            const result = await orderService.executeTrade(request);
            res.json(result);
        } catch (error) {
            log.error({ error: (error as Error).message }, 'Trade execution error');
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Get Trade Status ──
    app.get('/trade/:tradeId', auth, async (req, res) => {
        try {
            const trade = await getDatabase().trade.findUnique({
                where: { id: req.params.tradeId },
            });

            if (!trade) {
                res.status(404).json({ error: 'Trade not found' });
                return;
            }

            res.json(trade);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Cancel Trade ──
    app.post('/cancel/:tradeId', auth, async (req, res) => {
        try {
            const success = await orderService.cancelOrder(req.params.tradeId);
            res.json({ success });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Get Wallet Info ──
    app.get('/wallet', auth, async (_req, res) => {
        try {
            const address = walletService.getAddress();
            const balance = await walletService.getBalance();
            const usdcBalance = await rpcService.getUsdcBalance(address);

            res.json({
                address,
                maticBalance: balance.toString(),
                usdcBalance: usdcBalance.toString(),
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // ── Start Server ──
    const port = SERVICE_PORTS.TRADE_EXECUTOR;
    app.listen(port, () => {
        log.info(
            { port, mode: config.MODE, address: walletService.getAddress() },
            'Trade Executor Service started'
        );
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
        log.info('Shutting down Trade Executor Service...');
        await walletService.destroy();
        await disconnectDatabase();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    log.error({ error: error.message }, 'Failed to start Trade Executor Service');
    process.exit(1);
});
