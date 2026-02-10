import axios from 'axios';
import {
    logger,
    getConfig,
    getDatabase,
    POLYMARKET,
    RISK_LIMITS,
    TradeExecutionRequest,
    TradeExecutionResult,
} from 'shared-lib';
import { WalletService } from './wallet.service';
import { PolygonRpcService } from './polygon-rpc.service';

/**
 * OrderExecutionService — Executes trades on Polymarket via the CLOB API.
 *
 * Implements:
 *  - Market and limit orders
 *  - Slippage protection
 *  - Gas optimization
 *  - Retry logic with exponential backoff
 *  - Transaction confirmation monitoring
 *  - Failure recovery
 */
export class OrderExecutionService {
    private readonly log = logger.child({ module: 'OrderExecutionService' });
    private readonly walletService: WalletService;
    private readonly rpcService: PolygonRpcService;
    private readonly db = getDatabase();

    constructor(walletService: WalletService, rpcService: PolygonRpcService) {
        this.walletService = walletService;
        this.rpcService = rpcService;
    }

    /**
     * Execute a trade with full lifecycle management.
     */
    async executeTrade(request: TradeExecutionRequest): Promise<TradeExecutionResult> {
        const tradeLog = this.log.child({
            marketId: request.marketId,
            side: request.side,
            direction: request.direction,
            sizeUsd: request.sizeUsd,
        });

        // Create trade record in PENDING state
        const trade = await this.db.trade.create({
            data: {
                marketId: request.marketId,
                side: request.side,
                type: request.type,
                direction: request.direction,
                sizeUsd: request.sizeUsd,
                price: request.limitPrice || 0,
                strategyId: request.strategyId,
                confidence: request.confidence,
                reasoning: request.reasoning,
                status: 'PENDING',
            },
        });

        tradeLog.info({ tradeId: trade.id }, 'Trade record created');

        try {
            // Pre-flight checks
            await this.preFlightChecks(request, tradeLog);

            // Get current market price for slippage calculation
            const marketPrice = await this.getMarketPrice(request.conditionId, request.side);
            tradeLog.info({ marketPrice }, 'Current market price fetched');

            // Check slippage tolerance
            if (request.type === 'MARKET') {
                const slippageBps = Math.abs(marketPrice - (request.limitPrice || marketPrice)) * 10000;
                if (slippageBps > request.maxSlippageBps) {
                    throw new Error(
                        `Slippage ${slippageBps.toFixed(0)}bps exceeds max ${request.maxSlippageBps}bps`
                    );
                }
            }

            // Execute with retry
            const result = await this.executeWithRetry(request, trade.id, tradeLog);

            return result;
        } catch (error) {
            const errorMsg = (error as Error).message;
            tradeLog.error({ tradeId: trade.id, error: errorMsg }, 'Trade execution failed');

            await this.db.trade.update({
                where: { id: trade.id },
                data: { status: 'FAILED', errorMessage: errorMsg },
            });

            return {
                success: false,
                tradeId: trade.id,
                errorMessage: errorMsg,
                status: 'FAILED',
            };
        }
    }

    /**
     * Pre-flight checks before trade execution.
     */
    private async preFlightChecks(
        request: TradeExecutionRequest,
        tradeLog: typeof this.log
    ): Promise<void> {
        const config = getConfig();

        // Check simulation mode
        if (config.MODE === 'simulation') {
            tradeLog.info('Running in simulation mode — skipping wallet checks');
            return;
        }

        // Check MATIC balance for gas
        const balance = await this.walletService.getBalance();
        const minGasBalance = BigInt(1e16); // 0.01 MATIC
        if (balance < minGasBalance) {
            throw new Error(`Insufficient MATIC for gas: ${balance.toString()}`);
        }

        // Check USDC balance for trade
        const address = this.walletService.getAddress();
        const usdcBalance = await this.rpcService.getUsdcBalance(address);
        const requiredUsdc = BigInt(Math.ceil(request.sizeUsd * 1e6)); // USDC has 6 decimals
        if (usdcBalance < requiredUsdc) {
            throw new Error(
                `Insufficient USDC: have ${usdcBalance.toString()}, need ${requiredUsdc.toString()}`
            );
        }

        tradeLog.info('Pre-flight checks passed');
    }

    /**
     * Execute trade with exponential backoff retry.
     */
    private async executeWithRetry(
        request: TradeExecutionRequest,
        tradeId: string,
        tradeLog: typeof this.log
    ): Promise<TradeExecutionResult> {
        const maxRetries = RISK_LIMITS.MAX_RETRY_COUNT;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = RISK_LIMITS.RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
                    tradeLog.info({ attempt, delay }, 'Retrying trade execution');
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    await this.db.trade.update({
                        where: { id: tradeId },
                        data: { retryCount: attempt },
                    });
                }

                const config = getConfig();

                // In simulation mode, return a simulated result
                if (config.MODE === 'simulation') {
                    return this.simulateExecution(request, tradeId, tradeLog);
                }

                // Place order via Polymarket CLOB API
                const orderResult = await this.placeOrder(request, tradeLog);

                // Update trade record
                await this.db.trade.update({
                    where: { id: tradeId },
                    data: {
                        status: 'FILLED',
                        txHash: orderResult.txHash,
                        filledPrice: orderResult.filledPrice,
                        filledSizeUsd: orderResult.filledSizeUsd,
                        slippage: orderResult.slippage,
                        gasUsed: orderResult.gasUsed,
                    },
                });

                tradeLog.info(
                    {
                        tradeId,
                        txHash: orderResult.txHash,
                        filledPrice: orderResult.filledPrice,
                    },
                    'Trade executed successfully'
                );

