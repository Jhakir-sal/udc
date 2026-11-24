import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "390px mobile", width: 390, height: 844 },
] as const;

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function expectNoHorizontalOverflow(page: Page) {
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth, "the page must not scroll horizontally").toBeLessThanOrEqual(viewportWidth);
}

async function expectActionIsUsable(action: Locator, page: Page) {
  await action.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(action).toBeVisible();

  const box = await action.boundingBox();
  expect(box, "the primary action must have a rendered box").not.toBeNull();
  expect(box!.height, "the primary action must be at least 44px tall").toBeGreaterThanOrEqual(44);

  const isTopmostAtCenter = await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const center = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return center === element || element.contains(center);
  });
  expect(isTopmostAtCenter, "the primary action must not be covered by another element").toBe(true);
  await expect(page.getByTestId("panel-sally-chat")).toBeHidden();
}

for (const viewport of viewports) {
  test.describe(`signed-out family pages at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("entry page has no overflow and its primary action is usable", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { level: 1 })).toContainText("Support for the tasks");
      await expectNoHorizontalOverflow(page);
      await expectActionIsUsable(page.getByTestId("button-sign-in-hero"), page);
    });

    test("sign-in page has no overflow and its primary action is usable", async ({ page }) => {
      await page.goto("/login");

      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectActionIsUsable(page.getByTestId("button-login-submit"), page);
    });

    test("password recovery has no overflow and its primary action is usable", async ({ page }) => {
      await page.goto("/forgot-password");

      await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectActionIsUsable(page.getByTestId("button-send-reset"), page);
    });
  });
}

test.describe("verified family onboarding on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows an unobstructed next action without opening Sally", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path === "/api/auth/user") {
        return json(route, {
          id: "verified-family-browser-test",
          role: "user",
          destination: "/",
          permissions: [],
          mfaRequired: false,
          emailVerified: true,
          firstName: "Verified",
          lastName: "Family",
          email: "verified-family@example.invalid",
        });
      }

      if (path === "/api/onboarding/status") {
        return json(route, {
          required: true,
          complete: false,
          certificateId: "00000000-0000-4000-8000-000000000171",
          idVerificationStatus: "verified",
          lpoaSigned: false,
          estateQuestionNeeded: true,
          deceasedName: "Test Relative",
          identity: {
            verifiedLegalName: "Verified Family",
            accountNameMatchesId: true,
            certificateAuthorized: true,
            certificateMatch: "next_of_kin",
            relationshipOverrideApproved: false,
            reviewRequired: false,
            issues: [],
          },
          prefill: {
            principalName: "Verified Family",
            principalStreet: "123 Main St",
            principalCity: "Austin",
            principalState: "TX",
            principalZip: "78701",
          },
        });
      }

      return json(route, {});
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Limited Power of Attorney" })).toBeVisible();
    await expect(page.getByTestId("step-indicator-id")).toContainText("Your ID");
    await page.getByTestId("tab-signature-type").click();
    await page.getByTestId("input-typed-signature").fill("Verified Family");
    await page.getByTestId("checkbox-lpoa-consent").click();
    await expect(page.getByTestId("button-sign-lpoa")).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await expectActionIsUsable(page.getByTestId("button-sign-lpoa"), page);
  });
});