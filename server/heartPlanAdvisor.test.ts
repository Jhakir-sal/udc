import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { annualReviewStatus, advisorCanEdit, advisorHasFullAccess, findAdvisorGrant, normalizeAdvisorEmail, buildAdvisorResponse } from "./heartPlanAdvisorPolicy";
import { readHeartPlanAdvisorSummary } from "./heartPlanProgressStorage";
import { drizzle } from "drizzle-orm/node-postgres";
import type { HeartPlan } from "../shared/schema";
import { buildHeartPlanAdvisorInvitationEmail } from "./email";
import { insertPlanContactSchema } from "../shared/schema";

const contacts = [
  { isAdvisor: true, email: " Advisor@Example.com ", advisorAccessLevel: "limited", advisorPermission: "view" },
  { isAdvisor: false, email: "other@example.com", advisorAccessLevel: "full", advisorPermission: "edit" },
];

test("advisor access requires a verified normalized email match", () => {
  assert.equal(normalizeAdvisorEmail(" Advisor@Example.COM "), "advisor@example.com");
  assert.equal(findAdvisorGrant({ email: "advisor@example.com", emailVerified: false }, contacts), null);
  assert.equal(findAdvisorGrant({ email: "wrong@example.com", emailVerified: true }, contacts), null);
  assert.equal(findAdvisorGrant({ email: "other@example.com", emailVerified: true }, contacts), null);
  assert.equal(findAdvisorGrant({ email: "", emailVerified: true }, contacts), null);
  assert.equal(findAdvisorGrant({ email: "ADVISOR@example.com", emailVerified: true }, contacts), contacts[0]);
});

test("scope and permission remain independent grants", () => {
  assert.equal(advisorHasFullAccess(contacts[0]), false);
  assert.equal(advisorCanEdit(contacts[0]), false);
  assert.equal(advisorHasFullAccess(contacts[1]), true);
  assert.equal(advisorCanEdit(contacts[1]), true);
});

test("annual review is due one year after creation or the last review", () => {
  const beforeDue = annualReviewStatus({ createdAt: "2025-06-01T00:00:00Z" }, new Date("2026-05-31T00:00:00Z"));
  assert.equal(beforeDue.due, false);
  assert.equal(beforeDue.nextReviewAt.toISOString().slice(0, 10), "2026-06-01");
  const afterReview = annualReviewStatus({ createdAt: "2024-01-01T00:00:00Z", lastReviewedAt: "2026-02-10T00:00:00Z" }, new Date("2027-02-11T00:00:00Z"));
  assert.equal(afterReview.due, true);
  assert.equal(afterReview.nextReviewAt.toISOString().slice(0, 10), "2027-02-10");
});

test("contact validation permits only explicit advisor scope and permissions", () => {
  const base = { planId: "plan-1", fullName: "Advisor", email: "advisor@example.com", isAdvisor: true };
  assert.equal(insertPlanContactSchema.safeParse({ ...base, advisorAccessLevel: "limited", advisorPermission: "view" }).success, true);
  assert.equal(insertPlanContactSchema.safeParse({ ...base, advisorAccessLevel: "everything" }).success, false);
  assert.equal(insertPlanContactSchema.safeParse({ ...base, advisorPermission: "owner" }).success, false);
});

test("advisor invitation states the exact role and access", () => {
  const email = buildHeartPlanAdvisorInvitationEmail({
    advisorName: "Alex Advisor",
    plannerName: "Pat Planner",
    planId: "plan-1",
    accessLevel: "limited",
    permission: "edit",
  });
  assert.match(email.subject, /Trusted Advisor/);
  assert.match(email.html, /Limited/);
  assert.match(email.html, /Can edit/);
  assert.ok(email.html.includes("/heartplan/advisor/plan-1"));
});

test("owner routes remain separate and advisor mutations enforce edit permission", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.ok(routes.includes('app.get("/api/heartplan", isAuthenticated, isPlanner'));
  assert.ok(routes.includes("if (!advisorCanEdit(access.contact)) return res.status(403)"));
  assert.ok(routes.includes("const response = await buildAdvisorResponse(plan, contact, storage);"));
  const authorization = routes.slice(routes.indexOf("async function resolveAdvisorAccess"), routes.indexOf("const advisorWishesSchema"));
  assert.match(authorization, /plan\.status !== "active"/);
  assert.match(authorization, /findAdvisorGrant\(user, await storage\.getPlanAdvisorContacts\(plan\.id\)\)/);
  assert.doesNotMatch(authorization, /getPlanContacts\(/);
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const grantQuery = storage.slice(storage.indexOf("async getPlanAdvisorContacts"), storage.indexOf("async getHeartPlanAdvisorSummary"));
  assert.match(grantQuery, /eq\(planContacts\.planId, planId\), eq\(planContacts\.isAdvisor, true\)/);
  assert.match(grantQuery, /orderBy\(planContacts\.createdAt\)/);
  assert.doesNotMatch(grantQuery, /select\(\)|phone|notes|infoEmail/);
});

