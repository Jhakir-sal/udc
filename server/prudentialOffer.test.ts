import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRUDENTIAL_ACCESS_MESSAGE, PRUDENTIAL_OFFER_END, PRUDENTIAL_FREE_ACCESS_DAYS, PRUDENTIAL_LIFETIME_PRICE_CENTS } from "../shared/prudentialOffer";
import { complimentaryOrsaLegacyIsActive } from "../shared/orsaLegacyOffer";

test("Prudential has no expiry and keeps its partner price independently of ORSA's deadline", () => {
  assert.equal(PRUDENTIAL_OFFER_END, null);
  assert.equal(PRUDENTIAL_FREE_ACCESS_DAYS, 90);
  assert.equal(PRUDENTIAL_ACCESS_MESSAGE, "Free for 90 days, then $50 one time for lifetime access.");
  assert.equal(PRUDENTIAL_LIFETIME_PRICE_CENTS, 5000);
  assert.equal(complimentaryOrsaLegacyIsActive(new Date("2027-01-01")), false);
  const config = readFileSync(new URL("../shared/prudentialOffer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(config, /from .*orsaLegacyOffer|new Date|Date\.parse/);
  for (const path of ["../client/src/pages/prudential-heartplan.tsx", "../client/src/components/prudential-registration-notice.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /no expiration/i);
    assert.match(source, /PRUDENTIAL_ACCESS_MESSAGE/);
    assert.match(source, /No offer review/i);
    assert.doesNotMatch(source, /review your eligibility|confirm eligibility|Request partner activation|let SAL review|standard free account|subject to SAL eligibility|activationHref/);
    assert.doesNotMatch(source, /December 1|PRUDENTIAL_OFFER_END_LABEL|PRUDENTIAL_STANDARD_PRICE|offerActive|setInterval/);
  }
});

test("Prudential signup uses the approved terms in its form, verification and confirmation states", () => {
  const signup = readFileSync(new URL("../client/src/pages/heartplan-register.tsx", import.meta.url), "utf8");
  const notice = readFileSync(new URL("../client/src/components/prudential-registration-notice.tsx", import.meta.url), "utf8");
  assert.match(notice, /PRUDENTIAL_ACCESS_MESSAGE/);
  // The notice stays above the form/verification/success switch, so terms are
  // visible in every state without repeating the offer inside each card.
  const noticePosition = signup.indexOf("{showPrudentialOffer && <PrudentialRegistrationNotice />}");
  assert(noticePosition >= 0);
  assert(noticePosition < signup.indexOf("{verified ? ("));
  assert.match(signup, /showPrudentialOffer \? `Start my \$\{PRUDENTIAL_FREE_ACCESS_DAYS\} days free` : "Create my HeartPlan"/);
  const confirmation = signup.slice(signup.indexOf("{verified ? ("), signup.indexOf(") : verificationStep ? ("));
  assert.match(confirmation, /showPrudentialOffer &&/);
  assert.match(confirmation, /PRUDENTIAL_ACCESS_MESSAGE/);
});

test("Prudential signup branding is conditional and uses real co-brand assets", () => {
  const signup = readFileSync(new URL("../client/src/pages/heartplan-register.tsx", import.meta.url), "utf8");
  assert.match(signup, /signupParams\.get\("partner"\) === "prudential"/);
  assert.match(signup, /const partnerBrand = showPrudentialOffer \?/);
  assert.match(signup, /src=\{prudentialLogo\} alt="Prudential"/);
  assert.match(signup, /src=\{salLogo\} alt="Steps After Life"/);
  assert.match(signup, /showPrudentialOffer \? "pr-signup" : ""/);
  assert.match(signup, /showPrudentialOffer \? "pr-signup-card" : undefined/);
  const css = readFileSync(new URL("../client/src/pages/heartplan-register-prudential.css", import.meta.url), "utf8");
  assert.match(css, /--prs-blue: #0076d1/);
  assert.match(css, /--prs-navy: #001f45/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /(?:^|\n)(?:body|input|button|:root|\.shadcn-card)\s*[{,]/);
});

test("Prudential public page does not bypass auth resolution or route users into ORSA benefits", () => {
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const marker = 'if (path === "/prudential" || path === "/prudential/heartplan")';
  assert(app.includes(marker));
  const loadingGuard = app.indexOf("if (isLoading ||");
  assert(loadingGuard !== -1);
  assert(app.indexOf(marker) > loadingGuard);
  assert(app.indexOf(marker) < app.indexOf("if (!isAuthenticated)"));
  const page = readFileSync(new URL("../client/src/pages/prudential-heartplan.tsx", import.meta.url), "utf8");
  assert.match(page, /\/heartplan-register\?partner=prudential/);
  assert.doesNotMatch(page, /orsa_offer|\/api\/orsa|\/orsa\/|fetch\(|apiRequest\(/);
  assert.match(page, /hello@stepsafterlife\.com/);
  const signup = readFileSync(new URL("../client/src/pages/heartplan-register.tsx", import.meta.url), "utf8");
  const body = signup.slice(signup.indexOf('apiRequest("POST", "/api/heartplan/register"'), signup.indexOf("onSuccess:"));
  assert.doesNotMatch(body, /partner|prudential|orsa|entitlement|legacyAccess/);
});
