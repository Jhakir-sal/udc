import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { db } from "./db";
import { storage } from "./storage";

test("phone enrollment cannot be guessed or reissued to reset its attempt limit", async () => {
  const id = randomUUID();
  await db.insert(users).values({ id });
  try {
    const expiry = new Date(Date.now() + 10 * 60_000);
    assert.equal(await storage.updateUserPhone(id, "+15555550123", "123456", expiry), true);
    assert.equal(await storage.updateUserPhone(id, "+15555550123", "222222", expiry), false);
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal(await storage.verifyUserPhone(id, "999999"), false);
    }
    assert.equal(await storage.verifyUserPhone(id, "123456"), false);
    assert.equal(await storage.updateUserPhone(id, "+15555550123", "123456", expiry), false);
    const [row] = await db.select({ verified: users.phoneVerified }).from(users).where(eq(users.id, id));
    assert.equal(row.verified, false);
  } finally {
    await db.delete(users).where(eq(users.id, id));
  }
});