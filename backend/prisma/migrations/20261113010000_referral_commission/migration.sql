-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "customer_stores" ADD COLUMN "isProfessional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "profession" VARCHAR(80),
ADD COLUMN "commissionPercentBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN "referrerCustomerId" UUID;

-- CreateTable
CREATE TABLE "referral_commissions" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "professionalCustomerId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "percentBps" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_commissions_purchaseId_key" ON "referral_commissions"("purchaseId");

-- CreateIndex
CREATE INDEX "referral_commissions_storeId_status_idx" ON "referral_commissions"("storeId", "status");

-- CreateIndex
CREATE INDEX "referral_commissions_professionalCustomerId_idx" ON "referral_commissions"("professionalCustomerId");

-- CreateIndex
CREATE INDEX "purchases_referrerCustomerId_idx" ON "purchases"("referrerCustomerId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_referrerCustomerId_fkey" FOREIGN KEY ("referrerCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_professionalCustomerId_fkey" FOREIGN KEY ("professionalCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
