
const { ethers } = require('ethers');

// Addresses
const USER_ADDRESS = '0x8a808653378BC3220E1868e21F630Efc6fdE61C7';
const RPC_URL = 'https://polygon-rpc.com';

const BRIDGED_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (What we need)
const NATIVE_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';  // USDC (Circle Standard)

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

async function checkBalances() {
    console.log('Checking balances for:', USER_ADDRESS);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Check Native POL (Matic)
    const polBalance = await provider.getBalance(USER_ADDRESS);
    console.log(`POL (Native): ${ethers.formatEther(polBalance)} POL`);

    // Check Bridged USDC
    const bridgedContract = new ethers.Contract(BRIDGED_USDC, ERC20_ABI, provider);
    const bridgedBalance = await bridgedContract.balanceOf(USER_ADDRESS);
    console.log(`Bridged USDC (USDC.e): ${ethers.formatUnits(bridgedBalance, 6)} USDC (This is what the bot uses)`);

    // Check Native USDC
    const nativeContract = new ethers.Contract(NATIVE_USDC, ERC20_ABI, provider);
    const nativeBalance = await nativeContract.balanceOf(USER_ADDRESS);
    console.log(`Native USDC: ${ethers.formatUnits(nativeBalance, 6)} USDC`);

    if (nativeBalance > 0n && bridgedBalance === 0n) {
        console.log('\n>>> DIAGNOSIS: You have NATIVE USDC. You need BRIDGED USDC (USDC.e).');
        console.log('>>> SOLUTION: Swap "USDC" for "USDC.e" on Uniswap or QuickSwap.');
    } else if (nativeBalance === 0n && bridgedBalance === 0n) {
        console.log('\n>>> DIAGNOSIS: You have NO USDC of any kind.');
    } else {
        console.log('\n>>> DIAGNOSIS: Balances look correct.');
    }
}

checkBalances().catch(console.error);
