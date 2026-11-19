import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

const familyUser = {
  id: "mobile-family-test",
  role: "user",
  destination: "/",
  permissions: [],
  mfaRequired: false,
  emailVerified: true,
  firstName: "Mobile",
  lastName: "Family",
  email: "mobile-family@example.invalid",
};

const adminUser = {
  ...familyUser,
  id: "mobile-admin-test",
  role: "admin",
  destination: "/admin",
};

const certificate = {
  id: "mobile-case",
  deceasedName: "Alex Example",
  certificateNumber: "TEST-390",
  status: "processing",
  submittedAt: "2026-08-20T12:00:00.000Z",
  dateOfDeath: "2026-08-01",
  documentUrl: "/objects/test-certificate.pdf",
  paymentStatus: "paid",
};

const account = {
  id: "mobile-account",
  certificateId: certificate.id,
  accountName: "Example Electric Company With A Long Name",
  accountType: "Electric Utility",
  category: "real_estate",
  status: "pending_action",
  responsibleParty: "family",
  addedBy: "family",
  isJoint: false,
};

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function prepareMobilePage(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.addInitScript(() => {
    sessionStorage.setItem("sally-auto-opened", "1");
    localStorage.removeItem("sal-selected-case");
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.pageWidth, "the page must not scroll horizontally at 390px").toBeLessThanOrEqual(
    dimensions.viewportWidth,
  );
}

async function expectActionIsUsable(action: Locator) {
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeVisible();

  const box = await action.boundingBox();
  expect(box, "the active next action must have a rendered box").not.toBeNull();
  expect(box!.height, "the active next action must be at least 44px tall").toBeGreaterThanOrEqual(44);

  const isTopmostAtCenter = await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return topmost === element || element.contains(topmost);
  });
  expect(isTopmostAtCenter, "fixed UI must not cover the active next action").toBe(true);
}

async function expectMobileCaseWorkIsUsable(page: Page, actions: Locator[]) {
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId("panel-sally-chat")).toBeHidden();
  for (const action of actions) await expectActionIsUsable(action);
}

async function mockFamilyCaseWork(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/auth/user") return json(route, familyUser);
    if (path === "/api/onboarding/status") return json(route, { complete: true });
    if (path === "/api/certificates") return json(route, [certificate]);
    if (path === "/api/accounts") return json(route, [account]);
    if (path === "/api/notifications") return json(route, []);
    if (path === "/api/heartplan/status") return json(route, { eligible: false, hasPlan: false });
    if (path === "/api/family/legacy-messages") return json(route, []);

    return json(route, {});
  });
}

test.describe("family case-work pages at 390px", () => {
  test.beforeEach(async ({ page }) => {
    await prepareMobilePage(page);
  });

  test("dashboard keeps the current case action visible and tappable", async ({ page }) => {
    await mockFamilyCaseWork(page);
    await page.goto("/");

    await expect(page.getByTestId("text-dashboard-greeting")).toBeVisible();
    await expectMobileCaseWorkIsUsable(page, [
      page.getByTestId(`button-view-document-${certificate.id}`),
      page.getByTestId(`button-view-certificate-${certificate.id}`),
    ]);
  });

  test("case document library keeps document actions visible and tappable", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path === "/api/auth/user") return json(route, adminUser);
      if (path === `/api/admin/case/${certificate.id}`) {
        return json(route, {
          certificate,
          user: { id: familyUser.id, firstName: "Mobile", lastName: "Family" },
          accounts: [account],
          beneficiaries: [],
          notifications: [],
          lifeInsurance: [],
          messages: [],
          creditProtection: [],
          governmentNotifications: [],
          caseTasks: [],
        });
      }
      if (path === `/api/admin/case/${certificate.id}/family-documents`) {
        return json(route, [
          {
            id: "mobile-document",
            label: "Electric utility statement with a long descriptive document title",
            documentType: "utility_bill",
            fileName: "electric-statement.pdf",
            objectPath: "/objects/electric-statement.pdf",
            contentType: "application/pdf",
            uploadedByRole: "user",
            uploaderName: "Mobile Family",
            uploadedAt: "2026-08-21T12:00:00.000Z",
          },
        ]);
      }
      if (
        path === `/api/admin/case/${certificate.id}/invitations` ||
        path === `/api/admin/case/${certificate.id}/family-accounts` ||
        path === `/api/admin/case/${certificate.id}/lpoa`
      ) {
        return json(route, []);
      }

      return json(route, {});
    });

    await page.goto(`/admin/case/${certificate.id}`);

    await expect(page.getByTestId("card-document-library")).toBeVisible();
    await expectMobileCaseWorkIsUsable(page, [
      page.getByTestId("button-view-doc-mobile-document"),
      page.getByTestId("button-delete-doc-mobile-document"),
    ]);
  });

  test("connected-account action menu stays visible and tappable", async ({ page }) => {
    await mockFamilyCaseWork(page);
    await page.goto(`/accounts?certificate=${certificate.id}`);

    const trigger = page.getByTestId(`button-account-actions-${account.id}`);
    await expect(page.getByTestId(`account-card-${account.id}`)).toBeVisible();
    await expectMobileCaseWorkIsUsable(page, [trigger]);

    await trigger.click();
    const transferAction = page.getByTestId(`action-transfer-${account.id}`);
    await expectMobileCaseWorkIsUsable(page, [
      page.getByTestId(`action-suspend-${account.id}`),
      transferAction,
    ]);
    await transferAction.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("input-transfer-name").fill("Jordan Example");
    await page.getByTestId("select-transfer-relationship").click();
    await page.getByRole("option", { name: "Executor" }).click();
    await expectMobileCaseWorkIsUsable(page, [
      page.getByTestId("button-confirm-transfer"),
    ]);
  });
});