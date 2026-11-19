import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import { registerOrsaWarmupRoutes } from "./orsaWarmupRoutes";
import { DEFAULT_WARMUP } from "./orsaWarmup";
import { ORSA_FAST_OUTREACH_PRESET } from "@shared/orsaWarmupDefaults";

test("warmup PUT validates reviews, numeric settings and four-second floor before persistence", async () => {
  const app = express();
  app.use(express.json());
  const saved: unknown[] = [];
  const authenticate: RequestHandler = (req: any, _res, next) => {
    req.session = { userId: "synthetic-admin" };
    next();
  };
  registerOrsaWarmupRoutes(app, authenticate, (_req, _res, next) => next(), {
    getWarmupOverview: async () => { throw new Error("Unexpected status read"); },
    pauseWarmup: async () => { throw new Error("Unexpected pause"); },
    saveWarmupSettings: async (input, actor) => {
      saved.push({ input, actor });
      return { settings: input } as any;
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const payload = { ...DEFAULT_WARMUP, ...ORSA_FAST_OUTREACH_PRESET,
    acknowledgeProviderLimits: true, reviewedDeliveryStats: true };
  try {
    const put = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/admin/orsa/email-warmup`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    for (const patch of [
      { acknowledgeProviderLimits: false }, { reviewedDeliveryStats: false },
      { acknowledgeProviderLimits: undefined }, { reviewedDeliveryStats: undefined },
      { minIntervalSeconds: 3 }, { minIntervalSeconds: "4" },
      { dailyLimit: "1000" }, { hourlyLimit: "900" }, { providerHourlyLimit: 909 },
    ]) {
      const response = await put({ ...payload, ...patch });
      assert.equal(response.status, 400, JSON.stringify(patch));
      assert.ok((await response.json()).error);
      assert.equal(saved.length, 0);
    }
    const response = await put(payload);
    assert.equal(response.status, 200);
    const { acknowledgeProviderLimits, reviewedDeliveryStats, ...input } = payload;
    assert.deepEqual(saved, [{ input, actor: "synthetic-admin" }]);
    assert.deepEqual(await response.json(), { settings: input });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
