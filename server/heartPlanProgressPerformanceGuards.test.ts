import test from "node:test";
import assert from "node:assert/strict";
import {
  assertProgressPlan, assertProgressRows, assertProgressSql, scanFields, type ExplainNode,
  progressProjectionKeys,
} from "./heartPlanProgressPerformanceGuards";

function goodPlan(): ExplainNode {
  return {
    "Node Type": "Hash Join", "Actual Loops": 1, "Actual Rows": 10_000,
    Plans: Object.entries(scanFields).map(([table, fields]) => ({
      "Node Type": "Seq Scan", "Relation Name": table, "Actual Loops": 1, "Actual Rows": 10_000,
      Output: fields.map(field => `${table}.${field}`),
    })),
  };
}

test("plan guard catches per-plan item scans and private/whole-row projections", () => {
  assertProgressPlan(goodPlan(), 10_000);
  const repeated = goodPlan();
  repeated.Plans![3]["Actual Loops"] = 10_000;
  assert.throws(() => assertProgressPlan(repeated, 10_000), /repeated\/per-plan scans/);
  const broad = goodPlan();
  broad.Output = ["plan_documents.object_path"];
  assert.throws(() => assertProgressPlan(broad, 10_000), /broad\/private projected output/);
  const wholeRow = goodPlan();
  wholeRow.Output = ["plan_documents.*"];
  assert.throws(() => assertProgressPlan(wholeRow, 10_000), /broad\/private projected output/);
  const twice = goodPlan();
  twice.Plans!.push({ ...twice.Plans![3] });
  assert.throws(() => assertProgressPlan(twice, 10_000), /exactly one scan/);
});

test("SQL and mapped-row guards reject broad, newly added, and private projections", () => {
  for (const sql of ['select * from plan_letters', 'select "plan_letters".* from plan_letters',
    'select "body" from plan_letters', 'select "plan_letters"."future_private_column" from "plan_letters"']) {
    assert.throws(() => assertProgressSql(sql), /projection|Private fields|private\/future/);
  }
  assertProgressSql("select count(*) from plan_letters");
  const safe = Object.fromEntries(progressProjectionKeys.map(key => [key, null]));
  assertProgressRows([safe]);
  assert.throws(() => assertProgressRows([{ ...safe, futurePrivateField: "hidden" }]));
  assert.throws(() => assertProgressRows([{ ...safe, fullName: "PRIVATE_FIXTURE" }]), /sentinel leaked/);
});
