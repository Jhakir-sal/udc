import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { certificates, companyDirectory, connectedAccounts } from "@shared/schema";
import { registerAccountCompanyNotification } from "./accountCompanyNotification";
import { hasVerifiedNotificationRouting } from "../shared/companyEmailRouting";

test("staff sees editable saved email without granting unverified recipients delivery readiness", async () => {
  const [certId, accountId, companyId, otherCompanyId] = Array.from({ length: 4 }, () => randomUUID());
  const domain = `synthetic-${companyId}.example.invalid`;
  const candidate = `claims@${domain}`;
  const app = express();
  app.use(express.json());
  registerAccountCompanyNotification(app, {
    isAuthenticated: (req, res, next) => req.header("x-test-role") ? next() : res.status(401).json({ error: "Sign in required" }),
    isAdmin: (req, res, next) => req.header("x-test-role") === "admin" ? next() : res.status(403).json({ error: "Staff only" }),
    hasVerifiedRouting: hasVerifiedNotificationRouting,
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/admin/accounts`;
  const get = async (role = "admin", id = accountId, suffix = "") => {
    const response = await fetch(`${base}/${id}/company-notification${suffix}`, {
      headers: role ? { "x-test-role": role } : {},
    });
    return { status: response.status, data: await response.json() as any, cache: response.headers.get("cache-control") };
  };
  try {
    await db.insert(certificates).values({
      id: certId, deceasedName: "Synthetic Company Email Context", status: "verified",
      dateOfBirth: "1950-01-01", dateOfDeath: "2026-01-01",
      certificateNumber: `SYN-COMPANY-CONTEXT-${certId}`, issuingAuthority: "Synthetic test",
    });
    await db.insert(companyDirectory).values([
      { id: companyId, name: "Synthetic Editable Company", officialDomain: domain, category: "miscellaneous", notificationEmail: candidate },
      { id: otherCompanyId, name: "Synthetic Other Company", officialDomain: `other-${otherCompanyId}.example.invalid`, category: "miscellaneous" },
    ]);
    await db.insert(connectedAccounts).values({
      id: accountId, certificateId: certId, companyId, accountName: "Synthetic Company Account",
      accountType: "Utility", category: "miscellaneous", notes: "PRIVATE-SAL-NOTE-SYNTHETIC",
    });
    assert.equal((await get("")).status, 401);
    assert.equal((await get("user")).status, 403);
    assert.equal((await get("admin", randomUUID())).status, 404);
    const initial = await get();
    assert.equal(initial.status, 200);
    assert.match(initial.cache || "", /no-store/);
    assert.equal(initial.data.company.notificationEmail, candidate);
    assert.equal(initial.data.company.officialDomain, domain);
    assert.equal(initial.data.company.status, "active");
    assert.equal(initial.data.company.canEmail, false);
    assert.equal(initial.data.company.recipient, null);
    assert(!initial.data.preview.text.includes("PRIVATE-SAL-NOTE"));
    assert.equal(initial.data.internalNotes, "PRIVATE-SAL-NOTE-SYNTHETIC");
    assert.equal((await get("admin", accountId, `?companyId=${otherCompanyId}`)).data.company.id, companyId);

    await db.update(companyDirectory).set({ verifiedAt: new Date(), verifiedBy: "synthetic-reviewer" }).where(eq(companyDirectory.id, companyId));
    const reviewed = await get();
    assert.equal(reviewed.data.company.canEmail, true);
    assert.equal(reviewed.data.company.recipient, candidate);

    await db.update(companyDirectory).set({
      notificationEmail: `estate@${domain}`, verifiedAt: null, verifiedBy: null,
    }).where(eq(companyDirectory.id, companyId));
    const changed = await get();
    assert.equal(changed.data.company.notificationEmail, `estate@${domain}`);
    assert.equal(changed.data.company.canEmail, false);
    assert.equal(changed.data.company.recipient, null);

    await db.update(companyDirectory).set({ notificationEmail: null }).where(eq(companyDirectory.id, companyId));
    assert.equal((await get()).data.company.notificationEmail, null);
    await db.update(companyDirectory).set({ notificationEmail: "third-party@external.example.invalid",
      verifiedAt: new Date(), verifiedBy: "synthetic-reviewer" }).where(eq(companyDirectory.id, companyId));
    assert.equal((await get()).data.company.canEmail, false);
    await db.update(companyDirectory).set({ status: "inactive" }).where(eq(companyDirectory.id, companyId));
    const inactive = await get();
    assert.equal(inactive.data.company.status, "inactive");
    assert.equal(inactive.data.company.canEmail, false);
    assert.equal(inactive.data.company.recipient, null);
  } finally {
    await db.delete(connectedAccounts).where(eq(connectedAccounts.id, accountId));
    await db.delete(certificates).where(eq(certificates.id, certId));
    await db.delete(companyDirectory).where(inArray(companyDirectory.id, [companyId, otherCompanyId]));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
