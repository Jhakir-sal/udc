import type { Express, RequestHandler } from "express";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  orsaRosterMembers, orsaEmailCampaignContacts, orsaEmailCampaignDeliveries,
  orsaSmsCampaign, orsaBulkSmsRuns, users,
} from "@shared/schema";
import type { OutreachGroup, OutreachOverview } from "@shared/orsaOutreach";
import { OUTREACH_GROUPS } from "@shared/orsaOutreach";
import { stoppedSmsPhones } from "./orsaBulkSmsAudience";
import { buildOutreachMembers, inOutreachGroup, invitationWasAttempted, outreachEmail } from "./orsaOutreachPolicy";

/** Cross-template and invitation history. Any uncertain claim is excluded. */
export async function neverEmailedCandidates<T extends { id: string; email: string }>(candidates: T[], connection = db): Promise<T[]> {
  if (!candidates.length) return [];
  const ids = candidates.map(row => row.id), emails = candidates.map(row => row.email);
  const [deliveries, invitations, accounts] = await Promise.all([
    connection.select({ memberId: orsaEmailCampaignDeliveries.memberId, email: orsaEmailCampaignDeliveries.normalizedEmail })
      .from(orsaEmailCampaignDeliveries).where(or(
        inArray(orsaEmailCampaignDeliveries.memberId, ids), inArray(orsaEmailCampaignDeliveries.normalizedEmail, emails),
      )),
    connection.select().from(orsaRosterMembers).where(or(
      inArray(orsaRosterMembers.id, ids), inArray(orsaRosterMembers.normalizedEmail, emails),
    )),
    connection.select({ email: users.email }).from(users).where(inArray(sql<string>`lower(trim(${users.email}))`, emails)),
  ]);
  const attemptedIds = new Set(deliveries.map(row => row.memberId));
  const attemptedEmails = new Set(deliveries.map(row => outreachEmail(row.email)));
  for (const row of invitations.filter(invitationWasAttempted)) {
    attemptedIds.add(row.id);
    attemptedEmails.add(outreachEmail(row.normalizedEmail));
  }
  for (const account of accounts) attemptedEmails.add(outreachEmail(account.email));
  return candidates.filter(row => !attemptedIds.has(row.id) && !attemptedEmails.has(outreachEmail(row.email)));
}

export async function loadOutreachOverview() {
  const [roster, emailDeliveries, optedOut, sms, smsStops, accounts, runs] = await Promise.all([
    db.select().from(orsaRosterMembers),
    db.select({
      memberId: orsaEmailCampaignDeliveries.memberId, normalizedEmail: orsaEmailCampaignDeliveries.normalizedEmail,
      status: orsaEmailCampaignDeliveries.status, attemptedAt: orsaEmailCampaignDeliveries.attemptedAt,
      sentAt: orsaEmailCampaignDeliveries.sentAt,
    }).from(orsaEmailCampaignDeliveries),
    db.select({ email: orsaEmailCampaignContacts.normalizedEmail }).from(orsaEmailCampaignContacts)
      .where(sql`${orsaEmailCampaignContacts.optedOutAt} IS NOT NULL`),
    db.select().from(orsaSmsCampaign), stoppedSmsPhones(),
    db.select({ email: users.email }).from(users),
    db.select({ status: orsaBulkSmsRuns.status }).from(orsaBulkSmsRuns)
      .where(inArray(orsaBulkSmsRuns.status, ["running", "paused"])).orderBy(desc(orsaBulkSmsRuns.updatedAt)),
  ]);
  const members = buildOutreachMembers({
    roster, emailDeliveries, sms, smsStops,
    emailOptOuts: new Set(optedOut.map(row => outreachEmail(row.email)!)),
    accountEmails: new Set(accounts.map(row => outreachEmail(row.email)).filter((email): email is string => !!email)),
  });
  const smsRunStatus = runs.some(run => run.status === "running") ? "running" : runs[0]?.status || null;
  return { members, smsPaused: smsRunStatus === "paused", smsRunStatus };
}

const groups = OUTREACH_GROUPS;
const queryInput = z.object({
  group: z.enum(groups).default("all"), q: z.string().trim().max(320).default(""),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function registerOrsaOutreachRoutes(app: Express, authenticated: RequestHandler, admin: RequestHandler, load = loadOutreachOverview) {
  app.get("/api/admin/orsa/outreach", authenticated, admin, async (req, res) => {
    const input = queryInput.safeParse(req.query);
    if (!input.success) return res.status(400).json({ error: "Choose a valid outreach group, search and page." });
    try {
      const { members, smsPaused, smsRunStatus } = await load();
      const counts = Object.fromEntries(groups.map(group => [group, members.filter(row => inOutreachGroup(row, group)).length])) as Record<OutreachGroup, number>;
      const { group, q, offset, limit } = input.data;
      const search = q.toLowerCase();
      const matching = members.filter(row => inOutreachGroup(row, group) &&
        (!search || [row.displayName, row.email, row.phone].some(value => value?.toLowerCase().includes(search))));
      const result: OutreachOverview = {
        members: matching.slice(offset, offset + limit), total: matching.length, counts, offset, limit,
        checkedAt: new Date().toISOString(), smsPaused, smsRunStatus,
      };
      res.json(result);
    } catch (error) {
      console.error("[ORSA outreach] Could not load contact history", error instanceof Error ? error.name : "Unknown error");
      res.status(500).json({ error: "Could not load outreach history. Do not assume missing results mean no prior contact." });
    }
  });
}
