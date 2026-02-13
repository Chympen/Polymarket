import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SERVICE_JWT_SECRET || 'dev-jwt-secret-must-be-at-least-32-characters-long';
const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3001';
const RISK_URL = process.env.RISK_GUARDIAN_URL || 'http://localhost:3002';
const EXECUTOR_URL = process.env.TRADE_EXECUTOR_URL || 'http://localhost:3003';

if (process.env.NODE_ENV === 'production') {
    if (AGENT_URL.includes('localhost')) console.warn('⚠️ AGENT_SERVICE_URL is set to localhost in production!');
    if (RISK_URL.includes('localhost')) console.warn('⚠️ RISK_GUARDIAN_URL is set to localhost in production!');
    if (EXECUTOR_URL.includes('localhost')) console.warn('⚠️ TRADE_EXECUTOR_URL is set to localhost in production!');
}

function generateToken(): string {
    return jwt.sign({ service: 'admin' }, JWT_SECRET, { expiresIn: '5m' });
}

function headers(): Record<string, string> {
    return {
        Authorization: `Bearer ${generateToken()}`,
        'Content-Type': 'application/json',
    };
}

async function safeFetch(url: string, options?: RequestInit) {
    try {
        const res = await fetch(url, { ...options, headers: headers(), signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (error) {
        console.error(`API Error (${url}):`, (error as Error).message);
        return null;
    }
}

// ── Agent Service ──
export const agentApi = {
    health: () => safeFetch(`${AGENT_URL}/health`),
    triggerCycle: () => safeFetch(`${AGENT_URL}/trigger-cycle`, { method: 'POST' }),
    performance: () => safeFetch(`${AGENT_URL}/performance`),
    selfReflect: () => safeFetch(`${AGENT_URL}/self-reflect`, { method: 'POST' }),
    getSmartOverview: () => safeFetch(`${AGENT_URL}/smart-overview`),
    // Control
    status: () => safeFetch(`${AGENT_URL}/status`),
    toggle: () => safeFetch(`${AGENT_URL}/toggle`, { method: 'POST' }),
    toggleMode: () => safeFetch(`${AGENT_URL}/toggle-mode`, { method: 'POST' }),
    getPaperPortfolio: () => safeFetch(`${AGENT_URL}/paper-portfolio`),
};

// ── Risk Guardian ──
export const riskApi = {
    health: () => safeFetch(`${RISK_URL}/health`),
    portfolioRisk: () => safeFetch(`${RISK_URL}/portfolio-risk`),
    killSwitch: (action: 'activate' | 'reset') =>
        safeFetch(`${RISK_URL}/kill-switch`, { method: 'POST', body: JSON.stringify({ action }) }),
    riskEvents: (limit = 50) => safeFetch(`${RISK_URL}/risk-events?limit=${limit}`),
};

// ── Trade Executor ──
export const executorApi = {
    health: () => safeFetch(`${EXECUTOR_URL}/health`),
    wallet: () => safeFetch(`${EXECUTOR_URL}/wallet`),
};
