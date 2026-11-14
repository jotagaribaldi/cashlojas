-- AlterTable
ALTER TABLE "customers" ADD COLUMN "cpf" VARCHAR(11);

-- CreateIndex
CREATE UNIQUE INDEX "customers_cpf_key" ON "customers"("cpf");
