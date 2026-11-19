import { db } from "../server/db";
import { sql } from "drizzle-orm";

await db.execute(sql`
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
`);

await db.execute(sql`
  DROP TRIGGER IF EXISTS heart_plan_consent_records_append_only
  ON heart_plan_consent_records;
`);

await db.execute(sql`
  CREATE TRIGGER heart_plan_consent_records_append_only
  BEFORE UPDATE OR DELETE ON heart_plan_consent_records
  FOR EACH ROW
  EXECUTE FUNCTION reject_heart_plan_consent_mutation();
`);

console.log("HeartPlan consent ledger update/delete protection enabled");
process.exit(0);