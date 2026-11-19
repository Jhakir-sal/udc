import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  LIFE_INSURANCE_COVERAGE_VALUES,
  LIFE_INSURANCE_COVERAGE_OPTIONS,
  PRUDENTIAL_LIFE_INSURANCE_URL,
  shouldSuggestPrudentialLifeInsurance,
} from "../shared/heartPlanLifeInsurance";
import { HEARTPLAN_SIGNUP_SOURCE } from "../shared/heartPlanConsent";
import { heartPlanRegistrationSchema } from "./heartPlanConsent";

const registration = {
  email: "insurance-test@example.invalid",
  password: "Synthetic!Pass1234",
  firstName: "Sample",
  lastName: "Planner",
  consent: {
    termsAccepted: true,
    privacyAcknowledged: true,
    communicationsConsent: false,
    source: HEARTPLAN_SIGNUP_SOURCE,
  },
};

test("Prudential suggestion appears only for no coverage and employer-only coverage", () => {
  for (const coverage of ["no", "employer_only"]) {
    assert.equal(shouldSuggestPrudentialLifeInsurance(coverage), true);
  }
  for (const coverage of ["yes", "not_sure", "skipped", "", "unknown", null, undefined]) {
    assert.equal(shouldSuggestPrudentialLifeInsurance(coverage), false);
  }
  assert.deepEqual(LIFE_INSURANCE_COVERAGE_OPTIONS.map(({ value }) => value).sort(), [...LIFE_INSURANCE_COVERAGE_VALUES].sort());
});

test("insurance answer is optional, validated and independent of marketing consent", () => {
  const omitted = heartPlanRegistrationSchema.parse(registration);
  assert.equal(omitted.lifeInsuranceCoverage, undefined);
  for (const coverage of LIFE_INSURANCE_COVERAGE_VALUES) {
    const parsed = heartPlanRegistrationSchema.parse({ ...registration, lifeInsuranceCoverage: coverage });
    assert.equal(parsed.lifeInsuranceCoverage, coverage);
    assert.equal(parsed.consent.communicationsConsent, false);
  }
  for (const lifeInsuranceCoverage of ["", "invalid", true, {}, null]) {
    assert.equal(heartPlanRegistrationSchema.safeParse({ ...registration, lifeInsuranceCoverage }).success, false);
  }
});

test("official resource URL includes no personal data or affiliate parameters", () => {
  const url = new URL(PRUDENTIAL_LIFE_INSURANCE_URL);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "www.prudential.com");
  assert.equal(url.pathname, "/personal/life-insurance");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  const ui = readFileSync(new URL("../client/src/components/prudential-life-insurance-suggestion.tsx", import.meta.url), "utf8");
  assert.match(ui, /if \(!shouldSuggestPrudentialLifeInsurance\(coverage\)\) return null/);
  assert.match(ui, /href=\{PRUDENTIAL_LIFE_INSURANCE_URL\}/);
  assert.match(ui, /target="_blank"/);
  assert.match(ui, /rel="noopener noreferrer"/);
  assert.match(ui, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(ui, /apiRequest|fetch\(|\/api\/|URLSearchParams/);
});

test("registration stores coverage in the existing atomic intake, and intake updates accept employer-only", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const register = routes.slice(routes.indexOf('app.post("/api/heartplan/register"'), routes.indexOf('app.get("/api/heartplan"'));
  assert.match(register, /consent, lifeInsuranceCoverage \} = registration.data/);
  assert.match(register, /createHeartPlanRegistration/);
  assert.match(register, /hasLifeInsurance: lifeInsuranceCoverage/);
  assert.match(routes, /hasLifeInsurance: z.enum\(LIFE_INSURANCE_COVERAGE_VALUES\).nullable\(\).optional\(\)/);
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const create = storage.slice(storage.indexOf("async createHeartPlanRegistration("), storage.indexOf("async getHeartPlanConsents("));
  assert.match(create, /db.transaction/);
  assert.match(create, /tx.insert\(heartPlanIntakes\).values\(\{\s*\.\.\.intake,/);
  const signup = readFileSync(new URL("../client/src/pages/heartplan-register.tsx", import.meta.url), "utf8");
  assert.match(signup, /lifeInsuranceCoverage \? \{ lifeInsuranceCoverage \} : \{\}/);
  assert.match(signup, /<PrudentialLifeInsuranceSuggestion coverage=\{lifeInsuranceCoverage\}/);
  const welcome = readFileSync(new URL("../client/src/pages/heartplan/welcome.tsx", import.meta.url), "utf8");
  assert.match(welcome, /onChange=\{v => set\("hasLifeInsurance", v\)\} options=\{LIFE_INSURANCE_COVERAGE_OPTIONS\}/);
  const dashboard = readFileSync(new URL("../client/src/pages/heartplan/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /!isActivated && shouldSuggestPrudentialLifeInsurance\(lifeInsuranceCoverage\)/);
});
