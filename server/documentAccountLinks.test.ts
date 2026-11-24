import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import {
  caseEvents, certificates, connectedAccounts, documentAccountLinks,
  familyDocumentNotices, familyDocuments, users,
} from "@shared/schema";
import { assignDocumentAccounts } from "@shared/documentAccountLinks";
import { registerDocumentAccountLinks } from "./documentAccountLinks";

test("document assignments accept only explicit, bounded, unique account selections", () => {
  assert(assignDocumentAccounts.safeParse({ accountIds: [] }).success);
  const id = randomUUID();
  assert(assignDocumentAccounts.safeParse({ accountIds: [id] }).success);
  for (const value of [
    {}, { accountIds: null }, { accountIds: ["bad"] }, { accountIds: [id, id] },
    { accountIds: [], assignedBy: "forged" }, { accountIds: Array.from({ length: 201 }, () => randomUUID()) },
  ]) assert(!assignDocumentAccounts.safeParse(value).success);
});

test("oversized invalid account selections produce a bounded validation error", () => {
  const result = assignDocumentAccounts.safeParse({ accountIds: Array(10_000).fill("invalid") });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues.length, 1);
});

test("staff can persist and remove case-bound document links without approving or sharing files", async () => {
  const [admin, family, outsider, caseA, caseB, accountA, accountA2, accountB, docA, docA2, docB, unscopedDoc] =
    Array.from({ length: 12 }, () => randomUUID());
  const userIds = [admin, family, outsider];
  const caseIds = [caseA, caseB];
  const app = express();
  app.use(express.json());
  registerDocumentAccountLinks(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-actor") };
    // Authorization must resolve the stored role, not trust a role claim.
    req.user = { claims: { role: "admin" } };
    next();
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (documentId?: string, body?: unknown, actor = admin, certId = caseA) => {
    const response = await fetch(`${base}/api/admin/case/${certId}/${documentId
      ? `family-documents/${documentId}/accounts` : "document-account-links"}`, {
      method: documentId ? "PUT" : "GET",
      headers: { "content-type": "application/json", "x-test-actor": actor },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() as any, cache: response.headers.get("cache-control") };
  };
  try {
    await db.insert(users).values(userIds.map((id, i) => ({
      id, role: i === 0 ? "admin" as const : "user" as const, email: `${id}@example.invalid`,
      firstName: "Synthetic", lastName: "Document Link Test", emailVerified: true,
    })));
    await db.insert(certificates).values(caseIds.map((id, i) => ({
      id, userId: i ? outsider : family, deceasedName: "Synthetic Document Assignment",
      dateOfBirth: "1950-01-01", dateOfDeath: "2026-01-01",
      certificateNumber: `SYN-DOC-LINK-${id}`, issuingAuthority: "Synthetic",
    })));
    await db.insert(connectedAccounts).values([accountA, accountA2, accountB].map((id, i) => ({
      id, certificateId: i === 2 ? caseB : caseA, accountName: `Synthetic Bank ${i}`,
      accountType: "checking", category: "financial", accountNumber: "1234",
    })));
    await db.insert(familyDocuments).values([docA, docA2, docB, unscopedDoc].map((id, i) => ({
      id, userId: i === 2 ? outsider : family, certificateId: i === 3 ? null : i === 2 ? caseB : caseA,
      label: "Synthetic statement", documentType: "financial_statement", fileName: "not-a-real-file.pdf",
      objectPath: `/objects/synthetic-document-link/${id}`, contentType: "application/pdf",
    })));
    await db.insert(familyDocumentNotices).values({ documentId: docA, certificateId: caseA });
    assert.equal((await request(undefined, undefined, "")).status, 401);
    assert.equal((await request(undefined, undefined, family)).status, 403);
    assert.equal((await request(undefined, undefined, admin, randomUUID())).status, 404);
    assert.deepEqual((await request()).data, []);
    assert.match((await request()).cache || "", /no-store/);

    assert.equal((await request(docA, { accountIds: [accountA, accountA2] })).status, 200);
    const saved = await request();
    assert.deepEqual(new Set(saved.data.map((link: any) => link.accountId)), new Set([accountA, accountA2]));
    assert(!JSON.stringify(saved.data).includes("/objects/")); // Link list carries no file payload.
    const originalRows = await db.select().from(documentAccountLinks).where(eq(documentAccountLinks.documentId, docA));
    assert(originalRows.every(link => link.assignedBy === admin));
    const originalEvents = await db.select().from(caseEvents).where(eq(caseEvents.certificateId, caseA));
    assert.equal(originalEvents.length, 1);
    await request(docA, { accountIds: [accountA2, accountA] });
    assert.equal((await db.select().from(caseEvents).where(eq(caseEvents.certificateId, caseA))).length, 1);

    // Cross-case accounts/documents, owner-only files and forged payloads cannot change existing links.
    assert.equal((await request(docA, { accountIds: [accountB] })).status, 400);
    assert.equal((await request(docB, { accountIds: [accountA] })).status, 404);
    assert.equal((await request(unscopedDoc, { accountIds: [accountA] })).status, 404);
    assert.equal((await request(docA, { accountIds: [randomUUID()] })).status, 400);
    assert.equal((await request(docA, { accountIds: [accountA, accountA] })).status, 400);
    const invalid = await request(docA, { accountIds: ["invalid"] });
    assert.equal(invalid.status, 400);
    assert.equal(typeof invalid.data.message, "string");
    assert.equal((await request(docA, { accountIds: [], approved: true })).status, 400);
    assert.equal((await request(docA, { accountIds: [] }, family)).status, 403);
    assert.deepEqual((await request()).data, saved.data);
    assert.deepEqual((await request(undefined, undefined, admin, caseB)).data, []);

    // Replacement and unassignment are document-specific, not case-wide.
    await request(docA2, { accountIds: [accountA] });
    await request(docA, { accountIds: [accountA2] });
    assert.equal((await request()).data.length, 2);
    await request(docA, { accountIds: [] });
    assert.deepEqual((await request()).data, [{ documentId: docA2, accountId: accountA }]);

    // Concurrent replacement sets remain whole, never a union/interleaving.
    const concurrent = await Promise.all([
      request(docA, { accountIds: [accountA] }), request(docA, { accountIds: [accountA2] }),
    ]);
    assert(concurrent.every(result => result.status === 200));
    const final = (await request()).data.filter((link: any) => link.documentId === docA);
    assert.equal(final.length, 1);

    const [notice] = await db.select().from(familyDocumentNotices).where(eq(familyDocumentNotices.documentId, docA));
    assert.equal(notice.seenAt, null); // Assignment is not acknowledgment, approval, or release.
    const [unchanged] = await db.select().from(familyDocuments).where(eq(familyDocuments.id, docA));
    assert.equal(unchanged.objectPath, `/objects/synthetic-document-link/${docA}`);
    assert.equal(unchanged.certificateId, caseA);
    assert.equal(unchanged.userId, family);
    assert.equal(unchanged.uploadedByRole, "user");

    await db.delete(familyDocuments).where(eq(familyDocuments.id, docA));
    assert.equal((await request(docA, { accountIds: [accountA] })).status, 404);
    assert.deepEqual((await request()).data, [{ documentId: docA2, accountId: accountA }]);
    await db.delete(connectedAccounts).where(eq(connectedAccounts.id, accountA));
    assert.deepEqual((await request()).data, []);
  } finally {
    await db.delete(familyDocuments).where(inArray(familyDocuments.userId, userIds));
    await db.delete(connectedAccounts).where(inArray(connectedAccounts.certificateId, caseIds));
    await db.delete(caseEvents).where(inArray(caseEvents.certificateId, caseIds));
    await db.delete(certificates).where(inArray(certificates.id, caseIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
