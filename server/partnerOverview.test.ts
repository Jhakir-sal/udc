import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadPartnerOverview } from "./partnerOverview";
import { PARTNER_OVERVIEW_SHA256 } from "@shared/outreach";

test("approved one-pager is attached as the exact saved PDF and fails closed on a changed file", async () => {
  const overview = await loadPartnerOverview();
  const pdf = Buffer.from(overview.attachment.content, "base64");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(overview.info.pages, 1);
  assert.equal(overview.info.size, pdf.length);
  assert.equal(overview.attachment.disposition, "attachment");
  assert.equal(overview.attachment.type, "application/pdf");
  assert.equal(overview.sha256, createHash("sha256").update(pdf).digest("hex"));
  assert.equal(overview.sha256, PARTNER_OVERVIEW_SHA256);
  assert.equal((await loadPartnerOverview(overview.sha256)).sha256, overview.sha256);
  await assert.rejects(loadPartnerOverview("0".repeat(64)), /changed since this template was saved/);
  const previousMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal((await loadPartnerOverview(overview.sha256)).sha256, overview.sha256);
  } finally {
    process.env.NODE_ENV = previousMode;
  }
});