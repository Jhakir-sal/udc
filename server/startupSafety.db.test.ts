import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const enabled = process.env.STARTUP_SAFETY_DB_TEST === "1" &&
  process.env.NODE_ENV !== "production" && process.env.WEBSITE_SLOT_NAME === undefined;
const tsx = "node_modules/tsx/dist/cli.mjs";
const childEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: "synthetic-startup-test-secret",
};

test("startup preserves cases and does not promote or seed admins", { skip: !enabled, timeout: 60000 }, async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const certificateId = "ddfd435b-1018-47ce-89f6-99273bfdbde7";
  const email = `startup-${randomUUID()}@example.invalid`;
  const missingEmail = `missing-${randomUUID()}@example.invalid`;
  await client.connect();
  let insertedCase = false;
  let userId: string | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const user = await client.query("INSERT INTO users (email, role) VALUES ($1, 'user') RETURNING id", [email]);
    userId = user.rows[0].id;
    await client.query(
      "INSERT INTO certificates (id, deceased_name, date_of_death, date_of_birth, certificate_number, issuing_authority) VALUES ($1, $2, $3, $4, $5, $6)",
      [certificateId, "Synthetic case", "2020-01-01", "1970-01-01", randomUUID(), "Synthetic authority"],
    );
    insertedCase = true;
    for (const seedEmail of [email, missingEmail]) {
      child = spawn(process.execPath, [tsx, "server/index.ts"], {
        env: {
          ...childEnv, NODE_ENV: "development", WEBSITE_SLOT_NAME: "staging", PORT: "0",
          PUBLIC_APP_URL: "https://example.invalid", ADMIN_SEED_EMAIL: seedEmail,
          ADMIN_SEED_PASSWORD: "Synthetic-only-password!",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const current = child;
      await new Promise<void>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error(`Startup timed out:\n${output}`)), 45000);
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("serving on port")) {
            clearTimeout(timer);
            resolve();
          }
        };
        current.stdout.on("data", onData);
        current.stderr.on("data", onData);
        current.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`Startup exited (${code}):\n${output}`));
        });
      });
      current.kill("SIGTERM");
      await new Promise<void>((resolve) => current.once("exit", () => resolve()));
      child = undefined;
    }
    assert.equal((await client.query("SELECT role FROM users WHERE id = $1", [userId])).rows[0].role, "user");
    assert.equal((await client.query("SELECT id FROM users WHERE email = $1", [missingEmail])).rowCount, 0);
    assert.equal((await client.query("SELECT id FROM certificates WHERE id = $1", [certificateId])).rowCount, 1);
  } finally {
    child?.kill("SIGTERM");
    if (insertedCase) await client.query("DELETE FROM certificates WHERE id = $1", [certificateId]);
    if (userId) await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.end();
  }
});

test("explicit bootstrap only creates the first user and never changes existing accounts", { skip: !enabled, timeout: 30000 }, async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const schema = `bootstrap_${randomUUID().replace(/-/g, "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`CREATE TABLE "${schema}".users (
      email text UNIQUE, first_name text, last_name text, role text,
      password_hash text, email_verified boolean
    )`);
    const env = {
      ...childEnv, PGOPTIONS: `-c search_path=${schema}`,
      ADMIN_SEED_EMAIL: "FIRST@example.invalid", ADMIN_SEED_PASSWORD: "Synthetic-only-password!",
    };
    const run = () => spawnSync(process.execPath, [tsx, "script/bootstrap-admin.ts"], { env, encoding: "utf8" });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const before = await client.query(`SELECT * FROM "${schema}".users`);
    assert.equal(before.rows[0].email, "first@example.invalid");
    assert.equal(before.rows[0].role, "admin");
    assert.equal(before.rows[0].email_verified, true);
    const second = run();
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /requires an empty users table/);
    assert.deepEqual((await client.query(`SELECT * FROM "${schema}".users`)).rows, before.rows);
    await client.query(`UPDATE "${schema}".users SET role = 'user'`);
    const userBefore = await client.query(`SELECT * FROM "${schema}".users`);
    const third = run();
    assert.notEqual(third.status, 0);
    assert.deepEqual((await client.query(`SELECT * FROM "${schema}".users`)).rows, userBefore.rows);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
