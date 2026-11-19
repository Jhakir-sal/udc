import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isHeartPlanInvitationLateStage } from "./heartplan-invitation";

test("does not invite before a family has a case", () => {
  assert.equal(isHeartPlanInvitationLateStage([], []), false);
});

test("completed cases are eligible even when they have no tracked accounts", () => {
  assert.equal(
    isHeartPlanInvitationLateStage([{ id: "case-1", status: "completed" }], []),
    true,
  );
});

test("active cases become eligible only when every tracked account is resolved", () => {
  const certificate = [{ id: "case-1", status: "processing" }];
  assert.equal(
    isHeartPlanInvitationLateStage(certificate, [
      { certificateId: "case-1", status: "closed" },
      { certificateId: "case-1", status: "pending_action" },
    ]),
    false,
  );
  assert.equal(
    isHeartPlanInvitationLateStage(certificate, [
      { certificateId: "case-1", status: "closed" },
      { certificateId: "case-1", status: "suspended" },
    ]),
    true,
  );
});

test("all of a family's cases must be late stage before showing the invitation", () => {
  assert.equal(
    isHeartPlanInvitationLateStage(
      [
        { id: "case-1", status: "completed" },
        { id: "case-2", status: "processing" },
      ],
      [{ certificateId: "case-2", status: "active" }],
    ),
    false,
  );
});

test("family users without a plan are not shown an early HeartPlan sidebar pitch", () => {
  const sidebar = readFileSync(new URL("../components/app-sidebar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(sidebar, /Start My HeartPlan/);
});