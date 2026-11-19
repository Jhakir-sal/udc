import { expect, test, type Page } from "@playwright/test";

const caseId = "00000000-0000-4000-8000-000000000170";

async function mockCase(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === "/api/auth/user") body = {
      id: "synthetic-admin", role: "admin", email: "admin@example.invalid",
      firstName: "Synthetic", lastName: "Admin", permissions: [],
      mfaRequired: false, emailVerified: true,
    };
    if (path === `/api/admin/case/${caseId}/document-alerts`) body = {
      unseenCount: 0, unseenDocumentIds: [], latestUploadedAt: null,
    };
    if (path === `/api/admin/case/${caseId}`) body = {
      certificate: {
        id: caseId, deceasedName: "Alex Synthetic Example",
        certificateNumber: "TEST-402", status: "processing",
        dateOfDeath: "2026-08-01", submittedAt: "2026-08-20T12:00:00Z",
        deceasedEmail: "synthetic-long-contact-address@example.invalid",
      },
      user: { id: "synthetic-family", email: "family@example.invalid" },
      accounts: [{
        id: "synthetic-account", certificateId: caseId,
        accountName: "Synthetic Electric Company With A Long Account Name",
        accountType: "Electric Utility", category: "miscellaneous",
        status: "pending_action", responsibleParty: "family", addedBy: "family",
      }],
      beneficiaries: [], notifications: [], lifeInsurance: [], messages: [],
      creditProtection: [], governmentNotifications: [], relatives: [], caseTasks: [],
    };
    await route.fulfill({ json: body });
  });
  await page.goto(`/admin/case/${caseId}`);
  await expect(page.getByTestId("text-case-title")).toBeVisible();
}

async function expectAligned(page: Page) {
  const sizes = await page.locator("main").evaluate((main) => ({
    width: main.clientWidth, contentWidth: main.scrollWidth, left: main.scrollLeft,
    pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth,
  }));
  if (sizes.contentWidth > sizes.width) console.log(await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > main.getBoundingClientRect().right)
      .slice(0, 15).map((el) => ({ tag: el.tagName, class: el.className, width: el.clientWidth, scroll: el.scrollWidth })),
  ));
  expect(sizes.contentWidth, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.width);
  expect(sizes.left).toBe(0);
  expect(sizes.pageWidth).toBeLessThanOrEqual(sizes.viewport);
}

for (const width of [360, 390, 430]) {
test(`mobile ${width}px case stays aligned after navigation, assistant, Sally, and tabs`, async ({ page }) => {
  await page.setViewportSize({ width, height: 874 });
  await mockCase(page);
  await expectAligned(page);
  await page.getByTestId("button-sidebar-toggle").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.getByRole("dialog").evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectAligned(page);
  await page.getByTestId("button-open-assistant").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => page.getByRole("dialog").evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expectAligned(page);
  await page.getByTestId("button-case-sally-help").click();
  await expect(page.getByTestId("panel-sally-chat")).toBeVisible();
  await page.getByTestId("button-sally-close").click();
  await expectAligned(page);
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    await expectAligned(page);
  }
  await page.getByTestId("tab-accounts").click();
  const tableScroller = page.getByRole("table").locator("..");
  const tableSizes = await tableScroller.evaluate((el) => {
    el.scrollLeft = 200;
    return { width: el.clientWidth, content: el.scrollWidth, left: el.scrollLeft };
  });
  expect(tableSizes.content).toBeGreaterThan(tableSizes.width);
  expect(tableSizes.left).toBeGreaterThan(0);
  await expectAligned(page);
  await page.getByTestId("button-open-assistant").click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expectAligned(page);
  await page.getByTestId("tab-overview").click();
  await page.screenshot({ path: `test-results/admin-case-mobile-layout-${width}.jpg`, fullPage: true });
});
}

test("desktop case retains a locally scrollable accounts table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockCase(page);
  await page.getByRole("tab", { name: /Accounts/ }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Account Holder", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status", exact: true })).toBeVisible();
  await expectAligned(page);
});
