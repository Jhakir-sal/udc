import test from "node:test";
import assert from "node:assert/strict";
import { isProductionDeployment } from "./deploymentEnv";
import { getAppUrl } from "./email";
import { getOutreachPublishedBaseUrl, registerOutreachRoutes } from "./outreachRoutes";
import { isCurrentOrsaHeartPlanText, orsaHeartPlanText } from "./orsaSmsCampaign";
import express from "express";

const keys = ["NODE_ENV", "WEBSITE_SLOT_NAME", "PUBLIC_APP_URL", "PORT"] as const;

function withRestoredEnvironment(fn: () => void) {
  const previous = keys.map(key => process.env[key]);
  try {
    fn();
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test("campaign delivery requires production mode and an explicitly identified production slot", () => {
  withRestoredEnvironment(() => {
    process.env.NODE_ENV = "production";
    for (const slot of [undefined, "", "staging", "production-staging", " production "]) {
      if (slot === undefined) delete process.env.WEBSITE_SLOT_NAME;
      else process.env.WEBSITE_SLOT_NAME = slot;
      assert.equal(isProductionDeployment(), false, `slot ${slot} must not send`);
    }
    process.env.WEBSITE_SLOT_NAME = "Production";
    assert.equal(isProductionDeployment(), true);
    process.env.NODE_ENV = "development";
    assert.equal(isProductionDeployment(), false);
  });
});

test("email and outreach links use the configured origin; only development falls back to localhost", () => {
  withRestoredEnvironment(() => {
    process.env.NODE_ENV = "development";
    delete process.env.PUBLIC_APP_URL;
    process.env.PORT = "5050";
    assert.equal(getAppUrl(), "http://localhost:5050");
    delete process.env.PORT;
    assert.equal(getAppUrl(), "http://localhost:5000");
    process.env.PUBLIC_APP_URL = "https://example.invalid/";
    assert.equal(getAppUrl(), "https://example.invalid");
    assert.equal(getOutreachPublishedBaseUrl(), "https://example.invalid");
    process.env.NODE_ENV = "production";
    assert.equal(getAppUrl(), "https://example.invalid");
    delete process.env.PUBLIC_APP_URL;
    assert.throws(() => getAppUrl(), /PUBLIC_APP_URL must be configured/);
    for (const invalid of ["http://example.invalid", "example.invalid", "https://user:pass@example.invalid", "https://example.invalid/path", "https://example.invalid/?x=1", "https://example.invalid/#section"]) {
      process.env.PUBLIC_APP_URL = invalid;
      assert.throws(() => getAppUrl(), /PUBLIC_APP_URL/);
    }
  });
});

test("saved SMS runs must match the current campaign message and landing URL", () => {
  const landingUrl = "https://example.invalid/orsa/heartplan";
  assert.equal(isCurrentOrsaHeartPlanText(orsaHeartPlanText(landingUrl), landingUrl), true);
  assert.equal(isCurrentOrsaHeartPlanText(orsaHeartPlanText("https://old.invalid/orsa/heartplan"), landingUrl), false);
  assert.equal(isCurrentOrsaHeartPlanText(`${orsaHeartPlanText(landingUrl)} changed`, landingUrl), false);
});

test("outreach uses the actual deployment gate before checking opt-outs or contacting a provider", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSlot = process.env.WEBSITE_SLOT_NAME;
  let optOutChecks = 0;
  let sends = 0;
  const app = express();
  registerOutreachRoutes(app, (_req, _res, next) => next(), (_req, _res, next) => next(), {
    deliveryConfigured: () => true,
    unsubscribeAvailable: async () => { optOutChecks++; return false; },
    send: async () => { sends++; return true; },
  });
  const layer = app.router.stack.find(entry => entry.route?.path === "/api/admin/outreach/send");
  assert.ok(layer?.route);
  const handler = layer.route.stack.at(-1)!.handle;
  const response = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(_body: unknown) { return this; },
  };
  try {
    process.env.NODE_ENV = "production";
    for (const slot of [undefined, "staging"]) {
      if (slot === undefined) delete process.env.WEBSITE_SLOT_NAME;
      else process.env.WEBSITE_SLOT_NAME = slot;
      await handler({ body: { contactIds: ["0c48b93c-60a7-45d0-bec5-39aaa386c0a3"], templateId: "credit_union_intro" } }, response);
      assert.equal(response.statusCode, 503);
      assert.equal(optOutChecks, 0);
    }
    process.env.WEBSITE_SLOT_NAME = "production";
    await handler({ body: { contactIds: ["0c48b93c-60a7-45d0-bec5-39aaa386c0a3"], templateId: "credit_union_intro" } }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(optOutChecks, 1);
    assert.equal(sends, 0);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSlot === undefined) delete process.env.WEBSITE_SLOT_NAME;
    else process.env.WEBSITE_SLOT_NAME = previousSlot;
  }
});
