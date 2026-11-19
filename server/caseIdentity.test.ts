import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateCaseIdentity, legalNamesMatch, normalizeLegalName } from "@shared/legalName";
import {
  classifyIdProviderUnavailability,
  issueIdentityFallbackGrant,
  usableIdentityFallbackGrant,
  validIdentityFallbackGrant,
} from "./idVerificationFallback";

test("normalizes case, accents, punctuation, and repeated whitespace deterministically", () => {
  assert.equal(normalizeLegalName("  José   O’Neill-Smith, Jr. "), "jose o neill smith jr");
  assert.equal(
    legalNamesMatch("Élodie St. James", "elodie st james"),
    true,
  );
});

test("does not treat a meaningful partial-name difference as a match", () => {
  assert.equal(legalNamesMatch("Alex Morgan", "Alex Jordan Morgan"), false);
  assert.equal(legalNamesMatch("Taylor Smith", "Taylor Smyth"), false);
  assert.equal(legalNamesMatch("", ""), false);
});

test("classifies only genuine Stripe provider outages", () => {
  assert.equal(
    classifyIdProviderUnavailability(null, { noClient: true, production: true }),
    "stripe_not_configured",
  );
  assert.equal(classifyIdProviderUnavailability({ type: "StripeConnectionError" }), "stripe_connection_error");
  assert.equal(classifyIdProviderUnavailability({ type: "StripeRateLimitError", statusCode: 429 }), "stripe_rate_limited");
  assert.equal(classifyIdProviderUnavailability({ type: "StripeAPIError", statusCode: 503 }), "stripe_server_error");
  assert.equal(classifyIdProviderUnavailability({ code: "api_key_expired", statusCode: 401 }), "stripe_key_expired");
  assert.equal(
    classifyIdProviderUnavailability({ type: "StripePermissionError", statusCode: 403 }),
    "stripe_identity_unavailable",
  );
  assert.equal(
    classifyIdProviderUnavailability({
      type: "StripeInvalidRequestError",
      statusCode: 400,
      message: "Identity Verification Sessions are not available for this account until Identity is enabled.",
    }),
    "stripe_identity_unavailable",
  );
  for (const error of [
    { type: "StripeInvalidRequestError", statusCode: 400 },
    { type: "StripeInvalidRequestError", statusCode: 400, message: "No such customer" },
    { code: "resource_missing", statusCode: 404 },
    { code: "verification_failed", statusCode: 402 },
    { code: "user_canceled" },
    { message: "document mismatch" },
    { statusCode: 429, message: "unrelated rate limit" },
    { statusCode: 503, message: "unrelated dependency unavailable" },
  ]) {
    assert.equal(classifyIdProviderUnavailability(error), null);
  }
});

test("a server-observed verified result with no legal name can use the audited fallback", () => {
  const session: Record<string, unknown> = {};
  const grant = issueIdentityFallbackGrant(
    session,
    "jack",
    "stripe_verified_name_missing",
    1_000,
  );
  assert.equal(grant.reason, "stripe_verified_name_missing");
  assert.equal(
    validIdentityFallbackGrant(session, "jack", 1_001)?.reason,
    "stripe_verified_name_missing",
  );

  const persisted = evaluateCaseIdentity({
    idVerificationStatus: "verified",
    idVerifiedName: null,
    accountName: "Jack Lucido",
    nextOfKinName: "Jack Lucido",
    informantName: null,
    lpoaDocuments: [{
      id: "missing-name-fallback",
      principalName: "Jack Lucido",
      status: "active",
      identitySource: "self_attested_provider_unavailable",
      identityFallbackReason: "stripe_verified_name_missing",
      identityAttestedAt: new Date(),
    }],
  });
  assert.equal(persisted.complete, true);
  assert.equal(persisted.identitySource, "self_attested_provider_unavailable");
});

