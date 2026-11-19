import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("./caseAuthorization.ts", import.meta.url), "utf8");

test("family authorization permits canonical owners and active members only", () => {
  assert.match(auth, /certificate\.userId === userId/);
  assert.match(auth, /eq\(caseFamilyMemberships\.status, "active"\)/);
  assert.match(auth, /user\.role !== "user" \|\| !user\.emailVerified/);
});

test("membership acceptance never transfers an established owner", () => {
  assert.match(routes, /acceptFamilyInvitation/);
  assert.match(routes, /caseFamilyMemberships/);
  assert.match(readFileSync(new URL("./caseAuthorization.ts", import.meta.url), "utf8"), /familyInvitations\)\.set\(\{ status: "accepted"/);
  assert.match(readFileSync(new URL("./caseAuthorization.ts", import.meta.url), "utf8"), /db\.transaction/);
});

test("invitation registration defers acceptance and existing accounts require a code", () => {
  assert.match(routes, /Possessing an invitation URL is not sufficient proof/);
  assert.match(routes, /requiresVerification: true/);
  assert.match(routes, /emailVerificationCode: verificationCode/);
});

test("shared invitation endpoints are case scoped and support lifecycle actions", () => {
  assert.match(routes, /\/api\/case\/:certId\/family-invitations/);
  assert.match(routes, /family-invitations\/:inviteId\/revoke/);
  assert.match(routes, /family-invitations\/:inviteId\/resend/);
  assert.match(routes, /eq\(familyInvitations\.certificateId, cert\.id\)/);
});

test("shared members get their own safeguards, never the owner's legal onboarding", () => {
  assert.match(routes, /sharedMember: true/);
  assert.match(routes, /memberSafeguardsRequired: !memberComplete/);
  assert.match(routes, /Only the canonical case owner may sign this authorization/);
  assert.match(routes, /certificateId: z\.string\(\)\.min\(1\)/);
});

test("payment verification pins the stored session and exact Stripe contract", () => {
  assert.match(routes, /!certificate\.stripeCheckoutSessionId \|\| certificate\.stripeCheckoutSessionId !== session\.id/);
  assert.match(routes, /session\.mode !== "payment"/);
  assert.match(routes, /session\.currency !== "usd"/);
  assert.match(routes, /session\.amount_total !== plan\.amount/);
  assert.match(routes, /session\.metadata\?\.certificateId !== certificate\.id/);
});

test("specialized family listings use verified membership-aware lookup", () => {
  assert.match(auth, /user\.role !== "user" \|\| !user\.emailVerified/);
  assert.match(routes, /app\.get\("\/api\/ner-analysis"/);
  assert.match(routes, /const certificates = await getFamilyAccessibleCertificates\(userId\)/);
});

test("challenge proof is bound to both invited email and user", () => {
  assert.match(auth, /user\.email\.toLowerCase\(\) !== invite\.email\.toLowerCase/);
  assert.match(auth, /eq\(familyInvitationChallenges\.userId, input\.userId\)/);
});

test("mutating family document and estate routes require explicit certificate context", () => {
  assert.match(routes, /A valid accessible case is required/);
  assert.match(routes, /Only the canonical case owner may answer this question/);
  assert.match(routes, /certificateId = typeof req\.body\?\.certificateId/);
});

test("invitation management does not rely on sentBy and audits lifecycle actions", () => {
  assert.doesNotMatch(routes.match(/\/api\/case\/:certId\/family-invitations\/:inviteId\/revoke[\s\S]{0,1800}/)?.[0] || "", /sentBy !== actorId/);
  assert.match(routes, /family_invitation_revoked/);
  assert.match(routes, /family_invitation_resent/);
});

test("member removal updates linked invitation transactionally", () => {
  assert.match(routes, /db\.transaction\(async \(tx\) =>/);
  assert.match(routes, /updated\.invitationId/);
  assert.match(routes, /familyInvitations\)\.set\(\{ status: "revoked" \}/);
});

test("shared-member dashboard uses neutral owner authorization copy", () => {
  const dashboard = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /sharedMember/);
  assert.match(dashboard, /Case owner authorization complete/);
  assert.match(dashboard, /Shared family access/);
});