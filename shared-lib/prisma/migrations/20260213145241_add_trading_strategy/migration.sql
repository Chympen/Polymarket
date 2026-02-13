-- DropForeignKey
ALTER TABLE "ai_decisions" DROP CONSTRAINT "ai_decisions_market_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_market_id_fkey";

-- DropForeignKey
ALTER TABLE "trades" DROP CONSTRAINT "trades_market_id_fkey";

-- AlterTable
ALTER TABLE "portfolio" ADD COLUMN     "is_paper" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "is_paper" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "is_paper" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "user_strategy_id" TEXT;

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

-- CreateTable
CREATE TABLE "trading_strategies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT[],
    "max_daily_trades" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trading_strategies_pkey" PRIMARY KEY ("id")
);

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
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_strategy_id_fkey" FOREIGN KEY ("user_strategy_id") REFERENCES "trading_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("condition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("condition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("condition_id") ON DELETE RESTRICT ON UPDATE CASCADE;