test("fallback grants are server-issued, user-bound, and expire", () => {
  const session: Record<string, unknown> = {};
  assert.equal(validIdentityFallbackGrant(session, "jack", 1_000), null);
  issueIdentityFallbackGrant(session, "jack", "stripe_connection_error", 1_000);
  assert.equal(validIdentityFallbackGrant(session, "other", 1_001), null);
  assert.equal(validIdentityFallbackGrant(session, "jack", 1_001)?.reason, "stripe_connection_error");
  assert.equal(validIdentityFallbackGrant(session, "jack", 31 * 60 * 1000), null);
  assert.equal(
    usableIdentityFallbackGrant(session, "jack", "failed", 1_001),
    null,
  );
  issueIdentityFallbackGrant(session, "jack", "stripe_verification_failed", 2_000);
  assert.equal(
    usableIdentityFallbackGrant(session, "jack", "failed", 2_001)?.reason,
    "stripe_verification_failed",
  );
});

test("securely persisted provider-outage identity requires exact Jack Lucido alignment", () => {
  const aligned = evaluateCaseIdentity({
    idVerificationStatus: "pending",
    idVerifiedName: null,
    accountName: " Jack   Lucido ",
    nextOfKinName: "JACK LUCIDO",
    informantName: null,
    lpoaDocuments: [{
      id: "fallback",
      principalName: "Jack Lucido",
      status: "active",
      identitySource: "self_attested_provider_unavailable",
      identityFallbackReason: "stripe_connection_error",
      identityAttestedAt: new Date(),
    }],
  });
  assert.equal(aligned.complete, true);
  assert.equal(aligned.identitySource, "self_attested_provider_unavailable");

  for (const accountName of ["Jack", "Jack Luciano"]) {
    const mismatch = evaluateCaseIdentity({
      idVerificationStatus: "pending",
      idVerifiedName: null,
      accountName,
      nextOfKinName: "Jack Lucido",
      informantName: null,
      lpoaDocuments: [{
        id: "fallback",
        principalName: "Jack Lucido",
        status: "active",
        identitySource: "self_attested_provider_unavailable",
        identityFallbackReason: "stripe_connection_error",
        identityAttestedAt: new Date(),
      }],
    });
    assert.equal(mismatch.complete, false);
  }
});

test("a failed ID check remains unverified even when legal-name attestation completes the case", () => {
  const result = evaluateCaseIdentity({
    idVerificationStatus: "failed",
    idVerifiedName: null,
    accountName: "Jack Lucido",
    nextOfKinName: "Jack Lucido",
    informantName: null,
    lpoaDocuments: [{
      id: "failed-id-attestation",
      principalName: "Jack Lucido",
      status: "active",
      identitySource: "self_attested_provider_unavailable",
      identityFallbackReason: "stripe_verification_failed",
      identityAttestedAt: new Date(),
    }],
  });
  assert.equal(result.complete, true);
  assert.equal(result.identitySource, "self_attested_provider_unavailable");
});

test("relationship override cannot authorize a self-attested wrong signer", () => {
  const result = evaluateCaseIdentity({
    idVerificationStatus: "failed",
    idVerifiedName: null,
    accountName: "Jack Lucido",
    nextOfKinName: "Someone Else",
    informantName: null,
    relationshipOverrideApproved: true,
    lpoaDocuments: [{
      id: "fallback",
      principalName: "Jack Lucido",
      status: "active",
      identitySource: "self_attested_provider_unavailable",
      identityFallbackReason: "stripe_server_error",
      identityAttestedAt: new Date(),
    }],
  });
  assert.equal(result.identitySource, null);
  assert.equal(result.complete, false);
});

