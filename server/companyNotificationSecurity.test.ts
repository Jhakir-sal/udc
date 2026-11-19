import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emailMatchesOfficialDomain, generateOpaqueSecureRecordId, generateReleaseToken, hashSecret, minimalDeathNoticePayload } from "./companyNotificationSecurity";

test("company email matching requires the exact official domain", () => {
  assert.equal(emailMatchesOfficialDomain("agent@verizon.com", "verizon.com"), true);
  assert.equal(emailMatchesOfficialDomain("agent@sub.verizon.com", "verizon.com"), false);
  assert.equal(emailMatchesOfficialDomain("agent@verizon.com.evil.test", "verizon.com"), false);
});

test("release secrets are opaque and stored as one-way hashes", () => {
  const token = generateReleaseToken();
  assert.ok(token.length >= 40);
  assert.notEqual(token, hashSecret(token));
  assert.equal(hashSecret(token), hashSecret(token));
  assert.match(generateOpaqueSecureRecordId(), /^SAL-[A-Za-z0-9_-]+$/);
});

test("minimal notice payload excludes sensitive case fields", () => {
  const payload = minimalDeathNoticePayload({ companyName: "Example", secureRecordId: "SAL-test", portalUrl: "https://example.test/portal" });
  assert.deepEqual(Object.keys(payload).sort(), ["companyName", "portalUrl", "secureRecordId", "statement"].sort());
  assert.doesNotMatch(JSON.stringify(payload), /ssn|dob|certificate|accountNumber|documentUrl/i);
});

test("company portal source guards sensitive state transitions", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /inArray\(companyDeathNotices\.status, \["sent", "acknowledged"\]\)/);
  assert.match(routes, /eq\(certificateAccessRequests\.requesterUserId, userId\)/);
  assert.match(routes, /certificateReleaseGrants\.revokedAt/);
  assert.match(routes, /company-notices\/access-requests\/:id\/reissue/);
  assert.match(routes, /releaseDeliveryStatus/);
  assert.match(routes, /hasVerifiedCompanyRouting/);
});

test("an existing certificate-only approval never authorizes an LPOA package", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  const request = routes.slice(routes.indexOf('app.post("/api/company-portal/notices/:id/access-requests"'), routes.indexOf('app.get("/api/admin/company-notices/access-requests"'));
  const download = routes.slice(routes.indexOf('app.get("/api/company-portal/releases/:token/download"'), routes.indexOf("// WEBHOOK/PUSH NOTIFICATION APIs"));
  assert.match(schema, /releaseScope: text\("release_scope"\)\.notNull\(\)\.default\("certificate"\)/);
  assert.match(request, /locked\.releaseScope !== "certificate"/);
  assert.match(request, /status: "pending".*purpose: parsed\.data\.purpose/);
  assert.match(request, /certificateReleaseGrants\)\.set\(\{ revokedAt:/);
  assert.match(download, /request\.releaseScope === "package"/);
  assert.match(download, /releasableCompanyLpoa/);
  assert.match(download, /buildCompanyDocumentPackage/);
  assert.match(download, /eq\(certificateAccessRequests\.requesterUserId, userId\)/);
  assert.match(download, /freshLpoa\.id !== lpoa\?\.id/);
  assert.match(routes, /eq\(certificateAccessRequests\.releaseScope, current\.request\.releaseScope\)/);
  assert.match(routes, /grant\.expiresAt <= new Date\(\)/);
  assert.match(routes, /locked\.releaseDeliveryStatus === "sending"/);
});

test("notice creation locks and revalidates account company assignment", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const noticeRoute = routes.slice(routes.indexOf('app.post("/api/company-notices"'));
  assert.match(noticeRoute, /db\.transaction\(async \(tx\)/);
  assert.match(noticeRoute, /\.for\("update"\)/);
  assert.match(noticeRoute, /isNull\(connectedAccounts\.companyId\)/);
  assert.match(noticeRoute, /reReadAccount\.companyId !== parsed\.data\.companyId/);
});

test("routing recovery is authorized, draft-only, audited, and never sends email", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const refresh = routes.slice(
    routes.indexOf('app.post("/api/company-notices/:id/refresh-routing"'),
    routes.indexOf('app.post("/api/company-notices/:id/send"'),
  );
  assert.match(refresh, /isAuthenticated/);
  assert.match(refresh, /actor\?\.role !== "admin".*verifyCertificateOwnership/);
  assert.match(refresh, /certificate\?\.status !== "verified"/);
  assert.match(refresh, /hasVerifiedCompanyRouting\(row\.company\)/);
  assert.match(refresh, /eq\(companyDeathNotices\.status, "draft"\)/);
  assert.match(refresh, /destinationEmail: row\.company\.notificationEmail/);
  assert.match(refresh, /notice_routing_refreshed/);
  assert.match(refresh, /sent: false/);
  assert.doesNotMatch(refresh, /sendEmail|sendCompanyDeathNotice|status: "sent"/);
  const send = routes.slice(
    routes.indexOf('app.post("/api/company-notices/:id/send"'),
    routes.indexOf('app.get("/api/company-portal/notices"'),
  );
  assert.match(send, /row\.notice\.destinationEmail !== row\.company\.notificationEmail/);
});