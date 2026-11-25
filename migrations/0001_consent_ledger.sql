CREATE OR REPLACE FUNCTION reject_heart_plan_consent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'HeartPlan consent records are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER heart_plan_consent_records_append_only
BEFORE UPDATE OR DELETE ON heart_plan_consent_records
FOR EACH ROW
EXECUTE FUNCTION reject_heart_plan_consent_mutation();