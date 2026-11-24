import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ viewport: { width: 1536, height: 720 } });

type Session = "signed-out" | "planner" | "demo" | "family" | "admin";

async function mockSession(page: Page, session: Session) {
  const protectedRequests: string[] = [];
  await page.addInitScript(() => sessionStorage.setItem("sally-auto-opened", "1"));
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/auth/user") {
      if (session === "signed-out") return json({ error: "Not authenticated" }, 401);
      return json({
        id: "route-access-test",
        role: session === "family" ? "user" : session === "admin" ? "admin" : "planner",
        destination: session === "admin" ? "/admin" : session === "family" ? "/" : "/heartplan",
        email: "route-test@example.invalid", permissions: [], mfaRequired: false,
        isDemoAccount: session === "demo",
      });
    }
    if (path === "/api/heartplan/intake") return json({ required: false });
    if (path === "/api/onboarding/status") return json({ complete: true, certificateId: "00000000-0000-4000-8000-000000000001" });
    if (path === "/api/auth/pending-heartplan-registration") return json({ pending: false });
    if (path === "/api/funeral-home-upload/test-token") return json({ status: "pending", funeralHomeName: "Example Home" });
    if (path === "/api/outreach/unsubscribe/test-token") return json({ unsubscribed: true });
    if (path === "/api/heartplan/advisor/test-plan" || path === "/api/referrals/test-referral/confirmation") {
      protectedRequests.push(path);
      // The error page is rendered only after the protected page actually makes its request.
      return json({ error: "No matching invitation" }, 404);
    }
    // Keep this route test isolated from real account data and external services.
    return json({ error: `Unexpected API request: ${path}` }, 404);
  });
  return protectedRequests;
}

