import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/models/auth";
import { issueMfaChallenge, mfaDeliveryDetails } from "./mfa";
import { matchesMfaCode, matchesPhoneEnrollmentCode, mfaCode, phoneEnrollmentCode } from "./verificationCodePurpose";

const account = {
  id: "test-account",
  email: "member@example.com",
  emailVerified: true,
  phoneNumber: "+15555550123",
  phoneVerified: true,
} as User;

test("MFA passes the stored recipient role to the authentication SMS provider", async () => {
  let recipientRole: User["role"] | undefined;
  const sentVia = await issueMfaChallenge({ ...account, role: "admin" }, {
    updateCode: async () => {},
    sendSms: async (_to, _body, role) => { recipientRole = role; return true; },
    deliverEmail: async () => { throw new Error("accepted SMS must not duplicate email"); },
  });
  assert.equal(sentVia, "sms");
  assert.equal(recipientRole, "admin");
});

test("password MFA uses text only for a verified phone", async () => {
  let smsCalls = 0;
  let emailCalls = 0;
  let storedCode = "";
  let textCode = "";
  const deps = {
    updateCode: async (_id: string, code: string | null) => { storedCode = code || ""; },
    sendSms: async (_to: string, body: string) => {
      smsCalls++;
      textCode = body.match(/\b\d{6}\b/)?.[0] || "";
      return true;
    },
    deliverEmail: async () => { emailCalls++; return true; },
  };
  assert.equal(await issueMfaChallenge(account, deps), "sms");
  assert.equal(matchesMfaCode(storedCode, textCode), true);
  assert.equal(smsCalls, 1);
  assert.equal(emailCalls, 0);
  assert.equal(await issueMfaChallenge({ ...account, phoneVerified: false }, deps), "email");
  assert.equal(smsCalls, 1);
  assert.equal(emailCalls, 1);
});

test("failed SMS falls back only to a verified email address", async () => {
  let emailCalls = 0;
  const deps = {
    updateCode: async () => {},
    sendSms: async () => false,
    deliverEmail: async () => { emailCalls++; return true; },
  };
  assert.equal(await issueMfaChallenge(account, deps), "email");
  assert.equal(emailCalls, 1);
  await assert.rejects(issueMfaChallenge({ ...account, emailVerified: false }, deps), /No verified delivery address/);
  assert.equal(emailCalls, 1);
});

test("an emailed login or password-reset code cannot verify a pending phone", () => {
  assert.equal(matchesPhoneEnrollmentCode(phoneEnrollmentCode("123456"), "123456"), true);
  assert.equal(matchesPhoneEnrollmentCode(mfaCode("123456"), "123456"), false);
  assert.equal(matchesPhoneEnrollmentCode("pwreset_123456", "123456"), false);
  assert.equal(matchesMfaCode(phoneEnrollmentCode("123456"), "123456"), false);
  assert.equal(matchesMfaCode(mfaCode("123456"), "123456"), true);
});

test("explicit email recovery skips SMS, replaces the old login code, and requires a verified email", async () => {
  let storedCode = "";
  let emailCalls = 0;
  const deps = {
    updateCode: async (_id: string, code: string | null) => { storedCode = code || ""; },
    sendSms: async () => { throw new Error("email recovery must not submit SMS"); },
    deliverEmail: async () => { emailCalls++; return true; },
  };
  assert.equal(await issueMfaChallenge(account, deps, "email"), "email");
  assert.equal(storedCode.startsWith("mfa_"), true);
  assert.equal(emailCalls, 1);
  await assert.rejects(issueMfaChallenge({ ...account, emailVerified: false }, deps, "email"), /No verified/);
  await assert.rejects(issueMfaChallenge({ ...account, phoneVerified: false }, deps, "sms"), /Verify a phone/);
  assert.equal(emailCalls, 1);
});

test("MFA destinations are masked and accounts without enrolled phones explain email delivery", () => {
  assert.equal(mfaDeliveryDetails(account, "sms").destination, "phone ending in 0123");
  assert.equal(mfaDeliveryDetails(account, "email").destination, "m***@example.com");
  const noPhone = mfaDeliveryDetails({ ...account, phoneVerified: false, phoneNumber: null }, "email");
  assert.equal(noPhone.smsAvailable, false);
  assert.equal(noPhone.emailAvailable, true);
  assert.match(noPhone.deliveryNote, /No verified phone/);
  assert.match(mfaDeliveryDetails(account, "sms").deliveryNote, /delayed/);
});