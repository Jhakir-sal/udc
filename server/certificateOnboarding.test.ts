import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatOcrDate } from "../client/src/lib/utils";

test("OCR dates are shown in the family-friendly review format", () => {
  assert.equal(formatOcrDate("1950-01-02"), "01/02/1950");
  assert.equal(formatOcrDate("03/04/2026"), "03/04/2026");
  assert.equal(formatOcrDate(null), "");
});

test("certificate onboarding starts with OCR upload and keeps typing as a fallback", () => {
  const uploadPage = readFileSync(new URL("../client/src/pages/upload-certificate.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

  assert.ok(uploadPage.includes("Start with the death certificate"));
  assert.ok(uploadPage.includes('data-testid="dropzone-certificate"'));
  assert.ok(uploadPage.includes("form.setValue(\"deceasedSsn\""));
  assert.ok(uploadPage.includes("setIsEditingVerify(missingRequiredDetails)"));
  assert.ok(uploadPage.includes('data-testid="section-required-family-questions"'));
  assert.ok(uploadPage.includes('data-testid="button-enter-certificate-manually"'));
  assert.ok(dashboard.includes('data-testid="card-certificate-first-step"'));
  assert.ok(dashboard.includes("fill in the official details with OCR"));
});