import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { HardAssetValuation } from "@shared/schema";
import { hardAssetValuationRequestSchema, hardAssetComparablesUpdateSchema } from "@shared/schema";
import {
  calculateOfferCents,
  calculateComparableEvidence,
  normalizeValuationInsights,
  isSupportedValuationEvidence,
  isVerifiedValuationEvidenceUpload,
  HardAssetValuationRequestError,
  HardAssetValuationAnalysisError,
  HardAssetValuationSaveError,
  registerHardAssetValuationRoutes,
  valuationPersistenceFields,
  valuationItemFields,
  normalizePhotoValuationResponse,
  type HardAssetValuationRepository,
} from "./hardAssetValuation";

const photoIdentity = {
  category: "collectible", itemName: "Ceramic table vase", brand: null, model: null,
  yearOrEdition: null, condition: "good", conditionNotes: "Visible surface wear; underside not shown.",
  description: "A blue ceramic table vase with visible surface wear.",
};
const photoResponse = {
  summary: "A rough resale estimate for the ceramic vase visible in the photographs, without authentication.",
  fmvLowDollars: 20, fmvHighDollars: 60, fmvDollars: 40, confidence: 35,
  comparables: ["Generic decorative ceramic vases, not verified sales"],
  assumptions: ["Ordinary ceramic rather than authenticated collectible"],
  risks: ["Maker and internal condition unknown"],
  missingEvidence: ["Photograph of base markings"],
  identifiedItem: photoIdentity,
};

test("photo intake requires one to six distinct photos without manual details", () => {
  const ids = Array.from({ length: 7 }, () => crypto.randomUUID());
  const input = hardAssetValuationRequestSchema.parse({ photoMode: true, attachmentIds: ids.slice(0, 3) });
  assert.equal(input.photoMode, true);
  for (const body of [
    { photoMode: true, attachmentIds: [] },
    { photoMode: true, attachmentIds: ids },
    { photoMode: true, attachmentIds: [ids[0], ids[0]] },
    { photoMode: true, attachmentIds: [ids[0]], itemName: "Untrusted override" },
  ]) assert.equal(hardAssetValuationRequestSchema.safeParse(body).success, false);
});

test("photo analysis persists inferred identity and never the intake placeholders or authentication", () => {
  const input = hardAssetValuationRequestSchema.parse({ photoMode: true, attachmentIds: [crypto.randomUUID()] });
  const insights = normalizePhotoValuationResponse(photoResponse, true);
  const fields = valuationItemFields(input, insights);
  assert.equal(fields.itemName, photoIdentity.itemName);
  assert.equal(fields.category, "collectible");
  assert.equal(fields.authenticityStatus, "not_reviewed");
  assert.equal(insights.fmvCents, 4000);
  assert.equal("photoMode" in fields, false);
  assert.equal("attachmentIds" in fields, false);
  assert.throws(() => valuationItemFields(input, fakeInsights()), HardAssetValuationRequestError);
});

test("unclear photos and malformed identification never produce a fabricated estimate", () => {
  assert.throws(() => normalizePhotoValuationResponse({ identifiedItem: null, reason: "Photograph only one item at a time." }, true),
    /Photograph only one item/);
  assert.throws(() => normalizePhotoValuationResponse({ ...photoResponse, identifiedItem: { ...photoIdentity, category: "unknown" } }, true));
  assert.throws(() => normalizePhotoValuationResponse({ ...photoResponse, fmvDollars: 100 }, true), /range is inconsistent/);
});

test("purchase target is always FMV minus 20 percent", () => {
  assert.equal(calculateOfferCents(100_00), 80_00);
  assert.equal(calculateOfferCents(12_345), 9_876);
});

test("normalizes a valid AI valuation into cents", () => {
  const result = normalizeValuationInsights({
    summary: "A preliminary estimate based on the supplied model, age, and stated condition.",
    fmvLowDollars: 9000,
    fmvHighDollars: 11000,
    fmvDollars: 10000,
    confidence: 72,
    comparables: ["Similar reference class in good pre-owned condition"],
    assumptions: ["Serial and description are accurate"],
    risks: ["No physical inspection"],
    missingEvidence: ["Authentication report"],
  });
  assert.equal(result.fmvCents, 1_000_000);
  assert.equal(result.offerCents, 800_000);
});

test("rejects an FMV outside the estimated range", () => {
  assert.throws(() => normalizeValuationInsights({
    summary: "A preliminary estimate based on the supplied model, age, and stated condition.",
    fmvLowDollars: 9000,
    fmvHighDollars: 11000,
    fmvDollars: 12000,
    confidence: 50,
    comparables: [],
    assumptions: [],
    risks: [],
    missingEvidence: [],
  }), /range is inconsistent/);
});

