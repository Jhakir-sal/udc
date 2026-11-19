import { expect, test, type Page } from "@playwright/test";
import { ORSA_WARMUP_DEFAULTS, ORSA_WARMUP_EXPANDED_PRESET, ORSA_FULL_LIST_PRESET } from "../../shared/orsaWarmupDefaults";

const base = "/api/admin/orsa/email-warmup";
const fields = ["hourlyLimit", "dailyLimit", "minIntervalSeconds", "providerHourlyLimit", "reservedHourly"] as const;

/** Every API call is intercepted, including unknown sends. No real login or email. */
async function syntheticWarmup(page: Page, baseURL: string, enabled: boolean, paused: boolean, dailyReviewRequired = false, withCampaign = false) {
  let settings = { ...ORSA_WARMUP_DEFAULTS, enabled, paused, pauseReason: null, dailyReviewRequired };
  const usage = { hourly: 7, daily: 73, otherHourly: 3, otherDaily: 11 };
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const forbidden: string[] = [];
  let statusReads = 0;
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const origin = new URL(baseURL).origin;
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/objects/")) return route.continue();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() !== "GET") {
      if (request.method() === "PUT" && url.pathname === base) {
        const body = request.postDataJSON();
        writes.push({ method: request.method(), path: url.pathname, body });
        const { acknowledgeProviderLimits, reviewedDeliveryStats, ...values } = body;
        settings = { ...settings, ...values, dailyReviewRequired: false };
        return json({ settings, usage });
      }
      forbidden.push(`${request.method()} ${url.pathname}`);
      return json({ error: "Real mutations forbidden" }, 405);
    }
    if (/\/(send|preview|confirm)(\/|$)/.test(url.pathname) || url.pathname.startsWith("/objects/")) {
      forbidden.push(`GET ${url.pathname}`);
      return json({ error: "Recipient and private reads forbidden" }, 403);
    }
    if (url.pathname === base) {
      statusReads++;
      return json({
        settings, usage, remaining: { hourly: settings.hourlyLimit - 7, daily: settings.dailyLimit - 73 },
        nextAllowedAt: null,
      });
    }
    if (url.pathname === "/api/auth/user") return json({
      id: "synthetic-admin", role: "admin", destination: "/admin", permissions: [],
      mfaRequired: false, firstName: "Synthetic", lastName: "Admin", email: "admin@example.invalid",
    });
    if (url.pathname === "/api/user/role") return json({ role: "admin", permissions: [] });
    if (withCampaign && url.pathname === "/api/admin/orsa/email-campaign") return json({
      templates: [{ id: "link-recovery", subject: "Activate your HeartPlan", preheader: "Protect your family",
        suggestedSendDate: "2026-11-09", sendable: true }],
      eligibleCount: 6000, suppressedCount: 5, sentCounts: {}, engagement: {}, needsReviewCount: {},
      optoutsReviewed: true, configured: true,
    });
    if (url.pathname === "/api/admin/orsa/roster") return json({ roster: [] });
    if (url.pathname === "/api/admin/orsa/household-billing") return json({ households: [] });
    if (url.pathname.endsWith("/unread-count")) return json({ count: 0 });
    // Unrelated campaign panels show their explicit unavailable state. Never
    // fall through to live APIs, even if a future panel adds a new endpoint.
    return json({ error: "Not part of this isolated warmup fixture" }, 503);
  });
  return { writes, forbidden, pageErrors, saved: () => settings, statusReads: () => statusReads };
}

