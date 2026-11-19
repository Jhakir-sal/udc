import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { discoveryItemPatchSchema } from "@shared/schema";
import { DEMO_ACCOUNT_EMAILS, isDemoAccountEmail } from "@shared/demoAccounts";
import {
  canAccessFinancialDiscovery,
  financialInventoryForConcierge,
} from "./financialDiscoveryPolicy";

test("only the explicitly allowlisted emails can receive the demo flag on password or SSO writes", () => {
  assert.equal(DEMO_ACCOUNT_EMAILS.length, 3);
  assert.equal(isDemoAccountEmail("hello@stepsafterlife.com"), true);
  for (const email of DEMO_ACCOUNT_EMAILS) {
    assert.equal(isDemoAccountEmail(email), true);
    assert.equal(isDemoAccountEmail(`  ${email.toUpperCase()}  `), true);
    assert.equal(canAccessFinancialDiscovery({ email, isDemoAccount: true }), true);
  }
  for (const email of ["planner@example.com", "", null]) {
    assert.equal(isDemoAccountEmail(email), false);
  }

  const passwordStorage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const ssoStorage = readFileSync(new URL("./replit_integrations/auth/storage.ts", import.meta.url), "utf8");
  for (const source of [passwordStorage, ssoStorage]) {
    assert.match(source, /isDemoAccount:\s*isDemoAccountEmail\(normalizedEmail\)/);
    assert.match(source, /normalizeAccountEmail/);
  }
});

test("access requires both the persisted flag and the hard allowlist", () => {
  const allowed = DEMO_ACCOUNT_EMAILS[0];
  assert.equal(canAccessFinancialDiscovery({ email: allowed, isDemoAccount: true }), true);
  assert.equal(canAccessFinancialDiscovery({ email: allowed, isDemoAccount: false }), false);
  assert.equal(canAccessFinancialDiscovery({ email: "planner@example.com", isDemoAccount: true }), false);
  assert.equal(canAccessFinancialDiscovery(null), false);
});

test("every financial discovery API route uses the shared authentication and demo guards", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const routePaths = [
    "/api/heartplan/discovery/status",
    "/api/heartplan/discovery/items",
    "/api/heartplan/discovery/credit/consent",
    "/api/heartplan/discovery/credit/run",
    "/api/heartplan/discovery/credit",
    "/api/heartplan/discovery/bank/run",
    "/api/heartplan/discovery/bank",
    "/api/heartplan/discovery/items/:id",
    "/api/heartplan/discovery/items/:id/merge",
    "/api/heartplan/discovery/save",
    "/api/heartplan/discovery/reset",
  ];
  assert.match(routes, /const discoveryGuards = \[isAuthenticated, requireDemoDiscovery\]/);
  for (const path of routePaths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(routes, new RegExp(`${escaped.replaceAll("/", "\\/")}["']?[\\s\\S]{0,100}\\.\\.\\.discoveryGuards`));
  }
});

test("patches reject credential-like/free-form fields and account hints over four digits", () => {
  for (const input of [
    { username: "bank-user" },
    { password: "do-not-store-this" },
    { notes: "sensitive free form" },
    { institution: "A bank" },
    { accountNumberHint: "12345" },
    { accountNumberHint: "12 34" },
    { estimatedValue: "about ten thousand" },
  ]) {
    assert.equal(discoveryItemPatchSchema.safeParse(input).success, false);
  }
  assert.equal(discoveryItemPatchSchema.safeParse({
    accountNumberHint: "1234",
    estimatedValue: "$10,000.00",
    status: "selected",
  }).success, true);
});

test("concierge inventory remains private until plan activation", () => {
  const assets = [{ id: "asset-1" }] as any[];
  assert.deepEqual(financialInventoryForConcierge({ status: "active" } as any, assets as any), []);
  assert.deepEqual(financialInventoryForConcierge({ status: "activated" } as any, assets as any), assets);
});

test("storage preserves merge, repeated-save, and reset integrity invariants", () => {
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  assert.match(storage, /if \(sourceId === targetId\) return undefined/);
  assert.match(storage, /source\.name\.trim\(\)\.toLowerCase\(\) !== target\.name\.trim\(\)\.toLowerCase\(\)/);
  assert.match(storage, /isNull\(planDiscoveryItems\.savedPlanAssetId\)/);
  assert.match(storage, /SELECT id FROM \$\{heartPlans\} WHERE id = \$\{planId\} FOR UPDATE/);
  assert.match(storage, /Items cascade\. Saved plan assets intentionally remain regular plan data/);
  assert.match(storage, /delete\(planDiscoverySessions\).*planDiscoverySessions\.planId/s);
});