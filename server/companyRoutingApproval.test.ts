import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { companyDirectory, companyNotificationAuditEvents } from "../shared/schema";
import { emailMatchesCompanyDomain, hasVerifiedNotificationRouting, hasCurrentRoutingApproval } from "../shared/companyEmailRouting";
import { emailMatchesOfficialDomain } from "./companyNotificationSecurity";
import { registerCompanyRoutingApproval } from "./companyRoutingApproval";

test("notification domain matching accepts real subdomains, never resemblance or suffix tricks", () => {
  for (const email of ["estates@company.com", "any.department+tag@company.com", "person@claims.company.com", "PERSON@MAIL.COMPANY.COM"]) {
    assert.equal(emailMatchesCompanyDomain(email, "company.com"), true, email);
  }
  for (const email of ["person@notcompany.com", "person@company.com.evil.test", "person@company-claims.com",
    "person@cornpany.com", "person@company.co", "person@gmail.com", "bad@@company.com", "person@.company.com"]) {
    assert.equal(emailMatchesCompanyDomain(email, "company.com"), false, email);
  }
  // Notification exceptions must not weaken portal membership.
  assert.equal(emailMatchesOfficialDomain("person@claims.company.com", "company.com"), false);
});

test("alternate routing needs explicit admin approval, stale reviews fail, and the approval is address-bound and audited", async () => {
  const id = randomUUID();
  const domain = `synthetic-${id}.example.invalid`;
  const email = "estates@synthetic-agent.example.invalid";
  const app = express();
  app.use(express.json());
  registerCompanyRoutingApproval(app,
    (req: any, res, next) => {
      if (!req.header("x-test-role")) return res.sendStatus(401);
      req.session = { userId: "synthetic-routing-reviewer" };
      next();
    },
    (req, res, next) => req.header("x-test-role") === "admin" ? next() : res.sendStatus(403),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/admin/company-directory/${id}/verify-routing`;
  const post = async (body: unknown, role = "admin") => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json",
      ...(role ? { "x-test-role": role } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, text: await response.text() };
  };
  const review = { expectedEmail: email, expectedDomain: domain, approveAlternateDomain: true,
    reason: "Confirmed with the company that this is its authorized estate notification department." };
  const get = async () => (await db.select().from(companyDirectory).where(eq(companyDirectory.id, id)))[0];
  try {
    await db.insert(companyDirectory).values({ id, name: "Synthetic approval company", officialDomain: domain,
      notificationEmail: email, category: "miscellaneous" });
    assert.equal((await post(review, "")).status, 401);
    assert.equal((await post(review, "user")).status, 403);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ ...review, reason: "too short" })).status, 400);
    assert.equal((await post({ approveAlternateDomain: true, reason: review.reason })).status, 400);
    assert.equal((await post({ ...review, expectedEmail: "changed@synthetic-agent.example.invalid" })).status, 409);
    assert.equal(hasVerifiedNotificationRouting(await get()), false);
    assert.equal((await post(review)).status, 200);
    const approved = await get();
    assert.equal(hasVerifiedNotificationRouting(approved), true);
    assert.equal(approved.routingApproval?.approvedBy, "synthetic-routing-reviewer");
    const audits = await db.select().from(companyNotificationAuditEvents).where(eq(companyNotificationAuditEvents.companyId, id));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].eventType, "alternate_email_routing_approved");
    assert.equal((audits[0].metadata as any).reason, review.reason);
    assert.equal(hasCurrentRoutingApproval({ ...approved, notificationEmail: "other@synthetic-agent.example.invalid" }), false);
    assert.equal(hasVerifiedNotificationRouting({ ...approved, notificationEmail: "other@synthetic-agent.example.invalid" }), false);
    assert.equal(hasVerifiedNotificationRouting({ ...approved, officialDomain: "other.example.invalid" }), false);
    assert.equal(hasVerifiedNotificationRouting({ ...approved, status: "inactive" }), false);
    assert.equal(hasVerifiedNotificationRouting({ ...approved, verifiedAt: null }), false);
    await db.update(companyDirectory).set({ status: "inactive" }).where(eq(companyDirectory.id, id));
    assert.equal((await post(review)).status, 400);
    const subdomainEmail = `estates@claims.${domain}`;
    await db.update(companyDirectory).set({ status: "active", notificationEmail: subdomainEmail,
      verifiedAt: null, verifiedBy: null, routingApproval: null }).where(eq(companyDirectory.id, id));
    assert.equal(hasVerifiedNotificationRouting(await get()), false);
    assert.equal((await post({ expectedEmail: subdomainEmail, expectedDomain: domain })).status, 200);
    assert.equal(hasVerifiedNotificationRouting(await get()), true);
    assert.equal((await get()).routingApproval, null);
  } finally {
    await db.delete(companyNotificationAuditEvents).where(eq(companyNotificationAuditEvents.companyId, id));
    await db.delete(companyDirectory).where(eq(companyDirectory.id, id));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
