import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { isSyntheticNaicPolicy, registerDisabledNaicSearch, SYNTHETIC_NAIC_MARKER } from "./naicSafety";

test("quarantine identifies only policies marked by the invented NAIC pull", () => {
  const policies = [
    { id: "fake-one", provider: "Prudential Financial", notes: `${SYNTHETIC_NAIC_MARKER} Insured: Synthetic.` },
    { id: "fake-two", provider: "Other Insurer", notes: `${SYNTHETIC_NAIC_MARKER} Insured: Synthetic.` },
    { id: "manual-same-provider", provider: "Prudential Financial", notes: null },
    { id: "manual-note", provider: "Other Insurer", notes: "Family supplied policy; NAIC contact suggested." },
    { id: "manual-empty", provider: "Other Insurer", notes: "" },
  ];
  assert.deepEqual(policies.filter(p => !isSyntheticNaicPolicy(p)).map(p => p.id),
    ["manual-same-provider", "manual-note", "manual-empty"]);
  assert.equal(isSyntheticNaicPolicy({ notes: `${SYNTHETIC_NAIC_MARKER} Status updated later.` }), true);
});

test("direct NAIC requests remain authenticated/admin-only and cannot run a search", async () => {
  const app = express();
  registerDisabledNaicSearch(app,
    (req, res, next) => req.headers["x-test-role"] ? next() : res.sendStatus(401),
    (req, res, next) => req.headers["x-test-role"] === "admin" ? next() : res.sendStatus(403),
  );
  const server = createServer(app);
  const socketPath = `/tmp/naic-safety-${process.pid}.sock`;
  server.listen(socketPath);
  await once(server, "listening");
  const call = (role?: string) => new Promise<{ status: number; body: string; cache: string | undefined }>((resolve, reject) => {
    const req = request({
      socketPath, path: "/api/admin/case/synthetic-case/naic-search", method: "POST",
      headers: role ? { "x-test-role": role } : {},
    }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({
        status: res.statusCode!, body, cache: res.headers["cache-control"],
      }));
    });
    req.on("error", reject);
    req.end();
  });
  try {
    assert.equal((await call()).status, 401);
    assert.equal((await call("family")).status, 403);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await call("admin");
      assert.equal(response.status, 503);
      assert.equal(response.cache, "private, no-store");
      const body = JSON.parse(response.body);
      assert.equal(body.code, "NAIC_NOT_CONNECTED");
      assert.match(body.error, /No policy search was performed/);
      assert.equal(body.policies, undefined);
      assert.equal(body.resultsCount, undefined);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("all existing case/report policy reads share the quarantine filter", () => {
  const storage = readFileSync("server/storage.ts", "utf8");
  const method = storage.slice(storage.indexOf("async getLifeInsurancePoliciesByCertificate"),
    storage.indexOf("async createLifeInsurancePolicy"));
  assert.match(method, /filter\(policy => !isSyntheticNaicPolicy\(policy\)\)/);
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.match(routes, /registerDisabledNaicSearch\(app, isAuthenticated, isAdmin\)/);
  assert.doesNotMatch(routes, /app\.post\("\/api\/admin\/case\/:certId\/naic-search"/);
  assert.doesNotMatch(routes, /PRU-8847291|Discovered via NAIC Life Insurance Policy Locator|const numExtra/);
});

test("NAIC control is disabled and no longer wired to a mutation", () => {
  const page = readFileSync("client/src/pages/case-detail.tsx", "utf8");
  const control = page.slice(page.indexOf("NAIC Life Insurance Policy Locator"),
    page.indexOf('data-testid="button-naic-search"') + 50);
  assert.match(control, /Disabled until a verified NAIC integration/);
  assert.match(control, /<Button\s+disabled/);
  assert.doesNotMatch(page, /naicSearchMutation|Click "Search NAIC"|using UDC Blockchain verification to discover/);
});