test("maps the AI summary to the required persistence field", () => {
  const normalized = normalizeValuationInsights({
    summary: "A preliminary estimate based on the supplied model, age, and stated condition.",
    fmvLowDollars: 90,
    fmvHighDollars: 110,
    fmvDollars: 100,
    confidence: 60,
    comparables: [],
    assumptions: [],
    risks: [],
    missingEvidence: [],
  });
  const fields = valuationPersistenceFields(normalized);
  assert.equal(fields.aiSummary, normalized.summary);
  assert.equal(fields.offerCents, 8_000);
  assert.equal("summary" in fields, false);
});

test("accepts real-estate-specific valuation details", () => {
  const parsed = hardAssetValuationRequestSchema.parse({
    category: "real_estate",
    itemName: "Three-bedroom single-family home",
    propertyLocation: "Raleigh, NC 27609",
    propertyType: "Single-family",
    livingAreaSquareFeet: 1850,
    bedrooms: 3,
    bathrooms: "2.5",
    lotSize: "0.24 acres",
    yearOrEdition: "1988; kitchen renovated 2022",
    condition: "good",
    conditionNotes: "Maintained condition; roof age unknown",
    description: "Two-story home with attached garage and renovated kitchen.",
    saleContext: "Vacant delivery expected; verify recent nearby closed sales.",
  });
  assert.equal(parsed.category, "real_estate");
  assert.equal(parsed.livingAreaSquareFeet, 1850);
  assert.equal(parsed.authenticityStatus, "not_reviewed");
});

