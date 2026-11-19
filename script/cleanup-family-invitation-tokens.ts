import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../server/db";
import { familyInvitations } from "../shared/schema";

export async function cleanupLegacyFamilyInvitationTokens(now = new Date()) {
  const cleared = await db.update(familyInvitations)
    .set({ token: null })
    .where(and(
      isNotNull(familyInvitations.token),
      or(
        ne(familyInvitations.status, "pending"),
        lte(familyInvitations.expiresAt, now),
      ),
    ))
    .returning({ id: familyInvitations.id });

  const [remaining] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(familyInvitations)
    .where(and(
      isNotNull(familyInvitations.token),
      eq(familyInvitations.status, "pending"),
      sql`${familyInvitations.expiresAt} > ${now}`,
    ));

  return {
    clearedCount: cleared.length,
    remainingValidPlaintextCount: remaining?.count ?? 0,
  };
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const result = await cleanupLegacyFamilyInvitationTokens();
  console.log(
    `Cleared ${result.clearedCount} expired, accepted, or revoked family invitation plaintext token(s).`,
  );
  if (result.remainingValidPlaintextCount > 0) {
    console.warn(
      `${result.remainingValidPlaintextCount} valid legacy plaintext invitation(s) remain; keep the compatibility lookup enabled.`,
    );
  } else {
    console.log("No valid legacy plaintext family invitations remain.");
  }
  process.exit(0);
}