async function expectPublicShell(page: Page) {
  await expect(page.getByRole("navigation", { name: "Public navigation" }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Footer navigation" })).toBeVisible();
  await expect(page.locator("#public-page-content")).toBeVisible();
  await expect(page.getByTestId("button-sidebar-toggle")).toHaveCount(0);
}

const signedOutEntryPages = [
  ["/register", "Create your account"],
  ["/family-register", "Invitation link unavailable"],
  ["/heartplan-register", "Create your HeartPlan"],
  ["/login", "Welcome back"],
  ["/team-login", "Welcome back"],
  ["/forgot-password", "Reset Password"],
  ["/demo", "Choose the experience you want to explore"],
  ["/demo/heartplan", "Your HeartPlan"],
  ["/demo/family", "Identity & authorization"],
  ["/demo/partner", "Partner Portal"],
  ["/demo/lpoa", "Practice Limited Power of Attorney"],
  ["/report-loss", "Tell us about a loss"],
  ["/referral-confirmation/test-referral", "Welcome back"],
  ["/heartplan/advisor/test-plan", "Welcome back"],
] as const;

test("signed-out entry pages use the public shell without exposing protected invite content", async ({ page }) => {
  test.setTimeout(120_000);
  const requests = await mockSession(page, "signed-out");
  for (const [path, content] of signedOutEntryPages) {
    await page.goto(path);
    await expectPublicShell(page);
    await expect(page.locator("#public-page-content").getByText(content, { exact: true }).first()).toBeVisible();
    if (path.includes("referral-confirmation") || path.includes("/advisor/")) {
      await expect(page.getByTestId("input-email")).toBeVisible();
    }
  }
  expect(requests).toEqual([]);
});

async function expectEntryLinks(page: Page) {
  const nav = page.getByRole("navigation", { name: "Public navigation" });
  for (const [label, href] of [
    ["Family sign in", "/login"],
    ["Partner portal", "/blockchain"],
    ["Make a HeartPlan", "/heartplan-register"],
    ["Create account", "/register"],
    ["Team sign in", "/team-login"],
    ["View demo", "/demo"],
  ]) {
    await expect(nav.first().getByRole("link", { name: label })).toHaveAttribute("href", href);
  }
  await page.setViewportSize({ width: 768, height: 720 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  for (const href of ["/login", "/blockchain", "/heartplan-register", "/register", "/team-login", "/demo"]) {
    await expect(nav.last().locator(`a[href="${href}"]`)).toHaveCount(1);
  }
  await page.setViewportSize({ width: 1536, height: 720 });
}

test("compact navigation remains usable between the xl and 2xl breakpoints", async ({ page }) => {
  await mockSession(page, "signed-out");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/legal/terms");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.locator("#public-mobile-navigation")).toBeVisible();
  await expect(page.locator("#public-mobile-navigation").getByRole("link", { name: "Create account" })).toBeVisible();
});

test("signed-in non-demo accounts keep registration and demo pages inside private routing", async ({ page }) => {
  test.setTimeout(120_000);
  await mockSession(page, "planner");
  for (const path of ["/register", "/heartplan-register", "/demo", "/demo/family", "/demo/select"]) {
    await page.goto(path);
    await expect(page.getByTestId("button-sidebar-toggle")).toBeVisible();
    await expect(page.getByRole("heading", { name: "404 Page Not Found" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Public navigation" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Footer navigation" })).toHaveCount(0);
  }
  await page.goto("/family-register");
  await expectPublicShell(page);
  await expect(page.getByRole("heading", { name: "Invitation link unavailable" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("button-sidebar-toggle")).toBeVisible();
  await expect(page.locator("#public-page-content")).toHaveCount(0);
});

for (const session of ["family", "admin"] as const) {
  test(`${session} dashboard keeps the private shell`, async ({ page }) => {
    await mockSession(page, session);
    await page.goto(session === "admin" ? "/admin" : "/");
    await expect(page.getByTestId("button-sidebar-toggle")).toBeVisible();
    await expect(page.locator("#public-page-content")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Footer navigation" })).toHaveCount(0);
  });
}

test("demo accounts can still open demo pages in the public shell", async ({ page }) => {
  await mockSession(page, "demo");
  await page.goto("/demo");
  await expectPublicShell(page);
  await expectEntryLinks(page);
  await page.goto("/demo/family");
  await expectPublicShell(page);
  await expect(page.getByTestId("demo-family-greeting")).toBeVisible();
  await page.goto("/legal/terms");
  await expectPublicShell(page);
  await expect(page.getByRole("link", { name: "Back to demo" })).toHaveAttribute("href", "/demo");
  await expectEntryLinks(page);
});

test("demo entry links lead to accessible experiences, not registration or the private portal", async ({ page }) => {
  await mockSession(page, "demo");
  for (const [label, destination] of [
    ["Create account", "/demo/family"],
    ["Make a HeartPlan", "/demo/heartplan"],
    ["Partner portal", "/demo/partner"],
  ]) {
    await page.goto("/legal/terms");
    await page.getByRole("navigation", { name: "Public navigation" }).first().getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expectPublicShell(page);
    await expect(page.getByRole("heading", { name: "404 Page Not Found" })).toHaveCount(0);
  }
});

for (const session of ["signed-out", "planner", "family", "admin"] as const) {
  test(`information and token-link pages stay public for ${session} visitors`, async ({ page }) => {
    test.setTimeout(120_000);
    await mockSession(page, session);
    for (const path of [
      "/legal/terms", "/legal/privacy", "/legal/tcpa", "/report-loss",
      "/activation-confirm", "/outreach/unsubscribe/test-token", "/funeral-home-upload/test-token",
    ]) {
      await page.goto(path);
      await expectPublicShell(page);
      const nav = page.getByRole("navigation", { name: "Public navigation" });
      if (session === "signed-out") {
        await expect(nav.first().getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
        await expect(nav.first().getByRole("link", { name: "View demo" })).toHaveAttribute("href", "/demo");
        if (path.startsWith("/legal/")) await expect(page.getByRole("link", { name: "Back to HeartPlan registration" })).toHaveAttribute("href", "/heartplan-register");
      } else {
        const dashboardHref = session === "admin" ? "/admin" : session === "planner" ? "/heartplan" : "/";
        await expect(nav.first().getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", dashboardHref);
        await expect(nav.first().getByRole("link", { name: "Report a loss" })).toHaveAttribute("href", "/report-loss");
        await expect(nav.first().locator("a")).toHaveCount(2);
        await expect(page.getByRole("link", { name: "Steps After Life home" })).toHaveAttribute("href", dashboardHref);
        await expect(page.getByTestId("button-public-dashboard-compact")).toHaveAttribute("href", dashboardHref);
        if (path.startsWith("/legal/")) await expect(page.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", dashboardHref);
      }
    }
    await expect(page.getByRole("heading", { name: "Secure certificate upload" })).toBeVisible();
    if (session === "signed-out") {
      await expectEntryLinks(page);
    } else {
      await page.setViewportSize({ width: 768, height: 720 });
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      const mobileNav = page.locator("#public-mobile-navigation");
      await expect(mobileNav.locator("a")).toHaveCount(2);
      await expect(mobileNav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", session === "admin" ? "/admin" : session === "planner" ? "/heartplan" : "/");
      await expect(mobileNav.getByRole("link", { name: "Report a loss" })).toHaveAttribute("href", "/report-loss");
      await mobileNav.getByRole("link", { name: "Dashboard" }).click();
      await expect(page.getByTestId("button-sidebar-toggle")).toBeVisible();
      await expect(page.getByRole("heading", { name: "404 Page Not Found" })).toHaveCount(0);
    }
  });
}

test("advisor and referral invitation content is reached only after sign-in", async ({ page }) => {
  const requests = await mockSession(page, "planner");
  for (const [path, apiPath] of [
    ["/heartplan/advisor/test-plan", "/api/heartplan/advisor/test-plan"],
    ["/referral-confirmation/test-referral", "/api/referrals/test-referral/confirmation"],
  ]) {
    await page.goto(path);
    await expectPublicShell(page);
    await expect.poll(() => requests.filter((request) => request === apiPath).length).toBeGreaterThan(0);
    await expect(page.getByTestId("input-email")).toHaveCount(0);
  }
});