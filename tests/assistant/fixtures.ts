import { test as base, expect, type Locator, type Page, type Route } from "@playwright/test";

export const caseA = "synthetic-case-a";
export const caseB = "synthetic-case-b";
export const paste = "Synthetic Community Bank checking account number: 987654321012\nAccount holder: Alex Synthetic";
export const account = {
  accountName: "Synthetic Community Bank", accountType: "Checking",
  category: "financial", accountNumberLast4: "1012", isJoint: false,
};
export const harnessPath = "/tests/assistant/index.html";

type Call = { path: string; body: any };
type Handler = (route: Route, call: Call) => Promise<void>;
type Stub = {
  calls: Call[];
  handlers: Map<string, Handler>;
  unexpected: string[];
};

export const test = base.extend<{ stub: Stub }>({
  stub: [async ({ page, baseURL }, use) => {
    const stub: Stub = { calls: [], handlers: new Map(), unexpected: [] };
    const origin = new URL(baseURL!).origin;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // CSS imports a webfont; intentionally deny it as well as all providers.
      if (url.origin !== origin) {
        if (!["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(url.origin)) {
          stub.unexpected.push(`${request.method()} ${url.href}`);
        }
        return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) {
        if (request.method() === "GET" && (
          url.pathname.startsWith("/tests/assistant/") ||
          /^\/(?:@vite|@react-refresh|@fs|@id|node_modules|client|shared)\b/.test(url.pathname)
        )) return route.continue();
        stub.unexpected.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      const call = { path: url.pathname, body: request.postDataJSON() };
      stub.calls.push(call);
      const handler = stub.handlers.get(call.path);
      if (request.method() === "POST" && handler) return handler(route, call);
      stub.unexpected.push(`${request.method()} ${call.path}`);
      return route.fulfill({ status: 403, json: { error: "Unexpected request denied by regression fixture" } });
    });
    page.on("pageerror", (error) => stub.unexpected.push(`Browser error: ${error.message}`));
    await use(stub);
    expect(stub.unexpected, "All API requests must be explicitly stubbed; external calls are denied").toEqual([]);
  }, { auto: true }],
});

export { expect };
export const assistantPath = (id = caseA) => `/api/admin/case/${id}/assistant`;
export const analyzePath = (id = caseA) => `/api/admin/case/${id}/account-intake/analyze`;
export const importPath = (id = caseA) => `/api/admin/case/${id}/account-intake/import`;

export function respond(stub: Stub, path: string, body: unknown) {
  stub.handlers.set(path, async (route) => { await route.fulfill({ json: body }); });
}

/** Hold a response until the test explicitly releases it, not a timing sleep. */
export function defer(stub: Stub, path: string) {
  let release!: (body: unknown) => void;
  const response = new Promise<unknown>((resolve) => { release = resolve; });
  stub.handlers.set(path, async (route) => {
    await route.fulfill({ json: await response });
  });
  return release;
}

export async function openAssistant(page: Page) {
  await page.goto(harnessPath);
  await page.getByTestId("button-open-assistant").click();
  await expect(page.getByTestId("input-assistant-message")).toBeVisible();
}

export async function send(page: Page, text: string) {
  await page.getByTestId("input-assistant-message").fill(text);
  await page.getByTestId("button-send-assistant").click();
}

export async function switchCase(page: Page, id: string) {
  await page.evaluate((id) => {
    history.pushState({}, "", `?case=${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, id);
  await expect(page.getByRole("dialog")).toContainText(id === caseA ? "Alex Synthetic" : "Blair Synthetic");
  await expect(page.getByTestId("assistant-chat-mode")).toBeVisible();
}

/** Actual hit-test and unforced click: visibility alone misses overlapping Sally. */
export async function hitAndClick(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  // Wait for the sheet's real opening transition and browser hit-testing.
  // A forced click, focus(), or fill() alone would conceal an overlay bug.
  await target.click({ trial: true });
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }), "Composer must receive pointer input, not Sally or an overlay").toBe(true);
  await target.click();
}
