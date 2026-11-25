import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { registerDisabledRelativesSearch } from "./relativesSearchSafety";

test("relatives search stays authenticated and never reports invented results", async () => {
  const app = express();
  registerDisabledRelativesSearch(app,
    (req, res, next) => req.headers["x-test-role"] ? next() : res.sendStatus(401),
    (req, res, next) => req.headers["x-test-role"] === "admin" ? next() : res.sendStatus(403),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/admin/case/synthetic/relatives/search`;
  try {
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { "x-test-role": "family" } })).status, 403);
    const response = await fetch(url, { method: "POST", headers: { "x-test-role": "admin" } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.code, "RELATIVES_SEARCH_NOT_CONNECTED");
    assert.match(body.error, /No search was performed/);
    assert.equal(body.relatives, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
