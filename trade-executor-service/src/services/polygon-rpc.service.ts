import { ethers } from 'ethers';
import { logger, getConfig, POLYMARKET } from 'shared-lib';

/**
 * PolygonRpcService — Manages Polygon blockchain interactions.
 * Handles gas estimation, nonce management, and transaction monitoring.
 */
export class PolygonRpcService {
    private provider: ethers.JsonRpcProvider;
    private readonly log = logger.child({ module: 'PolygonRpcService' });

    constructor() {
        const config = getConfig();
        const rpcUrl = config.POLYGON_RPC_URL || POLYMARKET.POLYGON_RPC_DEFAULT;

        this.provider = new ethers.JsonRpcProvider(rpcUrl, {
            chainId: POLYMARKET.CHAIN_ID,
            name: 'polygon',
        });

        this.log.info({ rpcUrl: rpcUrl.replace(/\/\/.*@/, '//***@') }, 'Polygon RPC initialized');
    }

    /**
     * Estimate gas for a transaction with safety buffer.
     */
    async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
        try {
            const estimate = await this.provider.estimateGas(tx);
            // Add 20% buffer for safety
            return (estimate * BigInt(120)) / BigInt(100);
        } catch (error) {
            this.log.error({ error: (error as Error).message }, 'Gas estimation failed');
            // Return a reasonable default
            return BigInt(300_000);
        }
    }

    /**
     * Get optimized gas price using EIP-1559 if available.
     */
    async getOptimizedGasPrice(): Promise<{
        maxFeePerGas: bigint;
        maxPriorityFeePerGas: bigint;
    }> {
        try {
            const feeData = await this.provider.getFeeData();

            const baseFee = feeData.gasPrice || BigInt(30_000_000_000);
            const priorityFee = feeData.maxPriorityFeePerGas || BigInt(30_000_000_000);

            return {
                maxFeePerGas: baseFee * BigInt(2),
                maxPriorityFeePerGas: priorityFee,
            };
        } catch (error) {
            this.log.warn({ error: (error as Error).message }, 'Fee data fetch failed, using defaults');
            return {
                maxFeePerGas: BigInt(60_000_000_000), // 60 gwei
                maxPriorityFeePerGas: BigInt(30_000_000_000), // 30 gwei
            };
        }
    }

    /**
     * Wait for a transaction to be confirmed with timeout.
     */
    async waitForTransaction(
        txHash: string,
        confirmations: number = 2,
        timeoutMs: number = 60_000
    ): Promise<ethers.TransactionReceipt | null> {
        this.log.info({ txHash, confirmations }, 'Waiting for transaction confirmation');

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const receipt = await this.provider.getTransactionReceipt(txHash);

                if (receipt && (await receipt.confirmations()) >= confirmations) {
                    this.log.info(
                        {
                            txHash,
                            blockNumber: receipt.blockNumber,
                            gasUsed: receipt.gasUsed.toString(),
                            status: receipt.status,
                        },
                        'Transaction confirmed'
                    );
                    return receipt;
                }
            } catch (error) {
                this.log.warn({ txHash, error: (error as Error).message }, 'Receipt check failed');
            }

            // Poll every 2 seconds
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        this.log.error({ txHash, timeoutMs }, 'Transaction confirmation timeout');
        return null;
    }

    /**
     * Get the current block number.
     */
    async getBlockNumber(): Promise<number> {
        return this.provider.getBlockNumber();
    }

    /**
     * Get the USDC balance for an address.
     */
    async getUsdcBalance(address: string): Promise<bigint> {
        const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
        const usdc = new ethers.Contract(POLYMARKET.USDC_ADDRESS, usdcAbi, this.provider);
        return usdc.balanceOf(address);
    }

    /**
     * Check USDC allowance for a spender.
     */
    async getUsdcAllowance(owner: string, spender: string): Promise<bigint> {
        const usdcAbi = ['function allowance(address,address) view returns (uint256)'];
        const usdc = new ethers.Contract(POLYMARKET.USDC_ADDRESS, usdcAbi, this.provider);
        return usdc.allowance(owner, spender);
    }

    getProvider(): ethers.JsonRpcProvider {
        return this.provider;
    }
}
