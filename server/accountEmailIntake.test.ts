import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { certificates, connectedAccounts, notifications } from "@shared/schema";
import { intakeAccountSchema, importAccountEmailSchema, type IntakeAccount } from "@shared/accountEmailIntake";
import { redactAccountEmail, findIntakeDuplicate, registerAccountEmailIntakeRoutes } from "./accountEmailIntake";

const checking: IntakeAccount = {
  accountName: "Synthetic Community Bank", accountType: "Checking", category: "financial",
  accountNumberLast4: "1234", isJoint: false,
};

test("sensitive source details are redacted without losing bank names and account last four", () => {
  const source = "Synthetic Community Bank; account number: 987654321; routing: 111000025\nSSN: 123-45-6789\nPassword: not-a-real-password\nFrom: family@example.test";
  const result = redactAccountEmail(source);
  assert.ok(result.includes("Synthetic Community Bank"));
  assert.ok(result.includes("ending 4321"));
  assert.ok(redactAccountEmail("Account number is 987654321").includes("ending 4321"));
  for (const secret of ["987654321", "111000025", "123-45-6789", "not-a-real-password", "family@"]) {
    assert.equal(result.includes(secret), false);
  }
});

test("review schema rejects full account numbers, unknown categories, hidden commands and absent confirmation", () => {
  assert.equal(intakeAccountSchema.safeParse({ ...checking, accountNumberLast4: "123456789" }).success, false);
  assert.equal(intakeAccountSchema.safeParse({ ...checking, category: "bank" }).success, false);
  assert.equal(intakeAccountSchema.safeParse({ ...checking, selectedAction: "close" }).success, false);
  assert.equal(importAccountEmailSchema.safeParse({ accounts: [checking] }).success, false);
  assert.equal(importAccountEmailSchema.safeParse({ confirmed: true, accounts: [] }).success, false);
});

test("duplicates normalize provider/type but preserve different account numbers and account types", () => {
  const row = { id: "existing", accountName: "Synthetic Community Bank", accountType: "Checking account", accountNumber: "****1234" };
  assert.equal(findIntakeDuplicate(checking, [row])?.id, "existing");
  assert.equal(findIntakeDuplicate({ ...checking, accountName: "SYNTHETIC COMMUNITY BANK!" }, [row])?.id, "existing");
  assert.equal(findIntakeDuplicate({ ...checking, accountNumberLast4: "5678" }, [row]), undefined);
  assert.equal(findIntakeDuplicate({ ...checking, accountType: "Savings" }, [row]), undefined);
  assert.equal(findIntakeDuplicate({ ...checking, accountNumberLast4: null }, [{ ...row, accountNumber: null }])?.id, "existing");
});

