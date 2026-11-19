import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import { db } from "./db";
import { conciergeInquiries } from "@shared/schema";
import { conciergeInquirySchema } from "@shared/conciergeInquiry";
import { buildConciergeConfirmationEmail, buildConciergeInquiryEmail, registerConciergeInquiryRoutes } from "./conciergeInquiryRoutes";

function input(requestId = randomUUID()) {
  return {
    requestId, name: "Synthetic Callback", email: "synthetic-concierge@example.invalid",
    phone: "202-555-0127", careLocation: "Synthetic care facility",
    bestTime: "Weekday afternoon, Eastern", contactPermission: true, website: "",
  };
}

test("callback input requires specific permission, valid contact details and no marketing fields", () => {
  assert.equal(conciergeInquirySchema.safeParse(input()).success, true);
  for (const changes of [
    { contactPermission: false }, { phone: "123" }, { email: "bad@example" },
    { website: "https://spam.invalid" }, { marketingOptIn: true }, { careLocation: "x".repeat(201) },
  ]) assert.equal(conciergeInquirySchema.safeParse({ ...input(), ...changes }).success, false);
});

test("staff alert escapes submitted content and uses a fixed SAL recipient, not a visitor-provided target", () => {
  const mail = buildConciergeInquiryEmail({ id: randomUUID(), ...input(), name: '<img src=x onerror="alert(1)">' });
  assert.equal(mail.to, "hello@stepsafterlife.com");
  assert.equal(mail.replyTo, input().email);
  assert.equal(mail.html.includes("<img"), false);
  assert.match(mail.html, /&lt;img/);
  assert.match(mail.text, /not marketing consent/);
});

async function withApi(
  dependencies: NonNullable<Parameters<typeof registerConciergeInquiryRoutes>[3]>,
  run: (request: (path: string, init?: RequestInit, actor?: string) => Promise<Response>) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  registerConciergeInquiryRoutes(app,
    (req, res, next) => req.headers["x-test-actor"] ? next() : void res.sendStatus(401),
    (req, res, next) => req.headers["x-test-actor"] === "admin" ? next() : void res.sendStatus(403),
    dependencies);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await run((path, init = {}, actor) => fetch(base + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(actor ? { "x-test-actor": actor } : {}), ...init.headers },
    }));
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("staff list and status updates require authentication and admin authorization", async () => {
  await withApi({ send: async () => { throw new Error("No messages allowed"); } }, async request => {
    for (const path of ["/api/admin/concierge-inquiries", `/api/admin/concierge-inquiries/${randomUUID()}`]) {
      const init = path.endsWith("inquiries") ? undefined : { method: "PATCH", body: JSON.stringify({ status: "closed" }) };
      assert.equal((await request(path, init)).status, 401);
      assert.equal((await request(path, init, "planner")).status, 403);
    }
    const invalid = await request("/api/concierge-inquiries", { method: "POST", body: JSON.stringify({ ...input(), contactPermission: false }) });
    assert.equal(invalid.status, 400);
  });
});

test("family confirmation is branded, transactional, and reveals no submitted private details", () => {
  const mail = buildConciergeConfirmationEmail(input());
  assert.equal(mail.to, input().email);
  assert.equal(mail.fromEmail, "hello@stepsafterlife.com");
  assert.equal(mail.fromName, "Steps After Life");
  assert.equal(mail.replyTo, "help@stepsafterlife.com");
  assert.match(mail.text, /^Hi Synthetic,/);
  assert.match(mail.text, /within one business day/);
  assert.match(mail.text, /no cost or obligation/);
  assert.match(mail.text, /Diana Milian, CEO/);
  assert.match(mail.text, /888-557-2083 \| help@stepsafterlife.com/);
  assert.match(mail.html, /Getting ready for our call \(optional\)/);
  assert.equal(mail.text.includes("{"), false);
  const unsafe = buildConciergeConfirmationEmail({ ...input(), name: "<script>alert(1)</script> Smith" });
  assert.equal(unsafe.html.includes("<script>"), false);
  assert.match(unsafe.html, /Hi &lt;script&gt;/);
  assert.match(mail.html, /888-557-2083/);
  assert.equal(mail.html.includes(input().careLocation), false);
  assert.equal(mail.text.includes(input().phone), false);
  assert.equal(mail.disableProviderClickTracking, true);
});

test("family email failure cannot lose the request or change the successful staff alert", async () => {
  let saved: any;
  const recipients: string[] = [];
  await withApi({
    sourceHash: () => "synthetic",
    store: {
      async save(body) {
        if (saved) return { row: saved, created: false };
        saved = { ...body, id: body.requestId, notificationStatus: "pending" };
        return { row: saved, created: true };
      },
      async alertResult(_id, status) { saved.notificationStatus = status; },
      async list() { return []; },
      async setStatus() { return undefined; },
    },
    send: async mail => {
      recipients.push(mail.to as string);
      if (mail.to !== "hello@stepsafterlife.com") throw new Error("Synthetic failure");
      return true;
    },
  }, async request => {
    const body = input();
    const post = () => request("/api/concierge-inquiries", { method: "POST", body: JSON.stringify(body) });
    const first = await post();
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), { saved: true, notificationAccepted: true });
    assert.deepEqual(recipients, ["hello@stepsafterlife.com", body.email]);
    assert.equal((await post()).status, 200);
    assert.equal(recipients.length, 2, "Browser retries must not duplicate either email");
  });
});

test("real development CRM persistence survives email failure, deduplicates retries, and enforces source limits", async () => {
  const ids = Array.from({ length: 6 }, () => randomUUID());
  const source = `synthetic-test-${randomUUID()}`;
  let notifications = 0;
  try {
    await withApi({
      sourceHash: () => source,
      send: async () => { notifications++; return false; },
    }, async request => {
      const post = (body: unknown) => request("/api/concierge-inquiries", { method: "POST", body: JSON.stringify(body) });
      const first = await post(input(ids[0]));
      assert.equal(first.status, 201);
      assert.deepEqual(await first.json(), { saved: true, notificationAccepted: false });
      const retry = await post(input(ids[0]));
      assert.equal(retry.status, 200);
      assert.equal(notifications, 2, "Neither staff nor family email is automatically repeated");
      const conflict = await post({ ...input(ids[0]), phone: "202-555-0188" });
      assert.equal(conflict.status, 409);
      for (const id of ids.slice(1, 5)) assert.equal((await post(input(id))).status, 201);
      assert.equal((await post(input(ids[5]))).status, 429);
      assert.equal(notifications, 10);

      const listing = await request("/api/admin/concierge-inquiries?page=0", {}, "admin");
      assert.equal(listing.status, 200);
      assert.equal(listing.headers.get("cache-control"), "no-store");
      const { items } = await listing.json();
      const saved = items.find((row: { id: string }) => row.id === ids[0]);
      assert.equal(saved.name, input().name);
      assert.equal(saved.notificationStatus, "failed");
      assert.equal("sourceHash" in saved, false);
      assert.equal("contactPermissionAt" in saved, false);

      const changed = await request(`/api/admin/concierge-inquiries/${ids[0]}`, {
        method: "PATCH", body: JSON.stringify({ status: "contacted" }),
      }, "admin");
      assert.equal(changed.status, 200);
      assert.equal((await changed.json()).status, "contacted");
      assert.equal((await request("/api/admin/concierge-inquiries?page=-1", {}, "admin")).status, 400);
    });
  } finally {
    await db.delete(conciergeInquiries).where(inArray(conciergeInquiries.id, ids));
  }
});
