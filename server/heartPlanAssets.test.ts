import test from "node:test";
import assert from "node:assert/strict";
import { insertPlanAssetSchema, planAssetPatchSchema, PLAN_ASSET_CATEGORIES, PLAN_ASSET_TYPES } from "../shared/schema";

test("every selectable asset category has meaningful specific types", () => {
  for (const category of PLAN_ASSET_CATEGORIES) {
    const types = PLAN_ASSET_TYPES[category.value];
    assert.ok(types.length > 0, `${category.label} should have type choices`);
    assert.ok(category.description.length > 10, `${category.label} should explain what belongs there`);
  }
});

test("new assets require a type that belongs to their category", () => {
  assert.equal(insertPlanAssetSchema.safeParse({
    planId: "plan-1",
    name: "Primary checking",
    category: "banking",
    assetType: "checking",
  }).success, true);

  const missingType = insertPlanAssetSchema.safeParse({
    planId: "plan-1",
    name: "Primary checking",
    category: "banking",
  });
  assert.equal(missingType.success, false);

  const mismatchedType = insertPlanAssetSchema.safeParse({
    planId: "plan-1",
    name: "Primary checking",
    category: "banking",
    assetType: "life_insurance",
  });
  assert.equal(mismatchedType.success, false);
});

test("financial inventory categories cover assets, accounts, obligations, and digital property", () => {
  const values = new Set(PLAN_ASSET_CATEGORIES.map(category => category.value));
  for (const expected of ["banking", "investments", "insurance", "real_estate", "vehicles", "business", "valuables", "digital", "subscription", "membership", "debt"]) {
    assert.ok(values.has(expected as any), `missing ${expected}`);
  }
});

test("common overlooked accounts have dedicated HeartPlan asset types", () => {
  const subscriptionTypes = new Set(PLAN_ASSET_TYPES.subscription.map(type => type.value));
  const digitalTypes = new Set(PLAN_ASSET_TYPES.digital.map(type => type.value));
  assert.equal(subscriptionTypes.has("toll_account"), true);
  assert.equal(subscriptionTypes.has("storage_unit"), true);
  assert.equal(digitalTypes.has("betting_app"), true);
  assert.equal(digitalTypes.has("crypto_app"), true);
});

test("vehicles require a constrained ownership or lease status", () => {
  const vehicle = { planId: "plan-1", name: "2022 Honda Accord", category: "vehicles", assetType: "car_truck" };
  for (const assetType of ["rv", "atv", "boat"]) {
    assert.equal(insertPlanAssetSchema.safeParse({
      ...vehicle,
      assetType,
      vehicleOwnershipStatus: "owned_outright",
    }).success, true);
  }
  assert.equal(insertPlanAssetSchema.safeParse(vehicle).success, false);
  for (const vehicleOwnershipStatus of ["owned_outright", "financed", "leased"]) {
    assert.equal(insertPlanAssetSchema.safeParse({ ...vehicle, vehicleOwnershipStatus }).success, true);
  }
  assert.equal(insertPlanAssetSchema.safeParse({ ...vehicle, vehicleOwnershipStatus: "borrowed" }).success, false);
});

test("vehicle status cannot be attached to another category and patches are strict", () => {
  assert.equal(insertPlanAssetSchema.safeParse({
    planId: "plan-1",
    name: "Checking",
    category: "banking",
    assetType: "checking",
    vehicleOwnershipStatus: "owned_outright",
  }).success, false);
  assert.equal(planAssetPatchSchema.safeParse({ vehicleOwnershipStatus: "leased" }).success, true);
  assert.equal(planAssetPatchSchema.safeParse({ vehicleOwnershipStatus: "borrowed" }).success, false);
  assert.equal(planAssetPatchSchema.safeParse({ unrelated: "value" }).success, false);
});