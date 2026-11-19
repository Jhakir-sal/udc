import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import {
  certificates, lpoaDocuments, familyDocuments, connectedAccounts,
  webhookLogs, heartPlans, users, notifications,
} from "@shared/schema";
import { CaseDeletionConflict, deleteCaseRecords } from "./caseDeletion";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("Roll back synthetic deletion-test data");

async function isolated(run: (tx: Transaction) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function fixture(tx: Transaction) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, firstName: "Synthetic", lastName: "Deletion" });
  const [certificate, otherCertificate] = await tx.insert(certificates).values(
    [randomUUID(), randomUUID()].map(id => ({
      id, userId, deceasedName: "Synthetic deletion case", dateOfDeath: "2026-01-01",
      dateOfBirth: "1950-01-01", certificateNumber: `deletion-test-${id}`,
      issuingAuthority: "Synthetic test",
    })),
  ).returning();
  for (const cert of [certificate, otherCertificate]) {
    await tx.insert(lpoaDocuments).values({
      userId, certificateId: cert.id, principalName: "Synthetic Deletion",
      principalAddress: "Synthetic address", signatureType: "typed",
      signatureData: "Synthetic Deletion", validUntil: "2027-01-01",
    });
    await tx.insert(familyDocuments).values({
      userId, certificateId: cert.id, label: "Synthetic document",
      fileName: "synthetic.pdf", objectPath: "/synthetic/deletion-test",
    });
    const [account] = await tx.insert(connectedAccounts).values({
      certificateId: cert.id, accountName: "Synthetic", accountType: "test", category: "other",
    }).returning();
    await tx.insert(webhookLogs).values({
      certificateId: cert.id, accountId: account.id,
      webhookUrl: "https://example.invalid", payload: "{}", encryptedData: "synthetic",
      blockchainHash: "synthetic",
    });
  }
  return { certificate, otherCertificate, userId };
}

test("deletion removes LPOAs, document records, and account-dependent webhooks only for the selected case", async () => {
  await isolated(async tx => {
    const { certificate, otherCertificate, userId } = await fixture(tx);
    const result = await deleteCaseRecords(certificate.id, tx);
    assert.equal(result?.id, certificate.id);
    assert.equal((await tx.select().from(certificates).where(eq(certificates.id, certificate.id))).length, 0);
    for (const table of [lpoaDocuments, familyDocuments, connectedAccounts, webhookLogs]) {
      assert.equal((await tx.select().from(table).where(eq(table.certificateId, certificate.id))).length, 0);
      assert.equal((await tx.select().from(table).where(eq(table.certificateId, otherCertificate.id))).length, 1);
    }
    assert.equal((await tx.select().from(users).where(eq(users.id, userId))).length, 1);
    assert.equal((await tx.select().from(certificates).where(eq(certificates.id, otherCertificate.id))).length, 1);
  });
});

test("an unexpected cross-case FK dependency rolls back all earlier child deletions", async () => {
  await isolated(async tx => {
    const { certificate, otherCertificate } = await fixture(tx);
    const [account] = await tx.select().from(connectedAccounts)
      .where(eq(connectedAccounts.certificateId, certificate.id));
    await tx.insert(notifications).values({
      certificateId: otherCertificate.id, accountId: account.id,
      message: "Synthetic cross-case dependency", type: "synthetic",
    });
    await assert.rejects(deleteCaseRecords(certificate.id, tx));
    for (const table of [lpoaDocuments, familyDocuments, connectedAccounts, webhookLogs]) {
      assert.equal((await tx.select().from(table).where(eq(table.certificateId, certificate.id))).length, 1);
    }
    assert.equal((await tx.select().from(certificates).where(eq(certificates.id, certificate.id))).length, 1);
  });
});

test("linked HeartPlans block deletion without removing case records", async () => {
  await isolated(async tx => {
    const { certificate, userId } = await fixture(tx);
    await tx.insert(heartPlans).values({ userId, certificateId: certificate.id });
    await assert.rejects(deleteCaseRecords(certificate.id, tx), CaseDeletionConflict);
    assert.equal((await tx.select().from(lpoaDocuments).where(eq(lpoaDocuments.certificateId, certificate.id))).length, 1);
    assert.equal((await tx.select().from(certificates).where(eq(certificates.id, certificate.id))).length, 1);
    assert.equal((await tx.select().from(heartPlans).where(eq(heartPlans.userId, userId))).length, 1);
  });
});

test("missing cases return null without changing records", async () => {
  await isolated(async tx => {
    assert.equal(await deleteCaseRecords(randomUUID(), tx), null);
  });
});

after(async () => pool.end());
