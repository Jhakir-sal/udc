import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { caseEvents, certificates, familyDocumentNotices, familyDocuments, users } from "@shared/schema";
import { markCaseDocumentsSeen } from "@shared/caseDocumentAlerts";
import { createFamilyDocumentWithNotice, registerCaseDocumentAlerts } from "./caseDocumentAlerts";

test("acknowledgment accepts only an explicit bounded snapshot of document IDs", () => {
  const id = randomUUID();
  assert(markCaseDocumentsSeen.safeParse({ documentIds: [id] }).success);
  for (const body of [{ documentIds: [] }, { documentIds: [id, id] }, { documentIds: ["not-an-id"] },
    { all: true }, { documentIds: [id], seenBy: "forged" }, { documentIds: Array.from({ length: 101 }, () => randomUUID()) }]) {
    assert(!markCaseDocumentsSeen.safeParse(body).success);
  }
});

test("new family uploads are visible until staff explicitly acknowledges them, without swallowing concurrent uploads", async () => {
  const [admin, secondAdmin, family, outsider, caseA, caseB] = Array.from({ length: 6 }, () => randomUUID());
  const userIds = [admin, secondAdmin, family, outsider];
  const app = express(); app.use(express.json());
  registerCaseDocumentAlerts(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-actor") }; next();
  });
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (method = "GET", caseId = caseA, body?: unknown, actor = admin) => {
    const response = await fetch(`${url}/api/admin/case/${caseId}/document-alerts${method === "POST" ? "/seen" : ""}`, {
      method, headers: { "content-type": "application/json", "x-test-actor": actor },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() as any };
  };
  const document = (certificateId: string | null = caseA, role = "user") => ({
    userId: role === "admin" ? admin : family, certificateId, uploadedByRole: role,
    label: "Synthetic private document", documentType: "other", fileName: "synthetic-private.pdf",
    objectPath: `/objects/synthetic-not-uploaded/${randomUUID()}`, contentType: "application/pdf",
  });
  try {
    await db.insert(users).values(userIds.map((id, i) => ({
      id, role: i < 2 ? "admin" as const : "user" as const,
      email: `${id}@example.invalid`, emailVerified: true, firstName: "Synthetic", lastName: `Actor${i}`,
    })));
    await db.insert(certificates).values([caseA, caseB].map((id, i) => ({
      id, userId: i ? outsider : family, deceasedName: "Synthetic Case Person",
      dateOfBirth: "1950-01-01", dateOfDeath: "2026-01-01",
      certificateNumber: `SYN-NOTICE-${id}`, issuingAuthority: "Synthetic",
    })));
    await db.insert(familyDocuments).values(document()); // Old files are never suddenly labeled new.
    await createFamilyDocumentWithNotice(document(caseA, "admin"));
    await createFamilyDocumentWithNotice(document(null));
    assert.equal((await request()).data.unseenCount, 0);
    assert.equal((await request("GET", caseA, undefined, "")).status, 401);
    assert.equal((await request("GET", caseA, undefined, family)).status, 403);
    assert.equal((await request("GET", randomUUID())).status, 404);

    const first = await createFamilyDocumentWithNotice(document());
    const otherCase = await createFamilyDocumentWithNotice(document(caseB));
    const summary = await request();
    assert.equal(summary.status, 200);
    assert.equal(summary.data.unseenCount, 1);
    assert.deepEqual(summary.data.unseenDocumentIds, [first.id]);
    assert(summary.data.latestUploadedAt);
    assert(!JSON.stringify(summary.data).includes("/objects/"));
    assert(!JSON.stringify(summary.data).includes("synthetic-private.pdf"));
    assert.equal((await request()).data.unseenCount, 1); // Reading/reloading never consumes a notice.
    assert.equal((await request("POST", caseA, { documentIds: [first.id] }, family)).status, 403);
    assert.equal((await request("POST", caseA, { documentIds: [otherCase.id] })).status, 409);
    assert.equal((await request()).data.unseenCount, 1);
    // New upload arrives after the staff's displayed snapshot.
    const concurrentUpload = await createFamilyDocumentWithNotice(document());
    assert.equal((await request("POST", caseA, { documentIds: summary.data.unseenDocumentIds })).data.acknowledgedCount, 1);
    const remaining = (await request("GET", caseA, undefined, secondAdmin)).data;
    assert.equal(remaining.unseenCount, 1);
    assert.deepEqual(remaining.unseenDocumentIds, [concurrentUpload.id]);
    assert.equal((await request("POST", caseA, { documentIds: [first.id] })).data.acknowledgedCount, 0);

    const results = await Promise.all([
      request("POST", caseA, { documentIds: [concurrentUpload.id] }, admin),
      request("POST", caseA, { documentIds: [concurrentUpload.id] }, secondAdmin),
    ]);
    assert.deepEqual(results.map(r => r.data.acknowledgedCount).sort(), [0, 1]);
    assert.equal((await request()).data.unseenCount, 0);
    assert.equal((await request("GET", caseB)).data.unseenCount, 1);
    const [notice] = await db.select().from(familyDocumentNotices).where(eq(familyDocumentNotices.documentId, first.id));
    assert.equal(notice.seenBy, admin);
    assert(notice.seenAt);
    const events = await db.select().from(caseEvents).where(eq(caseEvents.certificateId, caseA));
    assert.equal(events.filter(event => event.eventType === "family_documents_seen").length, 2);

    // Deleting an uploaded document removes its notice, not a phantom alert.
    await db.delete(familyDocuments).where(eq(familyDocuments.id, otherCase.id));
    assert.equal((await request("GET", caseB)).data.unseenCount, 0);
    assert.equal((await request("POST", caseB, { documentIds: [otherCase.id] })).status, 409);
  } finally {
    await db.delete(familyDocuments).where(inArray(familyDocuments.userId, userIds));
    await db.delete(caseEvents).where(inArray(caseEvents.certificateId, [caseA, caseB]));
    await db.delete(certificates).where(inArray(certificates.id, [caseA, caseB]));
    await db.delete(users).where(inArray(users.id, userIds));
    server.close(); await pool.end();
  }
});
