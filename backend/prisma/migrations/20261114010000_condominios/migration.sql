-- AlterTable
ALTER TABLE "activation_tokens" ALTER COLUMN "customerId" DROP NOT NULL,
ADD COLUMN "userId" UUID;

-- CreateTable
CREATE TABLE "administradoras" (
    "id" UUID NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administradoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condominios" (
    "id" UUID NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "administradoraId" UUID NOT NULL,
    "commissionPercentBps" INTEGER NOT NULL DEFAULT 2000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condominios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades" (
    "id" UUID NOT NULL,
    "condominioId" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moradias" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "condominioId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "moradias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sindico_vinculos" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "condominioId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "sindico_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administradora_users" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "administradoraId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administradora_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administradoras_cnpj_key" ON "administradoras"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "condominios_cnpj_key" ON "condominios"("cnpj");

-- CreateIndex
CREATE INDEX "condominios_administradoraId_idx" ON "condominios"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_condominioId_label_key" ON "unidades"("condominioId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "moradias_customerId_key" ON "moradias"("customerId");

-- CreateIndex
CREATE INDEX "moradias_condominioId_idx" ON "moradias"("condominioId");

-- CreateIndex
CREATE INDEX "moradias_unidadeId_idx" ON "moradias"("unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "sindico_vinculos_userId_condominioId_key" ON "sindico_vinculos"("userId", "condominioId");

-- CreateIndex
CREATE INDEX "sindico_vinculos_condominioId_idx" ON "sindico_vinculos"("condominioId");

-- CreateIndex
CREATE UNIQUE INDEX "administradora_users_userId_key" ON "administradora_users"("userId");

-- CreateIndex
CREATE INDEX "administradora_users_administradoraId_idx" ON "administradora_users"("administradoraId");

-- CreateIndex
CREATE INDEX "activation_tokens_userId_idx" ON "activation_tokens"("userId");

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominios" ADD CONSTRAINT "condominios_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condominios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moradias" ADD CONSTRAINT "moradias_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moradias" ADD CONSTRAINT "moradias_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condominios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moradias" ADD CONSTRAINT "moradias_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sindico_vinculos" ADD CONSTRAINT "sindico_vinculos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sindico_vinculos" ADD CONSTRAINT "sindico_vinculos_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condominios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administradora_users" ADD CONSTRAINT "administradora_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administradora_users" ADD CONSTRAINT "administradora_users_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "administradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