                return {
                    success: true,
                    tradeId,
                    txHash: orderResult.txHash,
                    filledPrice: orderResult.filledPrice,
                    filledSizeUsd: orderResult.filledSizeUsd,
                    slippage: orderResult.slippage,
                    gasUsed: orderResult.gasUsed,
                    status: 'FILLED',
                };
            } catch (error) {
                lastError = error as Error;
                tradeLog.warn(
                    { attempt, error: lastError.message },
                    'Trade execution attempt failed'
                );
            }
        }

        throw lastError || new Error('Trade execution failed after retries');
    }

    /**
     * Place an order on Polymarket CLOB.
     */
    private async placeOrder(
        request: TradeExecutionRequest,
        tradeLog: typeof this.log
    ): Promise<{
        txHash: string;
        filledPrice: number;
        filledSizeUsd: number;
        slippage: number;
        gasUsed: number;
    }> {
        const config = getConfig();

        // Build the order payload
        const orderPayload = {
            tokenID: request.conditionId,
            side: request.direction === 'BUY' ? 'BUY' : 'SELL',
            size: request.sizeUsd.toString(),
            price: request.limitPrice?.toString() || undefined,
            type: request.type === 'LIMIT' ? 'GTC' : 'FOK', // Good-til-cancel or Fill-or-kill
            feeRateBps: '0',
            nonce: Date.now().toString(),
            expiration: Math.floor(Date.now() / 1000 + 3600).toString(), // 1 hour
        };

        // Sign the order using EIP-712
        const domain = {
            name: 'Polymarket CTF Exchange',
            version: '1',
            chainId: POLYMARKET.CHAIN_ID,
            verifyingContract: POLYMARKET.CTF_EXCHANGE,
        };

        const types = {
            Order: [
                { name: 'tokenID', type: 'uint256' },
                { name: 'side', type: 'uint8' },
                { name: 'size', type: 'uint256' },
                { name: 'price', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expiration', type: 'uint256' },
            ],
        };

        const signature = await this.walletService.signTypedData(domain, types, orderPayload as unknown as Record<string, unknown>);

        // Submit to CLOB API
        const response = await axios.post(
            `${POLYMARKET.API_BASE}/order`,
            {
                order: orderPayload,
                signature,
                owner: this.walletService.getAddress(),
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.POLYMARKET_API_KEY && {
                        'POLY_API_KEY': config.POLYMARKET_API_KEY,
                        'POLY_API_SECRET': config.POLYMARKET_API_SECRET,
                        'POLY_PASSPHRASE': config.POLYMARKET_API_PASSPHRASE,
                    }),
                },
                timeout: 30_000,
            }
        );

        tradeLog.info({ orderResponse: response.data }, 'Order submitted to CLOB');

        // Monitor transaction confirmation
        const txHash = response.data.transactionsHashes?.[0] || response.data.orderID;

        if (txHash && txHash.startsWith('0x')) {
            const receipt = await this.rpcService.waitForTransaction(txHash, 2, 60_000);
            if (!receipt || receipt.status === 0) {
                throw new Error(`Transaction failed or timed out: ${txHash}`);
            }
        }

        const filledPrice = parseFloat(response.data.filledPrice || response.data.price || '0');
        const filledSize = parseFloat(response.data.filledSize || request.sizeUsd.toString());

        return {
            txHash: txHash || 'pending',
            filledPrice,
            filledSizeUsd: filledSize,
            slippage: Math.abs(filledPrice - (request.limitPrice || filledPrice)) * 10000,
            gasUsed: 0,
        };
    }

    /**
     * Simulate trade execution for backtesting.
     */
    private async simulateExecution(
        request: TradeExecutionRequest,
        tradeId: string,
        tradeLog: typeof this.log
    ): Promise<TradeExecutionResult> {
        // Get market price
        const price = await this.getMarketPrice(request.conditionId, request.side);

        // Apply simulated slippage (random 0-50bps)
        const slippageBps = Math.random() * 50;
        const slippageMultiplier = request.direction === 'BUY'
            ? 1 + slippageBps / 10000
            : 1 - slippageBps / 10000;
        const filledPrice = price * slippageMultiplier;

        // Simulate fill
        const filledSizeUsd = request.sizeUsd * (0.95 + Math.random() * 0.05); // 95-100% fill

        await this.db.trade.update({
            where: { id: tradeId },
            data: {
                status: 'FILLED',
                filledPrice,
                filledSizeUsd,
                slippage: slippageBps,
                txHash: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            },
        });

        tradeLog.info({ tradeId, filledPrice, filledSizeUsd }, 'Simulated trade executed');

        return {
            success: true,
            tradeId,
            txHash: `sim_${tradeId}`,
            filledPrice,
            filledSizeUsd,
            slippage: slippageBps,
            gasUsed: 0,
            status: 'FILLED',
        };
    }

    /**
     * Get current market price from Polymarket API.
     */
    private async getMarketPrice(conditionId: string, side: 'YES' | 'NO'): Promise<number> {
        try {
            const response = await axios.get(`${POLYMARKET.API_BASE}/prices`, {
                params: { token_id: conditionId },
                timeout: 10_000,
            });

            const price = side === 'YES' ? response.data.yes : response.data.no;
            return parseFloat(price) || 0.5;
        } catch (_error) {
            this.log.warn({ conditionId }, 'Failed to fetch market price, using 0.5 default');
            return 0.5;
        }
    }

    /**
     * Cancel a pending order.
     */
    async cancelOrder(tradeId: string): Promise<boolean> {
        const trade = await this.db.trade.findUnique({ where: { id: tradeId } });
        if (!trade || trade.status !== 'PENDING') {
            return false;
        }

        await this.db.trade.update({
            where: { id: tradeId },
            data: { status: 'CANCELLED' },
        });

        this.log.info({ tradeId }, 'Order cancelled');
        return true;
    }
}
