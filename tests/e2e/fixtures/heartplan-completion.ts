import { expect, type Locator, type Page, type Route } from "@playwright/test";

export const plannerEmail = "synthetic.planner+completion&staff@example.invalid";
export const privateCanaries = [
  "PRIVATE_WISH_DO_NOT_RENDER", "PRIVATE_ASSET_DO_NOT_RENDER",
  "PRIVATE_CONTACT_DO_NOT_RENDER", "PRIVATE_DOCUMENT_DO_NOT_RENDER",
  "PRIVATE_MESSAGE_DO_NOT_RENDER",
] as const;

const createdAt = "2026-01-01T12:00:00.000Z";
const annualReview = { lastReviewedAt: null, nextReviewAt: "2027-01-01T12:00:00.000Z", due: false };
const privateItems = {
  wishes: { notes: privateCanaries[0] },
  assets: [{ name: privateCanaries[1], estimatedValue: "123456" }],
  contacts: [{ name: privateCanaries[2], email: "private-contact@example.invalid" }],
  documents: [{ filename: privateCanaries[3], url: "/objects/private-canary" }],
  letters: [{ content: privateCanaries[4] }],
};

export const syntheticPlans = [true, false].map((partial) => {
  const progress = {
    sections: { profile: partial, wishes: false, documents: partial, assets: false, contacts: false, letters: false },
    counts: { documents: partial ? 2 : 0, assets: 0, contacts: 0, letters: 0 },
    completed: partial ? 2 : 0, total: 6, percent: partial ? 33 : 0,
  };
  const plan = {
    id: partial ? "synthetic-partial" : "synthetic-zero",
    status: "draft", tier: "free", fullName: partial ? "Synthetic Partial Planner" : "Synthetic Zero Planner",
    createdAt, upgradedAt: null, certificateId: null, activatedAt: null, activatedByName: null,
    ...privateItems,
  };
  return {
    row: {
      ...plan, ownerName: plan.fullName, ownerEmail: plannerEmail,
      lastActivityAt: createdAt, primaryContactStatus: "missing", failedContactDeliveries: 0,
      pendingActivationRequests: 0, annualReview, progress,
    },
    detail: {
      plan, progress, owner: { id: `owner-${plan.id}`, email: plannerEmail, firstName: "Synthetic", lastName: "Planner" },
      payment: { tier: "free", paid: false, paidAt: null },
      contactDelivery: { failedCount: 0, primaryStatus: "missing" },
      annualReview,
      consent: { requiredPoliciesAccepted: true, communicationsConsent: false, records: [] },
      activationRequests: [],
      ...privateItems,
    },
  };
});

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Never pass an API request through: no login, database read, or mutation. */
export async function mockCompletionSession(page: Page, baseURL: string, role = "admin") {
  const reads: URL[] = [];
  const unexpected: string[] = [];
  const destinations: Record<string, string> = {
    admin: "/admin", planner: "/heartplan", user: "/", funeral_home: "/funeral-home",
  };
  const origin = new URL(baseURL).origin;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/objects/")) {
      return route.continue();
    }
    if (request.method() !== "GET") {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return json(route, { message: "Mutations are forbidden in completion tests" }, 405);
    }
    reads.push(url);
    if (url.pathname === "/api/auth/user") {
      return json(route, {
        id: `synthetic-${role}`, role, destination: destinations[role], permissions: [],
        mfaRequired: false, firstName: "Synthetic", lastName: "Staff", email: "staff@example.invalid",
      });
    }
    if (url.pathname === "/api/user/role") return json(route, { role, permissions: [] });
    if (url.pathname === "/api/admin/users") return json(route, [{
      id: "synthetic-planner", email: plannerEmail, firstName: "Synthetic", lastName: "Planner",
      role: "planner", phoneNumber: null, phoneVerified: false, twoFactorEnabled: false, createdAt,
    }]);
    if (url.pathname === "/api/admin/stats") return json(route, {});
    if (url.pathname === "/api/admin/sms/unread-count") return json(route, { count: 0 });
    if (url.pathname === "/api/sal-notifications/unread-count") return json(route, { count: 0 });
    if (url.pathname === "/api/admin/heartplans/progress-summary") {
      return json(route, { started: 1, thirtyPlus: 1, fiftyPlus: 0, seventyFivePlus: 0, complete: 0 });
    }
    if (url.pathname === "/api/admin/heartplans") return json(route, syntheticPlans.map(({ row }) => row));
    const detail = syntheticPlans.find(({ row }) => url.pathname === `/api/admin/heartplans/${row.id}`);
    if (detail) return json(route, detail.detail);
    // Minimal destinations for rejected non-admin visits.
    if (url.pathname === "/api/heartplan/intake") return json(route, { required: false });
    if (url.pathname === "/api/onboarding/status") return json(route, { complete: true });
    if (url.pathname === "/api/heartplan/status") return json(route, { eligible: false, hasPlan: false });
    if (url.pathname === "/api/certificates") return json(route, []);
    if (role !== "admin") return json(route, {});
    unexpected.push(`GET ${url.pathname}`);
    return json(route, { message: "Unmocked request blocked" }, 403);
  });
  return { reads, unexpected };
}

export async function expectPrivateItemsAbsent(page: Page) {
  for (const canary of privateCanaries) {
    await expect(page.locator("body")).not.toContainText(canary);
  }
  await expect(page.locator('a[href*="/objects/"], img[src*="/objects/"]')).toHaveCount(0);
}

/** Check before clicking: Playwright's auto-scroll must not hide a layout regression. */
export async function expectHorizontallyReachable(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(await locator.evaluate((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollLeft !== 0) return false;
    }
    return true;
  })).toBe(true);
}
