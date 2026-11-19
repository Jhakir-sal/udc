import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("family dashboard distinguishes verified ID, fallback identity, and LPOA status", () => {
  const dashboard = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

  assert.ok(dashboard.includes('queryKey: ["/api/onboarding/status"]'));
  assert.ok(dashboard.includes('data-testid="status-family-id-verification"'));
  assert.ok(dashboard.includes('"ID verified"'));
  assert.ok(dashboard.includes('"Identity attested"'));
  assert.ok(dashboard.includes('"ID check unsuccessful"'));
  assert.ok(dashboard.includes('data-testid="button-continue-identity-attestation"'));
  assert.ok(dashboard.includes('data-testid="card-lpoa-action-required"'));
  assert.ok(dashboard.includes('data-testid="button-complete-lpoa"'));
  assert.ok(dashboard.includes('"Complete your Limited Power of Attorney"'));
  assert.ok(dashboard.includes('data-testid="status-family-lpoa"'));
  assert.ok(dashboard.includes('"Completed"'));
  assert.ok(dashboard.includes("Valid through"));
});

test("an ID fallback may return to the dashboard without reopening the ID check", () => {
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../client/src/pages/onboarding.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

  assert.ok(app.includes("mayReturnToDashboardAfterIdFailure"));
  assert.ok(app.includes("!!onboardingQuery.data.idVerificationFallbackAvailable"));
  assert.ok(onboarding.includes('{ returnPath: "/" }'));
  assert.ok(routes.includes('req.body?.returnPath === "/"'));
});

test("LPOA imports the verified ID name, permits correcting the field, and submits the linked case", () => {
  const onboarding = readFileSync(new URL("../client/src/pages/onboarding.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.get("/api/onboarding/status"');
  const end = routes.indexOf('app.post("/api/onboarding/lpoa/sign"', start);
  const handler = routes.slice(start, end);
  assert.ok(onboarding.includes("status?.identity?.verifiedLegalName ??"));
  assert.ok(onboarding.includes("onChange={(e) => setPrincipalName(e.target.value)}"));
  assert.ok(!onboarding.includes("readOnly={!fallbackIdentity}"));
  assert.ok(onboarding.includes("!nameDiffersFromId"));
  assert.ok(handler.includes("certificateId: cert?.id || null"));
  assert.ok(onboarding.includes("certificateId: status?.certificateId"));
});

test("a family can reach certificate upload before a case exists, then returns to onboarding", () => {
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  const upload = readFileSync(new URL("../client/src/pages/upload-certificate.tsx", import.meta.url), "utf8");
  assert.ok(app.includes("!onboardingQuery.data.certificateId && !onboardingQuery.data.complete"));
  assert.ok(app.includes('path !== "/" && path !== "/upload"'));
  assert.ok(dashboard.includes('data-testid="button-start-certificate-upload"'));
  assert.ok(dashboard.includes("!!familyOnboardingStatus?.certificateId &&"));
  assert.ok(upload.includes('await queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] })'));
  assert.ok(upload.includes('navigate("/onboarding")'));
});

test("Family demo provides a safe simulated ID check and completed LPOA example", () => {
  const demo = readFileSync(new URL("../client/src/pages/demo-experience.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

  assert.ok(demo.includes('data-testid="button-demo-test-id"'));
  assert.ok(demo.includes("Run test ID check"));
  assert.ok(demo.includes("Test ID verified successfully."));
  assert.ok(demo.includes("no real ID or personal data is collected."));
  assert.ok(demo.includes('data-testid="demo-family-identity"'));
  assert.ok(demo.includes("Signed and available to the concierge team"));
  assert.ok(app.includes('if (isDemoAccount && path === "/demo/family") return <DemoFamilyExperience />'));
});

test("Family demo navigation opens every synthetic counterpart without live routes", () => {
  const demo = readFileSync(new URL("../client/src/pages/demo-experience.tsx", import.meta.url), "utf8");

  for (const section of [
    "case",
    "accounts",
    "benefits",
    "updates",
    "find-accounts",
    "estate-plans",
    "providers",
  ]) {
    assert.ok(demo.includes(`"${section}"`));
  }
  assert.ok(demo.includes('data-testid={`demo-nav-${kind}-${section}`}'));
  assert.ok(demo.includes('data-testid={`demo-family-view-${section}`}'));
  assert.ok(!demo.includes('window.location.href = "/accounts"'));
  assert.ok(!demo.includes('window.location.href = "/benefits"'));
});

test("Partner demo simulates certificate extraction locally before its matching form", () => {
  const demo = readFileSync(new URL("../client/src/pages/demo-experience.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const partnerStart = demo.indexOf("export function DemoPartnerExperience");
  const partnerSource = demo.slice(partnerStart);
  const uploader = partnerSource.indexOf("<CertificateUploader");
  const form = partnerSource.indexOf('data-testid="demo-partner-form"');

  assert.ok(partnerStart >= 0);
  assert.ok(uploader >= 0);
  assert.ok(form >= 0);
  assert.ok(uploader < form);
  assert.ok(partnerSource.includes("never reads or"));
  assert.ok(partnerSource.includes("uploads its contents"));
  assert.ok(partnerSource.includes("window.setTimeout"));
  assert.ok(partnerSource.includes("setForm(demoSampleForm)"));
  assert.ok(partnerSource.includes('data-testid="input-demo-partner-certificate"'));
  assert.ok(!partnerSource.includes("apiRequest"));
  assert.ok(!partnerSource.includes("FileReader"));
  assert.ok(!partnerSource.includes("demoMode"));
  assert.ok(routes.includes('verificationData.verificationStatus === "rejected"'));
  assert.ok(!routes.includes("allowRejectedDemoExtraction"));
});

test("real Partner OCR keeps authenticity checks and visibly controls extracted state", () => {
  const portal = readFileSync(new URL("../client/src/pages/funeral-home-portal.tsx", import.meta.url), "utf8");

  assert.ok(portal.includes('apiRequest("POST", "/api/ocr/certificate", {'));
  assert.ok(!portal.includes("demoMode"));
  assert.ok(portal.includes('value={field.value}'));
  assert.ok(portal.includes("stateCode, countyCode"));
  assert.ok(portal.includes("placeOfDeath, causeOfDeath"));
});