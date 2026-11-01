-- CreateTable
CREATE TABLE "activation_tokens" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activation_tokens_tokenHash_key" ON "activation_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "activation_tokens_customerId_idx" ON "activation_tokens"("customerId");

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