test("checks evidence signatures and rejects disguised files", () => {
  assert.equal(isSupportedValuationEvidence("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(isSupportedValuationEvidence("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(isSupportedValuationEvidence("image/webp", Buffer.from("RIFFxxxxWEBP")), true);
  assert.equal(isSupportedValuationEvidence("application/pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(isSupportedValuationEvidence("image/jpeg", Buffer.from("%PDF-1.7")), false);
  assert.equal(isSupportedValuationEvidence("text/plain", Buffer.from("not evidence")), false);
});

test("only promotes the exact verified evidence bytes", () => {
  const pdf = Buffer.from("%PDF-1.7");
  assert.equal(isVerifiedValuationEvidenceUpload({
    expectedContentType: "application/pdf",
    expectedSize: pdf.length,
    storedContentType: "application/pdf",
    storedSize: pdf.length,
    data: pdf,
  }), true);
  assert.equal(isVerifiedValuationEvidenceUpload({
    expectedContentType: "application/pdf",
    expectedSize: pdf.length,
    storedContentType: "application/pdf",
    storedSize: pdf.length,
    data: Buffer.from("%PDF-1.70"),
  }), false);
  assert.equal(isVerifiedValuationEvidenceUpload({
    expectedContentType: "application/pdf",
    expectedSize: pdf.length,
    storedContentType: "text/html",
    storedSize: pdf.length,
    data: Buffer.from("<html>xx"),
  }), false);
});

test("verified evidence weights stronger matches and drives the purchase target", () => {
  const common = { condition: "Used", included: true, verifiedBy: "admin", verifiedAt: new Date().toISOString() };
  const result = calculateComparableEvidence([
    { ...common, id: crypto.randomUUID(), soldAt: "2026-08-01", source: "Auction result", sourceUrl: null, priceCents: 100_000, matchQuality: "strong", exclusionReason: null },
    { ...common, id: crypto.randomUUID(), soldAt: "2026-08-02", source: "Dealer result", sourceUrl: null, priceCents: 200_000, matchQuality: "weak", exclusionReason: null },
    { ...common, id: crypto.randomUUID(), soldAt: "2026-08-03", source: "Irrelevant result", sourceUrl: null, priceCents: 900_000, matchQuality: "strong", included: false, exclusionReason: "Wrong model" },
  ], new Date("2026-09-01T00:00:00Z"));
  assert.equal(result?.fmvCents, 125_000);
  assert.equal(result?.offerCents, 100_000);
  assert.match(result?.evidenceSummary || "", /2 included verified sales/);
});

test("confidence falls when verified prices disagree or sales are stale", () => {
  const common = { condition: "Used", included: true, verifiedBy: "admin", verifiedAt: "2026-09-01T00:00:00.000Z", matchQuality: "strong" as const, exclusionReason: null };
  const consistent = calculateComparableEvidence([
    { ...common, id: crypto.randomUUID(), soldAt: "2026-08-01", source: "Sale one", sourceUrl: null, priceCents: 100_000 },
    { ...common, id: crypto.randomUUID(), soldAt: "2026-08-02", source: "Sale two", sourceUrl: null, priceCents: 105_000 },
  ], new Date("2026-09-01T00:00:00Z"));
  const staleAndDispersed = calculateComparableEvidence([
    { ...common, id: crypto.randomUUID(), soldAt: "2020-01-01", source: "Old sale one", sourceUrl: null, priceCents: 50_000 },
    { ...common, id: crypto.randomUUID(), soldAt: "2020-01-02", source: "Old sale two", sourceUrl: null, priceCents: 200_000 },
  ], new Date("2026-09-01T00:00:00Z"));
  assert.ok((consistent?.confidence || 0) > (staleAndDispersed?.confidence || 0));
  assert.match(consistent?.evidenceSummary || "", /Confidence reflects match quality and count/);
});

test("comparable updates require exclusion reasons and reject future sale dates", () => {
  const sale = {
    soldAt: "2026-08-01",
    source: "Auction result",
    sourceUrl: null,
    priceCents: 100_000,
    condition: "Good",
    matchQuality: "strong" as const,
    included: false,
    exclusionReason: null,
  };
  assert.equal(hardAssetComparablesUpdateSchema.safeParse({
    comparableSales: [sale],
    expectedRevision: 0,
  }).success, false);
  assert.equal(hardAssetComparablesUpdateSchema.safeParse({
    comparableSales: [{ ...sale, soldAt: "2999-01-01", included: true }],
    expectedRevision: 0,
  }).success, false);
});

const requestBody = {
  category: "watch" as const,
  itemName: "Example Chronograph",
  brand: "Example",
  model: "Chronograph",
  condition: "good",
  conditionNotes: "Good used condition",
  description: "A complete watch with box and papers.",
};

function fakeInsights() {
  return {
    summary: "A deterministic preliminary estimate based on the supplied item evidence.",
    fmvLowCents: 90_000,
    fmvHighCents: 110_000,
    fmvCents: 100_000,
    offerCents: 1,
    confidence: 70,
    comparables: ["Comparable pre-owned chronographs"],
    assumptions: ["Description is accurate"],
    risks: ["No physical inspection"],
    missingEvidence: ["Authentication report"],
  };
}

async function startRouteServer(
  repository: HardAssetValuationRepository,
  analyze: () => Promise<ReturnType<typeof fakeInsights>>,
) {
  const isAuthenticated: RequestHandler = (req: any, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.session = { userId: req.headers.authorization === "Bearer admin" ? "admin-1" : "planner-1" };
    next();
  };
  const isAdmin: RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== "Bearer admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };
  const app = express();
  app.use(express.json());
  registerHardAssetValuationRoutes(app, isAuthenticated, isAdmin, { repository, analyze });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, endpoint: `http://127.0.0.1:${address.port}/api/admin/hard-asset-valuations` };
}

test("photo route delegates private evidence handling and saves inferred fields without manual entry", async (t) => {
  const id = crypto.randomUUID();
  let called = false;
  const repository: HardAssetValuationRepository = {
    list: async () => [],
    create: async () => { throw new Error("Photo mode must use evidence-aware creation"); },
    review: async () => undefined,
    createWithAnalysis: async (input, userId, analyze) => {
      assert.equal(input.photoMode, true);
      assert.deepEqual(input.attachmentIds, [id]);
      assert.equal(userId, "admin-1");
      const insights = await analyze(input, [{ fileName: "photo.jpg", contentType: "image/jpeg", data: Buffer.from([255, 216, 255]) }]);
      called = true;
      return { id: "synthetic-photo-valuation", ...valuationItemFields(input, insights), ...valuationPersistenceFields(insights) } as HardAssetValuation;
    },
  };
  const { server, endpoint } = await startRouteServer(repository, async () => normalizePhotoValuationResponse(photoResponse, true));
  t.after(() => server.close());
  const response = await fetch(`${endpoint}/analyze`, {
    method: "POST", headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
    body: JSON.stringify({ photoMode: true, attachmentIds: [id] }),
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(called, true);
  assert.equal(result.itemName, photoIdentity.itemName);
  assert.equal(result.fmvCents, 4000);
  assert.equal(result.authenticityStatus, "not_reviewed");
  assert.equal("photoMode" in result, false);
});

test("admin valuation routes enforce access and persist create, reload, approve, and reject", async (t) => {
  const records: HardAssetValuation[] = [];
  const repository: HardAssetValuationRepository = {
    async list() {
      return records.map((record) => ({ ...record }));
    },
    async create(values) {
      const now = new Date();
      const record = { id: `valuation-${records.length + 1}`, ...values, createdAt: now, updatedAt: now } as HardAssetValuation;
      records.push(record);
      return { ...record };
    },
    async review(id, values) {
      const record = records.find((candidate) => candidate.id === id);
      if (!record) return undefined;
      Object.assign(record, values);
      return { ...record };
    },
  };
  const { server, endpoint } = await startRouteServer(repository, async () => fakeInsights());
  t.after(() => server.close());

  const protectedRequests = [
    { url: endpoint },
    {
      url: `${endpoint}/analyze`,
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) },
    },
    {
      url: `${endpoint}/valuation-1/review`,
      init: { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
    },
  ];
  for (const request of protectedRequests) {
    assert.equal((await fetch(request.url, request.init)).status, 401);
    assert.equal((await fetch(request.url, {
      ...request.init,
      headers: { ...request.init?.headers, Authorization: "Bearer planner" },
    })).status, 403);
  }

  const createdResponse = await fetch(`${endpoint}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin" },
    body: JSON.stringify(requestBody),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as HardAssetValuation;
  assert.equal(created.aiSummary, fakeInsights().summary);
  assert.equal(created.createdBy, "admin-1");
  assert.equal(created.offerCents, 80_000, "stored target must be derived from FMV, not trusted from the provider");

  const reloaded = await (await fetch(endpoint, { headers: { Authorization: "Bearer admin" } })).json() as HardAssetValuation[];
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].offerCents, Math.round(reloaded[0].fmvCents * 0.8));

  for (const status of ["approved", "rejected"] as const) {
    const response = await fetch(`${endpoint}/${created.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer admin" },
      body: JSON.stringify({ status }),
    });
    assert.equal(response.status, 200);
    const reviewed = await response.json() as HardAssetValuation;
    assert.equal(reviewed.status, status);
    assert.equal(reviewed.reviewedBy, "admin-1");
    assert.ok(reviewed.reviewedAt);
  }
});

test("malformed AI output and provider failures never create partial valuations", async (t) => {
  let createCalls = 0;
  const repository: HardAssetValuationRepository = {
    async list() { return []; },
    async create() {
      createCalls += 1;
      throw new Error("create should not be called");
    },
    async review() { return undefined; },
  };
  const failures = [
    async () => normalizeValuationInsights({ summary: "malformed" }),
    async () => { throw new Error("provider unavailable"); },
  ];

  for (const analyze of failures) {
    const { server, endpoint } = await startRouteServer(repository, analyze);
    t.after(() => server.close());
    const response = await fetch(`${endpoint}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer admin" },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 502);
  }
  assert.equal(createCalls, 0);
});

test("database save failures return an error instead of a partial success", async (t) => {
  const repository: HardAssetValuationRepository = {
    async list() { return []; },
    async create() { throw new Error("database unavailable"); },
    async review() { return undefined; },
  };
  const { server, endpoint } = await startRouteServer(repository, async () => fakeInsights());
  t.after(() => server.close());

  const response = await fetch(`${endpoint}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin" },
    body: JSON.stringify(requestBody),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: "Valuation could not be saved. Please try again." });
  assert.deepEqual(await repository.list(), []);
});

test("evidence-aware creation preserves provider injection and error classification", async (t) => {
  let failure: Error | undefined;
  let calls = 0;
  const repository: HardAssetValuationRepository = {
    async list() { return []; },
    async create() { throw new Error("Evidence-aware creation must not use the plain save path"); },
    async review() { return undefined; },
    async createWithAnalysis(input, userId, analyze) {
      assert.equal(userId, "admin-1");
      assert.deepEqual(input.attachmentIds, []);
      if (failure) throw failure;
      const insights = await analyze(input);
      return {
        id: "evidence-valuation",
        ...input,
        ...valuationPersistenceFields(insights),
        createdBy: userId,
        status: "analyzed",
      } as HardAssetValuation;
    },
  };
  const { server, endpoint } = await startRouteServer(repository, async () => {
    calls += 1;
    return fakeInsights();
  });
  t.after(() => server.close());
  const create = () => fetch(`${endpoint}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin" },
    body: JSON.stringify(requestBody),
  });
  const created = await create();
  assert.equal(created.status, 201);
  assert.equal((await created.json()).offerCents, 80_000);
  assert.equal(calls, 1);
  for (const [error, status] of [
    [new HardAssetValuationRequestError("Evidence unavailable"), 400],
    [new HardAssetValuationAnalysisError("Private provider error"), 502],
    [new HardAssetValuationSaveError("Private database error"), 500],
  ] as const) {
    failure = error;
    const response = await create();
    assert.equal(response.status, status);
    if (status !== 400) assert.doesNotMatch(await response.text(), /Private/);
  }
});