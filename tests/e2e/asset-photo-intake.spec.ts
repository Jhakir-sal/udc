import { expect, test } from "@playwright/test";
import { deflateSync } from "node:zlib";

// Fully intercepted synthetic fixture for /admin/valuations photo-first intake.
// No real valuations, uploads, storage, OpenAI calls, approvals, deletes, or sends.

const UPLOAD_PREFIX = "/__synthetic_upload__/";
const ANALYZE_PATH = "/api/admin/hard-asset-valuations/analyze";
const UPLOAD_URL_PATH = "/api/admin/hard-asset-valuations/upload-url";
const LIST_PATH = "/api/admin/hard-asset-valuations";
const FINALIZE_RE = /^\/api\/admin\/hard-asset-valuations\/attachments\/([^/]+)\/finalize$/;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

// Real decodable 8-bit RGB PNG with a gradient so the image is not blank.
function makePng(width: number, height: number, seed: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 3;
      raw[p] = (x * 255) / (width - 1) | 0;
      raw[p + 1] = (y * 255) / (height - 1) | 0;
      raw[p + 2] = (seed * 90 + x + y) % 256;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const valuation = {
  id: "b0000000-0000-4000-8000-000000000001",
  category: "collectible",
  itemName: "Blue ceramic vase",
  brand: null,
  model: null,
  condition: "good",
  aiSummary: "Synthetic rough estimate for fixture only. Not a live market search.",
  comparables: [],
  assumptions: [],
  risks: [],
  missingEvidence: [],
  fmvLowCents: 2000,
  fmvHighCents: 6000,
  fmvCents: 4000,
  offerCents: 3200,
  confidence: 35,
  status: "analyzed",
  createdAt: "2026-11-16T16:00:00.000Z",
  updatedAt: "2026-11-16T16:00:00.000Z",
  attachments: [],
  comparableSales: [],
  aiFmvLowCents: 2000,
  aiFmvHighCents: 6000,
  aiFmvCents: 4000,
  aiConfidence: 35,
  evidenceSummary: null,
  revision: 1,
};

test("photo-first valuation keeps private photos through a 400 estimate and completes on retry", async ({ page, baseURL }, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const writes: Array<Record<string, unknown>> = [];
  const forbidden: string[] = [];
  const external: string[] = [];
  const unhandledGets: string[] = [];
  const pageErrors: string[] = [];
  const analyzeBodies: Array<Record<string, unknown>> = [];
  const uploads = new Map<string, { fileName: string; contentType: string; fileSize: number }>();
  let attachmentSeq = 0;
  let analyzeCalls = 0;

  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (url.origin !== origin) {
      external.push(`${method} ${url.origin}${url.pathname}`);
      if (method !== "GET") forbidden.push(`${method} external ${url.origin}${url.pathname}`);
      return route.abort();
    }

    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (method === "PUT" && path.startsWith(UPLOAD_PREFIX)) {
      const body = request.postDataBuffer();
      writes.push({
        method,
        path,
        contentType: request.headers()["content-type"],
        bytes: body?.length ?? 0,
        magic: body?.subarray(0, 3).toString("hex"),
      });
      return route.fulfill({ status: 200, body: "" });
    }

    if (method === "POST" && path === UPLOAD_URL_PATH) {
      const body = request.postDataJSON() as { fileName: string; contentType: string; fileSize: number };
      attachmentSeq += 1;
      const id = `a0000000-0000-4000-8000-${String(attachmentSeq).padStart(12, "0")}`;
      uploads.set(id, { fileName: body.fileName, contentType: body.contentType, fileSize: body.fileSize });
      writes.push({ method, path, body });
      return json({
        attachment: {
          id, valuationId: null, objectPath: `/objects/synthetic/${id}`, fileName: body.fileName,
          contentType: body.contentType, fileSize: body.fileSize, status: "uploading",
        },
        uploadURL: `${origin}${UPLOAD_PREFIX}${id}`,
      });
    }

    const finalize = path.match(FINALIZE_RE);
    if (method === "POST" && finalize) {
      const id = finalize[1];
      const meta = uploads.get(id);
      writes.push({ method, path });
      if (!meta) return json({ message: "unknown synthetic attachment" }, 404);
      return json({
        id, valuationId: null, objectPath: `/objects/synthetic/${id}`, fileName: meta.fileName,
        contentType: meta.contentType, fileSize: meta.fileSize, status: "ready",
      });
    }

    if (method === "POST" && path === ANALYZE_PATH) {
      const body = request.postDataJSON() as Record<string, unknown>;
      analyzeBodies.push(body);
      writes.push({ method, path, body });
      analyzeCalls += 1;
      if (analyzeCalls === 1) return json({ message: "Add clearer photos of one item" }, 400);
      return json(valuation, 201);
    }

    if (method !== "GET") {
      forbidden.push(`${method} ${path}`);
      return json({ error: "Writes are prohibited in this fixture" }, 403);
    }

    if (path === "/api/auth/user") return json({
      id: "synthetic-admin", role: "admin", destination: "/admin", permissions: [], mfaRequired: false,
      firstName: "Synthetic", email: "synthetic@example.invalid",
    });
    if (path === "/api/user/role") return json({ role: "admin", permissions: [] });
    if (path.endsWith("/unread-count")) return json({ count: 0 });
    if (path === LIST_PATH) return json([]);
    if (path.startsWith("/api/")) {
      unhandledGets.push(path);
      return json({});
    }
    return route.continue();
  });

  const photos = [
    { name: "vase-front.png", mimeType: "image/png", buffer: makePng(96, 128, 0) },
    { name: "vase-maker-mark.png", mimeType: "image/png", buffer: makePng(128, 96, 1) },
  ];
  const photoThumbs = page.locator('img[alt^="Selected item photo"]');
  const readyLabel = page.getByText("Private photo ready", { exact: true });
  const runButton = page.getByTestId("button-run-valuation");

  // Mobile intake
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/valuations");
  await expect(page.getByRole("heading", { name: "Hard Asset Valuation" })).toBeVisible();
  await expect(page.locator('input[type="file"][capture="environment"]')).toHaveCount(1);
  await page.locator('input[type="file"][multiple][accept="image/jpeg,image/png,image/webp"]').setInputFiles(photos);
  await expect(readyLabel).toHaveCount(2);
  await expect(photoThumbs).toHaveCount(2);

  // Toggle manual and back to photo-first; photos must survive
  await page.getByRole("button", { name: "Manual intake" }).click();
  await expect(photoThumbs).toHaveCount(0);
  await page.getByRole("button", { name: "Photo first" }).click();
  await expect(readyLabel).toHaveCount(2);
  await expect(photoThumbs).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("asset-photo-intake-mobile-photos.png"), fullPage: true });
  const overflowIntake = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(overflowIntake.scrollWidth).toBeLessThanOrEqual(overflowIntake.innerWidth);

  // First estimate: 400 must keep both photos
  await runButton.click();
  await expect(page.getByText("Add clearer photos of one item", { exact: false }).first()).toBeVisible();
  await expect(readyLabel).toHaveCount(2);
  await expect(photoThumbs).toHaveCount(2);
  expect(analyzeCalls).toBe(1);

  // Retry with the same photos: 201 valuation
  await runButton.click();
  await expect(page.getByText("Blue ceramic vase", { exact: true })).toBeVisible();
  await expect(page.getByText("$20–$60", { exact: true })).toBeVisible();
  await expect(page.getByText("$40", { exact: true })).toBeVisible();
  await expect(page.getByText("$32", { exact: true })).toBeVisible();
  await expect(page.getByText("35% confidence", { exact: true })).toBeVisible();
  await expect(readyLabel).toHaveCount(0);
  await expect(photoThumbs).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("asset-photo-intake-mobile-result.png"), fullPage: true });
  const overflowMobile = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(overflowMobile.scrollWidth).toBeLessThanOrEqual(overflowMobile.innerWidth);

  // Desktop result
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText("Blue ceramic vase", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("asset-photo-intake-desktop-result.png"), fullPage: true });
  const overflowDesktop = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(overflowDesktop.scrollWidth).toBeLessThanOrEqual(overflowDesktop.innerWidth);

  // Assertions on recorded traffic
  const ids = [...uploads.keys()];
  expect(ids).toHaveLength(2);
  expect(analyzeBodies).toHaveLength(2);
  for (const body of analyzeBodies) {
    expect(Object.keys(body).sort()).toEqual(["attachmentIds", "photoMode"]);
    expect(body).toEqual({ photoMode: true, attachmentIds: ids });
  }
  const uploadBodies = writes.filter((w) => w.path === UPLOAD_URL_PATH) as Array<{ body: { contentType: string; fileName: string } }>;
  expect(uploadBodies.map((w) => w.body.contentType)).toEqual(["image/jpeg", "image/jpeg"]);
  expect(uploadBodies.every((w) => w.body.fileName.endsWith(".jpg"))).toBe(true);
  const puts = writes.filter((w) => w.method === "PUT") as Array<{ contentType: string; bytes: number; magic: string }>;
  expect(puts).toHaveLength(2);
  for (const put of puts) {
    expect(put.contentType).toContain("image/jpeg");
    expect(put.magic).toBe("ffd8ff");
    expect(put.bytes).toBeGreaterThan(0);
  }
  expect(writes.filter((w) => w.method === "POST" && String(w.path).endsWith("/finalize"))).toHaveLength(2);

  console.log(JSON.stringify({ writes, forbidden, external, unhandledGets, pageErrors, overflowIntake, overflowMobile, overflowDesktop }, null, 2));
  expect(forbidden).toEqual([]);
  expect(pageErrors).toEqual([]);
});
