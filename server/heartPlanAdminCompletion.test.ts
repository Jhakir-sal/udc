import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { HeartPlan } from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  adminHeartPlanSummary, heartPlanCompletion, heartPlanCompletionFromCounts,
} from "./heartplanAdmin";
import { readHeartPlanAdminData } from "./heartPlanProgressStorage";
import { assertProgressSql } from "./heartPlanProgressPerformanceGuards";

test("admin plan summary allowlists operational fields for living and converted plans", () => {
  for (const status of ["active", "activated"]) {
    const privatePlan = {
      id: "synthetic-plan", status, tier: "free", fullName: "Synthetic Planner",
      createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
      upgradedAt: null, certificateId: null, activatedAt: null, activatedByName: null,
      dateOfBirth: "PRIVATE_DOB", phone: "PRIVATE_PHONE", street: "PRIVATE_ADDRESS",
      homeOccupancyStatus: "PRIVATE_HOUSING", hasVehicles: true,
      userId: "PRIVATE_OWNER_BINDING", stripeCheckoutSessionId: "PRIVATE_PAYMENT_SESSION",
      futurePrivateField: "PRIVATE_FUTURE_FIELD",
    } as unknown as HeartPlan;
    const summary = adminHeartPlanSummary(privatePlan);
    assert.deepEqual(Object.keys(summary).sort(), [
      "id", "status", "tier", "fullName", "createdAt", "updatedAt",
      "upgradedAt", "certificateId", "activatedAt", "activatedByName",
    ].sort());
    assert.doesNotMatch(JSON.stringify(summary), /PRIVATE_/);
  }
});

test("empty plan returns six incomplete sections without exposing content", () => {
  const progress = heartPlanCompletion({ fullName: "Synthetic Planner", dateOfBirth: null }, {
    wishes: null, documents: [], assets: [], contacts: [], letters: [],
  });
  assert.equal(progress.completed, 0);
  assert.equal(progress.total, 6);
  assert.equal(progress.percent, 0);
  assert.ok(Object.values(progress.sections).every(value => value === false));
  assert.deepEqual(progress.counts, { documents: 0, assets: 0, contacts: 0, letters: 0 });
});

test("checklist preserves existing completion rules, counts records, and never returns their values", () => {
  const privateItem = { value: "PRIVATE_ITEM", objectPath: "/PRIVATE_FILE", body: "PRIVATE_MESSAGE" };
  const progress = heartPlanCompletion({ fullName: "Synthetic", dateOfBirth: "PRIVATE_DOB" }, {
    wishes: { restingPreference: "PRIVATE_WISH" },
    documents: [privateItem, privateItem], assets: [privateItem],
    contacts: [privateItem, privateItem, privateItem], letters: [privateItem],
  });
  assert.equal(progress.completed, 6);
  assert.equal(progress.percent, 100);
  assert.ok(Object.values(progress.sections).every(Boolean));
  assert.deepEqual(progress.counts, { documents: 2, assets: 1, contacts: 3, letters: 1 });
  assert.doesNotMatch(JSON.stringify(progress), /PRIVATE_/);
  const partial = heartPlanCompletion({ fullName: "Synthetic", dateOfBirth: null }, {
    wishes: { restingPreference: null }, documents: [], assets: [privateItem],
    contacts: [privateItem], letters: [],
  });
  assert.equal(partial.completed, 2);
  assert.equal(partial.percent, 33);
});

