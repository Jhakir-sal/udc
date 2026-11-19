import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("funeral-home invitation management uses the verified case manager, not a session role claim", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf("const canManageInviteCase =");
  const end = routes.indexOf('app.get("/api/funeral-home-upload/:token"', start);
  assert.ok(start >= 0 && end > start);
  const invitationRoutes = routes.slice(start, end);

  assert.ok(invitationRoutes.includes("canManageFamilyCase(req, certificate)"));
  assert.doesNotMatch(invitationRoutes.slice(0, invitationRoutes.indexOf("const inviteByToken")), /req\.user\?\.role|claims\?\.role/);
  assert.equal(
    (invitationRoutes.match(/await canManageInviteCase\(req, certificate\)/g) || []).length,
    4,
    "send, list, revoke, and resend must all await the same authorization check",
  );
});

test("funeral-home upload creates its private object before attaching it to the case", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.post("/api/funeral-home-upload/:token"');
  const end = routes.indexOf("// Stripe clients are created per-request", start);
  assert.ok(start >= 0 && end > start);
  const upload = routes.slice(start, end);
  assert.match(upload, /await objectService\.writeObjectEntity\(objectPath, body, mime\)/);
  assert.doesNotMatch(upload, /getObjectEntityFile\(objectPath\)/, "a new object does not exist yet");
  assert.match(upload, /await objectService\.deleteObjectEntity\(objectPath\)/);
  assert.match(upload, /aiVerificationStatus: "pending"/);
});