import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  createMarketplaceCategorySchema,
  createMarketplaceEventSchema,
  createMarketplaceProviderSchema,
  isMarketplaceProviderPubliclyEligible,
  updateMarketplaceCategorySchema,
  updateMarketplaceProviderSchema,
  type MarketplaceCategory,
} from "@shared/schema";
import { isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";

const isAdmin: RequestHandler = async (req: any, res, next) => {
  const userId = req.session?.userId || req.user?.claims?.sub;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

const canBrowseMarketplace: RequestHandler = async (req: any, res, next) => {
  const userId = req.session?.userId || req.user?.claims?.sub;
  const user = userId ? await storage.getUser(userId) : undefined;
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  if (!["user", "planner", "admin"].includes(user.role || "")) {
    return res.status(403).json({ message: "Marketplace access is limited to customers, planners, and administrators" });
  }
  req.marketplaceActorRole = user.role;
  next();
};

function marketplaceApprovalErrors(
  provider: {
    businessName: string;
    description: string;
    services: string[];
    serviceAreas: string[];
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  },
  category: Pick<MarketplaceCategory, "isActive">,
): string[] {
  const errors: string[] = [];
  if (!category.isActive) errors.push("category must be active");
  if (!provider.businessName.trim()) errors.push("business name is required");
  if (!provider.description.trim()) errors.push("description is required");
  if (!provider.services.some((service) => service.trim())) errors.push("at least one service is required");
  if (!provider.serviceAreas.some((area) => area.trim())) errors.push("at least one service area is required");
  if (![provider.phone, provider.email, provider.website].some((contact) => contact?.trim())) {
    errors.push("at least one contact method is required");
  }
  return errors;
}

function publicMarketplaceProvider<T extends { approvedBy: string | null }>(provider: T): Omit<T, "approvedBy"> {
  const { approvedBy: _approvedBy, ...publicProvider } = provider;
  return publicProvider;
}

export function registerMarketplaceRoutes(app: Express, authenticate: RequestHandler = isAuthenticated): void {
  const marketplaceError = (res: any, error: unknown, fallback: string) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid marketplace data",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    if ((error as any)?.code === "23505") {
      return res.status(409).json({ error: "A marketplace record with that unique value already exists" });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
  };

  app.get("/api/marketplace/categories", authenticate, canBrowseMarketplace, async (_req: any, res) => {
    try {
      res.json(await storage.getMarketplaceCategories(true));
    } catch (error) {
      marketplaceError(res, error, "Failed to load marketplace categories");
    }
  });

  app.get("/api/marketplace/providers", authenticate, canBrowseMarketplace, async (req: any, res) => {
    try {
      const filters: Record<string, string | undefined> = {};
      for (const key of ["q", "category", "location"] as const) {
        const value = req.query[key];
        if (value !== undefined && typeof value !== "string") {
          return res.status(400).json({ error: `${key} must be a single string` });
        }
        if (value && value.length > 300) return res.status(400).json({ error: `${key} is too long` });
        filters[key] = value;
      }
      const providers = await storage.getMarketplaceProviders({ ...filters, publicOnly: true });
      res.json(providers.map(publicMarketplaceProvider));
    } catch (error) {
      marketplaceError(res, error, "Failed to load marketplace providers");
    }
  });

  app.get("/api/marketplace/providers/:id", authenticate, canBrowseMarketplace, async (req: any, res) => {
    try {
      const provider = await storage.getMarketplaceProvider(req.params.id, true);
      if (!provider) return res.status(404).json({ error: "Provider not found" });
      res.json(publicMarketplaceProvider(provider));
    } catch (error) {
      marketplaceError(res, error, "Failed to load marketplace provider");
    }
  });

  app.post("/api/marketplace/events", authenticate, canBrowseMarketplace, async (req: any, res) => {
    try {
      const input = createMarketplaceEventSchema.parse(req.body);
      const provider = await storage.getMarketplaceProvider(input.providerId, true);
      if (!provider) return res.status(400).json({ error: "Events can only be recorded for a public marketplace provider" });
      const event = await storage.createMarketplaceEvent({
        providerId: provider.id,
        actorRole: req.marketplaceActorRole,
        action: input.action,
      });
      res.status(201).json(event);
    } catch (error) {
      marketplaceError(res, error, "Failed to record marketplace event");
    }
  });

  app.get("/api/admin/marketplace/categories", authenticate, isAdmin, async (_req: any, res) => {
    try {
      res.json(await storage.getMarketplaceCategories(false));
    } catch (error) {
      marketplaceError(res, error, "Failed to load marketplace categories");
    }
  });

  app.post("/api/admin/marketplace/categories", authenticate, isAdmin, async (req: any, res) => {
    try {
      const input = createMarketplaceCategorySchema.parse(req.body);
      res.status(201).json(await storage.createMarketplaceCategory(input));
    } catch (error) {
      marketplaceError(res, error, "Failed to create marketplace category");
    }
  });

  app.patch("/api/admin/marketplace/categories/:id", authenticate, isAdmin, async (req: any, res) => {
    try {
      const input = updateMarketplaceCategorySchema.parse(req.body);
      const updated = await storage.updateMarketplaceCategory(req.params.id, input);
      if (!updated) return res.status(404).json({ error: "Category not found" });
      res.json(updated);
    } catch (error) {
      marketplaceError(res, error, "Failed to update marketplace category");
    }
  });

  app.get("/api/admin/marketplace/providers", authenticate, isAdmin, async (req: any, res) => {
    try {
      const status = req.query.status;
      if (status !== undefined && (typeof status !== "string" || !["draft", "review", "approved", "suspended", "archived"].includes(status))) {
        return res.status(400).json({ error: "Invalid provider status" });
      }
      const providers = await storage.getMarketplaceProviders();
      res.json(status ? providers.filter((provider) => provider.status === status) : providers);
    } catch (error) {
      marketplaceError(res, error, "Failed to load marketplace providers");
    }
  });

  app.get("/api/admin/marketplace/providers/:id", authenticate, isAdmin, async (req: any, res) => {
    try {
      const provider = await storage.getMarketplaceProvider(req.params.id);
      if (!provider) return res.status(404).json({ error: "Provider not found" });
      res.json({
        ...provider,
        publiclyEligible: isMarketplaceProviderPubliclyEligible({
          ...provider,
          categoryIsActive: provider.category.isActive,
        }),
        publicationErrors: marketplaceApprovalErrors(provider, provider.category),
      });
    } catch (error) {
      marketplaceError(res, error, "Failed to load marketplace provider");
    }
  });

  app.post("/api/admin/marketplace/providers", authenticate, isAdmin, async (req: any, res) => {
    try {
      const input = createMarketplaceProviderSchema.parse(req.body);
      const category = await storage.getMarketplaceCategory(input.categoryId);
      if (!category) return res.status(400).json({ error: "The selected marketplace category does not exist" });
      if (input.status === "approved") {
        const errors = marketplaceApprovalErrors(input, category);
        if (errors.length) return res.status(400).json({ error: "Provider cannot be approved", details: errors });
      }
      const approvalData = input.status === "approved"
        ? {
            vettedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: req.session?.userId || req.user?.claims?.sub,
          }
        : {};
      const created = await storage.createMarketplaceProvider({ ...input, ...approvalData });
      res.status(201).json(await storage.getMarketplaceProvider(created.id));
    } catch (error) {
      marketplaceError(res, error, "Failed to create marketplace provider");
    }
  });

  app.patch("/api/admin/marketplace/providers/:id", authenticate, isAdmin, async (req: any, res) => {
    try {
      const input = updateMarketplaceProviderSchema.parse(req.body);
      const existing = await storage.getMarketplaceProvider(req.params.id);
      if (!existing) return res.status(404).json({ error: "Provider not found" });
      const category = input.categoryId
        ? await storage.getMarketplaceCategory(input.categoryId)
        : existing.category;
      if (!category) return res.status(400).json({ error: "The selected marketplace category does not exist" });
      const candidate = { ...existing, ...input };
      if (candidate.status === "approved") {
        const errors = marketplaceApprovalErrors(candidate, category);
        if (errors.length) return res.status(400).json({ error: "Provider cannot be approved", details: errors });
      }
      const approvalData = input.status === "approved" && existing.status !== "approved"
        ? {
            vettedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: req.session?.userId || req.user?.claims?.sub,
          }
        : {};
      const updated = await storage.updateMarketplaceProvider(existing.id, { ...input, ...approvalData });
      res.json(updated ? await storage.getMarketplaceProvider(updated.id) : updated);
    } catch (error) {
      marketplaceError(res, error, "Failed to update marketplace provider");
    }
  });
}