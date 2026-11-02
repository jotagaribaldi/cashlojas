CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;
  IF (to_jsonb(NEW) - 'userId') IS DISTINCT FROM (to_jsonb(OLD) - 'userId') OR NEW."userId" IS NOT NULL THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable_trg ON "audit_logs";

CREATE TRIGGER audit_logs_immutable_trg
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