const providerAck = (page: Page) => page.getByTestId("checkbox-orsa-warmup-provider-ack");
const statsAck = (page: Page) => page.getByTestId("checkbox-orsa-warmup-stats-reviewed");
const save = (page: Page) => page.getByTestId("button-orsa-warmup-save");
const load = (page: Page) => page.getByTestId("button-orsa-warmup-load-expanded");
async function openEmailSettings(page: Page) {
  await page.getByRole("button", { name: "Email campaigns", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Email delivery settings and global pause" }).click();
}

test.use({ serviceWorkers: "block" });
for (const { enabled, paused } of [
  { enabled: false, paused: true }, { enabled: true, paused: true },
  { enabled: true, paused: false }, { enabled: false, paused: false },
]) {
  test(`expanded preset remains an unsaved draft (enabled=${enabled}, paused=${paused})`, async ({ page, baseURL }) => {
    const traffic = await syntheticWarmup(page, baseURL!, enabled, paused);
    await page.clock.install();
    await page.goto("/admin/orsa");
    await openEmailSettings(page);
    const usage = page.getByTestId("orsa-warmup-usage");
    await expect(usage).toBeVisible();
    const beforeUsage = await usage.innerText();
    const beforeSettings = structuredClone(traffic.saved());
    await providerAck(page).check();
    await statsAck(page).check();
    await load(page).click();
    await expect(page.getByTestId("orsa-warmup-preset-unsaved-status")).toContainText("unsaved draft");
    for (const field of fields) {
      await expect(page.getByTestId(`input-orsa-warmup-${field}`)).toHaveValue(String(ORSA_WARMUP_EXPANDED_PRESET[field]));
    }
    await expect(page.getByTestId("checkbox-orsa-warmup-enabled")).toBeChecked({ checked: enabled });
    await expect(page.getByTestId("checkbox-orsa-warmup-paused")).toBeChecked({ checked: paused });
    await expect(providerAck(page)).not.toBeChecked();
    await expect(statsAck(page)).not.toBeChecked();
    await expect(save(page)).toBeDisabled();
    expect(await usage.innerText()).toBe(beforeUsage);
    expect(traffic.saved()).toEqual(beforeSettings);
    expect(traffic.writes).toEqual([]);
    // A refetch must neither overwrite the draft nor commit it.
    const readsBefore = traffic.statusReads();
    await page.clock.runFor(15_001);
    await expect.poll(() => traffic.statusReads()).toBeGreaterThan(readsBefore);
    await expect(page.getByTestId("input-orsa-warmup-dailyLimit")).toHaveValue("1000");
    expect(await usage.innerText()).toBe(beforeUsage);
    await page.reload();
    await openEmailSettings(page);
    await expect(page.getByTestId("input-orsa-warmup-dailyLimit")).toHaveValue("250");
    await expect(page.getByTestId("orsa-warmup-preset-unsaved-status")).toHaveCount(0);
    expect(traffic.writes).toEqual([]);
    expect(traffic.forbidden).toEqual([]);
    expect(traffic.pageErrors).toEqual([]);
  });
}

test("save requires both fresh reviews, rejects four seconds, serializes numbers, and never sends email", async ({ page, baseURL }) => {
  const traffic = await syntheticWarmup(page, baseURL!, true, false);
  await page.goto("/admin/orsa");
  await openEmailSettings(page);
  await load(page).click();
  await expect(save(page)).toBeDisabled();
  await providerAck(page).check();
  await expect(save(page)).toBeDisabled();
  await providerAck(page).uncheck();
  await statsAck(page).check();
  await expect(save(page)).toBeDisabled();
  await providerAck(page).check();
  await expect(save(page)).toBeEnabled();
  await page.getByTestId("input-orsa-warmup-minIntervalSeconds").fill("4");
  await expect(save(page)).toBeDisabled();
  expect(traffic.writes).toEqual([]);
  // Fill every numeric input rather than testing only numeric preset constants.
  for (const field of fields) {
    await page.getByTestId(`input-orsa-warmup-${field}`).fill(String(ORSA_WARMUP_EXPANDED_PRESET[field]));
  }
  await save(page).click();
  await expect(page.getByTestId("orsa-warmup-save-success")).toBeVisible();
  expect(traffic.writes).toEqual([{
    method: "PUT", path: base, body: {
      enabled: true, paused: false, ...ORSA_WARMUP_EXPANDED_PRESET,
      acknowledgeProviderLimits: true, reviewedDeliveryStats: true,
    },
  }]);
  for (const field of fields) expect(typeof traffic.writes[0].body[field]).toBe("number");
  await expect(providerAck(page)).not.toBeChecked();
  await expect(statsAck(page)).not.toBeChecked();
  await expect(page.getByTestId("orsa-warmup-preset-unsaved-status")).toHaveCount(0);
  await expect(page.getByTestId("orsa-warmup-usage")).toContainText("73");
  await page.reload();
  await openEmailSettings(page);
  await expect(page.getByTestId("input-orsa-warmup-dailyLimit")).toHaveValue("1000");
  expect(traffic.forbidden).toEqual([]);
  expect(traffic.pageErrors).toEqual([]);
});

test("full-list controls remain draft-only and review-all selects a large group without sending", async ({ page, baseURL }, testInfo) => {
  const traffic = await syntheticWarmup(page, baseURL!, true, false, false, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/orsa");
  await openEmailSettings(page);
  await page.getByTestId("button-orsa-warmup-load-full-list").click();
  for (const field of fields) {
    await expect(page.getByTestId(`input-orsa-warmup-${field}`)).toHaveValue(String(ORSA_FULL_LIST_PRESET[field]));
  }
  await expect(save(page)).toBeDisabled();
  await expect(page.getByTestId("orsa-warmup-preset-unsaved-status")).toContainText("unsaved draft");
  expect(traffic.writes).toEqual([]);
  await page.getByTestId("button-orsa-email-review-all").click();
  await expect(page.getByTestId("input-orsa-email-recipient-group-size")).toHaveValue("10000");
  expect(traffic.forbidden).toEqual([]);
  await providerAck(page).check();
  await statsAck(page).check();
  await save(page).click();
  expect(traffic.writes).toHaveLength(1);
  expect(traffic.writes[0].body).toMatchObject(ORSA_FULL_LIST_PRESET);
  await expect(page.getByTestId("orsa-warmup-save-success")).toBeVisible();
  await page.getByTestId("button-orsa-warmup-load-full-list").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("orsa-full-list-mobile.png") });
  expect(traffic.forbidden).toEqual([]);
  expect(traffic.pageErrors).toEqual([]);
});

test("daily review can be saved without changing limits only after both acknowledgements", async ({ page, baseURL }) => {
  const traffic = await syntheticWarmup(page, baseURL!, true, false, true);
  await page.goto("/admin/orsa");
  await openEmailSettings(page);
  await expect(page.getByTestId("card-orsa-warmup-controls")).toContainText("Daily delivery review required");
  await expect(save(page)).toBeDisabled();
  await providerAck(page).check();
  await expect(save(page)).toBeDisabled();
  await statsAck(page).check();
  await save(page).click();
  await expect(page.getByTestId("orsa-warmup-save-success")).toBeVisible();
  expect(traffic.saved().dailyReviewRequired).toBe(false);
  expect(traffic.writes).toHaveLength(1);
  expect(traffic.forbidden).toEqual([]);
  expect(traffic.pageErrors).toEqual([]);
});
