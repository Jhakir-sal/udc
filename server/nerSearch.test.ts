import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { caseEvents, certificates, nerSearchChecks, users } from "@shared/schema";
import { nerFamilyReportInput, nerSearchInput } from "@shared/nerSearch";
import { nerProviderResult, registerNerSearchRoutes } from "./nerSearchRoutes";

test("NER completion requires recognized results, not a redirect, error or unknown response", () => {
  assert.equal(nerProviderResult(200, []).outcome, "completed_no_match");
  assert.equal(nerProviderResult(200, { success: true, results: [] }).outcome, "completed_no_match");
  for (const status of [301, 302, 401, 402, 403]) {
    const result = nerProviderResult(status, []);
    assert.equal(result.outcome, "redirect_required");
    assert.equal(result.success, false);
  }
  for (const response of [null, {}, "HTML", { results: [] }, { success: false, results: [] },
    { success: true, source: "redirect", results: [] }, { success: true, requiresPayment: true, results: [] },
    { success: true, status: "pending", results: [] }, [{ ssn: "synthetic-private" }]]) {
    assert.equal(nerProviderResult(200, response).outcome, "unrecognized_response");
  }
  assert.equal(nerProviderResult(503, []).outcome, "unavailable");
  const projection = nerProviderResult(200, [{
    principalName: "Synthetic Case Person", documentType: "Will", jurisdiction: "Test jurisdiction",
    principalSsn: "SYNTHETIC-SECRET", executorContact: "private@example.invalid", objectPath: "/private/synthetic",
  }]);
  assert.equal(projection.outcome, "completed_match");
  assert.deepEqual(projection.results, [{
    principalName: "Synthetic Case Person", documentType: "Will", jurisdiction: "Test jurisdiction",
  }]);
  assert(!JSON.stringify(projection).includes("SYNTHETIC-SECRET"));
  assert(!nerSearchInput.safeParse({ firstName: " ", lastName: "Person" }).success);
  assert(!nerSearchInput.safeParse({ firstName: "Case", lastName: "Person", outcome: "completed_no_match" }).success);
  assert(!nerFamilyReportInput.safeParse({
    firstName: "", lastName: "", searchedAt: "2026-01-01T15:00:00.000Z",
    result: "unknown", notes: "", confirmed: true,
  }).success);
});

