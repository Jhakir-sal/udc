import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  createMarketplaceCategorySchema,
  createMarketplaceProviderSchema,
  isMarketplaceProviderPubliclyEligible,
  marketplaceCategories,
  marketplaceEvents,
  marketplaceProviders,
  updateMarketplaceCategorySchema,
  updateMarketplaceProviderSchema,
  type MarketplacePublicEligibilityInput,
} from "../shared/schema";
import { users } from "../shared/models/auth";
import { db } from "./db";
import { registerMarketplaceRoutes } from "./marketplaceRoutes";

const eligibleProvider: MarketplacePublicEligibilityInput = {
  status: "approved",
  categoryIsActive: true,
  businessName: "Compassionate Estate Services",
  description: "Practical support for families settling an estate.",
  services: ["Estate organization"],
  serviceAreas: ["Charlotte, NC"],
  phone: "704-555-0100",
  email: null,
  website: null,
};

test("only approved providers can be publicly eligible", () => {
  const statuses = ["draft", "review", "approved", "suspended", "archived"] as const;
  for (const status of statuses) {
    assert.equal(
      isMarketplaceProviderPubliclyEligible({ ...eligibleProvider, status }),
      status === "approved",
      `unexpected eligibility for ${status}`,
    );
  }
});

test("inactive categories and every missing publication requirement are ineligible", () => {
  const ineligibleVariants: MarketplacePublicEligibilityInput[] = [
    { ...eligibleProvider, categoryIsActive: false },
    { ...eligibleProvider, businessName: "   " },
    { ...eligibleProvider, description: "" },
    { ...eligibleProvider, services: [] },
    { ...eligibleProvider, services: ["  "] },
    { ...eligibleProvider, serviceAreas: [] },
    { ...eligibleProvider, serviceAreas: ["  "] },
    { ...eligibleProvider, phone: null, email: null, website: null },
    { ...eligibleProvider, phone: " ", email: "", website: "  " },
  ];

  for (const provider of ineligibleVariants) {
    assert.equal(isMarketplaceProviderPubliclyEligible(provider), false);
  }
});

test("any one nonblank contact method satisfies the contact requirement", () => {
  for (const contact of [
    { phone: "704-555-0100", email: null, website: null },
    { phone: null, email: "help@example.com", website: null },
    { phone: null, email: null, website: "https://example.com" },
  ]) {
    assert.equal(isMarketplaceProviderPubliclyEligible({ ...eligibleProvider, ...contact }), true);
  }
});

test("marketplace category schemas are strict and updates cannot be empty", () => {
  assert.equal(createMarketplaceCategorySchema.parse({
    name: "Estate Support",
    slug: "estate-support",
  }).name, "Estate Support");
  assert.throws(() => createMarketplaceCategorySchema.parse({
    name: "Estate Support",
    slug: "Estate Support",
  }));
  assert.throws(() => createMarketplaceCategorySchema.parse({
    name: "Estate Support",
    slug: "estate-support",
    privateField: "not accepted",
  }));
  assert.throws(() => updateMarketplaceCategorySchema.parse({}));
  assert.throws(() => updateMarketplaceCategorySchema.parse({ unknown: true }));
});

test("marketplace provider schemas reject malformed URLs and unknown fields", () => {
  const validProvider = {
    businessName: "Compassionate Estate Services",
    categoryId: "category-id",
    description: "",
    services: [],
    serviceAreas: [],
    website: "https://example.com/services",
    imageUrl: "https://example.com/logo.png",
  };

  assert.deepEqual(createMarketplaceProviderSchema.parse(validProvider), validProvider);
  assert.deepEqual(createMarketplaceProviderSchema.parse({
    ...validProvider,
    phone: "",
    email: "",
    website: "",
    imageUrl: "",
  }), {
    ...validProvider,
    phone: null,
    email: null,
    website: null,
    imageUrl: null,
  });
  assert.throws(() => createMarketplaceProviderSchema.parse({
    ...validProvider,
    website: "not a URL",
  }));
  assert.throws(() => createMarketplaceProviderSchema.parse({
    ...validProvider,
    imageUrl: "/relative/image.png",
  }));
  assert.throws(() => createMarketplaceProviderSchema.parse({
    ...validProvider,
    website: "javascript:alert(document.cookie)",
  }));
  assert.throws(() => createMarketplaceProviderSchema.parse({
    ...validProvider,
    apiKey: "must never be accepted",
  }));
  assert.throws(() => updateMarketplaceProviderSchema.parse({}));
  assert.throws(() => updateMarketplaceProviderSchema.parse({
    website: "invalid",
  }));
  assert.throws(() => updateMarketplaceProviderSchema.parse({
    approvedBy: "client-controlled-admin-id",
  }));
});

