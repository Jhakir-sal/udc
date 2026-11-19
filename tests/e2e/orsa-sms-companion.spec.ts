import { expect, test } from "@playwright/test";

test("companion preparation budgets other traffic and creates only a reviewed draft", async ({ page, baseURL }, testInfo) => {
  const writes: Array<{ path: string; body: any }> = [];
  const unexpected: string[] = [];
  const candidates = [1, 2, 3].map(index => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    displayName: `Synthetic Member ${index}`, phone: `+1202555010${index}`,
    eligible: index !== 3, reason: index === 3 ? "SMS opt-out — do not contact" : null, consentRecorded: false,
  }));
  const message = "ORSA + Steps After Life: Help protect your family's future. Start your HeartPlan: https://SALUDC.replit.app/orsa/heartplan Reply STOP to opt out.";
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/objects/")) return route.continue();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "POST" && url.pathname === "/api/admin/orsa/bulk-sms") {
      writes.push({ path: url.pathname, body: request.postDataJSON() });
      return json({ runId: "synthetic-run", queued: 1 }, 201);
    }
    if (request.method() !== "GET") {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return json({ error: "No live actions allowed" }, 403);
    }
    if (url.pathname === "/api/auth/user") return json({
      id: "synthetic-admin", role: "admin", destination: "/admin", permissions: [], mfaRequired: false,
      firstName: "Synthetic", email: "synthetic@example.invalid",
    });
    if (url.pathname === "/api/user/role") return json({ role: "admin", permissions: [] });
    if (url.pathname === "/api/admin/orsa/roster") return json({ roster: [] });
    if (url.pathname === "/api/admin/orsa/household-billing") return json({ households: [] });
    if (url.pathname.endsWith("/unread-count")) return json({ count: 0 });
    if (url.pathname === "/api/admin/orsa/bulk-sms") return json({
      candidates, runs: [], message, landingUrl: "https://SALUDC.replit.app/orsa/heartplan",
      deliveryEnabled: false, workerNotice: "Synthetic draft-only fixture",
    });
    return json({ error: "Not included in isolated fixture" }, 503);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/orsa");
  await page.getByRole("button", { name: "Text campaigns", exact: true }).click();
  await page.getByTestId("button-orsa-sms-companion-draft").click();
  await expect(page.getByTestId("orsa-sms-companion-settings")).toContainText("not sending");
  await expect(page.locator("#bulk-timezone")).toHaveValue("America/New_York");
  await expect(page.locator("#bulk-daily-limit")).toHaveValue("5900");
  await expect(page.getByRole("button", { name: "Create draft for 2 selected", exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await page.locator("#bulk-other-usage").fill("5899");
  await expect(page.locator("#bulk-daily-limit")).toHaveValue("1");
  const create = page.getByRole("button", { name: "Create draft for 1 selected", exact: true });
  await expect(create).toBeDisabled();
  await page.getByText("Explicit SMS permission confirmed.", { exact: true }).locator("..").locator("..").locator("input").check();
  // Locate the timezone confirmation by its enclosing label, not any audience checkbox.
  const timezoneLabel = page.locator("label").filter({ hasText: /I confirm.*time.?zone|confirmed.*time.?zone|selected.*time.?zone/i });
  await timezoneLabel.locator('input[type="checkbox"]').check();
  await expect(create).toBeEnabled();
  await page.locator("#bulk-schedule").fill("2020-11-09T10:00");
  await expect(create).toBeDisabled();
  await page.locator("#bulk-schedule").fill("");
  await expect(create).toBeEnabled();
  const submittedAfter = Date.now();
  await create.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ dailyLimit: 1, timezone: "America/New_York", intervalSeconds: 10, smsPermissionConfirmed: true });
  expect(writes[0].body.memberIds).toHaveLength(1);
  expect(writes[0].body.memberIds).not.toContain(candidates[2].id);
  expect(Date.parse(writes[0].body.scheduledAt)).toBeGreaterThanOrEqual(submittedAfter);
  expect(Date.parse(writes[0].body.scheduledAt)).toBeLessThanOrEqual(Date.now());
  expect(unexpected).toEqual([]);
  await page.getByTestId("orsa-sms-companion-settings").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("sms-companion-mobile.png") });
});
