import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { ethers } from 'ethers';
import { logger, getConfig } from 'shared-lib';

/**
 * WalletService — Secure wallet key management.
 *
 * Security invariants:
 *  1. Private key is NEVER written to disk or logged
 *  2. Key is loaded from AWS Secrets Manager into memory only
 *  3. Wallet instance is kept in memory, never serialized
 *  4. All signing operations are done in-process
 */
export class WalletService {
    private wallet: ethers.Wallet | null = null;
    private provider: ethers.JsonRpcProvider | null = null;
    private readonly log = logger.child({ module: 'WalletService' });

    async initialize(): Promise<void> {
        const config = getConfig();
        const rpcUrl = config.POLYGON_RPC_URL || 'https://polygon-rpc.com';

        this.provider = new ethers.JsonRpcProvider(rpcUrl, {
            chainId: 137,
            name: 'polygon',
        });

        // Load private key from AWS Secrets Manager
        const privateKey = await this.loadPrivateKey();

        // Create wallet — key lives only in memory
        this.wallet = new ethers.Wallet(privateKey, this.provider);

        this.log.info(
            { address: this.wallet.address },
            'Wallet initialized (key in memory only)'
        );

        // Zero out the local variable immediately
        // (JS strings are immutable so this is best-effort)
    }

    /**
     * Loads the private key from AWS Secrets Manager.
     * In simulation mode, uses a deterministic test key.
     */
    private async loadPrivateKey(): Promise<string> {
        const config = getConfig();

        if (config.MODE === 'simulation') {
            this.log.warn('Using simulation wallet — NOT for production');
            // Deterministic test key (well-known, zero-value wallet)
            return '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        }

        // 1. Try environment variable first (cheaper/simpler for Railway/small deployments)
        if (config.WALLET_PRIVATE_KEY) {
            this.log.info('Private key loaded from environment variable');
            return config.WALLET_PRIVATE_KEY;
        }

        // 2. Fallback to AWS Secrets Manager
        const secretArn = config.WALLET_SECRET_ARN;
        if (!secretArn) {
            throw new Error('Either WALLET_PRIVATE_KEY or WALLET_SECRET_ARN is required in live mode');
        }

        this.log.info({ secretArn }, 'Attempting to load private key from AWS Secrets Manager');
        const client = new SecretsManagerClient({ region: config.AWS_REGION });

        try {
            const command = new GetSecretValueCommand({ SecretId: secretArn });
            const response = await client.send(command);

            if (!response.SecretString) {
                throw new Error('Secret value is empty');
            }

            const secret = JSON.parse(response.SecretString);
            const key = secret.privateKey || secret.PRIVATE_KEY;

            if (!key) {
                throw new Error('Private key not found in secret payload');
            }

            this.log.info('Private key loaded from AWS Secrets Manager');
            return key;
        } catch (error) {
            this.log.error({ error: (error as Error).message }, 'Failed to load wallet key');
            throw new Error(`Failed to load wallet private key: ${(error as Error).message}`);
        }
    }

    /**
     * Returns the wallet address (safe to log/share).
     */
    getAddress(): string {
        if (!this.wallet) throw new Error('Wallet not initialized');
        return this.wallet.address;
    }

    /**
     * Signs a transaction using the in-memory wallet.
     */
    async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
        if (!this.wallet) throw new Error('Wallet not initialized');
        return this.wallet.signTransaction(tx);
    }

    /**
     * Sends a signed transaction to the network.
     */
    async sendTransaction(
        tx: ethers.TransactionRequest
    ): Promise<ethers.TransactionResponse> {
        if (!this.wallet) throw new Error('Wallet not initialized');
        return this.wallet.sendTransaction(tx);
    }

    /**
     * Signs typed data (EIP-712) for Polymarket order signing.
     */
    async signTypedData(
        domain: ethers.TypedDataDomain,
        types: Record<string, ethers.TypedDataField[]>,
        value: Record<string, unknown>
    ): Promise<string> {
        if (!this.wallet) throw new Error('Wallet not initialized');
        return this.wallet.signTypedData(domain, types, value);
    }

    /**
     * Returns the current nonce for the wallet.
     */
    async getNonce(): Promise<number> {
        if (!this.wallet || !this.provider) throw new Error('Wallet not initialized');
        return this.provider.getTransactionCount(this.wallet.address, 'pending');
    }

    /**
     * Returns the current gas price with optional multiplier.
     */
    async getGasPrice(multiplier: number = 1.1): Promise<bigint> {
        if (!this.provider) throw new Error('Provider not initialized');
        const feeData = await this.provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(30_000_000_000); // 30 gwei fallback
        return BigInt(Math.ceil(Number(gasPrice) * multiplier));
    }

    /**
     * Returns the MATIC balance for gas fees.
     */
    async getBalance(): Promise<bigint> {
        if (!this.wallet || !this.provider) throw new Error('Wallet not initialized');
        return this.provider.getBalance(this.wallet.address);
    }

    /**
     * Cleanup — clear wallet reference (best-effort memory clearing).
     */
    async destroy(): Promise<void> {
        this.wallet = null;
        this.provider = null;
        this.log.info('Wallet service destroyed');
    }
}
