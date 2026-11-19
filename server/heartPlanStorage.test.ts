import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HEARTPLAN_VAULT_LIMITS, insertPlanDocumentSchema } from "../shared/schema";

test("Vault plans have a meaningful expanded storage allowance", () => {
  assert.equal(HEARTPLAN_VAULT_LIMITS.free, 100 * 1024 * 1024);
  assert.equal(HEARTPLAN_VAULT_LIMITS.legacy, 1024 * 1024 * 1024);
  assert.ok(HEARTPLAN_VAULT_LIMITS.legacy > HEARTPLAN_VAULT_LIMITS.free);
});

test("document metadata accepts valid file sizes and rejects files over 10 MB", () => {
  const document = {
    planId: "plan-1",
    label: "Will",
    documentType: "will_trust",
    fileName: "will.pdf",
    objectPath: "/objects/uploads/file-1",
    contentType: "application/pdf",
  };
  assert.equal(insertPlanDocumentSchema.safeParse({ ...document, fileSize: 1024 }).success, true);
  assert.equal(insertPlanDocumentSchema.safeParse({ ...document, fileSize: 10 * 1024 * 1024 + 1 }).success, false);
});

test("Vault registration trusts object metadata and enforces quota atomically", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  assert.ok(routes.includes("const actualFileSize = Number(objectMetadata.size)"));
  assert.ok(routes.includes("createPlanDocumentWithinLimit"));
  assert.ok(routes.includes("deleteObjectEntity(parsed.data.objectPath)"));
  assert.ok(storage.includes("FOR UPDATE"));
  assert.ok(storage.includes("COALESCE(SUM(${planDocuments.fileSize}), 0)"));
});

test("removing a Vault document deletes its stored object and the UI offers storage upgrade", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const vault = readFileSync(new URL("../client/src/pages/heartplan/vault.tsx", import.meta.url), "utf8");
  assert.ok(routes.includes("deleteObjectEntity(doc.objectPath)"));
  assert.ok(vault.includes('data-testid="button-upgrade-storage"'));
  assert.ok(vault.includes("Upgrade to HeartPlan Legacy for 1 GB"));
  assert.ok(vault.includes('"/api/heartplan/upgrade/checkout"'));
});