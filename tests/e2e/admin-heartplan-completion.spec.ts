import { expect, test as base, type Page } from "@playwright/test";
import {
  expectHorizontallyReachable, expectPrivateItemsAbsent, mockCompletionSession,
  plannerEmail, syntheticPlans,
} from "./fixtures/heartplan-completion";

type Traffic = Awaited<ReturnType<typeof mockCompletionSession>>;
const test = base.extend<{ syntheticRole: string; traffic: Traffic }>({
  syntheticRole: ["admin", { option: true }],
  traffic: [async ({ page, baseURL, syntheticRole }, use) => {
    const traffic = await mockCompletionSession(page, baseURL!, syntheticRole);
    await use(traffic);
    expect(traffic.unexpected, "No mutations or unmocked admin/private reads").toEqual([]);
    if (syntheticRole === "admin") {
      expect(traffic.reads.filter(({ pathname }) =>
        pathname.startsWith("/api/heartplan/") || pathname === "/api/heartplan" || pathname.startsWith("/objects/"),
      ), "Staff completion must not fetch the personal workspace").toEqual([]);
    }
  }, { auto: true }],
});

async function expectChecklist(page: Page, fixture: typeof syntheticPlans[number]) {
  const { progress } = fixture.detail;
  const checklist = page.getByTestId("card-heartplan-completion");
  await expect(page.getByTestId("text-plan-detail-title")).toHaveText(fixture.row.fullName);
  await expect(checklist).toContainText(`${progress.completed} of 6 complete · ${progress.percent}%`);
  for (const [section, complete] of Object.entries(progress.sections)) {
    const item = page.getByTestId(`completion-section-${section}`);
    await expect(item).toContainText(complete ? "Complete" : "Incomplete");
    if (section in progress.counts) {
      await expect(item).toContainText(`${progress.counts[section as keyof typeof progress.counts]} recorded`);
    }
  }
  for (const id of [
    "card-heartplan-annual-review", "card-heartplan-consent",
    "card-heartplan-payment", "card-heartplan-contact-delivery",
  ]) {
    const card = page.getByTestId(id);
    await expect(card).toBeVisible();
    // DOM and visual order both matter (CSS could reorder the cards).
    expect(await checklist.evaluate((element, testId) => {
      const other = document.querySelector(`[data-testid="${testId}"]`)!;
      return !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)
        && element.getBoundingClientRect().bottom <= other.getBoundingClientRect().top;
    }, id), `${id} must follow the entire checklist`).toBe(true);
  }
  await expectPrivateItemsAbsent(page);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile390", width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block" });

    test("Users planner link encodes email and opens the staff list, not the admin redirect", async ({ page, traffic }) => {
      await page.goto("/admin");
      await page.getByTestId("tab-users").click();
      if (viewport.width === 390) {
        const title = await page.getByText("User Management", { exact: true }).boundingBox();
        const actions = await page.getByTestId("link-admin-users-heartplan-completion").boundingBox();
        expect(title).not.toBeNull();
        expect(actions).not.toBeNull();
        expect(title!.y + title!.height).toBeLessThanOrEqual(actions!.y);
        expect(actions!.x + actions!.width).toBeLessThanOrEqual(viewport.width);
        await expect(page.getByTestId("button-case-sally-help")).toBeVisible();
        await expect(page.getByTestId("button-sally-toggle")).toHaveCount(0);
      }
      const link = page.getByTestId("link-user-heartplan-completion-synthetic-planner");
      await expect(link).toHaveAttribute("href", `/heartplans?q=${encodeURIComponent(plannerEmail)}`);
      await link.click();
      await expect(page).toHaveURL(`/heartplans?q=${encodeURIComponent(plannerEmail)}`);
      await expect(page.getByTestId("text-admin-heartplans-title")).toHaveText("HeartPlans");
      await expect(page.getByTestId("input-heartplan-search")).toHaveValue(plannerEmail);
      await expect.poll(() => traffic.reads.some((url) =>
        url.pathname === "/api/admin/heartplans" && url.searchParams.get("q") === plannerEmail
        && url.searchParams.size === 1,
      )).toBe(true);
      await expectPrivateItemsAbsent(page);
    });

    test("direct list and first-column completion links remain usable with partial and zero plans", async ({ page, traffic }) => {
      await page.goto(`/heartplans?q=${encodeURIComponent(plannerEmail)}`);
      await expect(page.getByTestId("text-admin-heartplans-title")).toBeVisible();
      await expect(page).toHaveURL(`/heartplans?q=${encodeURIComponent(plannerEmail)}`);
      // Fresh load exercises the actual App admin guard, not just client-side navigation.
      await page.reload();
      await expect(page.getByTestId("text-admin-heartplans-title")).toBeVisible();
      await expect(page).toHaveURL(`/heartplans?q=${encodeURIComponent(plannerEmail)}`);

      for (const fixture of syntheticPlans) {
        const { id, progress } = fixture.row;
        const row = page.getByTestId(`heartplan-row-${id}`);
        const firstCell = row.locator("td").first();
        const completion = page.getByTestId(`link-heartplan-completion-${id}`);
        const name = page.getByTestId(`link-heartplan-name-${id}`);
        await expect(firstCell).toContainText(`View completion · ${progress.percent}% (${progress.completed}/6)`);
        await expect(firstCell.getByTestId(`link-heartplan-completion-${id}`)).toHaveCount(1);
        await expectHorizontallyReachable(page, name);
        await expectHorizontallyReachable(page, completion);
        await expectPrivateItemsAbsent(page);
        await completion.click();
        await expect(page).toHaveURL(`/admin/heartplan/${id}?q=${encodeURIComponent(plannerEmail)}`);
        await expectChecklist(page, fixture);
        if (viewport.name === "mobile390") {
          await expectHorizontallyReachable(page, page.getByTestId("card-heartplan-completion"));
          for (const section of Object.keys(progress.sections)) {
            await expectHorizontallyReachable(page, page.getByTestId(`completion-section-${section}`));
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        }
        const back = page.getByTestId("link-back-heartplans");
        await expect(back).toHaveAttribute("href", `/heartplans?q=${encodeURIComponent(plannerEmail)}`);
        await expectHorizontallyReachable(page, back);
        await back.click();
        await expect(page.getByTestId("input-heartplan-search")).toHaveValue(plannerEmail);
        await expect(page).toHaveURL(`/heartplans?q=${encodeURIComponent(plannerEmail)}`);
      }
      // The planner name is another discoverable first-column entry point.
      await page.getByTestId("link-heartplan-name-synthetic-partial").click();
      await expectChecklist(page, syntheticPlans[0]);
      await expect.poll(() => traffic.reads.some(({ pathname }) =>
        pathname === "/api/admin/heartplans/synthetic-zero",
      )).toBe(true);
    });

    test("direct detail reload and error Back link retain q without private reads", async ({ page }) => {
      const q = "Synthetic + & query=1";
      await page.goto(`/admin/heartplan/synthetic-zero?q=${encodeURIComponent(q)}`);
      await expectChecklist(page, syntheticPlans[1]);
      await page.reload();
      await expectChecklist(page, syntheticPlans[1]);
      await expect(page.getByTestId("link-back-heartplans")).toHaveAttribute("href", `/heartplans?q=${encodeURIComponent(q)}`);
      await page.route("**/api/admin/heartplans/synthetic-zero", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic outage" }) }),
      );
      await page.reload();
      await expect(page.getByText("HeartPlan details could not be loaded")).toBeVisible();
      const back = page.getByRole("link", { name: "Back to HeartPlans" });
      await expect(back).toHaveAttribute("href", `/heartplans?q=${encodeURIComponent(q)}`);
      await back.click();
      await expect(page.getByTestId("input-heartplan-search")).toHaveValue(q);
    });
  });
}

for (const role of ["planner", "user", "funeral_home"]) {
  test.describe(`${role} authorization boundary`, () => {
    test.use({ syntheticRole: role, serviceWorkers: "block" });
    test("list and detail redirect before fetching staff data", async ({ page, traffic }) => {
      const destination = role === "planner" ? "/heartplan" : role === "user" ? "/" : "/funeral-home";
      for (const path of ["/heartplans?q=synthetic", "/admin/heartplan/synthetic-partial?q=synthetic"]) {
        await page.goto(path);
        await expect(page).toHaveURL(destination);
        await expect(page.getByTestId("text-admin-heartplans-title")).toHaveCount(0);
        await expect(page.getByTestId("card-heartplan-completion")).toHaveCount(0);
        await expectPrivateItemsAbsent(page);
      }
      expect(traffic.reads.filter(({ pathname }) => pathname.startsWith("/api/admin/"))).toEqual([]);
    });
  });
}
