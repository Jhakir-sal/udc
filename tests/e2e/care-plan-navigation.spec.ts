import { expect, test, type Page, type Route } from "@playwright/test";

type Section = "profile" | "wishes" | "documents" | "assets" | "contacts" | "letters";

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function mockCarePlan(page: Page) {
  const sections: Record<Section, boolean> = {
    profile: false,
    wishes: false,
    documents: false,
    assets: false,
    contacts: false,
    letters: false,
  };

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

    if (path === "/api/heartplan" && method === "PATCH") {
      sections.profile = true;
      return json(route, { ok: true });
    }

    if (path === "/api/heartplan/wishes" && method === "PUT") {
      sections.wishes = true;
      return json(route, { ok: true });
    }

    if (path === "/api/heartplan") {
      const completed = Object.values(sections).filter(Boolean).length;
      return json(route, {
        plan: {
          id: "browser-test-plan",
          status: "draft",
          tier: "free",
          fullName: "",
          dateOfBirth: "",
          phone: "",
          street: "",
          city: "",
          state: "",
          zip: "",
        },
        progress: {
          sections,
          completed,
          total: 6,
          percent: Math.round((completed / 6) * 100),
        },
      });
    }

    if (path === "/api/heartplan/status") {
      return json(route, { eligible: true, hasPlan: true });
    }

    if (path === "/api/heartplan/wishes") return json(route, null);
    if (
      path === "/api/heartplan/documents" ||
      path === "/api/heartplan/assets" ||
      path === "/api/heartplan/contacts" ||
      path === "/api/heartplan/letters"
    ) {
      return json(route, []);
    }

    return json(route, {});
  });

  return sections;
}

async function expectHeadingFocused(page: Page, testId: string, text: string) {
  const heading = page.getByTestId(testId);
  await expect(heading).toHaveText(text);
  await expect(heading).toBeFocused();
}

async function expectMobilePageIsUsable(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.pageWidth, "HeartPlan page must not scroll horizontally").toBeLessThanOrEqual(dimensions.viewportWidth);
  await expect(page.getByTestId("panel-sally-chat")).toBeHidden();

  for (const action of await page.locator('[data-testid^="button-section-"]:visible').all()) {
    const box = await action.boundingBox();
    expect(box, "each visible navigation action must have a rendered box").not.toBeNull();
    expect(box!.height, "each visible navigation action must be at least 44px tall").toBeGreaterThanOrEqual(44);
  }
}

test("save, defer, and Back preserve next-incomplete routing and heading focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sections = await mockCarePlan(page);

  await page.goto("/");
  await expectHeadingFocused(page, "text-heartplan-title", "Your HeartPlan");
  await expectMobilePageIsUsable(page);

  await page.getByTestId("input-full-name").fill("Browser Test Planner");
  await page.getByTestId("button-save-profile").click();
  await expect(page.getByTestId("button-save-profile")).toHaveText(/Saved/);
  await expect(page).toHaveURL(/\/heartplan\/wishes$/);
  await expectHeadingFocused(page, "text-wishes-title", "End-of-life wishes");
  await expectMobilePageIsUsable(page);
  expect(sections.profile).toBe(true);

  await page.getByTestId("input-resting-details").fill("A quiet woodland setting");
  await page.getByTestId("button-section-save").click();
  await expect(page.getByTestId("button-section-save")).toHaveText(/Saved/);
  await expect(page).toHaveURL(/\/heartplan\/vault$/);
  await expectHeadingFocused(page, "text-vault-title", "Document vault");
  await expectMobilePageIsUsable(page);
  expect(sections.wishes).toBe(true);

  await page.getByTestId("button-section-defer").click();
  await expect(page).toHaveURL(/\/heartplan\/assets$/);
  await expectHeadingFocused(page, "text-assets-title", "Assets & accounts");
  await expectMobilePageIsUsable(page);
  expect(sections.documents).toBe(false);

  await page.getByTestId("button-section-back").click();
  await expect(page).toHaveURL(/\/heartplan\/vault$/);
  await expectHeadingFocused(page, "text-vault-title", "Document vault");

  await page.getByTestId("button-section-back").click();
  await expect(page).toHaveURL(/\/heartplan\/wishes$/);
  await expectHeadingFocused(page, "text-wishes-title", "End-of-life wishes");

  await page.getByTestId("button-section-back").click();
  await expect(page).toHaveURL(/\/heartplan$/);
  await expectHeadingFocused(page, "text-heartplan-title", "Your HeartPlan");

  await expect(page.getByTestId("checklist-profile")).toContainText("Personal information");
  await expect(page.getByTestId("checklist-wishes")).toContainText("End-of-life wishes");
  await expect(page.getByTestId("checklist-documents")).toContainText("Document vault");
  expect(sections).toEqual({
    profile: true,
    wishes: true,
    documents: false,
    assets: false,
    contacts: false,
    letters: false,
  });
});