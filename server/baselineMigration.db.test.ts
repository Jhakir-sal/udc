import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

test("versioned baseline protects consent records from update and deletion", {
  skip: process.env.BASELINE_DB_TEST !== "1" || process.env.NODE_ENV === "production" ||
    process.env.WEBSITE_SLOT_NAME !== undefined,
}, async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const operation of ["UPDATE heart_plan_consent_records SET decision = false", "DELETE FROM heart_plan_consent_records"]) {
      await client.query("BEGIN");
      try {
        await client.query(`INSERT INTO heart_plan_consent_records
          (user_id, plan_id, consent_type, decision, document_version, source_url, content_hash, disclosure_text, signup_source)
          VALUES ('synthetic', 'synthetic', 'terms', true, '1', 'https://example.invalid', 'synthetic', 'synthetic', 'test')`);
        await assert.rejects(client.query(operation), /append-only/);
      } finally {
        await client.query("ROLLBACK");
      }
    }
  } finally {
    await client.end();
  }
});