test("LPOA route does not trust a browser fallback claim", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.post("/api/onboarding/lpoa/sign"');
  const end = routes.indexOf("// View own signed LPOA", start);
  const handler = routes.slice(start, end);
  assert.match(handler, /usableIdentityFallbackGrant\(/);
  assert.match(handler, /const usesFallback = !stripeVerifiedName && !!fallbackGrant/);
  assert.doesNotMatch(handler, /fallbackGrant \|\| persistedFallback/);
  assert.match(handler, /usesFallback && !data\.identityFallbackAttested/);
  assert.match(handler, /legalNamesMatch\(data\.signatureData, canonicalLegalName\)/);
  assert.match(handler, /certificateNameMatchesAccount/);
  assert.doesNotMatch(handler, /req\.body\.identitySource/);
});

test("verified ID without an extracted name issues a name-attestation grant on the first status refresh", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.get("/api/onboarding/status"');
  const end = routes.indexOf('app.post("/api/onboarding/lpoa/sign"', start);
  const handler = routes.slice(start, end);
  assert.match(handler, /if \(verifiedName\) clearIdentityFallbackGrant\(req\.session as any\);\s*else issueIdentityFallbackGrant\(req\.session as any, userId, "stripe_verified_name_missing"\)/);
});

test("requires the verified ID, certificate relationship, account name, and active LPOA to align", () => {
  const result = evaluateCaseIdentity({
    idVerificationStatus: "verified",
    idVerifiedName: "Maria de la Cruz",
    accountName: "María de la Cruz",
    nextOfKinName: "MARIA DE LA CRUZ",
    informantName: null,
    lpoaDocuments: [
      { id: "doc-1", principalName: "Maria de la Cruz", status: "active" },
    ],
  });

  assert.equal(result.complete, true);
  assert.equal(result.certificateMatch, "next_of_kin");
  assert.equal(result.lpoaMatchesId, true);
  assert.deepEqual(result.issues, []);
});

test("case-specific concierge authorization resolves profile and certificate differences but not a wrong LPOA signer", () => {
  const authorized = evaluateCaseIdentity({
    idVerificationStatus: "verified",
    idVerifiedName: "Jordan Lee",
    accountName: "Jordan Lee-Santos",
    nextOfKinName: "Morgan Lee",
    informantName: "Morgan Lee",
    relationshipOverrideApproved: true,
    lpoaDocuments: [
      { id: "doc-1", principalName: "Jordan Lee", status: "active" },
    ],
  });
  assert.equal(authorized.complete, true);
  assert.equal(authorized.reviewRequired, false);

  const wrongSigner = evaluateCaseIdentity({
    idVerificationStatus: "verified",
    idVerifiedName: "Jordan Lee",
    accountName: "Jordan Lee-Santos",
    nextOfKinName: "Morgan Lee",
    informantName: "Morgan Lee",
    relationshipOverrideApproved: true,
    lpoaDocuments: [
      { id: "doc-1", principalName: "Morgan Lee", status: "active" },
    ],
  });
  assert.equal(wrongSigner.complete, false);
  assert.equal(wrongSigner.lpoaNeedsReplacement, true);
  assert.ok(wrongSigner.issues.includes("lpoa_name_mismatch"));
});

test("a replacement-required LPOA is not treated as active", () => {
  const result = evaluateCaseIdentity({
    idVerificationStatus: "verified",
    idVerifiedName: "Sam Rivera",
    accountName: "Sam Rivera",
    nextOfKinName: "Sam Rivera",
    informantName: null,
    lpoaDocuments: [
      { id: "old", principalName: "Sam Rivera", status: "replacement_required" },
    ],
  });
  assert.equal(result.activeLpoa, null);
  assert.equal(result.lpoaNeedsReplacement, true);
  assert.equal(result.complete, false);
});

test("identity and LPOA concierge mutation routes require authentication and admin access", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const route of [
    "/api/admin/case/:certId/family-accounts/:userId/identity-override",
    "/api/admin/case/:certId/family-accounts/:userId/lpoa-request",
  ]) {
    assert.match(
      routes,
      new RegExp(
        `app\\.post\\(\\s*"${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",\\s*isAuthenticated,\\s*isAdmin,`,
      ),
    );
  }
  assert.match(routes, /legalNamesMatch\(data\.principalName, canonicalLegalName\)/);
  assert.match(routes, /certificate\.userId !== familyUser\.id/);
});

test("concierge APIs do not expose raw Stripe identity payloads or document links", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.get("/api/admin/family-accounts/:userId/id-document"');
  const end = routes.indexOf("// Concierge manual override", start);
  const handler = routes.slice(start, end);
  assert.match(handler, /status\(410\)/);
  assert.doesNotMatch(handler, /verificationSessions\.retrieve/);
  assert.doesNotMatch(handler, /fileLinks\.create/);
  assert.doesNotMatch(handler, /imageUrls|dateOfBirth|dob/);
});