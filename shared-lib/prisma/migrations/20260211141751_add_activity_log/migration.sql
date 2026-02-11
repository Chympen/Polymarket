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

-- CreateIndex
CREATE INDEX "ai_cost_log_created_at_idx" ON "ai_cost_log"("created_at");

-- CreateIndex
CREATE INDEX "ai_cost_log_purpose_idx" ON "ai_cost_log"("purpose");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at");

-- CreateIndex
CREATE INDEX "activity_log_type_idx" ON "activity_log"("type");
