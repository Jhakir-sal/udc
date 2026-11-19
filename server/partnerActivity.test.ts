import assert from "node:assert/strict";
import test from "node:test";
import { classifyPartnerActivity, normalizePartnerActivityRow } from "./partnerActivity";

const now = new Date("2025-04-01T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

test("classifies partner activity at the documented day thresholds", () => {
  assert.equal(classifyPartnerActivity(daysAgo(30), now), "Active");
  assert.equal(classifyPartnerActivity(daysAgo(30.01), now), "Quiet");
  assert.equal(classifyPartnerActivity(daysAgo(90), now), "Quiet");
  assert.equal(classifyPartnerActivity(daysAgo(90.01), now), "Inactive");
  assert.equal(classifyPartnerActivity(null, now), "No activity");
  assert.equal(classifyPartnerActivity("not-a-date", now), "No activity");
});

test("normalizes aggregate counts and dates without adding private fields", () => {
  const row = normalizePartnerActivityRow({
    id: "marketplace:1",
    type: "marketplace_provider",
    displayName: "Example Provider",
    sourceType: "catalog_listing",
    enrollmentLabel: "Marketplace catalog listing",
    status: "approved",
    createdAt: "2025-01-01T00:00:00Z",
    linkedCount: null,
    activityCount: "4",
    lastActivityAt: daysAgo(31),
    managementPath: "/admin/marketplace",
  }, now);
  assert.equal(row.activityCount, 4);
  assert.equal(row.linkedCount, null);
  assert.equal(row.activityLevel, "Quiet");
  assert.equal(row.createdAt, "2025-01-01T00:00:00.000Z");
});