import { expect, test, type Page, type Route } from "@playwright/test";

type Asset = {
  id: string;
  name: string;
  category: string;
  assetType: string;
  institution: string | null;
  accountNumberHint: string | null;
  vehicleOwnershipStatus: string | null;
  estimatedValue: string | null;
  desiredAction: string | null;
  beneficiaryName: string | null;
  notes: string | null;
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const plan = {
  id: "browser-test-plan",
  status: "draft",
  tier: "free",
  fullName: "Browser Test Planner",
  dateOfBirth: "",
  phone: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  homeOccupancyStatus: null,
  hasVehicles: true,
};

async function mockPlanner(page: Page, assets: Asset[] = []) {
  let nextAssetId = 1;

  await page.addInitScript(() => {
    sessionStorage.setItem("sally-auto-opened", "1");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/auth/user") {
      return json(route, {
        id: "browser-test-planner",
        role: "planner",
        destination: "/heartplan",
        permissions: [],
        mfaRequired: false,
        firstName: "Browser",
        lastName: "Test",
        email: "browser-test@example.invalid",
      });
    }
    if (path === "/api/heartplan/status") {
      return json(route, { eligible: true, hasPlan: true });
    }
    if (path === "/api/heartplan") {
      return json(route, {
        plan,
        progress: {
          sections: { profile: false, wishes: false, documents: false, assets: false, contacts: false, letters: false },
          completed: 0,
          total: 6,
          percent: 0,
        },
      });
    }
    if (path === "/api/locations/us-zip/90210") {
      return json(route, { city: "Beverly Hills", state: "CA" });
    }
    if (path === "/api/locations/us-zip/00000") {
      return json(route, { error: "ZIP code not found" }, 404);
    }
    if (path === "/api/heartplan/assets" && method === "GET") {
      return json(route, assets);
    }
    if (path === "/api/heartplan/assets" && method === "POST") {
      const submitted = request.postDataJSON();
      const asset: Asset = {
        id: `browser-asset-${nextAssetId++}`,
        institution: null,
        accountNumberHint: null,
        vehicleOwnershipStatus: null,
        estimatedValue: null,
        desiredAction: null,
        beneficiaryName: null,
        notes: null,
        ...submitted,
      };
      assets.push(asset);
      return json(route, asset);
    }
    if (
      path === "/api/heartplan/wishes" ||
      path === "/api/heartplan/documents" ||
      path === "/api/heartplan/contacts" ||
      path === "/api/heartplan/letters"
    ) {
      return json(route, []);
    }

    return json(route, {});
  });
}

async function selectOption(page: Page, testId: string, optionName: string) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

async function enterAsset(
  page: Page,
  values: { name: string; category?: string; type: string; vehicleStatus?: string },
) {
  await page.getByTestId("input-asset-name").fill(values.name);
  if (values.category) await selectOption(page, "select-asset-category", values.category);
  await selectOption(page, "select-asset-type", values.type);
  if (values.vehicleStatus) {
    await selectOption(page, "select-vehicle-ownership-status", values.vehicleStatus);
  }
}

test("ZIP autofill succeeds while failed lookups preserve manual city and state", async ({ page }) => {
  await mockPlanner(page);
  await page.goto("/");

  await page.getByTestId("input-zip").fill("90210");
  await expect(page.getByTestId("input-city")).toHaveValue("Beverly Hills");
  await expect(page.getByTestId("input-state")).toHaveValue("CA");
  await expect(page.locator("#zip-lookup-status")).toHaveText("City and state filled from ZIP.");

  await page.getByTestId("input-city").fill("Manual City");
  await page.getByTestId("input-state").fill("ZZ");
  await page.getByTestId("input-zip").fill("00000");
  await expect(page.locator("#zip-lookup-status")).toHaveText("ZIP not found. Enter city and state manually.");
  await expect(page.getByTestId("input-city")).toHaveValue("Manual City");
  await expect(page.getByTestId("input-state")).toHaveValue("ZZ");
});

test("planners can save multiple real-estate and vehicle records without leaving the entry flow", async ({ page }) => {
  const assets: Asset[] = [];
  await mockPlanner(page, assets);
  await page.goto("/heartplan/assets");

  await page.getByTestId("button-add-asset").click();
  await enterAsset(page, { name: "Primary home", category: "Real Estate", type: "Primary residence" });
  await page.getByTestId("button-save-and-add-another").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("input-asset-name")).toHaveValue("");
  await expect(page.getByTestId("select-asset-category")).toContainText("Real Estate");
  await expect(page.getByTestId("select-asset-type")).toContainText("Choose a type...");

  await enterAsset(page, { name: "Lake house", type: "Second home or vacation property" });
  await page.getByTestId("button-save-asset").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Primary home", { exact: true })).toBeVisible();
  await expect(page.getByText("Lake house", { exact: true })).toBeVisible();

  await page.getByTestId("button-add-another-real_estate").click();
  await enterAsset(page, {
    name: "Family SUV",
    category: "Vehicles",
    type: "Car or truck",
    vehicleStatus: "Financed with a loan",
  });
  await page.getByTestId("button-save-and-add-another").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("input-asset-name")).toHaveValue("");
  await expect(page.getByTestId("select-asset-category")).toContainText("Vehicles");
  await expect(page.getByTestId("select-vehicle-ownership-status")).toContainText("Choose a status...");

  await enterAsset(page, {
    name: "Commuter car",
    type: "Car or truck",
    vehicleStatus: "Owned outright / paid off",
  });
  await page.getByTestId("button-save-asset").click();
  await expect(page.getByRole("dialog")).toBeHidden();

  for (const name of ["Primary home", "Lake house", "Family SUV", "Commuter car"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("asset-category-real_estate")).toContainText("2");
  await expect(page.getByTestId("asset-category-vehicles")).toContainText("2");
  expect(assets.map((asset) => asset.name)).toEqual(["Primary home", "Lake house", "Family SUV", "Commuter car"]);
  expect(new Set(assets.map((asset) => asset.id)).size).toBe(4);
});