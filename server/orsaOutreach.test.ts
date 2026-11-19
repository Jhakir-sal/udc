import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { registerOrsaOutreachRoutes } from "./orsaOutreach";
import { buildOutreachMembers } from "./orsaOutreachPolicy";

test("outreach endpoint protects data, paginates, searches, and counts across the whole roster", async () => {
  const app = express();
  const members = buildOutreachMembers({
    roster: Array.from({ length: 3 }, (_, index) => ({
      id: `member-${index}`, displayName: `Member ${index}`, normalizedEmail: `member${index}@example.invalid`,
      normalizedPhone: null, sharedEligibilityEmail: null, active: true, invitationStatus: "pending",
      invitationFirstAttemptAt: null, invitationAttemptedAt: null, invitationSentAt: null,
      invitationAcceptedAt: null, invitationAcceptedUserId: null,
    })),
    emailDeliveries: [], emailOptOuts: new Set(["member2@example.invalid"]), sms: [], smsStops: new Set(), accountEmails: new Set(),
  });
  let loads = 0;
  registerOrsaOutreachRoutes(app,
    (req, res, next) => req.headers["x-test-user"] ? next() : void res.sendStatus(401),
    (req, res, next) => req.headers["x-test-user"] === "admin" ? next() : void res.sendStatus(403),
    async () => { loads++; return { members, smsPaused: true, smsRunStatus: "paused" }; },
  );
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/admin/orsa/outreach`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { "x-test-user": "family" } })).status, 403);
    assert.equal(loads, 0);
    const get = (query: string) => fetch(`${url}${query}`, { headers: { "x-test-user": "admin" } });
    const result = await (await get("?group=not_emailed&q=member1&limit=1")).json();
    assert.equal(result.members[0].id, "member-1");
    assert.equal(result.total, 1);
    assert.equal(result.counts.not_emailed, 3);
    assert.equal(result.counts.emailed, 0);
    assert.equal(result.counts.texted, 0);
    assert.equal(result.counts.no_outreach, 3);
    assert.equal(result.counts.email_opted_out, 1);
    assert.equal(result.counts.sms_opted_out, 0);
    assert.equal(result.counts.opted_out, 1);
    assert.equal(result.smsPaused, true);
    assert.equal((await get("?limit=1000")).status, 400);
    assert.equal((await get("?group=anything")).status, 400);
    const page = await (await get("?offset=2&limit=1")).json();
    assert.equal(page.members[0].id, "member-2");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
