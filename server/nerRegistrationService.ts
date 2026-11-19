import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { nerEnrollments } from "@shared/schema";
import { registerWithNer } from "./nerAdapter";

export const NER_REGISTRATION_MAX_ATTEMPTS = 5;
export const NER_REGISTRATION_LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 15 * 60 * 1000;

export type NerRegistrationAttemptResult = "registered" | "failed" | "busy" | "already_registered" | "ineligible";

function retryAt(now: Date, attempts: number) {
  return new Date(now.getTime() + RETRY_BASE_MS * Math.min(16, 2 ** Math.max(0, attempts - 1)));
}

export async function attemptNerRegistration(enrollmentId: string, options: {
  now?: Date;
  force?: boolean;
} = {}): Promise<NerRegistrationAttemptResult> {
  const now = options.now ?? new Date();
  const leaseId = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + NER_REGISTRATION_LEASE_MS);
  const claim = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${enrollmentId}, 63004))`);
    const [current] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    if (!current || current.paidInstallmentCount < 1) return { disposition: "ineligible" as const };
    if (current.externalStatus === "registered") return { disposition: "already_registered" as const };
    if (current.externalLeaseId && current.externalLeaseExpiresAt && current.externalLeaseExpiresAt > now) {
      return { disposition: "busy" as const };
    }
    if (!options.force && current.externalNextAttemptAt && current.externalNextAttemptAt > now) {
      return { disposition: "busy" as const };
    }
    if (!options.force && current.externalAttemptCount >= NER_REGISTRATION_MAX_ATTEMPTS) {
      return { disposition: "ineligible" as const };
    }
    const attempt = current.externalAttemptCount + 1;
    const [claimed] = await tx.update(nerEnrollments).set({
      externalStatus: "pending",
      externalAttemptCount: attempt,
      externalLastAttemptAt: now,
      externalNextAttemptAt: retryAt(now, attempt),
      externalLeaseId: leaseId,
      externalLeaseExpiresAt: leaseExpiresAt,
      updatedAt: now,
    }).where(and(
      eq(nerEnrollments.id, enrollmentId),
      inArray(nerEnrollments.externalStatus, ["not_requested", "pending", "failed"]),
    )).returning();
    return claimed
      ? { disposition: "claimed" as const, enrollment: claimed, attempt }
      : { disposition: "busy" as const };
  });
  if (claim.disposition !== "claimed") return claim.disposition;

  try {
    const result = await registerWithNer({
      enrollmentId: claim.enrollment.id,
      userId: claim.enrollment.userId,
    });
    const [updated] = await db.update(nerEnrollments).set({
      externalStatus: "registered",
      externalReference: result.reference,
      externalLastFailure: null,
      externalNextAttemptAt: null,
      externalLeaseId: null,
      externalLeaseExpiresAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(nerEnrollments.id, enrollmentId),
      eq(nerEnrollments.externalLeaseId, leaseId),
      eq(nerEnrollments.externalStatus, "pending"),
    )).returning({ id: nerEnrollments.id });
    return updated ? "registered" : "busy";
  } catch (error) {
    const permanent = claim.attempt >= NER_REGISTRATION_MAX_ATTEMPTS;
    const [updated] = await db.update(nerEnrollments).set({
      externalStatus: "failed",
      externalLastFailure: permanent
        ? "Automatic registration retries exhausted"
        : error instanceof Error ? error.message.slice(0, 500) : "NER registration failed",
      externalNextAttemptAt: permanent ? null : retryAt(now, claim.attempt),
      externalLeaseId: null,
      externalLeaseExpiresAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(nerEnrollments.id, enrollmentId),
      eq(nerEnrollments.externalLeaseId, leaseId),
      eq(nerEnrollments.externalStatus, "pending"),
    )).returning({ id: nerEnrollments.id });
    return updated ? "failed" : "busy";
  }
}