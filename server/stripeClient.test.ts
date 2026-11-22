import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { getStripeClient, getStripeIdentityClient } from "./stripeClient";

test("Stripe clients use only STRIPE_SECRET_KEY without contacting Replit Connectors", async () => {
  const keys = [
    "STRIPE_SECRET_KEY",
    "REPLIT_CONNECTORS_HOSTNAME",
    "REPL_IDENTITY",
    "WEB_REPL_RENEWAL",
  ] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  try {
    process.env.STRIPE_SECRET_KEY = "sk_test_local_placeholder";
    process.env.REPLIT_CONNECTORS_HOSTNAME = "connector.invalid";
    process.env.REPL_IDENTITY = "local-placeholder";
    process.env.WEB_REPL_RENEWAL = "local-placeholder";
    globalThis.fetch = async () => {
      fetchCalls++;
      throw new Error("Unexpected network request");
    };

    assert.ok(await getStripeClient() instanceof Stripe);
    assert.ok(await getStripeIdentityClient() instanceof Stripe);
    assert.equal(fetchCalls, 0);

    process.env.STRIPE_SECRET_KEY = "invalid";
    assert.equal(await getStripeClient(), null);
    assert.equal(await getStripeIdentityClient(), null);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
