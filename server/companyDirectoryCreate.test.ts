import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { companyDirectory } from "@shared/schema";
import { registerCompanyDirectoryCreate } from "./companyDirectoryCreate";

test("staff can add an unverified company without sending, overwriting, or duplicating an existing domain", async () => {
  const domain = `synthetic-${randomUUID()}.example.invalid`;
  const body = { name: "Synthetic Manual Company", officialDomain: domain, category: "miscellaneous",
    notificationEmail: `estates@${domain}`, website: `https://${domain}`, source: "Synthetic staff-entered source" };
  const app = express();
  app.use(express.json());
  registerCompanyDirectoryCreate(app,
    (req, res, next) => req.header("x-test-role") ? next() : res.status(401).json({ error: "Sign in required" }),
    (req, res, next) => req.header("x-test-role") === "admin" ? next() : res.status(403).json({ error: "Staff only" }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}/api/admin/company-directory`;
  const post = async (value: unknown = body, role = "admin") => {
    const response = await fetch(endpoint, { method: "POST", headers: {
      "content-type": "application/json", ...(role ? { "x-test-role": role } : {}),
    }, body: JSON.stringify(value) });
    return { status: response.status, data: await response.json() as any };
  };
  try {
    assert.equal((await post(body, "")).status, 401);
    assert.equal((await post(body, "user")).status, 403);
    for (const invalid of [{ ...body, name: "" }, { ...body, officialDomain: "not a domain" },
      { ...body, category: "invalid" }, { ...body, notificationEmail: "not-an-email" }]) {
      assert.equal((await post(invalid)).status, 400);
    }
    const created = await post({ ...body, verifiedAt: new Date().toISOString(), verifiedBy: "forged" });
    assert.equal(created.status, 201);
    assert.equal(created.data.verifiedAt, null);
    assert.equal(created.data.verifiedBy, null);
    assert.equal(created.data.routingVerified, false);
    assert.equal(created.data.sent, false);
    assert.equal(created.data.name, body.name);
    assert.deepEqual(created.data.aliases, []);
    assert.equal(created.data.status, "active");
    let [persisted] = await db.select().from(companyDirectory).where(eq(companyDirectory.officialDomain, domain));
    assert.equal(persisted.id, created.data.id);
    assert.equal(persisted.notificationEmail, body.notificationEmail);
    assert.equal(persisted.verifiedAt, null);
    const duplicate = await post({ ...body, name: "Do not overwrite original", officialDomain: domain.toUpperCase() });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.existingCompany.id, created.data.id);
    assert.match(duplicate.data.error, /already exists/);
    [persisted] = await db.select().from(companyDirectory).where(eq(companyDirectory.officialDomain, domain));
    assert.equal(persisted.name, body.name);
    await db.update(companyDirectory).set({ status: "inactive" }).where(eq(companyDirectory.id, created.data.id));
    assert.equal((await post()).status, 409);
    [persisted] = await db.select().from(companyDirectory).where(eq(companyDirectory.officialDomain, domain));
    assert.equal(persisted.status, "inactive");
    assert.equal(persisted.verifiedBy, null);
  } finally {
    await db.delete(companyDirectory).where(eq(companyDirectory.officialDomain, domain));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
