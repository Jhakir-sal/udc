import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { orsaRosterAudits, orsaRosterMembers, orsaSmsCampaign, smsMessages } from "@shared/schema";
import { claimOrsaSms, finishOrsaSms, isSmsStop, orsaHeartPlanText, orsaSmsCandidates, recordOrsaSmsConsent, recordOrsaSmsDelivery, recordOrsaSmsOptOut } from "./orsaSmsCampaign";

test("no-email text identifies both brands, links to the official landing page, and includes STOP", () => {
  const url = "https://example.org/orsa/heartplan";
  const message = orsaHeartPlanText(url);
  assert.match(message, /ORSA \+ Steps After Life/);
  assert.match(message, /Start your HeartPlan:/);
  assert.ok(message.length <= 160, "Keep the companion text within one standard SMS segment");
  assert.ok([...message].every(character => character.charCodeAt(0) < 128), "Use plain text rather than smart punctuation that increases SMS segments");
  assert.ok(message.includes(url));
  assert.match(message, /Reply STOP to opt out/);
  assert.doesNotMatch(message, /you are verified|your account is active/i);
});

test("SMS campaign requires consent, claims only once, and tracks provider outcomes", async () => {
  const id = randomUUID(), actor = randomUUID();
  const phone = `212${Math.floor(1000000 + Math.random() * 9000000)}`;
  const formatted = `+1${phone}`;
  await db.insert(orsaRosterMembers).values({ id, normalizedPhone: phone, displayName: "SMS Test Member", active: true });
  try {
    const before = (await orsaSmsCandidates()).find(c => c.id === id);
    assert.equal(before?.status, "not_sent");
    assert.equal(before?.consentRecordedAt, null);
    await assert.rejects(claimOrsaSms(id, formatted, actor), /Consent is missing/);
    await recordOrsaSmsConsent(id, "Verbal SMS permission confirmed on call", actor);
    await assert.rejects(claimOrsaSms(id, "+19999999999", actor), /reviewed recipient has changed/);
    const claim = await claimOrsaSms(id, formatted, actor);
    assert.equal(claim.phone, formatted);
    await assert.rejects(claimOrsaSms(id, formatted, actor), /already been attempted/);
    await finishOrsaSms(formatted, { id: `rc-${id}`, status: "Queued" }, actor);
    await recordOrsaSmsDelivery(`rc-${id}`, "SendingFailed");
    assert.equal((await orsaSmsCandidates()).find(c => c.id === id)?.deliveryStatus, "failed");
    await recordOrsaSmsDelivery(`rc-${id}`, "Delivered");
    const after = (await orsaSmsCandidates()).find(c => c.id === id);
    assert.equal(after?.status, "submitted");
    assert.equal(after?.deliveryStatus, "delivered");
    await assert.rejects(recordOrsaSmsConsent(id, "New verbal consent cannot resend", actor), /already been attempted/);
    await recordOrsaSmsOptOut(formatted, "STOP");
    assert.ok((await orsaSmsCandidates()).find(c => c.id === id)?.optedOutAt);
    await assert.rejects(claimOrsaSms(id, formatted, actor), /opted out/);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actor));
    await db.delete(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, formatted));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
  }
});

test("SMS outreach cannot be approved for an unnamed roster record", async () => {
  const id = randomUUID(), actor = randomUUID();
  const phone = `212${Math.floor(1000000 + Math.random() * 9000000)}`;
  await db.insert(orsaRosterMembers).values({ id, normalizedPhone: phone, active: true });
  try {
    await assert.rejects(recordOrsaSmsConsent(id, "Documented phone consent on call", actor), /needs a name/);
    const candidate = (await orsaSmsCandidates()).find(c => c.id === id);
    assert.equal(candidate?.displayName, null);
    assert.equal(candidate?.consentRecordedAt, null);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actor));
    await db.delete(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, `+1${phone}`));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
  }
});

test("STOP words are recognized without interpreting ordinary messages as opt-outs", () => {
  assert.equal(isSmsStop(" STOP "), true);
  assert.equal(isSmsStop("unsubscribe"), true);
  assert.equal(isSmsStop("Please stop by tomorrow"), false);
});

test("an inbound STOP suppresses a phone before consent, even after roster import", async () => {
  const id = randomUUID(), actor = randomUUID();
  const phone = `212${Math.floor(1000000 + Math.random() * 9000000)}`;
  const formatted = `+1${phone}`;
  try {
    await recordOrsaSmsOptOut(formatted, "STOP");
    await db.insert(orsaRosterMembers).values({ id, normalizedPhone: phone, active: true });
    assert.ok((await orsaSmsCandidates()).find(c => c.id === id)?.optedOutAt);
    await assert.rejects(recordOrsaSmsConsent(id, "Explicit permission by phone", actor), /opted out/);
    await assert.rejects(claimOrsaSms(id, formatted, actor), /Consent is missing/);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actor));
    await db.delete(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, formatted));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
  }
});

test("older inbound STOP messages still suppress newly imported no-email members", async () => {
  const id = randomUUID(), actor = randomUUID();
  const phone = `212${Math.floor(1000000 + Math.random() * 9000000)}`;
  const [message] = await db.insert(smsMessages).values({
    phoneNumber: `+1${phone}`, direction: "inbound", body: "STOP", status: "read",
  }).returning({ id: smsMessages.id });
  try {
    await db.insert(orsaRosterMembers).values({ id, normalizedPhone: phone, active: true });
    assert.ok((await orsaSmsCandidates()).find(c => c.id === id)?.optedOutAt);
    await assert.rejects(recordOrsaSmsConsent(id, "Permission noted elsewhere", actor), /previously opted out/);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actor));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
    await db.delete(smsMessages).where(eq(smsMessages.id, message.id));
  }
});