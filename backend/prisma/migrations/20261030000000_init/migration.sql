-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ROOT', 'MANAGER', 'CASHIER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "segment" VARCHAR(120) NOT NULL,
    "cnpj" VARCHAR(14),
    "cashbackPercentBps" INTEGER NOT NULL DEFAULT 500,
    "validityDays" INTEGER NOT NULL DEFAULT 90,
    "maxRedeemPercentBps" INTEGER NOT NULL DEFAULT 10000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "storeId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" UUID,
    "userAgent" VARCHAR(255),
    "ip" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "rg" VARCHAR(20) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_stores" (
    "customerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_stores_pkey" PRIMARY KEY ("customerId","storeId")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "fiscalDocument" VARCHAR(60) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cashbackCents" INTEGER NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_credits" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "remainingCents" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "cashback_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "managerId" UUID,
    "fiscalDocument" VARCHAR(60) NOT NULL,
    "purchaseAmountCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "authorizationCode" VARCHAR(20),
    "decisionNote" VARCHAR(255),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemption_items" (
    "redemptionId" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "redemption_items_pkey" PRIMARY KEY ("redemptionId","creditId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP',
    "to" VARCHAR(20) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "providerId" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(60),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_slug_key" ON "groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stores_cnpj_key" ON "stores"("cnpj");

-- CreateIndex
CREATE INDEX "stores_groupId_idx" ON "stores"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_storeId_idx" ON "users"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "customers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customer_stores_storeId_idx" ON "customer_stores"("storeId");

-- CreateIndex
CREATE INDEX "purchases_customerId_storeId_purchaseDate_amountCents_idx" ON "purchases"("customerId", "storeId", "purchaseDate", "amountCents");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_storeId_fiscalDocument_key" ON "purchases"("storeId", "fiscalDocument");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_credits_purchaseId_key" ON "cashback_credits"("purchaseId");

-- CreateIndex
CREATE INDEX "cashback_credits_customerId_storeId_status_expiresAt_idx" ON "cashback_credits"("customerId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_authorizationCode_key" ON "redemptions"("authorizationCode");

-- CreateIndex
CREATE INDEX "redemptions_storeId_status_idx" ON "redemptions"("storeId", "status");

-- CreateIndex
CREATE INDEX "redemptions_customerId_idx" ON "redemptions"("customerId");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_stores" ADD CONSTRAINT "customer_stores_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_stores" ADD CONSTRAINT "customer_stores_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_credits" ADD CONSTRAINT "cashback_credits_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_credits" ADD CONSTRAINT "cashback_credits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_credits" ADD CONSTRAINT "cashback_credits_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_items" ADD CONSTRAINT "redemption_items_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "redemptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_items" ADD CONSTRAINT "redemption_items_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "cashback_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Restrições financeiras aplicadas também no banco, além da validação DTO.
ALTER TABLE "stores" ADD CONSTRAINT "stores_cashback_percent_bps_check" CHECK ("cashbackPercentBps" BETWEEN 1 AND 10000);
ALTER TABLE "stores" ADD CONSTRAINT "stores_validity_days_check" CHECK ("validityDays" IN (30, 90, 120));
ALTER TABLE "stores" ADD CONSTRAINT "stores_max_redeem_percent_bps_check" CHECK ("maxRedeemPercentBps" BETWEEN 1 AND 10000);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_amount_cents_check" CHECK ("amountCents" > 0);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cashback_cents_check" CHECK ("cashbackCents" >= 0);
ALTER TABLE "cashback_credits" ADD CONSTRAINT "credits_amount_cents_check" CHECK ("amountCents" > 0);
ALTER TABLE "cashback_credits" ADD CONSTRAINT "credits_remaining_cents_check" CHECK ("remainingCents" >= 0 AND "remainingCents" <= "amountCents");
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_amounts_check" CHECK ("purchaseAmountCents" > 0 AND "discountCents" > 0 AND "discountCents" <= "purchaseAmountCents");
ALTER TABLE "redemption_items" ADD CONSTRAINT "redemption_items_amount_check" CHECK ("amountCents" > 0);
