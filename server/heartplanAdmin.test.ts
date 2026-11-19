import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import express, { type RequestHandler } from "express";
import {
  filterHeartPlans,
  registerHeartPlanProgressSummaryRoute,
  summarizeHeartPlanFunnel,
  summarizeLivingHeartPlanProgress,
  type HeartPlanAdminRecord,
} from "./heartplanAdmin";

const base: HeartPlanAdminRecord = {
  id: "one", status: "active", tier: "free", fullName: "Alex Planner",
  createdAt: "2026-08-01T12:00:00Z", activatedAt: null, upgradedAt: null,
  updatedAt: "2026-08-02T12:00:00Z", ownerEmail: "alex@example.com", ownerName: "Alex Planner",
  emailVerified: false, progress: { completed: 0, total: 6, percent: 0 },
  pendingActivationRequests: 0, lastActivityAt: "2026-08-02T12:00:00Z",
  primaryContactStatus: "missing", failedContactDeliveries: 0,
  annualReview: { lastReviewedAt: null, nextReviewAt: "2027-08-01T12:00:00Z", due: false },
};

const records: HeartPlanAdminRecord[] = [
  base,
  {
    ...base, id: "two", fullName: "Bailey Legacy", ownerName: "Bailey Legacy",
    ownerEmail: "bailey@example.com", createdAt: "2026-08-15T12:00:00Z",
    emailVerified: true, tier: "legacy", upgradedAt: "2026-08-16T12:00:00Z",
    progress: { completed: 3, total: 6, percent: 50 }, failedContactDeliveries: 1,
    primaryContactStatus: "delivery_failed",
  },
  {
    ...base, id: "three", fullName: "Casey Complete", status: "activated",
    activatedAt: "2026-08-22T12:00:00Z", emailVerified: true,
    progress: { completed: 6, total: 6, percent: 100 },
  },
];

test("summarizes HeartPlan funnel counts", () => {
  assert.deepEqual(summarizeHeartPlanFunnel(records), {
    registered: 3, emailVerified: 2, startedProgress: 2,
    paidLegacy: 1, activated: 1, contactDeliveryWarnings: 1,
  });
});

test("groups living HeartPlans into mutually exclusive current progress bands", () => {
  const progressRecords: HeartPlanAdminRecord[] = [
    { ...base, id: "not-started" },
    { ...base, id: "started", progress: { completed: 1, total: 6, percent: 17 } },
    { ...base, id: "thirty", progress: { completed: 2, total: 6, percent: 33 } },
    { ...base, id: "fifty", progress: { completed: 3, total: 6, percent: 50 } },
    { ...base, id: "also-fifty", progress: { completed: 4, total: 6, percent: 67 } },
    { ...base, id: "seventy-five", progress: { completed: 5, total: 6, percent: 83 } },
    { ...base, id: "complete", progress: { completed: 6, total: 6, percent: 100 } },
    { ...base, id: "converted", status: "activated", progress: { completed: 6, total: 6, percent: 100 } },
  ];

  assert.deepEqual(summarizeLivingHeartPlanProgress(progressRecords), {
    started: 2,
    thirtyPlus: 1,
    fiftyPlus: 2,
    seventyFivePlus: 1,
    complete: 1,
  });
});

test("filters HeartPlans by search, dates, progress, payment, activation, and warnings", () => {
  assert.deepEqual(filterHeartPlans(records, { q: "BAILEY" }).map((r) => r.id), ["two"]);
  assert.deepEqual(filterHeartPlans(records, { signupFrom: "2026-08-10", signupTo: "2026-08-20" }).map((r) => r.id), ["two"]);
  assert.deepEqual(filterHeartPlans(records, { progress: "not_started" }).map((r) => r.id), ["one"]);
  assert.deepEqual(filterHeartPlans(records, { progress: "started" }).map((r) => r.id), ["two"]);
  assert.deepEqual(filterHeartPlans(records, { progress: "complete" }).map((r) => r.id), ["three"]);
  assert.deepEqual(filterHeartPlans(records, { payment: "paid", warnings: "yes" }).map((r) => r.id), ["two"]);
  assert.deepEqual(filterHeartPlans(records, { activation: "activated" }).map((r) => r.id), ["three"]);
  assert.deepEqual(filterHeartPlans([
    { ...base, id: "review-due", annualReview: { ...base.annualReview, due: true } },
    { ...base, id: "review-upcoming" },
    { ...base, id: "review-converted", status: "activated", annualReview: { ...base.annualReview, due: true } },
  ], { annualReview: "due" }).map((r) => r.id), ["review-due"]);
});