test("case-scoped NER requests and reports persist accurate provenance without leaking another case", async () => {
  const [admin, family, stranger, caseA, caseB] = Array.from({ length: 5 }, () => randomUUID());
  let providerCalls = 0;
  let response: { status: number; body: unknown } = { status: 200, body: [] };
  let throwProvider = false;
  let hold: (() => void) | null = null;
  let started: (() => void) | null = null;
  const app = express();
  app.use(express.json());
  registerNerSearchRoutes(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-actor") }; next();
  }, async () => {
    providerCalls++;
    started?.();
    if (hold) await new Promise<void>(resolve => { hold = resolve; });
    if (throwProvider) throw new Error("Synthetic timeout");
    return response;
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const history = (cert = caseA, staff = false) => `/api/${staff ? "admin/" : ""}case/${cert}/ner-searches`;
  const request = async (method: string, path: string, body?: unknown, actor = family) => {
    const result = await fetch(`${url}${path}`, { method,
      headers: { "content-type": "application/json", "x-test-actor": actor },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: result.status, data: await result.json() as any };
  };
  const search = (firstName: string, actor = family, cert: string | undefined = caseA) => request("POST", "/api/ner-external/search", {
    firstName, lastName: "Person", ...(cert ? { certificateId: cert } : {}),
  }, actor);
  try {
    await db.insert(users).values([
      { id: admin, role: "admin", email: `${admin}@example.invalid`, firstName: "Synthetic", lastName: "Staff", emailVerified: true },
      { id: family, role: "user", email: `${family}@example.invalid`, firstName: "Synthetic", lastName: "Family", emailVerified: true },
      { id: stranger, role: "user", email: `${stranger}@example.invalid`, emailVerified: true },
    ]);
    await db.insert(certificates).values([caseA, caseB].map((id, i) => ({
      id, userId: i ? stranger : family, deceasedName: "Case Person", dateOfBirth: "1950-01-01",
      dateOfDeath: "2026-01-01", certificateNumber: `SYN-NER-${id}`, issuingAuthority: "Synthetic",
    })));
    assert.equal((await request("GET", history(), undefined, "")).status, 401);
    assert.equal((await request("GET", history(caseA, true))).status, 403);
    assert.equal((await request("GET", history(), undefined, stranger)).status, 403);
    assert.equal((await search("Forbidden", family, caseB)).status, 403);
    assert.equal(providerCalls, 0);
    const initial = (await request("GET", history())).data;
    assert.deepEqual(initial.records, []);
    assert.equal(initial.externalHistoryAvailable, false);
    const report = {
      firstName: "Case", lastName: "Person", searchedAt: "2026-01-01T15:00:00.000Z", result: "no_match",
      searcherName: "Reported Synthetic Searcher", notes: "Family reports searching directly on NER.", confirmed: true,
    };
    assert.equal((await request("POST", `${history()}/family-report`, { ...report, confirmed: false })).status, 400);
    assert.equal((await request("POST", `${history()}/family-report`, { ...report, searchedAt: "2099-01-01T15:00:00.000Z" })).status, 400);
    assert.equal((await request("POST", `${history(caseB)}/family-report`, report)).status, 403);
    assert.equal((await request("POST", `${history()}/family-report`, report)).status, 201);
    assert.equal(providerCalls, 0);
    const manual = (await request("GET", history(caseA, true), undefined, admin)).data.records[0];
    assert.equal(manual.source, "family_report");
    assert.equal(manual.outcome, "family_reported");
    assert.equal(manual.completedAt, null);
    assert.equal(manual.resultCount, null);
    assert.equal(manual.reportedOutcome, "no_match");
    assert.equal(manual.searcherName, "Reported Synthetic Searcher");
    assert.equal(manual.actorName, "Synthetic Family");
    assert.equal(manual.matchesCaseName, true);
    assert(!("actorId" in manual));
    const completed = await search("Case");
    assert.equal(completed.status, 200);
    assert.equal(completed.data.outcome, "completed_no_match");
    assert.equal(completed.data.caseLinked, true);
    assert.equal(completed.data.historyRecorded, true);
    assert.equal((await search("Case")).status, 429);
    assert.equal(providerCalls, 1);
    response = { status: 401, body: [] };
    const redirect = await search("Redirect");
    assert.equal(redirect.data.source, "redirect");
    assert.equal(redirect.data.success, false);
    assert.equal(redirect.data.outcome, "redirect_required");
    response = { status: 200, body: { pending: true } };
    assert.equal((await search("Unknown")).data.outcome, "unrecognized_response");
    throwProvider = true;
    assert.equal((await search("Unavailable")).data.outcome, "unavailable");
    throwProvider = false;
    response = { status: 200, body: [{ name: "Potential Person", type: "Trust", privateAccount: "synthetic-secret" }] };
    const matched = await search("Potential");
    assert.equal(matched.data.results.length, 1);
    assert(!JSON.stringify(matched.data).includes("synthetic-secret"));
    // A staff-initiated request is attributed as staff, never as the family.
    response = { status: 200, body: [] };
    assert.equal((await search("Staff", admin)).status, 200);
    // An unlinked search is logged to its actor, not associated by a matching name.
    const unlinked = await request("POST", "/api/ner-external/search", { firstName: "Case", lastName: "Person" }, stranger);
    assert.equal(unlinked.data.caseLinked, false);
    assert.equal((await request("GET", history(caseB), undefined, stranger)).data.records.length, 0);
    // Record first, then call NER; pending history must not claim a completed search.
    hold = () => {};
    const begun = new Promise<void>(resolve => { started = resolve; });
    const pending = search("InFlight");
    await begun;
    const during = (await request("GET", history())).data.records.find((r: any) => r.searchedName === "InFlight Person");
    assert.equal(during.outcome, "submitted");
    assert.equal(during.completedAt, null);
    assert.equal(during.resultCount, null);
    assert.equal((await search("InFlight")).status, 429);
    hold!(); hold = null; started = null;
    assert.equal((await pending).data.outcome, "completed_no_match");
    const saved = (await request("GET", history(caseA, true), undefined, admin)).data.records;
    assert(saved.some((r: any) => r.actorRole === "admin" && r.searchedName === "Staff Person"));
    assert(saved.some((r: any) => r.outcome === "redirect_required" && r.resultCount === null));
    assert(saved.some((r: any) => r.outcome === "completed_no_match" && r.resultCount === 0));
    assert(saved.some((r: any) => r.searchedName === "Potential Person" && r.matchesCaseName === false));
    const [unchanged] = await db.select().from(certificates).where(eq(certificates.id, caseA));
    assert.equal(unchanged.estateStatus, null);
    // Existing history remains protected when a family's verification is withdrawn.
    await db.update(users).set({ emailVerified: false }).where(eq(users.id, family));
    assert.equal((await request("GET", history())).status, 403);
    const beforeDenied = providerCalls;
    assert.equal((await search("AfterRevoke")).status, 403);
    assert.equal(providerCalls, beforeDenied);
  } finally {
    hold?.();
    await db.delete(nerSearchChecks).where(inArray(nerSearchChecks.actorId, [admin, family, stranger]));
    await db.delete(caseEvents).where(inArray(caseEvents.certificateId, [caseA, caseB]));
    await db.delete(certificates).where(inArray(certificates.id, [caseA, caseB]));
    await db.delete(users).where(inArray(users.id, [admin, family, stranger]));
    server.close(); await pool.end();
  }
});
