-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "role" VARCHAR(20),
ADD COLUMN "storeId" UUID,
ADD COLUMN "outcome" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN "method" VARCHAR(10),
ADD COLUMN "path" VARCHAR(255),
ADD COLUMN "statusCode" INTEGER,
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "error" VARCHAR(500),
ADD COLUMN "userAgent" VARCHAR(255);

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_outcome_createdAt_idx" ON "audit_logs"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_storeId_createdAt_idx" ON "audit_logs"("storeId", "createdAt");

-- Append-only protection: block deletes and any column change other than userId being nullified by ON DELETE SET NULL
-- Function uses EXECUTE PROCEDURE syntax (PostgreSQL 10 compatible)
-- NOTE: The function and trigger below were applied separately due to dollar-quoting limitations in Prisma's migrate engine.
-- Function body:
--   CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $func$
--   BEGIN
--     IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'audit_logs is append-only'; END IF;
--     IF (to_jsonb(NEW) - 'userId') IS DISTINCT FROM (to_jsonb(OLD) - 'userId') OR NEW."userId" IS NOT NULL THEN
--       RAISE EXCEPTION 'audit_logs is append-only';
--     END IF;
--     RETURN NEW;
--   END;
--   $func$ LANGUAGE plpgsql;
--   DROP TRIGGER IF EXISTS audit_logs_immutable_trg ON "audit_logs";
--   CREATE TRIGGER audit_logs_immutable_trg BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE PROCEDURE audit_logs_immutable();
