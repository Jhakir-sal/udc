import { expect, test, type Route } from "@playwright/test";

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

test("admin HeartPlans page renders all five living-plan stage counts and labels", async ({ page }) => {
  const listRequests: URL[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/user") {
      return json(route, {
        id: "browser-test-admin",
        role: "admin",
        destination: "/admin",
        permissions: [],
        mfaRequired: false,
        firstName: "Browser",
        lastName: "Admin",
        email: "browser-admin@example.invalid",
      });
    }
    if (path === "/api/admin/heartplans/progress-summary") {
      return json(route, {
        started: 7,
        thirtyPlus: 6,
        fiftyPlus: 5,
        seventyFivePlus: 4,
        complete: 3,
      });
    }
    if (path === "/api/admin/heartplans") {
      listRequests.push(url);
      return json(route, []);
    }
    return json(route, {});
  });

  await page.goto("/heartplans");
  await expect(page.getByTestId("text-admin-heartplans-title")).toHaveText("HeartPlans");

  for (const [key, count, label] of [
    ["started", "7", "Started"],
    ["30", "6", "30%+"],
    ["50", "5", "50%+"],
    ["75", "4", "75%+"],
    ["complete", "3", "Complete"],
  ]) {
    const card = page.getByTestId(`text-living-progress-${key}`).locator("..");
    await expect(card).toContainText(count);
    await expect(card).toContainText(label);
  }

  await page.getByTestId("input-heartplan-search").fill("Alex");
  await page.getByTestId("button-living-progress-50").click();
  await expect(page.getByTestId("active-heartplan-stage-filter")).toContainText("Stage: 50%+");
  await expect.poll(() => listRequests.some((url) =>
    url.searchParams.get("q") === "Alex" && url.searchParams.get("stage") === "fiftyPlus",
  )).toBe(true);

  await page.getByTestId("button-clear-heartplan-stage").click();
  await expect(page.getByTestId("active-heartplan-stage-filter")).toHaveCount(0);
  await expect.poll(() => listRequests.some((url) =>
    url.searchParams.get("q") === "Alex" && !url.searchParams.has("stage"),
  )).toBe(true);
});
