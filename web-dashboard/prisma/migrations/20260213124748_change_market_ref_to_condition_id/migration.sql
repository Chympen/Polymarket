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
    "is_paper" BOOLEAN NOT NULL DEFAULT false,

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
    "is_paper" BOOLEAN NOT NULL DEFAULT false,

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
    "is_paper" BOOLEAN NOT NULL DEFAULT false,

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

-- CreateTable
CREATE TABLE "budget_config" (
    "id" TEXT NOT NULL,
    "max_daily_ai_spend" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "max_monthly_ai_spend" DOUBLE PRECISION NOT NULL DEFAULT 200.0,
    "max_total_trade_spend" DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
    "max_trade_size" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "alert_threshold_percent" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    "ai_spending_paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cost_log" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purpose" TEXT NOT NULL,
    "related_market_id" TEXT,
    "related_decision_id" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cost_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_outcomes" (
    "id" TEXT NOT NULL,
    "trade_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entry_price" DOUBLE PRECISION NOT NULL,
    "exit_price" DOUBLE PRECISION,
    "pnl_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMP(3),
    "original_reasoning" TEXT,
    "market_question" TEXT,
    "lessons_learned" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_notes" (
    "id" TEXT NOT NULL,
    "trade_outcome_id" TEXT NOT NULL,
    "market_question" TEXT NOT NULL,
    "original_reasoning" TEXT NOT NULL,
    "what_went_wrong" TEXT NOT NULL,
    "correction_rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "strategy_id" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "applied_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_clusters" (
    "id" TEXT NOT NULL,
    "cluster_name" TEXT NOT NULL,
    "description" TEXT,
    "market_ids" JSONB NOT NULL,
    "total_exposure" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_exposure" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "correlation_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_regime_snapshots" (
    "id" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_volatility" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_trend_strength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_liquidity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "markets_sampled" INTEGER NOT NULL DEFAULT 0,
    "strategy_multipliers" JSONB,
    "details" JSONB,
    "snapshot_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_regime_snapshots_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "ai_cost_log_created_at_idx" ON "ai_cost_log"("created_at");

-- CreateIndex
CREATE INDEX "ai_cost_log_purpose_idx" ON "ai_cost_log"("purpose");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at");

-- CreateIndex
CREATE INDEX "activity_log_type_idx" ON "activity_log"("type");

-- CreateIndex
CREATE INDEX "trade_outcomes_strategy_id_idx" ON "trade_outcomes"("strategy_id");

-- CreateIndex
CREATE INDEX "trade_outcomes_outcome_idx" ON "trade_outcomes"("outcome");

-- CreateIndex
CREATE INDEX "trade_outcomes_created_at_idx" ON "trade_outcomes"("created_at");

-- CreateIndex
CREATE INDEX "correction_notes_strategy_id_idx" ON "correction_notes"("strategy_id");

-- CreateIndex
CREATE INDEX "correction_notes_active_idx" ON "correction_notes"("active");

-- CreateIndex
CREATE INDEX "correction_notes_category_idx" ON "correction_notes"("category");

-- CreateIndex
CREATE INDEX "market_clusters_cluster_name_idx" ON "market_clusters"("cluster_name");

-- CreateIndex
CREATE INDEX "market_regime_snapshots_snapshot_date_idx" ON "market_regime_snapshots"("snapshot_date");

-- CreateIndex
CREATE INDEX "market_regime_snapshots_regime_idx" ON "market_regime_snapshots"("regime");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("condition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("condition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