const privatePlan = {
  id: "plan-1", status: "active", fullName: "Synthetic Planner",
  createdAt: new Date("2026-01-01"), dateOfBirth: "PRIVATE_DOB",
  homeOccupancyStatus: "owns_home", hasVehicles: false,
  userId: "PRIVATE_OWNER", certificateId: "PRIVATE_CERTIFICATE",
} as HeartPlan;
type AdvisorReads = Parameters<typeof buildAdvisorResponse>[2];

for (const permission of ["view", "edit"]) {
  test(`Limited/${permission} uses only the narrow summary read`, async () => {
    const calls: string[] = [];
    const forbidden = async () => {
      assert.fail("Limited access must not load full private records");
    };
    const storage: AdvisorReads = {
      getHeartPlanAdvisorSummary: async (id) => {
        calls.push(id);
        return {
          restingPreference: "cremation", serviceType: "private", additionalWishes: "Shared wish",
          documents: 2, assets: 3, trustedContacts: 4, legacyMessages: 5,
          ownerEmail: "PRIVATE_EMAIL", activatedAt: "PRIVATE_LIFECYCLE",
        };
      },
      getPlanWishes: forbidden, getPlanAssets: forbidden, getPlanDocuments: forbidden,
      getPlanContacts: forbidden, getPlanLetters: forbidden,
    };
    const grant = { ...contacts[0], advisorPermission: permission };
    const response = await buildAdvisorResponse(privatePlan, grant, storage);
    assert.deepEqual(calls, ["plan-1"]);
    assert.deepEqual(response.access, { level: "limited", permission });
    assert.equal(advisorCanEdit(grant), permission === "edit");
    assert.equal("details" in response, false);
    assert.doesNotMatch(JSON.stringify(response), /homeOccupancyStatus|hasVehicles/);
    assert.deepEqual(response.summary, {
      plannerName: "Synthetic Planner", status: "active",
      restingPreference: "cremation", serviceType: "private", additionalWishes: "Shared wish",
      counts: { documents: 2, assets: 3, trustedContacts: 4, legacyMessages: 5 },
    });
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE_/);
  });

  test(`Full/${permission} retains private details and existing redactions`, async () => {
    const calls: string[] = [];
    const read = (name: string, result: unknown) => async (id: string) => {
      assert.equal(id, "plan-1");
      calls.push(name);
      return result;
    };
    const storage = {
      getHeartPlanAdvisorSummary: async () => assert.fail("Full access uses its existing reads"),
      getPlanWishes: read("wishes", { restingPreference: "burial", music: "Full-only music" }),
      getPlanAssets: read("assets", [{ id: "asset", notes: "Full-only notes" }]),
      getPlanDocuments: read("documents", [{ id: "document", fileName: "will.pdf", objectPath: "PRIVATE_PATH" }]),
      getPlanContacts: read("contacts", [{ id: "contact", phone: "Full-only phone", infoEmailAttempts: 2, infoEmailFailedAt: "PRIVATE_FAILURE" }]),
      getPlanLetters: read("letters", [{ id: "letter", body: "Full-only message", objectPath: "PRIVATE_PATH" }]),
    } as AdvisorReads;
    const grant = { ...contacts[0], advisorAccessLevel: "full", advisorPermission: permission };
    const response = await buildAdvisorResponse(privatePlan, grant, storage);
    assert.deepEqual(calls.sort(), ["assets", "contacts", "documents", "letters", "wishes"]);
    assert.deepEqual(response.access, { level: "full", permission });
    assert.equal(advisorCanEdit(grant), permission === "edit");
    assert.deepEqual(response.summary.counts, { documents: 1, assets: 1, trustedContacts: 1, legacyMessages: 1 });
    assert.deepEqual(response.details?.wishes, { restingPreference: "burial", music: "Full-only music" });
    assert.deepEqual(response.details?.assets, [{ id: "asset", notes: "Full-only notes" }]);
    assert.deepEqual(response.details?.documents, [{ id: "document", fileName: "will.pdf" }]);
    assert.deepEqual(response.details?.contacts, [{ id: "contact", phone: "Full-only phone" }]);
    assert.deepEqual(response.details?.legacyMessages, [{ id: "letter", body: "Full-only message" }]);
    assert.equal(response.details?.profile.dateOfBirth, "PRIVATE_DOB");
    assert.equal(response.details?.profile.homeOccupancyStatus, "owns_home");
    assert.equal(response.details?.profile.hasVehicles, false);
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE_PATH|PRIVATE_FAILURE|infoEmailAttempts/);
  });
}

