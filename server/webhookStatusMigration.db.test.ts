import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { webhookStatusEnum } from "../shared/schema";

test("permanent webhook failures can be stored after the migration, including on repeated runs", {
  skip: process.env.WEBHOOK_MIGRATION_DB_TEST !== "1" ||
    process.env.NODE_ENV === "production" || process.env.WEBSITE_SLOT_NAME !== undefined,
}, async () => {
  assert.ok(webhookStatusEnum.enumValues.includes("failed_permanent"));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("CREATE TEMP TABLE migration_marker (id integer)");
    await client.query("CREATE TYPE pg_temp.webhook_status AS ENUM ('pending', 'sent', 'delivered', 'failed')");
    await client.query("SET search_path TO pg_temp");
    const migration = await readFile(new URL("../script/add-webhook-failed-permanent.sql", import.meta.url), "utf8");
    await client.query(migration);
    await client.query(migration);
    await client.query("CREATE TEMP TABLE webhook_status_test (status webhook_status)");
    await client.query("INSERT INTO webhook_status_test VALUES ('failed_permanent')");
    const result = await client.query("SELECT status FROM webhook_status_test");
    assert.equal(result.rows[0].status, "failed_permanent");
  } finally {
    await client.end();
  }
});