test("filters living HeartPlans by mutually exclusive stage and combines other filters", () => {
  const progressRecords: HeartPlanAdminRecord[] = [
    { ...base, id: "not-started" },
    { ...base, id: "started", progress: { completed: 1, total: 6, percent: 17 } },
    { ...base, id: "thirty", progress: { completed: 2, total: 6, percent: 33 } },
    { ...base, id: "fifty-free", progress: { completed: 3, total: 6, percent: 50 } },
    { ...base, id: "fifty-paid", tier: "legacy", upgradedAt: "2026-08-16T12:00:00Z", progress: { completed: 4, total: 6, percent: 67 } },
    { ...base, id: "seventy-five", progress: { completed: 5, total: 6, percent: 83 } },
    { ...base, id: "complete", progress: { completed: 6, total: 6, percent: 100 } },
    { ...base, id: "converted", status: "activated", progress: { completed: 6, total: 6, percent: 100 } },
  ];

  assert.deepEqual(filterHeartPlans(progressRecords, { stage: "started" }).map((r) => r.id), ["not-started", "started"]);
  assert.deepEqual(filterHeartPlans(progressRecords, { stage: "thirtyPlus" }).map((r) => r.id), ["thirty"]);
  assert.deepEqual(filterHeartPlans(progressRecords, { stage: "fiftyPlus" }).map((r) => r.id), ["fifty-free", "fifty-paid"]);
  assert.deepEqual(filterHeartPlans(progressRecords, { stage: "seventyFivePlus" }).map((r) => r.id), ["seventy-five"]);
  assert.deepEqual(filterHeartPlans(progressRecords, { stage: "complete" }).map((r) => r.id), ["complete"]);
  assert.deepEqual(filterHeartPlans(progressRecords, { stage: "fiftyPlus", payment: "paid", q: "planner" }).map((r) => r.id), ["fifty-paid"]);
});

test("protects HeartPlan admin routes with authentication and admin role middleware", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const route of ["/api/admin/stats", "/api/admin/heartplans", "/api/admin/heartplans/:id"]) {
    assert.match(routes, new RegExp(`app\\.get\\("${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", isAuthenticated, isAdmin,`));
  }
  assert.match(routes, /registerHeartPlanProgressSummaryRoute\(app, isAuthenticated, isAdmin, buildHeartPlanAdminRecords\)/);
  assert.match(routes, /app\.delete\("\/api\/admin\/heartplans\/:id", isAuthenticated, isAdmin,/);
  assert.match(routes, /Converted HeartPlans cannot be deleted/);
  assert.match(routes, /Paid Legacy plans require billing review before deletion/);
  assert.match(routes, /Resolve the pending death report before deleting this HeartPlan/);
  assert.match(routes, /confirmation: z\.literal\("DELETE"\)/);
});

test("authenticated admin progress endpoint returns every living plan exactly once and excludes converted plans", async (t) => {
  const progressRecords: HeartPlanAdminRecord[] = [
    { ...base, id: "living-started" },
    { ...base, id: "living-thirty", progress: { completed: 2, total: 6, percent: 33 } },
    { ...base, id: "living-fifty", progress: { completed: 3, total: 6, percent: 50 } },
    { ...base, id: "living-seventy-five", progress: { completed: 5, total: 6, percent: 83 } },
    { ...base, id: "living-complete", progress: { completed: 6, total: 6, percent: 100 } },
    { ...base, id: "converted-complete", status: "activated", progress: { completed: 6, total: 6, percent: 100 } },
  ];
  const isAuthenticated: RequestHandler = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
    next();
  };
  const isAdmin: RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== "Bearer admin") return res.status(403).json({ error: "Forbidden" });
    next();
  };
  const app = express();
  registerHeartPlanProgressSummaryRoute(app, isAuthenticated, isAdmin, async () => progressRecords);

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/api/admin/heartplans/progress-summary`;

  const unauthorized = await fetch(endpoint);
  assert.equal(unauthorized.status, 401);
  const nonAdmin = await fetch(endpoint, { headers: { Authorization: "Bearer planner" } });
  assert.equal(nonAdmin.status, 403);

  const response = await fetch(endpoint, { headers: { Authorization: "Bearer admin" } });
  assert.equal(response.status, 200);
  const summary = await response.json() as Record<string, number>;
  assert.deepEqual(summary, {
    started: 1,
    thirtyPlus: 1,
    fiftyPlus: 1,
    seventyFivePlus: 1,
    complete: 1,
  });
  assert.equal(Object.values(summary).reduce((total, count) => total + count, 0), 5);
});