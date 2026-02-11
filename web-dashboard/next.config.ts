import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    SERVICE_JWT_SECRET: process.env.SERVICE_JWT_SECRET,
    AGENT_SERVICE_URL: process.env.AGENT_SERVICE_URL || 'http://localhost:3001',
    RISK_GUARDIAN_URL: process.env.RISK_GUARDIAN_URL || 'http://localhost:3002',
    TRADE_EXECUTOR_URL: process.env.TRADE_EXECUTOR_URL || 'http://localhost:3003',
  },
};

export default nextConfig;