test("family and planner routers both expose marketplace list and profile routes", () => {
  const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const familyRouter = appSource.match(/function Router\(\)[\s\S]*?function PlannerRouter/)?.[0] ?? "";
  const plannerRouter = appSource.match(/function PlannerRouter\(\)[\s\S]*?function AuthenticatedApp/)?.[0] ?? "";

  for (const router of [familyRouter, plannerRouter]) {
    assert.match(router, /path="\/marketplace"/);
    assert.match(router, /path="\/marketplace\/:id"/);
  }
});

test("marketplace API enforces database-backed visibility, roles, filters, and private event boundaries", async (t) => {
  const suffix = randomUUID();
  const userIds = {
    family: `market-family-${suffix}`,
    planner: `market-planner-${suffix}`,
    admin: `market-admin-${suffix}`,
    funeral: `market-funeral-${suffix}`,
  };
  const categoryIds = {
    estate: `market-estate-${suffix}`,
    grief: `market-grief-${suffix}`,
    inactive: `market-inactive-${suffix}`,
  };
  const providerIds = {
    estate: `market-provider-estate-${suffix}`,
    grief: `market-provider-grief-${suffix}`,
    draft: `market-provider-draft-${suffix}`,
    review: `market-provider-review-${suffix}`,
    suspended: `market-provider-suspended-${suffix}`,
    archived: `market-provider-archived-${suffix}`,
    incompleteDescription: `market-provider-no-description-${suffix}`,
    incompleteServices: `market-provider-no-services-${suffix}`,
    incompleteAreas: `market-provider-no-areas-${suffix}`,
    incompleteContact: `market-provider-no-contact-${suffix}`,
    inactiveCategory: `market-provider-inactive-category-${suffix}`,
  };
  const allProviderIds = Object.values(providerIds);

  await db.insert(users).values([
    { id: userIds.family, email: `market-family-${suffix}@example.com`, role: "user", emailVerified: true },
    { id: userIds.planner, email: `market-planner-${suffix}@example.com`, role: "planner", emailVerified: true },
    { id: userIds.admin, email: `market-admin-${suffix}@example.com`, role: "admin", emailVerified: true },
    { id: userIds.funeral, email: `market-funeral-${suffix}@example.com`, role: "funeral_home", emailVerified: true },
  ]);
  await db.insert(marketplaceCategories).values([
    { id: categoryIds.estate, name: "Estate Support", slug: `estate-support-${suffix}`, isActive: true },
    { id: categoryIds.grief, name: "Grief Support", slug: `grief-support-${suffix}`, isActive: true },
    { id: categoryIds.inactive, name: "Inactive Services", slug: `inactive-services-${suffix}`, isActive: false },
  ]);

  const complete = {
    description: "Practical support for families.",
    services: ["Estate organization"],
    serviceAreas: ["Charlotte, NC"],
    phone: "704-555-0100",
    status: "approved" as const,
  };
  await db.insert(marketplaceProviders).values([
    { id: providerIds.estate, categoryId: categoryIds.estate, businessName: "Carolina Estate Guides", ...complete },
    {
      id: providerIds.grief,
      categoryId: categoryIds.grief,
      businessName: "Mountain Grief Counselors",
      ...complete,
      description: "Licensed bereavement counseling.",
      services: ["Bereavement counseling"],
      serviceAreas: ["Asheville, NC"],
      phone: null,
      email: "care@example.com",
    },
    ...(["draft", "review", "suspended", "archived"] as const).map((status) => ({
      id: providerIds[status],
      categoryId: categoryIds.estate,
      businessName: `${status} provider`,
      ...complete,
      status,
    })),
    { id: providerIds.incompleteDescription, categoryId: categoryIds.estate, businessName: "No Description", ...complete, description: "" },
    { id: providerIds.incompleteServices, categoryId: categoryIds.estate, businessName: "No Services", ...complete, services: [] },
    { id: providerIds.incompleteAreas, categoryId: categoryIds.estate, businessName: "No Areas", ...complete, serviceAreas: [] },
    {
      id: providerIds.incompleteContact,
      categoryId: categoryIds.estate,
      businessName: "No Contact",
      ...complete,
      phone: null,
      email: null,
      website: null,
    },
    { id: providerIds.inactiveCategory, categoryId: categoryIds.inactive, businessName: "Inactive Category Provider", ...complete },
  ]);

  t.after(async () => {
    await db.delete(marketplaceEvents).where(inArray(marketplaceEvents.providerId, allProviderIds));
    await db.delete(marketplaceProviders).where(inArray(marketplaceProviders.id, allProviderIds));
    await db.delete(marketplaceCategories).where(inArray(marketplaceCategories.id, Object.values(categoryIds)));
    await db.delete(users).where(inArray(users.id, Object.values(userIds)));
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const userId = req.header("x-test-user");
    if (userId) req.session = { userId };
    next();
  });
  const authenticate: RequestHandler = (req: any, res, next) =>
    req.session?.userId ? next() : res.status(401).json({ message: "Unauthorized" });
  registerMarketplaceRoutes(app, authenticate);

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(path: string, userId?: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (userId) headers.set("x-test-user", userId);
    if (init.body) headers.set("content-type", "application/json");
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  await t.test("family, planner, and admin can browse; funeral-home and anonymous callers cannot", async () => {
    for (const userId of [userIds.family, userIds.planner, userIds.admin]) {
      assert.equal((await request("/api/marketplace/providers", userId)).status, 200);
    }
    assert.equal((await request("/api/marketplace/providers", userIds.funeral)).status, 403);
    assert.equal((await request("/api/marketplace/providers")).status, 401);

    assert.equal((await request("/api/admin/marketplace/providers", userIds.admin)).status, 200);
    for (const userId of [userIds.family, userIds.planner, userIds.funeral]) {
      assert.equal((await request("/api/admin/marketplace/providers", userId)).status, 403);
    }
    assert.equal((await request("/api/admin/marketplace/providers")).status, 401);
  });

  await t.test("customer lists and profiles hide every non-public database record", async () => {
    const response = await request("/api/marketplace/providers", userIds.family);
    assert.equal(response.status, 200);
    const providers = await response.json() as Array<{ id: string; approvedBy?: string }>;
    const fixtureProviderIds = providers
      .map(({ id }) => id)
      .filter((id) => allProviderIds.includes(id));
    assert.deepEqual(fixtureProviderIds, [providerIds.estate, providerIds.grief]);
    assert.ok(providers.every((provider) => !("approvedBy" in provider)));

    for (const providerId of allProviderIds.filter((id) => ![providerIds.estate, providerIds.grief].includes(id))) {
      assert.equal((await request(`/api/marketplace/providers/${providerId}`, userIds.planner)).status, 404);
    }

    const categories = await (await request("/api/marketplace/categories", userIds.family)).json() as Array<{ id: string }>;
    const fixtureCategoryIds = categories
      .map(({ id }) => id)
      .filter((id) => Object.values(categoryIds).includes(id));
    assert.deepEqual(fixtureCategoryIds.sort(), [categoryIds.estate, categoryIds.grief].sort());
  });

  await t.test("search, category, and location filters operate on public database records", async () => {
    const cases = [
      [`?q=bereavement`, [providerIds.grief]],
      [`?q=estate`, [providerIds.estate]],
      [`?category=${categoryIds.grief}`, [providerIds.grief]],
      [`?category=grief-support-${suffix}`, [providerIds.grief]],
      [`?location=asheville`, [providerIds.grief]],
      [`?location=charlotte`, [providerIds.estate]],
      [`?q=provider`, []],
    ] as const;

    for (const [query, expected] of cases) {
      const providers = await (await request(`/api/marketplace/providers${query}`, userIds.planner)).json() as Array<{ id: string }>;
      const fixtureProviderIds = providers
        .map(({ id }) => id)
        .filter((id) => allProviderIds.includes(id));
      assert.deepEqual(fixtureProviderIds, expected);
    }
  });

  await t.test("hidden listings reject all view and contact events", async () => {
    const hiddenIds = allProviderIds.filter((id) => ![providerIds.estate, providerIds.grief].includes(id));
    for (const providerId of hiddenIds) {
      for (const action of ["listing_view", "profile_view", "phone", "email", "website"]) {
        const response = await request("/api/marketplace/events", userIds.family, {
          method: "POST",
          body: JSON.stringify({ providerId, action }),
        });
        assert.equal(response.status, 400, `${providerId} unexpectedly accepted ${action}`);
      }
    }
    const rows = await db.select().from(marketplaceEvents).where(inArray(marketplaceEvents.providerId, hiddenIds));
    assert.equal(rows.length, 0);
  });

  await t.test("events persist only provider, action, and coarse role", async () => {
    const actors = [
      [userIds.family, "user", "listing_view"],
      [userIds.planner, "planner", "phone"],
      [userIds.admin, "admin", "website"],
    ] as const;
    for (const [userId, _role, action] of actors) {
      const response = await request("/api/marketplace/events", userId, {
        method: "POST",
        body: JSON.stringify({ providerId: providerIds.estate, action }),
      });
      assert.equal(response.status, 201);
    }

    const rejected = await request("/api/marketplace/events", userIds.family, {
      method: "POST",
      body: JSON.stringify({
        providerId: providerIds.estate,
        action: "email",
        userId: userIds.family,
        heartPlanId: "private-plan",
        certificateId: "private-certificate",
        caseId: "private-case",
      }),
    });
    assert.equal(rejected.status, 400);

    const rows = await db.select().from(marketplaceEvents).where(eq(marketplaceEvents.providerId, providerIds.estate));
    assert.deepEqual(
      rows.map(({ providerId, actorRole, action }) => ({ providerId, actorRole, action })),
      actors.map(([, actorRole, action]) => ({ providerId: providerIds.estate, actorRole, action })),
    );
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ["action", "actorRole", "createdAt", "id", "providerId"].sort());
    }
  });
});