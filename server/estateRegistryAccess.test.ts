import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estateRegistryAdminGuard, estateRegistrySummary } from "./estateRegistryView";
import type { Request, Response, NextFunction } from "express";
import type { EstateRegistry } from "@shared/schema";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const registry = routes.slice(routes.indexOf("// ESTATE REGISTRY API"), routes.indexOf("// NER ANALYSIS API"));
const analysis = routes.slice(routes.indexOf("// NER ANALYSIS API"), routes.indexOf("// EXTERNAL NATIONAL ESTATE REGISTRY API"));

test("list, detail and name search all require authentication and the registry admin guard", () => {
  for (const path of [
    'app.get("/api/estate-registry"',
    'app.get("/api/estate-registry/:id"',
    'app.get("/api/estate-registry/search/:name"',
  ]) {
    assert.ok(registry.includes(`${path}, isAuthenticated, estateRegistryAdmin,`), `${path} must require both authentication and persisted admin role`);
  }
  assert.match(registry, /estateRegistryAdminGuard\(id => storage\.getUser\(id\)\)/);
  assert.match(registry, /res\.json\(estate\)/); // staff detail remains available
});

test("anonymous and unrelated family accounts cannot retrieve registry records", async () => {
  const guard = estateRegistryAdminGuard(async id =>
    id === "staff" ? { role: "admin" } : { role: "user" },
  );
  async function check(sessionId?: string, ssoId?: string) {
    let status = 0;
    let nextCalled = false;
    const req = { session: sessionId ? { userId: sessionId } : {}, user: { claims: { sub: ssoId } } } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json() { return this; },
    } as unknown as Response;
    await guard(req, res, (() => { nextCalled = true; }) as NextFunction);
    return { status, nextCalled };
  }
  assert.deepEqual(await check(), { status: 401, nextCalled: false });
  assert.deepEqual(await check("unrelated-family"), { status: 403, nextCalled: false });
  assert.deepEqual(await check(undefined, "unrelated-family"), { status: 403, nextCalled: false });
  assert.deepEqual(await check("staff"), { status: 0, nextCalled: true });
});

test("family accounts cannot create or change a registry entry either", () => {
  for (const path of ['app.post("/api/estate-registry"', 'app.patch("/api/estate-registry/:id"']) {
    assert.ok(registry.includes(`${path}, isAuthenticated, estateRegistryAdmin,`));
  }
});

test("legacy NER analysis cannot return stored registry matches to a family session", async () => {
  for (const path of [
    'app.get("/api/ner-analysis"',
    'app.get("/api/ner-analysis/certificate/:certificateId"',
    'app.post("/api/ner-analysis/run/:certificateId"',
  ]) {
    assert.ok(analysis.includes(`${path}, isAuthenticated, estateRegistryAdmin,`), `${path} must enforce the same staff boundary`);
  }
  assert.match(analysis, /matchedEstates: allMatches/);
  const guard = estateRegistryAdminGuard(async () => ({ role: "user" }));
  const sensitiveRow = { principalSsn: "123-45-6789", executorContact: "private@example.test" };
  let response: unknown;
  let status = 0;
  const req = { session: { userId: "family" }, params: { certificateId: "family-case" } } as unknown as Request;
  const res = {
    status(code: number) { status = code; return this; },
    json(body: unknown) { response = body; return this; },
  } as unknown as Response;
  // Simulate the run handler's response: the actual guard must stop execution
  // before any matched estate can be sent, even for an owned certificate.
  await guard(req, res, (() => { response = { matchedEstates: [sensitiveRow] }; }) as NextFunction);
  assert.equal(status, 403);
  assert.deepEqual(response, { message: "Admin access required" });
  assert.doesNotMatch(JSON.stringify(response), /123-45-6789|private@example\.test/);
});

test("family utility transfer paths do not infer or disclose legacy estate matches", () => {
  const transfer = routes.slice(routes.indexOf('app.post("/api/accounts/:id/transfer"'), routes.indexOf("// Notifications"));
  assert.match(transfer, /if \(!verificationSource && staffActor\) \{\s*const estates = await storage\.searchEstatesByName/);
  assert.match(transfer, /if \(!verificationSource && staffActor\) \{\s*const nerAnalysis = await storage\.getNerAnalysisByCertificate/);
  assert.match(transfer, /if \(await isAdminUser\(req\)\) \{\s*const estates = await storage\.searchEstatesByName/);
});

test("staff list and search results expose only fields needed to locate a record", () => {
  const row = {
    id: "estate-1", documentType: "will", principalName: "Example Person",
    filingDate: new Date("2026-01-01"), jurisdiction: "CA", status: "active",
    principalDob: "1950-01-01", principalSsn: "123-45-6789",
    executorContact: "private@example.test", attorneyContact: "private@example.test",
    beneficiaryNames: ["Private Beneficiary"], estimatedValue: "1000",
    notes: "Private notes", documentNumber: "private-number",
  } as EstateRegistry;
  assert.deepEqual(estateRegistrySummary(row), {
    id: row.id, documentType: row.documentType, principalName: row.principalName,
    filingDate: row.filingDate, jurisdiction: row.jurisdiction, status: row.status,
  });
  assert.equal((registry.match(/res\.json\(estates\.map\(estateRegistrySummary\)\)/g) || []).length, 2);
});