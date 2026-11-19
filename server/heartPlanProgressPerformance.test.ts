import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import express, { type RequestHandler } from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readHeartPlanAdminData } from "./heartPlanProgressStorage";
import { heartPlanAdminRecords, heartPlanAdminListHandler } from "./heartPlanAdminReports";
import { registerHeartPlanProgressSummaryRoute } from "./heartplanAdmin";
import { createProgressPerformanceFixtures, fixturePlans, fixtureItemCounts } from "./heartPlanProgressPerformanceFixtures";
import {
  assertProgressPlan, assertProgressRows, assertProgressSql, planNodes, type ExplainNode,
} from "./heartPlanProgressPerformanceGuards";

type CapturedQuery = { text: string; params: unknown[] };
const sqlBudgetMs = 2_000;
const endpointBudgetMs = 5_000;
const samples = 5;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test("isolated PostgreSQL: 10,000 plans / 280,000 items, plans, privacy, and staff HTTP latency",
  { timeout: 180_000 }, async (t) => {
    assert.notEqual(process.env.NODE_ENV, "production", "This benchmark is development/test only");
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required; this performance command must not silently skip");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "heartplan-synthetic-performance" });
    await client.connect();
    t.after(async () => {
      try { await client.query("ROLLBACK"); } finally { await client.end(); }
    });
    await createProgressPerformanceFixtures(client);
    const environment = (await client.query(`
      SELECT version() AS postgres, current_setting('work_mem') AS work_mem,
        current_setting('jit') AS jit, current_setting('max_parallel_workers_per_gather') AS parallel_workers
    `)).rows[0];
    const calls: CapturedQuery[] = [];
    const db = drizzle({ client: {
      query: async (config: { text: string; rowMode?: "array" }, params: unknown[]) => {
        assertProgressSql(config.text);
        assert.doesNotMatch(config.text, /"(?:public|private)"\./, "Fixture query must not reference persistent schemas");
        calls.push({ text: config.text, params });
        return client.query({ text: config.text, values: params, rowMode: config.rowMode });
      },
    } as any });
    const report: Record<string, unknown> = {
      environment, fixture: { plans: fixturePlans, wishes: fixturePlans, itemsPerPlan: fixtureItemCounts,
        itemRows: fixturePlans * Object.values(fixtureItemCounts).reduce((a, b) => a + b, 0),
        indexes: "current schema primary/unique constraints only; no item plan_id indexes except wishes UNIQUE" },
      budgets: { sqlMedianMs: sqlBudgetMs, endpointMedianMs: endpointBudgetMs, samples },
      queries: {}, endpoints: {},
    };

    for (const [name, ids, expected] of [
      ["all", undefined, fixturePlans],
      ["largeScope", Array.from({ length: fixturePlans }, (_, i) => `plan-${i + 1}`), fixturePlans],
      ["single", ["plan-2"], 1],
    ] as const) {
      const before = calls.length;
      const rows = await readHeartPlanAdminData(db, ids ? [...ids] : undefined);
      assert.equal(calls.length - before, 1, `${name}: exactly one database roundtrip`);
      assert.equal(rows.length, expected);
      assertProgressRows(rows);
      for (const row of rows) {
        const i = Number(row.id.slice(5));
        assert.equal(row.documents, 8);
        assert.equal(row.assets, 6);
        assert.equal(row.contacts, 3);
        assert.equal(row.letters, 4);
        assert.equal(row.profileComplete, i % 3 !== 0);
        assert.equal(row.wishesComplete, i % 3 === 2);
        assert.equal(row.pendingActivationRequests, 1);
        assert.equal(row.failedContactDeliveries, i % 11 === 0 ? 1 : 0);
        assert.equal(row.primaryContactStatus, i % 11 === 0 ? "delivery_failed" : i % 13 === 0 ? "no_email" : "ready");
        assert.equal(new Date(row.lastEventAt!).toISOString(), "2026-01-03T00:05:00.000Z");
      }
      const query = calls.at(-1)!;
      const explanations = [];
      for (let sample = 0; sample < samples; sample++) {
        const result = await client.query({
          text: `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${query.text}`, values: query.params,
        });
        const explanation = result.rows[0]["QUERY PLAN"][0];
        await mkdir("generated-artifacts/heartplan-progress", { recursive: true });
        await writeFile("generated-artifacts/heartplan-progress/last-explain.json", JSON.stringify(explanation, null, 2) + "\n");
        assertProgressPlan(explanation.Plan as ExplainNode, expected);
        explanations.push(explanation);
      }
      const executionMs = explanations.map(plan => plan["Execution Time"] as number);
      const planningMs = explanations.map(plan => plan["Planning Time"] as number);
      assert.ok(median(executionMs) < sqlBudgetMs, `${name}: SQL median ${median(executionMs)}ms exceeds ${sqlBudgetMs}ms`);
      (report.queries as Record<string, unknown>)[name] = {
        executionMs, planningMs, medianExecutionMs: median(executionMs),
        scans: planNodes(explanations[0].Plan).filter(node => node["Relation Name"]).map(node => ({
          table: node["Relation Name"], type: node["Node Type"], loops: node["Actual Loops"], rows: node["Actual Rows"],
        })),
        explain: explanations[0],
      };
      t.diagnostic(`${name}: PostgreSQL median ${median(executionMs).toFixed(1)}ms`);
    }
    const beforeEmpty = calls.length;
    assert.deepEqual(await readHeartPlanAdminData(db, []), []);
    assert.equal(calls.length, beforeEmpty);

    // Use the actual production handlers with only auth and the isolated DB injected.
    // No import of routes.ts/storage.ts: no schedulers, emails, auth providers, or app DB pools.
    const app = express();
    const auth: RequestHandler = (req, res, next) => {
      if (!req.headers["x-synthetic-role"]) { res.sendStatus(401); return; }
      next();
    };
    const admin: RequestHandler = (req, res, next) => {
      if (req.headers["x-synthetic-role"] !== "admin") { res.sendStatus(403); return; }
      next();
    };
    const buildRecords = async () => heartPlanAdminRecords(await readHeartPlanAdminData(db));
    registerHeartPlanProgressSummaryRoute(app, auth, admin, buildRecords);
    app.get("/api/admin/heartplans", auth, admin, heartPlanAdminListHandler(buildRecords));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    t.after(() => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const expectedSummary = { started: 0, thirtyPlus: 0, fiftyPlus: 0, seventyFivePlus: 0, complete: 0 };
    for (let i = 1; i <= fixturePlans; i++) {
      if (i % 10 !== 0) {
        const band = i % 3 === 0 ? "fiftyPlus" : i % 3 === 1 ? "seventyFivePlus" : "complete";
        expectedSummary[band]++;
      }
    }
    for (const path of [
      "/api/admin/heartplans/progress-summary",
      "/api/admin/heartplans",
      "/api/admin/heartplans?stage=complete&payment=paid",
    ]) {
      const authBefore = calls.length;
      assert.equal((await fetch(base + path)).status, 401);
      assert.equal((await fetch(base + path, { headers: { "x-synthetic-role": "planner" } })).status, 403);
      assert.equal(calls.length, authBefore, "Unauthorized requests must not query the DB");
      const timings = [];
      let bytes = 0;
      // First successful call warms the complete SQL/mapping/serialization/HTTP path.
      for (let sample = -1; sample < samples; sample++) {
        const start = performance.now();
        const before = calls.length;
        const response = await fetch(base + path, { headers: { "x-synthetic-role": "admin" } });
        assert.equal(response.status, 200);
        const text = await response.text();
        const elapsed = performance.now() - start;
        assert.equal(calls.length - before, 1, `${path}: exactly one DB query`);
        assert.doesNotMatch(text, /PRIVATE_FIXTURE|objectPath|dateOfBirth|restingPreference|accountNumberHint/);
        const body = JSON.parse(text);
        if (path.endsWith("progress-summary")) {
          assert.deepEqual(body, expectedSummary);
        } else {
          assert.equal(response.headers.get("cache-control"), "private, no-store");
          const expectedIds = Array.from({ length: fixturePlans }, (_, i) => i + 1)
            .filter(i => !path.includes("?") || (i % 10 !== 0 && i % 3 === 2 && i % 2 === 0))
            .map(i => `plan-${i}`).sort();
          assert.deepEqual(body.map((row: { id: string }) => row.id).sort(), expectedIds);
          for (const row of body) {
            assert.deepEqual(Object.keys(row).sort(), [
              "id", "status", "tier", "fullName", "createdAt", "updatedAt", "upgradedAt", "certificateId",
              "activatedAt", "activatedByName", "ownerEmail", "ownerName", "emailVerified", "progress",
              "pendingActivationRequests", "lastActivityAt", "primaryContactStatus", "failedContactDeliveries",
              "annualReview",
            ].sort(), "Staff list response must remain allowlisted");
            assert.equal(row.progress.completed, Number(row.id.slice(5)) % 3 === 0 ? 4 : Number(row.id.slice(5)) % 3 === 1 ? 5 : 6);
            assert.deepEqual(row.progress.counts, { documents: 8, assets: 6, contacts: 3, letters: 4 });
          }
        }
        if (sample >= 0) timings.push(elapsed);
        bytes = Buffer.byteLength(text);
      }
      assert.ok(median(timings) < endpointBudgetMs, `${path}: endpoint median exceeds ${endpointBudgetMs}ms`);
      (report.endpoints as Record<string, unknown>)[path] = { timingsMs: timings, medianMs: median(timings), responseBytes: bytes, queriesPerRequest: 1 };
      t.diagnostic(`${path}: HTTP median ${median(timings).toFixed(1)}ms, ${bytes} bytes`);
    }
    await mkdir("generated-artifacts/heartplan-progress", { recursive: true });
    await writeFile("generated-artifacts/heartplan-progress/latest.json", JSON.stringify(report, null, 2) + "\n");
    t.diagnostic("Full synthetic EXPLAIN/latency report: generated-artifacts/heartplan-progress/latest.json");
  });
