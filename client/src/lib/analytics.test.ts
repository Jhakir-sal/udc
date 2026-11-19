import assert from "node:assert/strict";
import test from "node:test";
import { trackAnalyticsEvent, trackLivingHeartPlanMilestones } from "./analytics";

test("analytics is safe during server rendering", () => {
  assert.doesNotThrow(() => trackAnalyticsEvent("marketplace_provider_view", {}));
});

test("analytics forwards only the supplied event and primitive properties", () => {
  const calls: unknown[][] = [];
  Object.assign(globalThis, {
    window: { umami: { track: (...args: unknown[]) => calls.push(args) } },
  });
  trackAnalyticsEvent("landing_cta_click", { cta: "register", placement: "hero" });
  assert.deepEqual(calls, [["landing_cta_click", { cta: "register", placement: "hero" }]]);
  Reflect.deleteProperty(globalThis, "window");
});

test("admin HeartPlan stage events contain only the fixed stage band", () => {
  const calls: unknown[][] = [];
  Object.assign(globalThis, {
    window: { umami: { track: (...args: unknown[]) => calls.push(args) } },
  });

  trackAnalyticsEvent("admin_heartplan_stage_selected", { stage_band: "50_percent" });
  trackAnalyticsEvent("admin_heartplan_stage_cleared", { stage_band: "50_percent" });

  assert.deepEqual(calls, [
    ["admin_heartplan_stage_selected", { stage_band: "50_percent" }],
    ["admin_heartplan_stage_cleared", { stage_band: "50_percent" }],
  ]);
  Reflect.deleteProperty(globalThis, "window");
});

test("analytics provider errors never escape", () => {
  Object.assign(globalThis, {
    window: { umami: { track: () => { throw new Error("blocked"); } } },
  });
  assert.doesNotThrow(() => trackAnalyticsEvent("marketplace_provider_view", {}));
  Reflect.deleteProperty(globalThis, "window");
});

test("analytics swallows rejected provider promises", async () => {
  Object.assign(globalThis, {
    window: { umami: { track: () => Promise.reject(new Error("blocked")) } },
  });
  trackAnalyticsEvent("marketplace_provider_view", {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  Reflect.deleteProperty(globalThis, "window");
});

test("living HeartPlan milestones emit once as thresholds are crossed", () => {
  const calls: unknown[][] = [];
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    window: {
      umami: { track: (...args: unknown[]) => calls.push(args) },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });

  trackLivingHeartPlanMilestones("plan-1", "draft", 33);
  trackLivingHeartPlanMilestones("plan-1", "draft", 33);
  trackLivingHeartPlanMilestones("plan-1", "draft", 50);

  assert.deepEqual(calls, [
    ["heartplan_living_plan_milestone", { milestone: "started" }],
    ["heartplan_living_plan_milestone", { milestone: "30_percent" }],
    ["heartplan_living_plan_milestone", { milestone: "50_percent" }],
  ]);
  Reflect.deleteProperty(globalThis, "window");
});

test("activated deceased HeartPlans do not emit planning milestones", () => {
  const calls: unknown[][] = [];
  Object.assign(globalThis, {
    window: {
      umami: { track: (...args: unknown[]) => calls.push(args) },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    },
  });

  trackLivingHeartPlanMilestones("plan-2", "activated", 100);

  assert.deepEqual(calls, []);
  Reflect.deleteProperty(globalThis, "window");
});
