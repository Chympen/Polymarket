-- AlterTable
ALTER TABLE "portfolio" ADD COLUMN     "initial_capital" DOUBLE PRECISION NOT NULL DEFAULT 1000000;

-- AlterTable
ALTER TABLE "trading_strategies" ADD COLUMN     "max_position_size_usd" DOUBLE PRECISION NOT NULL DEFAULT 100.0;