test("admin detail route sends completion rather than private-item arrays and remains admin protected", () => {
  const source = readFileSync("server/routes.ts", "utf8");
  const route = source.slice(
    source.indexOf('app.get("/api/admin/heartplans/:id"'),
    source.indexOf("// Admin: permanently remove a living HeartPlan"),
  );
  assert.match(route, /isAuthenticated, isAdmin/);
  assert.match(route, /plan: adminHeartPlanSummary\(plan\)/);
  const response = route.slice(route.indexOf("res.json({"));
  assert.match(response, /\bprogress,/);
  assert.doesNotMatch(response, /\b(?:wishes|documents|assets|contacts|letters|events):/);
  assert.doesNotMatch(response, /\.\.\.plan|objectPath|redactPlanLetterForAdmin|financialInventoryForConcierge/);
  assert.match(route, /getHeartPlanAdminData\(\[req.params.id\]\)/);
  assert.doesNotMatch(route, /storage\.get(?:HeartPlan|User|PlanContacts)\(/);
});

test("count projection matches all 64 combinations of the existing six-section checklist", () => {
  for (let mask = 0; mask < 64; mask++) {
    const populated = (bit: number) => Boolean(mask & (1 << bit));
    const plan = { fullName: "Synthetic", dateOfBirth: populated(0) ? "PRIVATE_DOB" : null };
    const items = {
      wishes: populated(1) ? { restingPreference: "PRIVATE_WISH" } : null,
      documents: populated(2) ? [{ objectPath: "PRIVATE_FILE" }, {}] : [],
      assets: populated(3) ? [{ account: "PRIVATE_FINANCE" }] : [],
      contacts: populated(4) ? [{ email: "PRIVATE_CONTACT" }, {}, {}] : [],
      letters: populated(5) ? [{ body: "PRIVATE_MESSAGE" }] : [],
    };
    const fromCounts = heartPlanCompletionFromCounts({
      profileComplete: Boolean(plan.fullName && plan.dateOfBirth),
      wishesComplete: Boolean(items.wishes?.restingPreference),
      documents: items.documents.length, assets: items.assets.length,
      contacts: items.contacts.length, letters: items.letters.length,
    });
    assert.deepEqual(fromCounts, heartPlanCompletion(plan, items));
    const expectedCompleted = Array.from({ length: 6 }, (_, bit) => populated(bit)).filter(Boolean).length;
    assert.equal(fromCounts.completed, expectedCompleted);
    assert.equal(fromCounts.percent, Math.round(expectedCompleted / 6 * 100));
    assert.doesNotMatch(JSON.stringify(fromCounts), /PRIVATE_/);
  }
});

function capturingDatabase() {
  const calls: { text: string; params: unknown[] }[] = [];
  const db = drizzle({
    // Exercise the actual Drizzle SQL compiler and query execution boundary.
    client: {
      query: async (config: { text: string }, params: unknown[]) => {
        calls.push({ text: config.text, params });
        return { rows: [] };
      },
    } as any,
  });
  return { db, calls };
}

test("admin projection uses one query for one or 10,000 plans, and none for an empty list", async () => {
  const { db, calls } = capturingDatabase();
  assert.deepEqual(await readHeartPlanAdminData(db, []), []);
  assert.equal(calls.length, 0);
  await readHeartPlanAdminData(db, ["one"]);
  assert.equal(calls.length, 1);
  const ids = Array.from({ length: 10_000 }, (_, index) => `synthetic-${index}`);
  await readHeartPlanAdminData(db, ids);
  assert.equal(calls.length, 2);
  // Each grouped subquery is scoped to the same list; none performs an extra roundtrip.
  assert.deepEqual(calls[1].params, Array.from({ length: 7 }, () => ids));
  await readHeartPlanAdminData(db);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].params, []);
});

