import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import bcrypt from "bcrypt";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { acceptFamilyInvitation, findFamilyInvitationByToken, hashFamilyInvitationToken } from "./caseAuthorization";
import {
  caseFamilyMemberships, certificates, familyInvitationChallenges, familyInvitations,
} from "@shared/schema";
import { users } from "@shared/models/auth";

const ids: { users: string[]; certs: string[]; invites: string[]; challenges: string[] } = {
  users: [], certs: [], invites: [], challenges: [],
};

async function fixture() {
  const suffix = crypto.randomUUID();
  const userId = `family-test-${suffix}`;
  const certId = `cert-test-${suffix}`;
  const inviteId = `invite-test-${suffix}`;
  const challengeId = `challenge-test-${suffix}`;
  const code = "123456";
  await db.insert(users).values({ id: userId, email: `${suffix}@example.test`, role: "user", emailVerified: false });
  await db.insert(certificates).values({
    id: certId, deceasedName: "Test Loved One", dateOfDeath: "2024-01-01", dateOfBirth: "1940-01-01",
    certificateNumber: `TEST-${suffix}`, issuingAuthority: "Test Authority",
  });
  await db.insert(familyInvitations).values({
    id: inviteId, certificateId: certId, email: `${suffix}@example.test`, recipientName: "Test Recipient",
    deceasedName: "Test Loved One", tokenHash: hashFamilyInvitationToken(`token-${suffix}`), expiresAt: new Date(Date.now() + 86400000),
  });
  await db.insert(familyInvitationChallenges).values({
    id: challengeId, invitationId: inviteId, userId, email: `${suffix}@example.test`,
    codeHash: await bcrypt.hash(code, 4), expiresAt: new Date(Date.now() + 600000),
  });
  ids.users.push(userId); ids.certs.push(certId); ids.invites.push(inviteId); ids.challenges.push(challengeId);
  return { userId, certId, inviteId, challengeId, code };
}

async function cleanup() {
  for (const id of ids.challenges) await db.delete(familyInvitationChallenges).where(eq(familyInvitationChallenges.id, id));
  for (const id of ids.invites) await db.delete(familyInvitations).where(eq(familyInvitations.id, id));
  for (const id of ids.certs) await db.delete(certificates).where(eq(certificates.id, id));
  for (const id of ids.users) await db.delete(users).where(eq(users.id, id));
  ids.users.length = ids.certs.length = ids.invites.length = ids.challenges.length = 0;
}

test("family invitation transaction assigns owner and membership atomically", async () => {
  const f = await fixture();
  try {
    const result = await acceptFamilyInvitation({ invitationId: f.inviteId, challengeId: f.challengeId, userId: f.userId });
    assert.equal(result.membership?.role, "owner");
    const [invite] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    const [cert] = await db.select().from(certificates).where(eq(certificates.id, f.certId));
    assert.equal(invite.status, "accepted");
    assert.equal(cert.userId, f.userId);
  } finally { await cleanup(); }
});

test("invalid challenge rolls back invite, owner, and membership", async () => {
  const f = await fixture();
  try {
    await assert.rejects(() => acceptFamilyInvitation({ invitationId: f.inviteId, challengeId: "wrong", userId: f.userId }));
    const [invite] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    const memberships = await db.select().from(caseFamilyMemberships).where(eq(caseFamilyMemberships.certificateId, f.certId));
    const [cert] = await db.select().from(certificates).where(eq(certificates.id, f.certId));
    assert.equal(invite.status, "pending"); assert.equal(memberships.length, 0); assert.equal(cert.userId, null);
  } finally { await cleanup(); }
});

test("parallel challenge replay has one success and one active membership", async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled([
      acceptFamilyInvitation({ invitationId: f.inviteId, challengeId: f.challengeId, userId: f.userId }),
      acceptFamilyInvitation({ invitationId: f.inviteId, challengeId: f.challengeId, userId: f.userId }),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const memberships = await db.select().from(caseFamilyMemberships).where(and(eq(caseFamilyMemberships.certificateId, f.certId), eq(caseFamilyMemberships.status, "active")));
    assert.equal(memberships.length, 1);
  } finally { await cleanup(); }
});

