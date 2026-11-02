-- CreateEnum
CREATE TYPE "RedemptionRequestStatus" AS ENUM ('OPEN', 'ATTENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "redemption_requests" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "status" "RedemptionRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redemption_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "redemption_requests_storeId_status_idx" ON "redemption_requests"("storeId", "status");

-- CreateIndex
CREATE INDEX "redemption_requests_customerId_idx" ON "redemption_requests"("customerId");

-- AddForeignKey
ALTER TABLE "redemption_requests" ADD CONSTRAINT "redemption_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_requests" ADD CONSTRAINT "redemption_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
