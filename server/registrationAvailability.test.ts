import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registrationAvailability } from "./registrationAvailability";

test("production registration rejects missing email delivery before creating an account", async () => {
  const previous = process.env.NODE_ENV;
  const app = express();
  let created = 0;
  app.post("/register", registrationAvailability(() => false), (_req, res) => {
    created++;
    res.sendStatus(201);
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    process.env.NODE_ENV = "production";
    const unavailable = await fetch(`http://127.0.0.1:${address.port}/register`, { method: "POST" });
    assert.equal(unavailable.status, 503);
    assert.match((await unavailable.json()).error, /verification email is not configured/i);
    assert.equal(created, 0);

    process.env.NODE_ENV = "test";
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/register`, { method: "POST" })).status, 201);
    assert.equal(created, 1);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("configured email allows production registration to proceed", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const app = express();
  app.post("/register", registrationAvailability(() => true), (_req, res) => res.sendStatus(201));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/register`, { method: "POST" })).status, 201);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