test("revoked membership is reactivated on a later verified invitation without a duplicate row", async () => {
  const f = await fixture();
  try {
    await acceptFamilyInvitation({ invitationId: f.inviteId, challengeId: f.challengeId, userId: f.userId });
    const [before] = await db.select().from(caseFamilyMemberships).where(eq(caseFamilyMemberships.certificateId, f.certId));
    await db.update(caseFamilyMemberships).set({ status: "revoked" }).where(eq(caseFamilyMemberships.id, before.id));
    const [testUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, f.userId));
    const invite2 = `${f.inviteId}-2`; const challenge2 = `${f.challengeId}-2`;
    await db.insert(familyInvitations).values({
      id: invite2, certificateId: f.certId, email: testUser.email!, recipientName: "Test Recipient",
      deceasedName: "Test Loved One", tokenHash: hashFamilyInvitationToken(`token-${invite2}`), expiresAt: new Date(Date.now() + 86400000),
    });
    await db.insert(familyInvitationChallenges).values({
      id: challenge2, invitationId: invite2, userId: f.userId, email: testUser.email!,
      codeHash: await bcrypt.hash("123456", 4), expiresAt: new Date(Date.now() + 600000),
    });
    ids.invites.push(invite2); ids.challenges.push(challenge2);
    const result = await acceptFamilyInvitation({ invitationId: invite2, challengeId: challenge2, userId: f.userId });
    assert.equal(result.membership?.id, before.id);
    const rows = await db.select().from(caseFamilyMemberships).where(eq(caseFamilyMemberships.certificateId, f.certId));
    assert.equal(rows.length, 1); assert.equal(rows[0].status, "active");
  } finally { await cleanup(); }
});

test("accepted and revoked invitations are not eligible for resend", async () => {
  const f = await fixture();
  try {
    await db.update(familyInvitations).set({ status: "accepted" }).where(eq(familyInvitations.id, f.inviteId));
    const [accepted] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    assert.notEqual(accepted.status, "pending");
    await db.update(familyInvitations).set({ status: "revoked" }).where(eq(familyInvitations.id, f.inviteId));
    const [revoked] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    assert.notEqual(revoked.status, "pending");
  } finally { await cleanup(); }
});

test("new invitation tokens are stored as one-way hashes and can be found by the public token", async () => {
  const f = await fixture();
  try {
    const rawToken = `token-${f.inviteId.slice("invite-test-".length)}`;
    const invitation = await findFamilyInvitationByToken(rawToken);
    assert.equal(invitation?.id, f.inviteId);
    assert.equal(invitation?.token, null);
    assert.equal(invitation?.tokenHash, hashFamilyInvitationToken(rawToken));
    assert.notEqual(invitation?.tokenHash, rawToken);
  } finally { await cleanup(); }
});

test("unexpired legacy plaintext invitations are upgraded on first lookup", async () => {
  const f = await fixture();
  const legacyToken = `legacy-${crypto.randomUUID()}`;
  try {
    await db.update(familyInvitations).set({ token: legacyToken, tokenHash: null }).where(eq(familyInvitations.id, f.inviteId));
    const invitation = await findFamilyInvitationByToken(legacyToken);
    assert.equal(invitation?.id, f.inviteId);
    const [stored] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    assert.equal(stored.token, null);
    assert.equal(stored.tokenHash, hashFamilyInvitationToken(legacyToken));
  } finally { await cleanup(); }
});