test("narrow advisor SQL selects only fixed shared wishes and scoped item counts", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = drizzle({
    client: {
      query: async (config: { text: string }, params: unknown[]) => {
        calls.push({ text: config.text, params });
        return { rows: [[null, "", null, 0, 0, 0, 0]] };
      },
    } as any,
  });
  assert.deepEqual(await readHeartPlanAdvisorSummary(db, "plan-1"), {
    restingPreference: null, serviceType: "", additionalWishes: null,
    documents: 0, assets: 0, trustedContacts: 0, legacyMessages: 0,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["plan-1"]);
  const sql = calls[0].text;
  for (const table of ["plan_documents", "plan_assets", "plan_contacts", "plan_letters"]) {
    assert.ok(sql.includes(`select count(*)::integer from "${table}" where "${table}"."plan_id" = "heart_plans"."id"`));
  }
  assert.match(sql, /left join "plan_wishes".*"heart_plans"\."id" = "plan_wishes"\."plan_id"/);
  assert.match(sql, /where "heart_plans"\."id" = \$1/);
  assert.doesNotMatch(sql, /select\s+\*|"(?:users|plan_events|plan_activation_requests|object_path|body|notes|email|phone|full_name|date_of_birth|resting_details|music|created_at|activated_at|certificate_id)"/);
});

test("Limited empty wishes preserve null defaults and missing plans fail explicitly", async () => {
  const forbidden = async () => assert.fail("Unexpected private read");
  const response = await buildAdvisorResponse({ ...privatePlan, fullName: "" }, contacts[0], {
    getHeartPlanAdvisorSummary: async () => ({
      restingPreference: null, serviceType: "", additionalWishes: null,
      documents: 0, assets: 0, trustedContacts: 0, legacyMessages: 0,
    }),
    getPlanWishes: forbidden, getPlanAssets: forbidden, getPlanDocuments: forbidden,
    getPlanContacts: forbidden, getPlanLetters: forbidden,
  });
  assert.deepEqual(response.summary, {
    plannerName: "Heart Plan planner", status: "active",
    restingPreference: null, serviceType: null, additionalWishes: null,
    counts: { documents: 0, assets: 0, trustedContacts: 0, legacyMessages: 0 },
  });
  const db = drizzle({ client: { query: async () => ({ rows: [] }) } as any });
  await assert.rejects(readHeartPlanAdvisorSummary(db, "missing"), /HeartPlan is unavailable/);
});

test("PostgreSQL advisor counts stay plan-scoped and return zero without wishes",
  { skip: !process.env.DATABASE_URL }, async () => {
    const { pool } = await import("./db");
    const fixtures: [string, string, unknown[]][] = [
      ["heart_plans", "id text", [{ id: "selected" }, { id: "empty" }, { id: "other" }]],
      ["plan_wishes", "plan_id text, resting_preference text, service_type text, additional_wishes text", [
        { plan_id: "selected", resting_preference: "burial", service_type: "private", additional_wishes: "Shared wish" },
        { plan_id: "other", resting_preference: "Not shared" },
      ]],
      ...(["plan_documents", "plan_assets", "plan_contacts", "plan_letters"].map((table, index) => [
        table, "plan_id text",
        [...Array.from({ length: index + 1 }, () => ({ plan_id: "selected" })),
          ...Array.from({ length: 6 }, () => ({ plan_id: "other" }))],
      ] as [string, string, unknown[]])),
    ];
    let queries = 0;
    const db = drizzle({
      client: {
        query: async (config: { text: string; rowMode?: string }, params: unknown[]) => {
          queries++;
          return pool.query({
            ...config,
            text: `with ${fixtures.map(([name, columns], index) =>
              `"${name}" as (select * from jsonb_to_recordset($${params.length + index + 1}::jsonb) as fixture(${columns}))`).join(", ")} ${config.text}`,
            values: [...params, ...fixtures.map(([, , rows]) => JSON.stringify(rows))],
          });
        },
      } as any,
    });
    try {
      assert.deepEqual(await readHeartPlanAdvisorSummary(db, "selected"), {
        restingPreference: "burial", serviceType: "private", additionalWishes: "Shared wish",
        documents: 1, assets: 2, trustedContacts: 3, legacyMessages: 4,
      });
      assert.deepEqual(await readHeartPlanAdvisorSummary(db, "empty"), {
        restingPreference: null, serviceType: null, additionalWishes: null,
        documents: 0, assets: 0, trustedContacts: 0, legacyMessages: 0,
      });
      assert.equal(queries, 2);
    } finally {
      await pool.end();
    }
  });