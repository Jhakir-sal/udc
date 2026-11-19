import { sql } from "drizzle-orm";
import { db } from "./db";
import { stripeEventLedger } from "@shared/schema";

export const STRIPE_WEBHOOK_LEASE_MS = 5 * 60 * 1000;

export type LedgerClaimDecision = "claimed" | "processed" | "busy";

export function decideLedgerClaim(
  status: string,
  leaseExpiresAt: Date | null,
  now: Date,
): LedgerClaimDecision {
  if (status === "processed") return "processed";
  if (status === "failed") return "claimed";
  return !leaseExpiresAt || leaseExpiresAt <= now ? "claimed" : "busy";
}

export async function claimStripeEvent(eventId: string, eventType: string, now = new Date()) {
  const leaseExpiresAt = new Date(now.getTime() + STRIPE_WEBHOOK_LEASE_MS);
  const result = await db.execute(sql`
    insert into ${stripeEventLedger}
      (stripe_event_id, event_type, status, attempt_count, lease_expires_at)
    values (${eventId}, ${eventType}, 'processing', 1, ${leaseExpiresAt})
    on conflict (stripe_event_id) do update set
      status = 'processing',
      attempt_count = ${stripeEventLedger.attemptCount} + 1,
      lease_expires_at = excluded.lease_expires_at,
      last_error = null,
      processed_at = null
    where ${stripeEventLedger.status} = 'failed'
       or (${stripeEventLedger.status} = 'processing'
           and (${stripeEventLedger.leaseExpiresAt} is null
                or ${stripeEventLedger.leaseExpiresAt} <= ${now}))
    returning id
  `);
  const claimed = (result.rows as Array<{ id: string }>)[0];
  if (claimed) return { decision: "claimed" as const, id: claimed.id };

  const previous = await db.query.stripeEventLedger.findFirst({
    where: (ledger, { eq }) => eq(ledger.stripeEventId, eventId),
  });
  return {
    decision: decideLedgerClaim(previous?.status ?? "processing", previous?.leaseExpiresAt ?? null, now),
    id: previous?.id,
  };
}