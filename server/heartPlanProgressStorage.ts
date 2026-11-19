import { eq, sql, type AnyColumn } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  heartPlans, planWishes, planDocuments, planAssets, planContacts, planLetters, planEvents,
  planActivationRequests, users,
} from "@shared/schema";

/** Advisor-only projection: no item contents, owner identity, or admin lifecycle data. */
export async function readHeartPlanAdvisorSummary(db: Pick<NodePgDatabase, "select">, planId: string) {
  const [summary] = await db.select({
    restingPreference: planWishes.restingPreference,
    serviceType: planWishes.serviceType,
    additionalWishes: planWishes.additionalWishes,
    documents: sql<number>`(select count(*)::integer from ${planDocuments} where ${planDocuments.planId} = ${heartPlans.id})`,
    assets: sql<number>`(select count(*)::integer from ${planAssets} where ${planAssets.planId} = ${heartPlans.id})`,
    trustedContacts: sql<number>`(select count(*)::integer from ${planContacts} where ${planContacts.planId} = ${heartPlans.id})`,
    legacyMessages: sql<number>`(select count(*)::integer from ${planLetters} where ${planLetters.planId} = ${heartPlans.id})`,
  }).from(heartPlans)
    .leftJoin(planWishes, eq(heartPlans.id, planWishes.planId))
    .where(eq(heartPlans.id, planId));
  if (!summary) throw new Error("HeartPlan is unavailable");
  return summary;
}

export type HeartPlanAdvisorSummary = Awaited<ReturnType<typeof readHeartPlanAdvisorSummary>>;

/** One query, one row per plan. Private values are evaluated in SQL, never returned. */
export async function readHeartPlanAdminData(db: Pick<NodePgDatabase, "select">, planIds?: string[]) {
  if (planIds?.length === 0) return [];
  // One array parameter per scope avoids PostgreSQL's bind-parameter limit for large lists.
  const scope = (column: AnyColumn) => planIds
    ? sql`${column} = any(${sql.param(planIds)}::text[])` : undefined;
  // Group each item table once, rather than rescanning it for each planner.
  const documents = db.select({
    planId: planDocuments.planId,
    count: sql<number>`count(*)::integer`.as("document_count"),
  }).from(planDocuments).where(scope(planDocuments.planId))
    .groupBy(planDocuments.planId).as("document_counts");
  const assets = db.select({
    planId: planAssets.planId,
    count: sql<number>`count(*)::integer`.as("asset_count"),
  }).from(planAssets).where(scope(planAssets.planId))
    .groupBy(planAssets.planId).as("asset_counts");
  const letters = db.select({
    planId: planLetters.planId,
    count: sql<number>`count(*)::integer`.as("letter_count"),
  }).from(planLetters).where(scope(planLetters.planId))
    .groupBy(planLetters.planId).as("letter_counts");
  const contacts = db.select({
    planId: planContacts.planId,
    count: sql<number>`count(*)::integer`.as("contact_count"),
    failed: sql<number>`(count(*) filter (where ${planContacts.infoEmailFailedAt} is not null))::integer`.as("failed"),
    primaryStatus: sql<string | null>`(array_agg(
      case when ${planContacts.infoEmailFailedAt} is not null then 'delivery_failed'
        when coalesce(${planContacts.email}, '') = '' then 'no_email' else 'ready' end
      order by ${planContacts.createdAt}
    ) filter (where ${planContacts.isPrimary}))[1]`.as("primary_status"),
  }).from(planContacts).where(scope(planContacts.planId))
    .groupBy(planContacts.planId).as("contact_counts");
  const events = db.select({
    planId: planEvents.planId,
    latest: sql<Date | string | null>`max(${planEvents.createdAt})`.as("latest"),
  }).from(planEvents).where(scope(planEvents.planId))
    .groupBy(planEvents.planId).as("event_activity");
  const activationRequests = db.select({
    planId: planActivationRequests.planId,
    count: sql<number>`(count(*) filter (where ${planActivationRequests.status} = 'pending'))::integer`.as("activation_count"),
  }).from(planActivationRequests).where(scope(planActivationRequests.planId))
    .groupBy(planActivationRequests.planId).as("activation_counts");
  return db.select({
    id: heartPlans.id,
    status: heartPlans.status,
    tier: heartPlans.tier,
    fullName: heartPlans.fullName,
    createdAt: heartPlans.createdAt,
    updatedAt: heartPlans.updatedAt,
    upgradedAt: heartPlans.upgradedAt,
    certificateId: heartPlans.certificateId,
    activatedAt: heartPlans.activatedAt,
    activatedByName: heartPlans.activatedByName,
    lastReviewedAt: heartPlans.lastReviewedAt,
    pendingActivationRequests: sql<number>`coalesce(${activationRequests.count}, 0)`,
    ownerId: users.id,
    ownerEmail: users.email,
    ownerFirstName: users.firstName,
    ownerLastName: users.lastName,
    emailVerified: users.emailVerified,
    // Match JS truthiness exactly: empty strings are incomplete, whitespace is not.
    profileComplete: sql<boolean>`coalesce(${heartPlans.fullName} <> '' and ${heartPlans.dateOfBirth} <> '', false)`,
    wishesComplete: sql<boolean>`exists (
      select 1 from ${planWishes} where ${planWishes.planId} = ${heartPlans.id}
      and ${planWishes.restingPreference} <> ''
    )`,
    documents: sql<number>`coalesce(${documents.count}, 0)`,
    assets: sql<number>`coalesce(${assets.count}, 0)`,
    contacts: sql<number>`coalesce(${contacts.count}, 0)`,
    letters: sql<number>`coalesce(${letters.count}, 0)`,
    failedContactDeliveries: sql<number>`coalesce(${contacts.failed}, 0)`,
    primaryContactStatus: sql<"missing" | "delivery_failed" | "no_email" | "ready">`coalesce(${contacts.primaryStatus}, 'missing')`,
    lastEventAt: events.latest,
  }).from(heartPlans)
    .leftJoin(users, eq(heartPlans.userId, users.id))
    .leftJoin(documents, eq(heartPlans.id, documents.planId))
    .leftJoin(assets, eq(heartPlans.id, assets.planId))
    .leftJoin(letters, eq(heartPlans.id, letters.planId))
    .leftJoin(contacts, eq(heartPlans.id, contacts.planId))
    .leftJoin(events, eq(heartPlans.id, events.planId))
    .leftJoin(activationRequests, eq(heartPlans.id, activationRequests.planId))
    .where(scope(heartPlans.id));
}

export type HeartPlanAdminData = Awaited<ReturnType<typeof readHeartPlanAdminData>>[number];
