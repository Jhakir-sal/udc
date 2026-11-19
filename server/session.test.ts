import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import type { User } from "@shared/models/auth";
import {
  getSession,
} from "./replit_integrations/auth/replitAuth";
import { createPasswordLoginHandler } from "./replit_integrations/auth/passwordLogin";
import { registerAuthRoutes } from "./replit_integrations/auth/routes";

function testUser(role: User["role"]): User {
  return {
    id: `${role}-1`,
    email: `${role}@example.com`,
    firstName: "Session",
    lastName: "Tester",
    profileImageUrl: null,
    role,
    funeralHomeId: null,
    passwordHash: "",
    phoneNumber: null,
    phoneVerified: true,
    phoneVerificationCode: null,
    phoneVerificationExpiry: null,
    phoneEnrollmentAttempts: 0,
    phoneEnrollmentWindowStartedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    emailVerificationCode: null,
    emailVerificationExpiry: null,
    idVerificationStatus: "not_started",
    stripeVerificationSessionId: null,
    idVerifiedAt: null,
    idVerifiedName: null,
    idOverrideBy: null,
    idOverrideByName: null,
    idOverrideAt: null,
    idOverrideNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("a successful proxied login establishes a session for the next browser request", async (t) => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  });

  const password = "Correct-password-123!";
  const user = testUser("planner");
  user.passwordHash = await bcrypt.hash(password, 4);

  const app = express();
  app.use(express.json());
  app.use(getSession(new session.MemoryStore()));
  app.post("/api/auth/login", createPasswordLoginHandler({
    getUserByEmail: async (email) => email === user.email ? user : undefined,
  }));
  registerAuthRoutes(app, {
    getUser: async (id) => id === user.id ? user : undefined,
  });

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const forwardedHeaders = { "X-Forwarded-Proto": "https" };

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      ...forwardedHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: user.email, password }),
  });
  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    success: true,
    destination: "/heartplan",
    permissions: ["heartplan:access"],
  });

  const setCookie = loginResponse.headers.get("set-cookie");
  assert.ok(setCookie, "successful login must return a session cookie");
  assert.match(setCookie, /\bSecure\b/i);
  assert.match(setCookie, /\bSameSite=Lax\b/i);

  const browserCookie = setCookie.split(";", 1)[0];
  for (let request = 0; request < 2; request += 1) {
    const authenticatedResponse = await fetch(`${baseUrl}/api/auth/user`, {
      headers: {
        ...forwardedHeaders,
        Cookie: browserCookie,
      },
    });
    assert.equal(authenticatedResponse.status, 200);
    const profile = await authenticatedResponse.json() as {
      id: string;
      role: string;
      destination: string;
    };
    assert.equal(profile.id, user.id);
    assert.equal(profile.role, "planner");
    assert.equal(profile.destination, "/heartplan");
  }
});