test("staff account intake HTTP flow previews, reviews, persists in the chosen case and safely retries", async t => {
  const suffix = crypto.randomUUID();
  const staffId = `intake-admin-${suffix}`, familyId = `intake-family-${suffix}`;
  const caseId = crypto.randomUUID(), otherCaseId = crypto.randomUUID();
  const app = express();
  app.use(express.json());
  let extractorCalls = 0;
  let failExtractor = false;
  const auth = (req: any, res: any, next: any) => {
    if (!req.header("x-intake-test-actor")) return res.status(401).json({ error: "Sign in required" });
    req.session = { userId: req.header("x-intake-test-actor") };
    next();
  };
  registerAccountEmailIntakeRoutes(app, auth, (_req, _res, next) => next(), async () => {
    extractorCalls++;
    if (failExtractor) throw new Error("Provider unavailable");
    return [checking, { ...checking }, { ...checking, accountType: "Savings", accountNumberLast4: "9876" }];
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = (certId: string, action: string, body: object, actor: string | null = staffId) => fetch(
    `http://127.0.0.1:${address.port}/api/admin/case/${certId}/account-intake/${action}`, {
      method: "POST", headers: { "content-type": "application/json", ...(actor ? { "x-intake-test-actor": actor } : {}) },
      body: JSON.stringify(body),
    },
  );
  await db.insert(users).values([
    { id: staffId, email: `${staffId}@example.test`, role: "admin", emailVerified: true },
    { id: familyId, email: `${familyId}@example.test`, role: "user", emailVerified: true },
  ]);
  await db.insert(certificates).values([caseId, otherCaseId].map(id => ({
    id, deceasedName: "Synthetic intake test", dateOfDeath: "2026-01-01", dateOfBirth: "1940-01-01",
    certificateNumber: id, issuingAuthority: "Synthetic test authority",
  })));
  try {
    const analyzeBody = { text: "Synthetic Community Bank checking account ending 1234; savings ending 9876." };
    assert.equal((await request(caseId, "analyze", analyzeBody, null)).status, 401);
    assert.equal((await request(caseId, "analyze", analyzeBody, familyId)).status, 404);
    assert.equal((await request(crypto.randomUUID(), "analyze", analyzeBody)).status, 404);
    assert.equal((await request(caseId, "analyze", { text: "" })).status, 400);
    const analyzed = await request(caseId, "analyze", analyzeBody);
    assert.equal(analyzed.status, 200);
    assert.equal(analyzed.headers.get("cache-control"), "no-store");
    const preview = await analyzed.json() as any;
    assert.equal(preview.accounts.length, 3);
    assert.equal(preview.accounts[0].duplicate, false);
    assert.equal(preview.accounts[1].duplicate, true);
    assert.equal((await db.select().from(connectedAccounts).where(eq(connectedAccounts.certificateId, caseId))).length, 0);
    assert.equal((await request(caseId, "analyze", analyzeBody)).status, 429);
    assert.equal(extractorCalls, 1);
    assert.equal((await request(caseId, "import", { accounts: [checking] })).status, 400);
    assert.equal((await request(caseId, "import", { confirmed: true, accounts: [{ ...checking, accountNumberLast4: "123456789" }] })).status, 400);
    assert.equal((await request(caseId, "import", { confirmed: true, accounts: [checking] }, familyId)).status, 404);
    const payload = { confirmed: true, accounts: [checking, { ...checking }, { ...checking, accountType: "Savings", accountNumberLast4: "9876" }] };
    const responses = await Promise.all([request(caseId, "import", payload), request(caseId, "import", payload)]);
    assert.deepEqual(responses.map(response => response.status), [201, 201]);
    const results = await Promise.all(responses.map(response => response.json())) as any[];
    assert.equal(results.reduce((n, result) => n + result.created.length, 0), 2);
    assert.equal(results.reduce((n, result) => n + result.skipped, 0), 4);
    const accounts = await db.select().from(connectedAccounts).where(eq(connectedAccounts.certificateId, caseId));
    assert.equal(accounts.length, 2);
    assert.equal(accounts[0].accountNumber?.length, 8);
    assert.equal(accounts[0].addedBy, "sal_team");
    assert.equal(accounts[0].selectedAction, null);
    assert.equal(accounts[0].notificationSentAt, null);
    assert.equal(accounts[0].notes?.includes(analyzeBody.text), false);
    assert.equal((await db.select().from(connectedAccounts).where(eq(connectedAccounts.certificateId, otherCaseId))).length, 0);
    assert.equal((await db.select().from(notifications).where(eq(notifications.certificateId, caseId))).length, 2);

    // Independent route instance avoids an artificial 10-second wait in this test.
    const failureApp = express();
    failureApp.use(express.json());
    registerAccountEmailIntakeRoutes(failureApp, auth, (_req, _res, next) => next(), async () => {
      throw new Error("Synthetic unavailable provider");
    });
    const failureServer = createServer(failureApp);
    failureServer.listen(0, "127.0.0.1");
    await once(failureServer, "listening");
    const failureAddress = failureServer.address();
    assert.ok(failureAddress && typeof failureAddress !== "string");
    try {
      const failed = await fetch(`http://127.0.0.1:${failureAddress.port}/api/admin/case/${caseId}/account-intake/analyze`, {
        method: "POST", headers: { "content-type": "application/json", "x-intake-test-actor": staffId },
        body: JSON.stringify(analyzeBody),
      });
      assert.equal(failed.status, 503);
      assert.match((await failed.json() as any).error, /Nothing was created/);
    } finally { failureServer.close(); }
  } finally {
    server.close();
    await db.delete(notifications).where(inArray(notifications.certificateId, [caseId, otherCaseId]));
    await db.delete(connectedAccounts).where(inArray(connectedAccounts.certificateId, [caseId, otherCaseId]));
    await db.delete(certificates).where(inArray(certificates.id, [caseId, otherCaseId]));
    await db.delete(users).where(inArray(users.id, [staffId, familyId]));
  }
});
