import type { HeartPlan } from "@shared/schema";
import type { IStorage } from "./storage";

export type AdvisorIdentity = {
  email?: string | null;
  emailVerified?: boolean | null;
};

export type AdvisorGrant = {
  isAdvisor: boolean;
  email?: string | null;
  advisorAccessLevel: string;
  advisorPermission: string;
};

export function normalizeAdvisorEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "";
}

export function findAdvisorGrant<T extends AdvisorGrant>(
  user: AdvisorIdentity,
  contacts: T[],
): T | null {
  if (!user.emailVerified) return null;
  const email = normalizeAdvisorEmail(user.email);
  if (!email) return null;
  return contacts.find(contact =>
    contact.isAdvisor && normalizeAdvisorEmail(contact.email) === email
  ) || null;
}

export function advisorCanEdit(grant: AdvisorGrant): boolean {
  return grant.advisorPermission === "edit";
}

export function advisorHasFullAccess(grant: AdvisorGrant): boolean {
  return grant.advisorAccessLevel === "full";
}

/** Choose the data path by scope, never by edit permission. */
export async function buildAdvisorResponse(
  plan: HeartPlan,
  contact: AdvisorGrant,
  storage: Pick<IStorage, "getHeartPlanAdvisorSummary" | "getPlanWishes" | "getPlanAssets" | "getPlanDocuments" | "getPlanContacts" | "getPlanLetters">,
) {
  let sharedWishes;
  let counts;
  let details;
  if (advisorHasFullAccess(contact)) {
    const [wishes, assets, documents, contacts, letters] = await Promise.all([
      storage.getPlanWishes(plan.id),
      storage.getPlanAssets(plan.id),
      storage.getPlanDocuments(plan.id),
      storage.getPlanContacts(plan.id),
      storage.getPlanLetters(plan.id),
    ]);
    sharedWishes = wishes;
    counts = {
      documents: documents.length,
      assets: assets.length,
      trustedContacts: contacts.length,
      legacyMessages: letters.length,
    };
    details = {
      profile: {
        fullName: plan.fullName,
        dateOfBirth: plan.dateOfBirth,
        phone: plan.phone,
        street: plan.street,
        city: plan.city,
        state: plan.state,
        zip: plan.zip,
        homeOccupancyStatus: plan.homeOccupancyStatus,
        hasVehicles: plan.hasVehicles,
      },
      wishes: wishes || null,
      assets,
      documents: documents.map(({ objectPath: _privatePath, ...document }) => document),
      contacts: contacts.map(({ infoEmailAttempts: _attempts, infoEmailFailedAt: _failed, ...trustedContact }) => trustedContact),
      legacyMessages: letters.map(({ objectPath: _privatePath, ...letter }) => letter),
    };
  } else {
    const summary = await storage.getHeartPlanAdvisorSummary(plan.id);
    sharedWishes = summary;
    // Explicit projection prevents future admin/internal fields from leaking.
    counts = {
      documents: summary.documents,
      assets: summary.assets,
      trustedContacts: summary.trustedContacts,
      legacyMessages: summary.legacyMessages,
    };
  }
  return {
    planId: plan.id,
    access: {
      level: advisorHasFullAccess(contact) ? "full" : "limited",
      permission: advisorCanEdit(contact) ? "edit" : "view",
    },
    summary: {
      plannerName: plan.fullName || "Heart Plan planner",
      status: plan.status,
      restingPreference: sharedWishes?.restingPreference || null,
      serviceType: sharedWishes?.serviceType || null,
      additionalWishes: sharedWishes?.additionalWishes || null,
      counts,
    },
    annualReview: annualReviewStatus(plan),
    ...(details ? { details } : {}),
  };
}

export function annualReviewStatus(plan: {
  createdAt: Date | string;
  lastReviewedAt?: Date | string | null;
}, now = new Date()) {
  const basis = new Date(plan.lastReviewedAt || plan.createdAt);
  const nextReviewAt = new Date(basis);
  nextReviewAt.setFullYear(nextReviewAt.getFullYear() + 1);
  return {
    lastReviewedAt: plan.lastReviewedAt || null,
    nextReviewAt,
    due: now.getTime() >= nextReviewAt.getTime(),
  };
}