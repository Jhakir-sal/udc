import { expect, test } from "@playwright/test";
import type { OutreachMember } from "../../shared/orsaOutreach";

test("ORSA outreach separates opt-outs and first contact without sending", async ({ page, baseURL }, testInfo) => {
  const writes: Array<{ path: string; body: any }> = [];
  const forbidden: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const origin = new URL(baseURL!).origin;
  const members: OutreachMember[] = [
    {
      id: "fresh", displayName: "Synthetic Fresh Member", email: "fresh@example.invalid", phone: "+12025550101",
      active: true, emailState: "not_contacted", smsState: "not_contacted", emailAttempted: false,
      smsAttempted: false, emailLastAttemptAt: null, smsLastAttemptAt: null, canEmail: true, canText: true, signedUp: false,
    },
    {
      id: "stop", displayName: "Synthetic SMS Stop", email: "stop@example.invalid", phone: "+12025550102",
      active: true, emailState: "submitted", smsState: "opted_out", emailAttempted: true,
      smsAttempted: true, emailLastAttemptAt: "2026-11-09T15:00:00Z", smsLastAttemptAt: "2026-11-09T16:00:00Z",
      canEmail: false, canText: false, signedUp: false,
    },
    {
      id: "uncertain", displayName: "Synthetic Queued Member", email: "queued@example.invalid", phone: "+12025550103",
      active: true, emailState: "not_contacted", smsState: "submitted", emailAttempted: false,
      smsAttempted: true, emailLastAttemptAt: null, smsLastAttemptAt: "2026-11-09T16:00:00Z",
      canEmail: true, canText: false, signedUp: false,
    },
  ];
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/objects/")) return route.continue();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "POST" && url.pathname === "/api/admin/orsa/email-campaign/preview") {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, body });
      return json({
        previewId: "00000000-0000-4000-8000-000000000001", audience: body.audience,
        subject: "Protect your future and family with HeartPlan", html: "<p>Synthetic email preview only</p>",
        text: "Synthetic email preview only", eligibleCount: 2, availableCount: 2, groupLimit: 10, alreadySentCount: 0,
        recipients: members.filter(row => row.canEmail).map(row => ({ email: row.email, displayName: row.displayName })),
      });
    }
    if (request.method() !== "GET") {
      forbidden.push(`${request.method()} ${url.pathname}`);
      return json({ error: "Sending and mutations are prohibited in this fixture" }, 403);
    }
    if (url.pathname === "/api/auth/user") return json({
      id: "synthetic-admin", role: "admin", destination: "/admin", permissions: [], mfaRequired: false,
      firstName: "Synthetic", email: "synthetic@example.invalid",
    });
    if (url.pathname === "/api/user/role") return json({ role: "admin", permissions: [] });
    if (url.pathname.endsWith("/unread-count")) return json({ count: 0 });
    if (url.pathname === "/api/admin/orsa/outreach") {
      const group = url.searchParams.get("group"), q = url.searchParams.get("q") || "";
      const filtered = members.filter(row =>
        (group === "not_emailed" ? !row.emailAttempted : group === "opted_out" ? row.smsState === "opted_out" : true) &&
        (!q || row.displayName?.toLowerCase().includes(q.toLowerCase())));
      return json({
        members: filtered, total: filtered.length, counts: {
          all: 3, emailed: 1, texted: 2, both_contacted: 1, email_only: 0, sms_only: 1,
          not_emailed: 2, not_texted: 1, no_outreach: 1, opted_out: 1, needs_review: 1,
          email_opted_out: 0, sms_opted_out: 1,
        },
        offset: 0, limit: 50, checkedAt: "2026-11-16T16:00:00Z", smsPaused: true, smsRunStatus: "paused",
      });
    }
    if (url.pathname === "/api/admin/orsa/email-campaign") return json({
      templates: [
        { id: "launch-week", subject: "Protect your future and family with HeartPlan", preheader: "Help your family", suggestedSendDate: "2026-09-29", sendable: false, reason: "Synthetic preview only" },
        { id: "link-recovery", subject: "Activate your ORSA HeartPlan account", preheader: "Help your family", suggestedSendDate: "2026-10-02", sendable: false },
      ],
      eligibleCount: 3, suppressedCount: 0, sentCounts: {}, engagement: {}, needsReviewCount: {}, optoutsReviewed: true, configured: false,
    });
    if (url.pathname === "/api/admin/orsa/email-warmup") return json({
      settings: { enabled: true, paused: true, dailyReviewRequired: false, dailyLimit: 1000, hourlyLimit: 100,
        minIntervalSeconds: 30, providerHourlyLimit: 120, reservedHourly: 20, pauseReason: "Synthetic paused fixture" },
      usage: { hourly: 0, daily: 0, otherHourly: 0, otherDaily: 0 },
      remaining: { hourly: 100, daily: 1000 }, nextAllowedAt: null,
    });
    return json({});
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/orsa");
  await expect(page.getByRole("heading", { name: "ORSA membership operations" })).toBeVisible();
  await expect(page.getByText("Never text an SMS opt-out.", { exact: true })).toBeVisible();
  await expect(page.getByText("SMS campaign paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic SMS Stop" })).toBeVisible();
  await expect(page.getByText("Submitted · delivery unconfirmed", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("orsa-outreach-desktop.png") });
  await expect(page.getByTestId("orsa-email-attempt-stop")).toHaveText("Email attempt recorded");
  await expect(page.getByTestId("orsa-text-attempt-stop")).toHaveText("Text attempt recorded");
  await expect(page.getByTestId("orsa-email-attempt-fresh")).toHaveText("No email attempt recorded");
  await page.getByRole("button", { name: /1 Any opt-out/ }).click();
  await expect(page.getByRole("heading", { name: "Synthetic SMS Stop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic Fresh Member" })).toHaveCount(0);
  await expect(page.getByText("Do not text this number.", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("orsa-outreach-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /2 No email attempt/ }).click();
  await expect(page.getByRole("heading", { name: "Synthetic SMS Stop" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review eligible email preview" }).click();
  await expect(page.locator("#orsa-email-audience")).toHaveValue("never_emailed");
  await expect(page.locator("#orsa-email-template")).toHaveValue("launch-week");
  expect(writes).toHaveLength(0);
  await page.getByTestId("button-orsa-email-preview").click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ templateId: "launch-week", audience: "never_emailed", retryHeld: false });
  await expect(page.getByText("Approved scope:", { exact: false })).toContainText("No recorded prior email attempt");
  await expect(page.getByRole("list", { name: "ORSA email campaign recipients" })).not.toContainText("Synthetic SMS Stop");
  await page.getByRole("button", { name: "Outreach history", exact: true }).click();
  await page.getByRole("button", { name: "Email campaigns", exact: true }).click();
  await expect(page.getByText("Approved scope:", { exact: false })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Email delivery settings and global pause" }).click();
  await page.getByTestId("button-orsa-warmup-load-fast").click();
  await expect(page.getByTestId("input-orsa-warmup-minIntervalSeconds")).toHaveValue("4");
  await expect(page.getByTestId("input-orsa-warmup-hourlyLimit")).toHaveValue("900");
  await expect(page.getByTestId("input-orsa-warmup-dailyLimit")).toHaveValue("10000");
  await expect(page.getByTestId("checkbox-orsa-warmup-paused")).toBeChecked();
  await expect(page.getByTestId("button-orsa-warmup-save")).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});