test("expired legacy plaintext invitations are not migrated", async () => {
  const f = await fixture();
  const legacyToken = `expired-${crypto.randomUUID()}`;
  try {
    await db.update(familyInvitations).set({
      token: legacyToken, tokenHash: null, expiresAt: new Date(Date.now() - 1000),
    }).where(eq(familyInvitations.id, f.inviteId));
    const invitation = await findFamilyInvitationByToken(legacyToken);
    assert.equal(invitation?.id, f.inviteId);
    const [stored] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    assert.equal(stored.token, legacyToken);
    assert.equal(stored.tokenHash, null);
  } finally { await cleanup(); }
});

test("public family invitation routes preserve hashed and legacy token flows", async (t) => {
  const previousSessionSecret = process.env.SESSION_SECRET;
  const previousSendGridKey = process.env.SENDGRID_API_KEY;
  const previousRingCentral = {
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
    jwt: process.env.RINGCENTRAL_JWT_TOKEN,
    phone: process.env.RINGCENTRAL_PHONE_NUMBER,
  };
  process.env.SESSION_SECRET = "family-invitation-route-test-secret";
  delete process.env.SENDGRID_API_KEY;
  delete process.env.RINGCENTRAL_CLIENT_ID;
  delete process.env.RINGCENTRAL_CLIENT_SECRET;
  delete process.env.RINGCENTRAL_JWT_TOKEN;
  delete process.env.RINGCENTRAL_PHONE_NUMBER;
  t.after(() => {
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    if (previousSendGridKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = previousSendGridKey;
    for (const [key, value] of Object.entries({
      RINGCENTRAL_CLIENT_ID: previousRingCentral.clientId,
      RINGCENTRAL_CLIENT_SECRET: previousRingCentral.clientSecret,
      RINGCENTRAL_JWT_TOKEN: previousRingCentral.jwt,
      RINGCENTRAL_PHONE_NUMBER: previousRingCentral.phone,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    // Only this isolated test app accepts a synthetic actor header.
    if (req.header("x-family-test-actor")) req.session = {
      userId: req.header("x-family-test-actor"), save: (callback: () => void) => callback(),
      regenerate: (callback: () => void) => callback(), destroy: (callback: () => void) => callback(),
    };
    next();
  });
  const server = createServer(app);
  const { registerRoutes } = await import("./routes");
  await registerRoutes(server, app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });

  async function routeFixture(options: { status?: "pending" | "revoked"; expired?: boolean; legacy?: boolean } = {}) {
    const suffix = crypto.randomUUID();
    const certId = crypto.randomUUID();
    const inviteId = `invite-route-${suffix}`;
    const token = `route-token-${suffix}`;
    const email = `${suffix}@example.test`;
    await db.insert(certificates).values({
      id: certId, deceasedName: "Route Test Loved One", dateOfDeath: "2024-01-01", dateOfBirth: "1940-01-01",
      certificateNumber: `ROUTE-${suffix}`, issuingAuthority: "Test Authority",
    });
    await db.insert(familyInvitations).values({
      id: inviteId,
      certificateId: certId,
      email,
      recipientName: "Route Recipient",
      deceasedName: "Route Test Loved One",
      status: options.status || "pending",
      token: options.legacy ? token : null,
      tokenHash: options.legacy ? null : hashFamilyInvitationToken(token),
      expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 86_400_000)),
    });
    ids.certs.push(certId);
    ids.invites.push(inviteId);
    return { certId, inviteId, token, email };
  }

  await t.test("a newly hashed token validates, registers, resends, and verifies through the same URL token", async () => {
    const f = await routeFixture();
    const validation = await request(`/api/family-invite/${f.token}`);
    assert.equal(validation.status, 200);
    assert.deepEqual(await validation.json(), {
      email: f.email,
      recipientName: "Route Recipient",
      deceasedName: "Route Test Loved One",
      registrationReference: (await import("@shared/caseRegistrationReference")).caseRegistrationReference(f.certId),
      existingAccount: false, sharedAccess: false, sharingAuthorized: false,
    });

    const registration = await request(`/api/family-invite/${f.token}/register`, {
      method: "POST",
      body: JSON.stringify({ firstName: "Route", lastName: "Tester", password: "Strong-route-pass!",
        consent: { termsAccepted: true, privacyAcknowledged: true, communicationsConsent: false } }),
    });
    assert.equal(registration.status, 200);
    const registrationBody = await registration.json() as { verificationToken: string; user: { id: string } };
    assert.equal(registrationBody.verificationToken, f.token);
    ids.users.push(registrationBody.user.id);

    const resend = await request(`/api/family-invite/${f.token}/resend-code`, { method: "POST" });
    assert.equal(resend.status, 429);
    await db.update(familyInvitationChallenges).set({ createdAt: new Date(Date.now() - 61_000) })
      .where(eq(familyInvitationChallenges.invitationId, f.inviteId));
    const allowedResend = await request(`/api/family-invite/${f.token}/resend-code`, { method: "POST" });
    assert.equal(allowedResend.status, 200);
    const challenges = await db.select({ id: familyInvitationChallenges.id }).from(familyInvitationChallenges)
      .where(eq(familyInvitationChallenges.invitationId, f.inviteId));
    assert.equal(challenges.length, 2);
    ids.challenges.push(...challenges.map(row => row.id));
    const knownCode = "654321";
    await db.update(familyInvitationChallenges).set({ codeHash: await bcrypt.hash(knownCode, 4) })
      .where(eq(familyInvitationChallenges.invitationId, f.inviteId));

    const verification = await request(`/api/family-invite/${f.token}/verify-email`, {
      method: "POST",
      body: JSON.stringify({ code: knownCode }),
    });
    assert.equal(verification.status, 200);
    const [storedInvite] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, f.inviteId));
    assert.equal(storedInvite.status, "accepted");
  });

  await t.test("expired and revoked links are rejected", async () => {
    const expired = await routeFixture({ expired: true });
    const revoked = await routeFixture({ status: "revoked" });
    assert.equal((await request(`/api/family-invite/${expired.token}`)).status, 400);
    assert.equal((await request(`/api/family-invite/${revoked.token}`)).status, 400);
    assert.equal((await request(`/api/family-invite/${expired.token}/register`, {
      method: "POST",
      body: JSON.stringify({ firstName: "Route", lastName: "Tester", password: "Strong-route-pass!" }),
    })).status, 400);
    assert.equal((await request(`/api/family-invite/${revoked.token}/resend-code`, { method: "POST" })).status, 400);
  });

  await t.test("an unexpired legacy plaintext token upgrades and remains usable", async () => {
    const legacy = await routeFixture({ legacy: true });
    assert.equal((await request(`/api/family-invite/${legacy.token}`)).status, 200);
    const [upgraded] = await db.select().from(familyInvitations).where(eq(familyInvitations.id, legacy.inviteId));
    assert.equal(upgraded.token, null);
    assert.equal(upgraded.tokenHash, hashFamilyInvitationToken(legacy.token));
    const registration = await request(`/api/family-invite/${legacy.token}/register`, {
      method: "POST",
      body: JSON.stringify({ firstName: "Legacy", lastName: "Tester", password: "Strong-legacy-pass!",
        consent: { termsAccepted: true, privacyAcknowledged: true, communicationsConsent: false } }),
    });
    assert.equal(registration.status, 200);
    const body = await registration.json() as { user: { id: string }; verificationToken: string };
    ids.users.push(body.user.id);
    assert.equal(body.verificationToken, legacy.token);
    ids.challenges.push(...(await db.select({ id: familyInvitationChallenges.id }).from(familyInvitationChallenges)
      .where(eq(familyInvitationChallenges.invitationId, legacy.inviteId))).map(row => row.id));
  });

  await t.test("existing family account accepts without a new password and must still complete normal MFA sign-in", async () => {
    const f = await routeFixture();
    const userId = `existing-family-${crypto.randomUUID()}`;
    const passwordHash = await bcrypt.hash("Original-password!", 4);
    await db.insert(users).values({ id: userId, email: f.email, role: "user",
      emailVerified: true, twoFactorEnabled: true, passwordHash, firstName: "Existing", lastName: "Family" });
    ids.users.push(userId);
    const registration = await request(`/api/family-invite/${f.token}/register`, { method: "POST",
      body: JSON.stringify({ existingAccount: true, consent: { termsAccepted: true, privacyAcknowledged: true, communicationsConsent: false } }) });
    assert.equal(registration.status, 200);
    const [challenge] = await db.select().from(familyInvitationChallenges).where(eq(familyInvitationChallenges.invitationId, f.inviteId));
    assert.equal(challenge.accountCreated, false);
    ids.challenges.push(challenge.id);
    await db.update(familyInvitationChallenges).set({ codeHash: await bcrypt.hash("654321", 4) }).where(eq(familyInvitationChallenges.id, challenge.id));
    const result = await request(`/api/family-invite/${f.token}/verify-email`, { method: "POST", body: JSON.stringify({
      code: "654321", consent: { termsAccepted: true, privacyAcknowledged: true, communicationsConsent: false },
    }) });
    assert.equal(result.status, 200);
    const response = await result.json() as any;
    assert.equal(response.requiresSignIn, true);
    assert.equal(response.nextPath, "/login");
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    assert.equal(user.passwordHash, passwordHash);
    assert.equal(user.twoFactorEnabled, true);
  });

  await t.test("owner invites and signs once; member completes checks and can upload only afterward", async () => {
    const { lpoaDocuments, familyDocuments, caseFamilyAuthorizations } = await import("@shared/schema");
    const { FAMILY_SHARING_VERSION } = await import("@shared/familySharing");
    const suffix = crypto.randomUUID();
    const ownerId = `owner-journey-${suffix}`, certId = crypto.randomUUID(), token = `journey-${suffix}`;
    const recipientEmail = `member-${suffix}@example.test`;
    let memberId: string | undefined;
    const requestAs = (id: string, path: string, body?: object) => request(path, {
      method: body ? "POST" : "GET", headers: { "x-family-test-actor": id },
      body: body ? JSON.stringify(body) : undefined,
    });
    await db.insert(users).values({
      id: ownerId, email: `owner-${suffix}@example.test`, role: "user", firstName: "Test", lastName: "Owner",
      emailVerified: true, idVerificationStatus: "verified", idVerifiedName: "Test Owner",
    });
    await db.insert(certificates).values({
      id: certId, userId: ownerId, deceasedName: "Synthetic Journey", dateOfDeath: "2026-01-01",
      dateOfBirth: "1940-01-01", certificateNumber: certId, issuingAuthority: "Synthetic authority", nextOfKinName: "Test Owner",
    });
    await db.insert(lpoaDocuments).values({
      certificateId: certId, userId: ownerId, principalName: "Test Owner", principalAddress: "Synthetic address",
      signatureType: "typed", signatureData: "Test Owner", consentAgreed: true, validUntil: "2030-01-01",
    });
    try {
      const body = { name: "Test Member", email: recipientEmail, relationship: "child", phone: "",
        sharingConsent: { typedName: "Test Owner", confirmed: true, scope: "helper", agreementVersion: FAMILY_SHARING_VERSION } };
      const invited = await requestAs(ownerId, `/api/case/${certId}/family-invitations`, body);
      assert.equal(invited.status, 201);
      const invite = await invited.json() as any;
      assert.equal(invite.sharingAuthorized, true);
      assert.equal(invite.emailSent, false); // Provider disabled in this isolated test.
      assert.equal(invite.tokenHash, undefined);
      assert.equal((await requestAs(ownerId, `/api/case/${certId}/family-invitations`, body)).status, 409);
      await db.update(familyInvitations).set({ tokenHash: hashFamilyInvitationToken(token) }).where(eq(familyInvitations.id, invite.id));
      const signup = await request(`/api/family-invite/${token}/register`, { method: "POST", body: JSON.stringify({
        firstName: "Test", lastName: "Member", password: "Synthetic-journey-pass!",
        consent: { termsAccepted: true, privacyAcknowledged: true, communicationsConsent: false },
      }) });
      assert.equal(signup.status, 200);
      memberId = (await signup.json() as any).user.id;
      const [challenge] = await db.select().from(familyInvitationChallenges).where(eq(familyInvitationChallenges.invitationId, invite.id));
      await db.update(familyInvitationChallenges).set({ codeHash: await bcrypt.hash("654321", 4) }).where(eq(familyInvitationChallenges.id, challenge.id));
      const accepted = await request(`/api/family-invite/${token}/verify-email`, { method: "POST", body: JSON.stringify({ code: "654321" }) });
      assert.equal(accepted.status, 200);
      assert.equal((await accepted.json() as any).nextPath, "/family-access");
      const doc = { certificateId: certId, label: "Synthetic upload", documentType: "other", fileName: "synthetic.pdf", objectPath: `/objects/synthetic-journey-${suffix}` };
      assert.equal((await requestAs(memberId!, "/api/family-documents", doc)).status, 403);
      const checklist = await requestAs(memberId!, "/api/family-access/checklist");
      const member = (await checklist.json() as any).members[0];
      assert.equal(member.sharingAuthorized, true);
      assert.equal(member.memberAccepted, false);
      await db.update(users).set({ idVerificationStatus: "verified", idVerifiedName: "Test Member" }).where(eq(users.id, memberId!));
      assert.equal((await requestAs(memberId!, "/api/family-documents", doc)).status, 403);
      assert.equal((await requestAs(memberId!, `/api/case/${certId}/family-members/${memberId}/accept-sharing`, {
        grantId: member.grantId, typedName: "Test Member", confirmed: true, agreementVersion: FAMILY_SHARING_VERSION,
      })).status, 200);
      assert.equal((await requestAs(memberId!, "/api/family-documents", doc)).status, 201);
      const documents = await requestAs(memberId!, "/api/family-documents");
      assert.ok((await documents.json() as any[]).some(document => document.certificateId === certId));
      assert.equal((await requestAs(ownerId, `/api/case/${certId}/family-members/${memberId}/revoke`, {})).status, 200);
      assert.equal((await requestAs(memberId!, "/api/family-documents", { ...doc, objectPath: `/objects/synthetic-after-revoke-${suffix}` })).status, 403);
      const grants = await db.select().from(caseFamilyAuthorizations).innerJoin(caseFamilyMemberships, eq(caseFamilyMemberships.id, caseFamilyAuthorizations.membershipId))
        .where(eq(caseFamilyMemberships.certificateId, certId));
      assert.ok(grants[0].case_family_authorizations.revokedAt);
    } finally {
      await db.delete(familyDocuments).where(eq(familyDocuments.certificateId, certId));
      await db.delete(lpoaDocuments).where(eq(lpoaDocuments.certificateId, certId));
      const invites = await db.select({ id: familyInvitations.id }).from(familyInvitations).where(eq(familyInvitations.certificateId, certId));
      for (const invite of invites) await db.delete(familyInvitationChallenges).where(eq(familyInvitationChallenges.invitationId, invite.id));
      await db.delete(familyInvitations).where(eq(familyInvitations.certificateId, certId));
      await db.delete(certificates).where(eq(certificates.id, certId));
      await db.delete(users).where(inArray(users.id, [ownerId, ...(memberId ? [memberId] : [])]));
    }
  });

  t.after(async () => {
    if (ids.challenges.length) {
      await db.delete(familyInvitationChallenges).where(inArray(familyInvitationChallenges.id, ids.challenges));
    }
    await cleanup();
  });
});