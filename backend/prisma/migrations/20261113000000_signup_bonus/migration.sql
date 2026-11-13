-- CreateEnum
CREATE TYPE "CreditSource" AS ENUM ('PURCHASE', 'SIGNUP_BONUS');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "signupBonusCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "cashback_credits" ADD COLUMN "source" "CreditSource" NOT NULL DEFAULT 'PURCHASE',
ADD COLUMN "signupBonusKey" VARCHAR(80),
ALTER COLUMN "purchaseId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cashback_credits_signupBonusKey_key" ON "cashback_credits"("signupBonusKey");
