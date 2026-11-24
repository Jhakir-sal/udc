import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertHeartPlanSchema } from "../shared/schema";

test("HeartPlan housing and vehicle profile values are constrained and nullable", () => {
  const base = { userId: "user-1" };
  for (const homeOccupancyStatus of [
    "owns_home",
    "rents_home",
    "lives_with_family_or_others",
    "prefer_not_to_say_or_not_sure",
    null,
  ]) {
    assert.equal(insertHeartPlanSchema.safeParse({ ...base, homeOccupancyStatus }).success, true);
  }
  assert.equal(insertHeartPlanSchema.safeParse({ ...base, homeOccupancyStatus: "mortgaged" }).success, false);
});

test("HeartPlan vehicle tri-state preserves an explicit false value", () => {
  const result = insertHeartPlanSchema.parse({ userId: "user-1", hasVehicles: false });
  assert.equal(result.hasVehicles, false);
  assert.equal(insertHeartPlanSchema.safeParse({ userId: "user-1", hasVehicles: "false" }).success, false);
});

test("profile routes are strict while progress semantics stay unchanged", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /hasVehicles:\s*z\.boolean\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(routes, /prefer_not_to_say_or_not_sure[\s\S]{0,100}\]\)\.nullable\(\)\.optional\(\),[\s\S]{0,100}hasVehicles[\s\S]{0,100}\}\)\.strict\(\)/);
  assert.match(routes, /return heartPlanCompletionFromCounts\(counts\)/);
  const completion = readFileSync(new URL("./heartplanAdmin.ts", import.meta.url), "utf8");
  assert.match(completion, /profileComplete:\s*Boolean\(plan\.fullName && plan\.dateOfBirth\)/);
  assert.doesNotMatch(completion, /profile:\s*Boolean\([^)]*(homeOccupancyStatus|hasVehicles)/);
});

test("new profile answers are redacted from concierge plan projections", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /plan:\s*adminHeartPlanSummary\(plan\)/);
  const projection = readFileSync(new URL("./heartplanAdmin.ts", import.meta.url), "utf8")
    .split("export function heartPlanCompletion")[0];
  assert.doesNotMatch(projection, /homeOccupancyStatus|hasVehicles|dateOfBirth|street|phone/);
  const detailRoute = routes.slice(routes.indexOf('app.get("/api/admin/heartplans/:id"'),
    routes.indexOf("// Admin: permanently remove a living HeartPlan"));
  assert.doesNotMatch(detailRoute.slice(detailRoute.indexOf("res.json({")), /assets:|documents:|letters:|wishes:/);
});