import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_VALUATION_CONDITIONS,
  DEMO_VALUATION_ITEMS,
  getDemoAssetEstimate,
} from "../shared/demoAssetValuation";

test("all demo sample/condition combinations produce consistent illustrative amounts", () => {
  for (const item of DEMO_VALUATION_ITEMS) {
    for (const condition of DEMO_VALUATION_CONDITIONS) {
      const result = getDemoAssetEstimate(item.id, condition.id);
      assert(result.lowCents > 0);
      assert(result.lowCents <= result.midpointCents);
      assert(result.midpointCents <= result.highCents);
      assert.equal(result.purchaseTargetCents, Math.round(result.midpointCents * 0.8));
      assert.equal(result.condition, condition.label);
      assert(result.item.evidence.length > 0);
      assert.match(result.source, /not live AI or verified market evidence/);
    }
  }
});

test("demo calculation is deterministic, condition-sensitive and rejects unsupported input", () => {
  const normal = getDemoAssetEstimate("watch", "good");
  assert.equal(normal.lowCents, 180000);
  assert.equal(normal.highCents, 260000);
  assert.equal(normal.midpointCents, 220000);
  assert.equal(normal.purchaseTargetCents, 176000);
  assert.deepEqual(normal, getDemoAssetEstimate("watch", "good"));
  assert(getDemoAssetEstimate("watch", "excellent").midpointCents > normal.midpointCents);
  assert(getDemoAssetEstimate("watch", "fair").midpointCents < normal.midpointCents);
  assert.throws(() => getDemoAssetEstimate("unknown", "good"));
  assert.throws(() => getDemoAssetEstimate("watch", "unknown"));
});

test("demo UI stays local, labels scripted results, and exposes easy entry and reset", () => {
  const ui = readFileSync(new URL("../client/src/components/demo-value-estimator.tsx", import.meta.url), "utf8");
  assert.match(ui, /Illustrative results only/);
  assert.match(ui, /not live AI/);
  assert.match(ui, /Evidence still needed/);
  assert.match(ui, /onClick=\{reset\}/);
  assert.match(ui, /const launch = \(\) => \{\s*reset\(\)/);
  assert.match(ui, /setItemId\(event.target.value\);\s*setEstimate\(null\)/);
  assert.match(ui, /setConditionId\(event.target.value\);\s*setEstimate\(null\)/);
  assert.doesNotMatch(ui, /fetch\(|apiRequest|useMutation|localStorage|sessionStorage|type="file"|\/api\//);
  const demo = readFileSync(new URL("../client/src/pages/demo-experience.tsx", import.meta.url), "utf8");
  assert.match(demo, /<DemoValueEstimator \/>/);
  assert.match(demo, /<DemoValueEstimator variant="card" \/>/);
});
