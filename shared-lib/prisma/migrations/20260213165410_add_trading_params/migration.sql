/*
  Warnings:

  - You are about to drop the column `ai_spending_paused` on the `budget_config` table. All the data in the column will be lost.
  - You are about to drop the column `max_daily_ai_spend` on the `budget_config` table. All the data in the column will be lost.
  - You are about to drop the column `max_monthly_ai_spend` on the `budget_config` table. All the data in the column will be lost.
  - You are about to drop the column `max_total_trade_spend` on the `budget_config` table. All the data in the column will be lost.
  - You are about to drop the column `max_trade_size` on the `budget_config` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "budget_config" DROP COLUMN "ai_spending_paused",
DROP COLUMN "max_daily_ai_spend",
DROP COLUMN "max_monthly_ai_spend",
DROP COLUMN "max_total_trade_spend",
DROP COLUMN "max_trade_size",
ADD COLUMN     "cron_schedule" TEXT NOT NULL DEFAULT '*/5 * * * *',
ADD COLUMN     "estimated_slippage_percent" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
ADD COLUMN     "max_daily_loss_usd" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
ADD COLUMN     "max_price_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
ADD COLUMN     "max_total_exposure_usd" DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
ADD COLUMN     "max_trade_size_usd" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
ADD COLUMN     "max_weekly_loss_usd" DOUBLE PRECISION NOT NULL DEFAULT 200.0,
ADD COLUMN     "min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
ADD COLUMN     "min_liquidity_usd" DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
ADD COLUMN     "min_price_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
ADD COLUMN     "trading_paused" BOOLEAN NOT NULL DEFAULT false;
