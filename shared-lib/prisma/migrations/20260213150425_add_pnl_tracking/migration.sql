-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "user_strategy_id" TEXT;

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "pnl_usd" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_strategy_id_fkey" FOREIGN KEY ("user_strategy_id") REFERENCES "trading_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
