import type { Client } from "pg";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  heartPlans, users, planWishes, planDocuments, planAssets, planLetters, planContacts,
  planEvents, planActivationRequests,
} from "@shared/schema";

const tables: PgTable[] = [
  heartPlans, users, planWishes, planDocuments, planAssets, planLetters, planContacts,
  planEvents, planActivationRequests,
];
export const fixturePlans = 10_000;
export const fixtureItemCounts = {
  plan_documents: 8, plan_assets: 6, plan_letters: 4, plan_contacts: 3,
  plan_events: 5, plan_activation_requests: 2,
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Only session-local tables; no LIKE public.*, schema discovery, or real-record reads. */
export async function createProgressPerformanceFixtures(client: Client) {
  await client.query("BEGIN");
  await client.query(`
    SET LOCAL search_path = pg_temp, pg_catalog;
    SET LOCAL statement_timeout = '15s';
    SET LOCAL lock_timeout = '1s';
    SET LOCAL work_mem = '64MB';
    SET LOCAL jit = off;
    SET LOCAL max_parallel_workers_per_gather = 0;
  `);
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      // Enums are represented by text; no dependency on public enum types.
      const type = column.getSQLType();
      const builtIn = /^(?:text|varchar(?:\(\d+\))?|boolean|integer|bigint|smallint|numeric(?:\(\d+(?:,\s*\d+)?\))?|real|double precision|timestamp(?: with time zone)?|date|jsonb|json)(?:\[\])?$/i;
      return `${quote(column.name)} ${builtIn.test(type) ? type : "text"}${column.primary ? " PRIMARY KEY" : column.isUnique ? " UNIQUE" : ""}`;
    });
    // Existing PK/unique constraints only, no invented plan_id indexes.
    await client.query(`CREATE TEMP TABLE ${quote(config.name)} (${columns.join(", ")}) ON COMMIT DROP`);
  }
  // Assert every relation is temporary before running even a synthetic INSERT.
  const relations = await client.query(`
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = pg_my_temp_schema() AND c.relkind = 'r'
  `);
  if (relations.rows.length !== tables.length) throw new Error("Temporary fixture isolation failed");
  const n = fixturePlans;
  await client.query(`
    INSERT INTO pg_temp.users (id, email, first_name, last_name, email_verified, password_hash)
    SELECT 'owner-' || i, 'synthetic-' || i || '@example.invalid', 'Synthetic', 'Planner', true,
      repeat('PRIVATE_FIXTURE_PASSWORD', 32) FROM generate_series(1, ${n}) i;
    INSERT INTO pg_temp.heart_plans (id, user_id, status, tier, full_name, date_of_birth,
      created_at, updated_at, upgraded_at, phone, street)
    SELECT 'plan-' || i, 'owner-' || i, CASE WHEN i % 10 = 0 THEN 'activated' ELSE 'active' END,
      CASE WHEN i % 2 = 0 THEN 'legacy' ELSE 'free' END, 'Synthetic Planner ' || i,
      CASE WHEN i % 3 = 0 THEN '' ELSE 'PRIVATE_FIXTURE_DOB' END,
      timestamp '2026-01-01', timestamp '2026-01-02',
      CASE WHEN i % 2 = 0 THEN timestamp '2026-01-02' END,
      repeat('PRIVATE_FIXTURE_PHONE', 32), repeat('PRIVATE_FIXTURE_STREET', 32)
    FROM generate_series(1, ${n}) i;
    INSERT INTO pg_temp.plan_wishes (id, plan_id, resting_preference, resting_details)
    SELECT 'wish-' || i, 'plan-' || i, CASE WHEN i % 3 = 2 THEN 'PRIVATE_FIXTURE_WISH' ELSE '' END,
      repeat('PRIVATE_FIXTURE_DETAILS', 32) FROM generate_series(1, ${n}) i;
  `);
  for (const [table, perPlan] of Object.entries(fixtureItemCounts)) {
    let fields = "";
    let values = "";
    switch (table) {
      case "plan_documents":
        fields = ", object_path, notes";
        values = ", repeat('PRIVATE_FIXTURE_FILE', 32), repeat('PRIVATE_FIXTURE_NOTE', 32)";
        break;
      case "plan_assets":
        fields = ", institution, account_number_hint";
        values = ", repeat('PRIVATE_FIXTURE_BANK', 32), repeat('PRIVATE_FIXTURE_ACCOUNT', 32)";
        break;
      case "plan_letters":
        fields = ", body, object_path";
        values = ", repeat('PRIVATE_FIXTURE_MESSAGE', 32), repeat('PRIVATE_FIXTURE_MEDIA', 32)";
        break;
      case "plan_contacts":
        fields = ", is_primary, email, info_email_failed_at, created_at, phone, address";
        values = `, j = 1, CASE WHEN i % 13 = 0 THEN '' ELSE 'PRIVATE_FIXTURE_EMAIL' END,
          CASE WHEN i % 11 = 0 AND j = 1 THEN timestamp '2026-01-03' END,
          timestamp '2026-01-01' + j * interval '1 minute',
          repeat('PRIVATE_FIXTURE_PHONE', 32), repeat('PRIVATE_FIXTURE_ADDRESS', 32)`;
        break;
      case "plan_events":
        fields = ", created_at, description";
        values = ", timestamp '2026-01-03' + j * interval '1 minute', repeat('PRIVATE_FIXTURE_EVENT', 32)";
        break;
      case "plan_activation_requests":
        fields = ", status, message";
        values = ", CASE WHEN j = 1 THEN 'pending' ELSE 'approved' END, repeat('PRIVATE_FIXTURE_REQUEST', 32)";
        break;
    }
    await client.query(`
      INSERT INTO pg_temp.${quote(table)} (id, plan_id${fields})
      SELECT '${table}-' || i || '-' || j, 'plan-' || i${values}
      FROM generate_series(1, ${n}) i CROSS JOIN generate_series(1, ${perPlan}) j
    `);
  }
  for (const table of tables) await client.query(`ANALYZE pg_temp.${quote(getTableConfig(table).name)}`);
}
