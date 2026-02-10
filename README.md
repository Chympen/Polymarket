# Polymarket AI Trading Platform

A production-grade, fully autonomous AI-driven Polymarket trading platform with three-layer microservice architecture.

## 🏗 Architecture

```
┌─────────────────────────────────────┐
│     OpenClaw AI Agent Service       │  ← Strategy + AI reasoning
│  • 6 Trading Agents                │     Port: 3001
│  • LLM Decision Engine (GPT-4)     │
│  • Meta Strategy Allocator          │
│  • Bayesian Weight Updating         │
└──────────────┬──────────────────────┘
               │ Authenticated REST
               ↓
┌─────────────────────────────────────┐
│      Risk Guardian Service          │  ← Hard safety controls
│  • Max 2% trade size               │     Port: 3002
│  • Max 10% market exposure         │     NO AI — Pure mechanics
│  • 3% daily drawdown kill-switch   │
│  • Monte Carlo VaR simulations     │
└──────────────┬──────────────────────┘
               │ Authenticated REST
               ↓
┌─────────────────────────────────────┐
│     Trade Execution Service         │  ← Wallet keys HERE ONLY
│  • Polymarket CLOB API             │     Port: 3003
│  • EIP-712 Order Signing           │
│  • Slippage Protection             │
│  • Retry Logic + Monitoring        │
└──────────────┬──────────────────────┘
               │ Polygon RPC
               ↓
          Polymarket
```

## 🧠 Trading Agents

| Agent | Strategy | Signal Type |
|-------|----------|-------------|
| **Arbitrage** | YES+NO price sum deviation, spread arb | Low-risk mispricings |
| **Momentum** | Multi-timeframe trend following + volume | Trending markets |
| **Mean Reversion** | Bollinger Bands + z-score | Range-bound markets |
| **Sentiment** | News/social signal aggregation | Information edge |
| **Portfolio Optimization** | Profit taking, stop loss, rebalancing | Portfolio health |
| **Meta Allocator** | Bayesian consensus + ensemble weighting | Final decision |

## 🛡 Risk Controls

| Rule | Limit | Action |
|------|-------|--------|
| Max trade size | 2% of bankroll | Size capped |
| Max market exposure | 10% of capital | Trade rejected |
| Max daily drawdown | 3% | **Kill switch** |
| Capital preservation | >1.5% drawdown | Sizes halved |
| Min confidence | >55% | Trade rejected |
| Max positions | 20 | Trade rejected |
| Max slippage | 200 bps | Trade rejected |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### 1. Clone and Install

```bash
cd "Polymarket agent"
cp .env.example .env
# Edit .env with your configuration
npm install
```

### 2. Start with Docker Compose (Recommended)

```bash
cd docker
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Agent Service on port 3001
- Risk Guardian on port 3002
- Trade Executor on port 3003

### 3. Run Database Migrations

```bash
cd shared-lib
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run Services Individually (Development)

```bash
# Terminal 1: Risk Guardian
npm run dev:risk

# Terminal 2: Trade Executor
npm run dev:executor

# Terminal 3: Agent Service
npm run dev:agent
```

### 5. Trigger a Trading Cycle

```bash
# Health check
curl http://localhost:3001/health

# Trigger trading cycle (requires admin JWT)
curl -X POST http://localhost:3001/trigger-cycle \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"

# Get performance report
curl http://localhost:3001/performance \
  -H "Authorization: Bearer <admin-token>"
```

## 📊 API Endpoints

### Agent Service (3001)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/trigger-cycle` | Run trading cycle |
| GET | `/performance` | Performance report |
| POST | `/simulate` | Run backtest |
| POST | `/self-reflect` | Run self-reflection |

### Risk Guardian (3002)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/validate-trade` | Validate trade signal |
| GET | `/portfolio-risk` | Portfolio risk summary |
| POST | `/monte-carlo` | Run MC simulation |
| POST | `/kill-switch` | Activate/reset kill switch |
| GET | `/risk-events` | Risk event history |

### Trade Executor (3003)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/execute-trade` | Execute trade |
| GET | `/trade/:id` | Trade status |
| POST | `/cancel/:id` | Cancel trade |
| GET | `/wallet` | Wallet info |

## 🗄 Database Schema

8 tables: `markets`, `trades`, `positions`, `portfolio`, `ai_decisions`, `strategy_scores`, `performance_metrics`, `risk_events`

See `shared-lib/prisma/schema.prisma` for full schema.

## 🔐 Security

- **Service Isolation**: Wallet keys exist ONLY in Trade Executor
- **JWT Auth**: All inter-service calls authenticated with short-lived tokens (5min TTL)
- **Secret Redaction**: Pino logger auto-redacts sensitive fields
- **AWS Secrets Manager**: All credentials loaded at runtime, never on disk
- **Non-root Docker**: All containers run as non-root users
- **VPC Isolation**: Services run in private subnets (AWS)

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MODE` | Yes | `live` or `simulation` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SERVICE_JWT_SECRET` | Yes | JWT secret (min 32 chars) |
| `OPENAI_API_KEY` | No | GPT-4 API key |
| `POLYGON_RPC_URL` | No | Polygon RPC endpoint |
| `WALLET_SECRET_ARN` | Live only | AWS Secrets Manager ARN for wallet |

See `.env.example` for the complete list.

## ☁️ AWS Deployment

See `deploy/aws/deployment-guide.md` for full instructions.

**Architecture**: ECS Fargate + VPC private networking + Secrets Manager + CloudWatch

## 📁 Project Structure

```
├── shared-lib/              # Shared types, DB schema, utilities
│   ├── prisma/schema.prisma # Database schema (8 tables)
│   └── src/
│       ├── types/           # Core TypeScript interfaces
│       ├── constants/       # Risk limits, strategy IDs
│       └── utils/           # Logger, auth, config, DB client
├── openclaw-agent-service/  # AI Agent orchestration
│   └── src/
│       ├── agents/          # 6 trading agents
│       ├── engine/          # LLM decision engine
│       ├── simulation/      # Backtest engine
│       └── analytics/       # Performance tracking
├── risk-guardian-service/   # Hard safety controls (NO AI)
│   └── src/services/
│       ├── position-sizer   # Trade size validation
│       ├── exposure-tracker  # Per-market exposure
│       ├── drawdown-monitor  # Kill switch logic
│       ├── volatility-adjuster # Vol-based sizing
│       └── monte-carlo      # VaR simulation
├── trade-executor-service/  # Wallet & execution (KEYS HERE ONLY)
│   └── src/services/
│       ├── wallet           # AWS Secrets Manager integration
│       ├── polygon-rpc      # Blockchain client
│       └── order-execution  # CLOB API, retry, slippage
├── docker/                  # Dockerfiles + compose
└── deploy/aws/              # ECS task defs, IAM policies
```

## ⚠️ Disclaimer

This software is for educational and research purposes. Trading on prediction markets involves financial risk. Always start in `MODE=simulation` before using real capital. The authors are not responsible for any financial losses.
