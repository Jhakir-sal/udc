import test from "node:test";
import assert from "node:assert/strict";
import { sendAuthenticationSms } from "./authSms";
import { getRingCentralServer } from "./ringcentral";

test("RingCentral selects the requested environment and rejects invalid settings", () => {
  assert.equal(getRingCentralServer(undefined), "https://platform.ringcentral.com");
  assert.equal(getRingCentralServer("production"), "https://platform.ringcentral.com");
  assert.equal(getRingCentralServer("sandbox"), "https://platform.devtest.ringcentral.com");
  assert.throws(() => getRingCentralServer("sandbx"), /RINGCENTRAL_ENVIRONMENT/);
});

test("non-staff authentication texts retain Twilio without duplicate RingCentral submissions", async () => {
  let twilioCalls = 0;
  let ringCalls = 0;
  assert.equal(await sendAuthenticationSms("+15555550123", "synthetic code", "user", {
    twilioConfigured: () => true,
    submitTwilio: async () => { twilioCalls++; return { status: "queued" }; },
    sendRingCentral: async () => { ringCalls++; return true; },
  }), true);
  assert.equal(twilioCalls, 1);
  assert.equal(ringCalls, 0);
});

test("missing Twilio or definitive rejection can use RingCentral", async () => {
  let ringCalls = 0;
  const sendRingCentral = async () => { ringCalls++; return true; };
  assert.equal(await sendAuthenticationSms("synthetic", "synthetic", "user", {
    twilioConfigured: () => false,
    submitTwilio: async () => { throw new Error("must not be called"); },
    sendRingCentral,
  }), true);
  assert.equal(await sendAuthenticationSms("synthetic", "synthetic", "user", {
    twilioConfigured: () => true,
    submitTwilio: async () => { throw { status: 400, code: 21608 }; },
    sendRingCentral,
  }), true);
  assert.equal(ringCalls, 2);
});

test("uncertain submissions never trigger a second SMS provider", async () => {
  for (const error of [new Error("timeout"), { status: 408 }, { status: 503 }]) {
    assert.equal(await sendAuthenticationSms("synthetic", "synthetic", "user", {
      twilioConfigured: () => true,
      submitTwilio: async () => { throw error; },
      sendRingCentral: async () => { throw new Error("must not duplicate uncertain submission"); },
    }), false);
  }
});

test("failed or unknown provider statuses are not described as successful submissions", async () => {
  for (const status of ["failed", "undelivered", "canceled", "unknown"]) {
    assert.equal(await sendAuthenticationSms("synthetic", "synthetic", "user", {
      twilioConfigured: () => true,
      submitTwilio: async () => ({ status }),
      sendRingCentral: async () => { throw new Error("must not retry a submitted message"); },
    }), false);
  }
});

test("SAL staff use RingCentral even while Twilio remains configured", async () => {
  let ringCalls = 0;
  const result = await sendAuthenticationSms("synthetic", "synthetic", "admin", {
    ringCentralConfigured: () => true,
    twilioConfigured: () => { throw new Error("staff must not select Twilio"); },
    submitTwilio: async () => { throw new Error("staff must not submit Twilio"); },
    sendRingCentral: async () => { ringCalls++; return true; },
  });
  assert.equal(result, true);
  assert.equal(ringCalls, 1);
});

test("SAL staff cannot silently switch providers if RingCentral is unavailable", async () => {
  let twilioCalls = 0;
  assert.equal(await sendAuthenticationSms("synthetic", "synthetic", "admin", {
    ringCentralConfigured: () => false,
    submitTwilio: async () => { twilioCalls++; return { status: "queued" }; },
    sendRingCentral: async () => { throw new Error("provider is not configured"); },
  }), false);
  assert.equal(twilioCalls, 0);
});

test("SAL staff failures and uncertain submissions leave recovery to email, not another SMS", async () => {
  for (const sendRingCentral of [
    async () => false,
    async () => { throw new Error("timeout"); },
  ]) {
    let ringCalls = 0;
    let twilioCalls = 0;
    assert.equal(await sendAuthenticationSms("synthetic", "synthetic", "admin", {
      ringCentralConfigured: () => true,
      submitTwilio: async () => { twilioCalls++; return { status: "queued" }; },
      sendRingCentral: async () => { ringCalls++; return sendRingCentral(); },
    }), false);
    assert.equal(ringCalls, 1);
    assert.equal(twilioCalls, 0);
  }
});
