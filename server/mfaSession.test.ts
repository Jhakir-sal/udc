import test from "node:test";
import assert from "node:assert/strict";
import type { User } from "@shared/models/auth";
import { createPasswordLoginHandler } from "./auth/passwordLogin";

for (const channel of ["sms", "email"] as const) {
  test(`password MFA persists the ${channel} delivery method without creating an authenticated session`, async () => {
    const user = {
      id: `synthetic-${channel}`,
      email: `synthetic-${channel}@example.invalid`,
      passwordHash: "synthetic-hash",
      role: "admin",
      emailVerified: true,
      phoneVerified: channel === "sms",
      phoneNumber: channel === "sms" ? "+15555550123" : null,
      twoFactorEnabled: true,
    } as User;
    let saved = false;
    let result: any;
    const req = {
      body: { email: user.email, password: "synthetic-password" },
      ip: "synthetic-ip",
      session: { save: (callback: (error?: Error) => void) => { saved = true; callback(); } },
    } as any;
    const handler = createPasswordLoginHandler({
      getUserByEmail: async () => user,
      comparePassword: async () => true,
      sendMfaChallenge: async () => channel,
      onAuthenticated: async () => { throw new Error("MFA must precede authentication"); },
    });
    await handler(req, { json: (body: any) => { result = body; }, status: () => { throw new Error("Unexpected failure"); } } as any, () => {});
    assert.equal(saved, true);
    assert.equal(req.session.pending2FAUserId, user.id);
    assert.equal(req.session.mfaSentVia, channel);
    assert.equal(req.session.userId, undefined);
    assert.equal(result.requires2FA, true);
    assert.equal(result.sentVia, channel);
    assert.equal(result.smsAvailable, channel === "sms");
    assert.equal(result.emailAvailable, true);
    assert.equal(result.destination.includes("+15555550123"), false);
  });
}
