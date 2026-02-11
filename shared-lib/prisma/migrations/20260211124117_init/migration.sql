-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "condition_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "slug" TEXT,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "outcome_yes" TEXT NOT NULL DEFAULT 'Yes',
    "outcome_no" TEXT NOT NULL DEFAULT 'No',
    "price_yes" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "price_no" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "volume_24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "end_date" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolution_outcome" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "size_usd" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "filled_price" DOUBLE PRECISION,
    "filled_size_usd" DOUBLE PRECISION,
    "slippage" DOUBLE PRECISION,
    "gas_used" DOUBLE PRECISION,
    "tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "strategy_id" TEXT,
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size_usd" DOUBLE PRECISION NOT NULL,
    "avg_entry_price" DOUBLE PRECISION NOT NULL,
    "current_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unrealized_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realized_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio" (
    "id" TEXT NOT NULL,
    "total_capital" DOUBLE PRECISION NOT NULL,
    "available_capital" DOUBLE PRECISION NOT NULL,
    "deployed_capital" DOUBLE PRECISION NOT NULL,
    "total_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_pnl_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "high_water_mark" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_drawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kill_switch_active" BOOLEAN NOT NULL DEFAULT false,
    "capital_preservation" BOOLEAN NOT NULL DEFAULT false,
    "snapshot_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_decisions" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "trade" BOOLEAN NOT NULL,
    "side" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "position_size_usd" DOUBLE PRECISION,
    "reasoning" TEXT,
    "input_snapshot" JSONB,
    "prompt_used" TEXT,
    "llm_model" TEXT,
    "llm_latency_ms" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "executed_trade_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_scores" (
    "id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "strategy_name" TEXT NOT NULL,
    "win_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_trades" INTEGER NOT NULL DEFAULT 0,
    "total_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sharpe_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_drawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cal_score_conf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL,
    "metric_date" TIMESTAMP(3) NOT NULL,
    "total_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sharpe_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_drawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "win_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_trades" INTEGER NOT NULL DEFAULT 0,
    "trade_accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "portfolio_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deployed_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "trade_id" TEXT,
    "market_id" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "markets_condition_id_key" ON "markets"("condition_id");

-- CreateIndex
CREATE INDEX "trades_market_id_idx" ON "trades"("market_id");

-- CreateIndex
CREATE INDEX "trades_status_idx" ON "trades"("status");

-- CreateIndex
CREATE INDEX "trades_created_at_idx" ON "trades"("created_at");

-- CreateIndex
CREATE INDEX "positions_status_idx" ON "positions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "positions_market_id_side_key" ON "positions"("market_id", "side");

-- CreateIndex
CREATE INDEX "portfolio_snapshot_date_idx" ON "portfolio"("snapshot_date");

-- CreateIndex
CREATE INDEX "ai_decisions_market_id_idx" ON "ai_decisions"("market_id");

-- CreateIndex
CREATE INDEX "ai_decisions_strategy_id_idx" ON "ai_decisions"("strategy_id");

-- CreateIndex
CREATE INDEX "ai_decisions_created_at_idx" ON "ai_decisions"("created_at");

-- CreateIndex
CREATE INDEX "strategy_scores_strategy_id_idx" ON "strategy_scores"("strategy_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_metrics_metric_date_key" ON "performance_metrics"("metric_date");

-- CreateIndex
CREATE INDEX "risk_events_event_type_idx" ON "risk_events"("event_type");

-- CreateIndex
CREATE INDEX "risk_events_severity_idx" ON "risk_events"("severity");

-- CreateIndex
CREATE INDEX "risk_events_created_at_idx" ON "risk_events"("created_at");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
