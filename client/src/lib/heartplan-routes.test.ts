import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminHeartPlanDetailHref, adminHeartPlansHref, isPersonalHeartPlanPath } from "./heartplan-routes";

test("admin completion list and detail never match the private planner-workspace redirect", () => {
  for (const path of ["/heartplans", "/admin/heartplan/synthetic-id", "/admin", "/heartplan-other"]) {
    assert.equal(isPersonalHeartPlanPath(path), false, path);
  }
});

test("personal workspace and registration retain their role boundary", () => {
  for (const path of [
    "/heartplan", "/heartplan/wishes", "/heartplan/vault", "/heartplan/assets",
    "/heartplan/contacts", "/heartplan/letters", "/heartplan/discovery", "/heartplan-register",
  ]) {
    assert.equal(isPersonalHeartPlanPath(path), true, path);
  }
});

test("App keeps the admin role guard and uses the bounded personal-workspace matcher", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(app, /path === "\/heartplans"[\s\S]{0,50}role !== "admin"/);
  assert.match(app, /isPersonalHeartPlanPath\(path\) && role !== "planner" && role !== "user"/);
  assert.doesNotMatch(app, /if \(path\.startsWith\("\/heartplan"\) && role/);
});

test("staff completion links round-trip reserved search characters without double encoding", () => {
  const q = "Synthetic Planner+tag&query=1@example.invalid";
  const detail = new URL(adminHeartPlanDetailHref("synthetic-id", q), "https://example.invalid");
  assert.equal(detail.searchParams.get("q"), q);
  assert.equal(detail.searchParams.size, 1);
  assert.equal(adminHeartPlansHref(detail.searchParams.get("q")!), `/heartplans?q=${encodeURIComponent(q)}`);
  assert.equal(adminHeartPlansHref(), "/heartplans");
  assert.equal(adminHeartPlanDetailHref("synthetic-id"), "/admin/heartplan/synthetic-id");
});
