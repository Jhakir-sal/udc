import test from "node:test";
import assert from "node:assert/strict";
import { summarizeNerSearchOrigin, type NerHistoryRecord } from "@shared/nerSearch";

const row = (override: Partial<NerHistoryRecord> = {}): NerHistoryRecord => ({
  id: "synthetic", searchedName: "Synthetic Case Person", yearOfBirth: null, zipCode: null, maidenName: null,
  source: "sal_request", outcome: "completed_no_match", resultCount: 0,
  actorName: "Synthetic Family", actorRole: "user", searcherName: "Synthetic Family",
  requestedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:00:10.000Z",
  reportedAt: null, reportedOutcome: null, reportNotes: null, matchesCaseName: true, ...override,
});

test("NER indicators independently distinguish completed family and SAL staff searches", () => {
  assert.deepEqual(summarizeNerSearchOrigin([]), {
    family: { state: "none", record: null }, staff: { state: "none", record: null }, familyReport: null,
  });
  const family = row();
  const staff = row({ id: "staff", actorRole: "admin", actorName: "Synthetic Staff", outcome: "completed_match", resultCount: 2 });
  const summary = summarizeNerSearchOrigin([staff, family]);
  assert.equal(summary.family.state, "completed");
  assert.equal(summary.family.record?.id, "synthetic");
  assert.equal(summary.staff.state, "completed");
  assert.equal(summary.staff.record?.id, "staff");
});

test("manual family reports remain unconfirmed even when staff records a claimed no-match", () => {
  const report = row({
    id: "report", source: "family_report", actorRole: "admin", outcome: "family_reported",
    reportedOutcome: "no_match", resultCount: null, completedAt: null,
  });
  const summary = summarizeNerSearchOrigin([report]);
  assert.equal(summary.family.state, "reported");
  assert.equal(summary.family.record, report);
  assert.equal(summary.staff.state, "none");
  assert.equal(summary.familyReport, report);
  const maliciousReport = row({ ...report, outcome: "completed_no_match" });
  assert.equal(summarizeNerSearchOrigin([maliciousReport]).family.state, "reported");
});

test("redirect, pending, failed and unrecognized requests never count as searched", () => {
  for (const outcome of ["submitted", "redirect_required", "unavailable", "unrecognized_response"] as const) {
    for (const actorRole of ["user", "admin"]) {
      const summary = summarizeNerSearchOrigin([row({ actorRole, outcome, completedAt: null, resultCount: null })]);
      assert.equal(summary[actorRole === "user" ? "family" : "staff"].state, "requested");
    }
  }
});

test("a newer failed request never erases a completed search and source ordering does not matter", () => {
  const original = row();
  const failed = row({ id: "failed", requestedAt: "2026-01-02T12:00:00.000Z", outcome: "unavailable", completedAt: null });
  const report = row({ id: "report", source: "family_report", outcome: "family_reported", requestedAt: "2026-01-03T12:00:00.000Z" });
  for (const records of [[original, failed, report], [report, failed, original]]) {
    const result = summarizeNerSearchOrigin(records);
    assert.equal(result.family.state, "completed");
    assert.equal(result.family.record?.id, original.id);
    assert.equal(result.familyReport?.id, "report");
  }
  const newestCompleted = row({ id: "new-completion", requestedAt: "2026-01-04T12:00:00.000Z" });
  assert.equal(summarizeNerSearchOrigin([newestCompleted, original]).family.record?.id, "new-completion");
});

test("an unknown account role is not silently attributed to family or staff", () => {
  const result = summarizeNerSearchOrigin([row({ actorRole: "funeral_home" })]);
  assert.equal(result.family.state, "none");
  assert.equal(result.staff.state, "none");
});