test("generated admin SQL selects aggregates, not private items or broad plan/user rows", async () => {
  const { db, calls } = capturingDatabase();
  await readHeartPlanAdminData(db);
  const sql = calls[0].text;
  assertProgressSql(sql);
  assert.doesNotMatch(sql, /select\s+\*|"(?:object_path|pending_object_path|body|content|notes|estimated_value|account_number_hint|institution|street|phone|address|stripe_checkout_session_id|password)"/i);
  // These sensitive columns may be used only to evaluate boolean/status expressions.
  assert.match(sql, /coalesce\("heart_plans"\."full_name" <> '' and "heart_plans"\."date_of_birth" <> '', false\)/);
  assert.match(sql, /exists\s*\(\s*select 1 from "plan_wishes"/);
  assert.match(sql, /"plan_wishes"\."resting_preference" <> ''/);
  assert.match(sql, /coalesce\("(?:plan_contacts"\.")?email", ''\) = ''/);
  assert.match(sql, /max\("(?:plan_events"\.")?created_at"\)/);
  assert.equal((sql.match(/count\(\*\)/g) || []).length, 6);
  const routes = readFileSync("server/routes.ts", "utf8");
  const aggregatePath = routes.slice(routes.indexOf("async function buildHeartPlanAdminRecords"),
    routes.indexOf("// Admin: permanently remove a living HeartPlan"));
  assert.doesNotMatch(aggregatePath, /storage\.get(?:HeartPlans|Users|PendingActivationRequests|PlanWishes|PlanDocuments|PlanAssets|PlanContacts|PlanLetters|PlanEvents)\(/);
  assert.match(aggregatePath, /return heartPlanAdminRecords\(plans\)/);
  assert.match(aggregatePath, /heartPlanAdminListHandler\(buildHeartPlanAdminRecords\)/);
});

test("PostgreSQL projection matches synthetic multiple-plan progress and delivery metadata without writes",
  { skip: !process.env.DATABASE_URL }, async () => {
    const { db, calls } = capturingDatabase();
    await readHeartPlanAdminData(db);
    const { pool } = await import("./db");
    const plans = Array.from({ length: 7 }, (_, index) => ({
      id: `plan-${index}`, user_id: "owner", status: index === 6 ? "activated" : "active",
      tier: "free", full_name: index === 0 ? "" : "Synthetic",
      date_of_birth: index >= 1 ? "PRIVATE_DOB" : null,
      created_at: "2026-01-01", updated_at: "2026-01-02",
    }));
    // CTEs shadow real tables: no actual planner records are read or mutated.
    const fixtures: [string, string, unknown[]][] = [
      ["heart_plans", "id text, user_id text, status text, tier text, full_name text, date_of_birth text, created_at timestamp, updated_at timestamp, upgraded_at timestamp, certificate_id text, activated_at timestamp, activated_by_name text, last_reviewed_at timestamp", plans],
      ["users", "id text, email text, first_name text, last_name text, email_verified boolean", [
        { id: "owner", email: "synthetic@example.com", first_name: "Synthetic", last_name: "Owner", email_verified: true },
      ]],
      ["plan_wishes", "plan_id text, resting_preference text", plans.filter((_, i) => i >= 2).map(p => ({ plan_id: p.id, resting_preference: " " }))],
      ["plan_documents", "plan_id text", plans.filter((_, i) => i >= 3).flatMap(p => [{ plan_id: p.id }, { plan_id: p.id }])],
      ["plan_assets", "plan_id text", plans.filter((_, i) => i >= 4).map(p => ({ plan_id: p.id }))],
      ["plan_contacts", "plan_id text, is_primary boolean, email text, info_email_failed_at timestamp, created_at timestamp", [
        { plan_id: "plan-5", is_primary: true, email: "", created_at: "2026-01-01" },
        { plan_id: "plan-5", is_primary: true, email: "ignored@example.com", created_at: "2026-01-02" },
        { plan_id: "plan-6", is_primary: true, email: null, info_email_failed_at: "2026-01-02", created_at: "2026-01-01" },
        { plan_id: "plan-4", is_primary: true, email: " ", created_at: "2026-01-01" },
      ]],
      ["plan_letters", "plan_id text", [{ plan_id: "plan-6" }]],
      ["plan_events", "plan_id text, created_at timestamp", [
        { plan_id: "plan-6", created_at: "2026-01-03" },
        { plan_id: "plan-6", created_at: "2026-01-04" },
      ]],
      ["plan_activation_requests", "plan_id text, status text", [
        { plan_id: "plan-5", status: "pending" },
        { plan_id: "plan-5", status: "pending" },
        { plan_id: "plan-5", status: "pending_verification" },
        { plan_id: "plan-6", status: "approved" },
      ]],
    ];
    const fixtureQuery = (query: { text: string; params: unknown[] }) => ({
      text: `with ${fixtures.map(([name, columns], index) =>
        `"${name}" as (select * from jsonb_to_recordset($${query.params.length + index + 1}::jsonb) as fixture(${columns}))`).join(", ")} ${query.text}`,
      values: [...query.params, ...fixtures.map(([, , rows]) => JSON.stringify(rows))],
      rowMode: "array" as const,
    });
    try {
      const positional = await pool.query(fixtureQuery(calls[0]));
      assert.equal(positional.rows.length, 7);
      const mappedDb = drizzle({ client: { query: async () => positional } as any });
      const mapped = await readHeartPlanAdminData(mappedDb);
      const byId = new Map(mapped.map(row => [row.id, row]));
      assert.deepEqual(plans.map(plan => heartPlanCompletionFromCounts(byId.get(plan.id)!).completed), [0, 1, 2, 3, 5, 5, 6]);
      assert.equal(byId.get("plan-5")?.primaryContactStatus, "no_email");
      assert.equal(byId.get("plan-6")?.primaryContactStatus, "delivery_failed");
      assert.equal(byId.get("plan-4")?.primaryContactStatus, "ready");
      assert.equal(byId.get("plan-0")?.primaryContactStatus, "missing");
      assert.equal(byId.get("plan-6")?.failedContactDeliveries, 1);
      assert.equal(byId.get("plan-5")?.contacts, 2);
      assert.equal(byId.get("plan-6")?.documents, 2);
      assert.equal(byId.get("plan-5")?.pendingActivationRequests, 2);
      assert.equal(byId.get("plan-6")?.pendingActivationRequests, 0);
      assert.equal(byId.get("plan-6")?.status, "activated");
      assert.equal(byId.get("plan-6")?.ownerEmail, "synthetic@example.com");
      assert.equal(new Date(byId.get("plan-6")!.lastEventAt!).toISOString(), "2026-01-04T00:00:00.000Z");
      assert.doesNotMatch(JSON.stringify(mapped), /PRIVATE_/);
      const largeRows = Array.from({ length: 10_000 }, (_, index) => {
        const row = [...positional.rows[index % 7]];
        row[0] = `large-${index}`;
        return row;
      });
      let queryCount = 0;
      const largeDb = drizzle({ client: {
        query: async () => { queryCount++; return { rows: largeRows }; },
      } as any });
      const largeResult = await readHeartPlanAdminData(largeDb, largeRows.map(row => row[0]));
      assert.equal(queryCount, 1);
      assert.equal(largeResult.length, 10_000);
      assert.equal(new Set(largeResult.map(row => row.id)).size, 10_000);
      for (let index = 0; index < largeResult.length; index++) {
        assert.deepEqual(heartPlanCompletionFromCounts(largeResult[index]),
          heartPlanCompletionFromCounts(mapped[index % 7]));
      }
      await readHeartPlanAdminData(db, ["plan-5", "missing", "plan-5"]);
      const scoped = await pool.query(fixtureQuery(calls[1]));
      const scopedDb = drizzle({ client: { query: async () => scoped } as any });
      const scopedResult = await readHeartPlanAdminData(scopedDb);
      assert.equal(scopedResult.length, 1);
      assert.deepEqual(scopedResult[0], byId.get("plan-5"));

      fixtures[0][2] = [
        { ...plans[0], id: "empty-name", full_name: "", date_of_birth: "present" },
        { ...plans[0], id: "empty-dob", full_name: "present", date_of_birth: "" },
        { ...plans[0], id: "null-name", full_name: null, date_of_birth: "present" },
        { ...plans[0], id: "spaces", full_name: " ", date_of_birth: " " },
      ];
      fixtures[2][2] = [
        { plan_id: "empty-name", resting_preference: "" },
        { plan_id: "empty-dob", resting_preference: null },
        { plan_id: "spaces", resting_preference: " " },
      ];
      const edges = await pool.query(fixtureQuery(calls[0]));
      const edgeDb = drizzle({ client: { query: async () => edges } as any });
      const edgeResult = await readHeartPlanAdminData(edgeDb);
      const edgeFlags = new Map(edgeResult.map(row => [row.id, [row.profileComplete, row.wishesComplete]]));
      assert.deepEqual(edgeFlags.get("empty-name"), [false, false]);
      assert.deepEqual(edgeFlags.get("empty-dob"), [false, false]);
      assert.deepEqual(edgeFlags.get("null-name"), [false, false]);
      assert.deepEqual(edgeFlags.get("spaces"), [true, true]);
    } finally {
      await pool.end();
    }
  });
