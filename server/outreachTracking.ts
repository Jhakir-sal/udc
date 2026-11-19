import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./db";
import { outreachContacts as contacts, outreachDeliveries as deliveries, outreachTemplates as templates } from "@shared/schema";
import type { OutreachContactStatus, OutreachStatusFilter } from "@shared/outreachTracking";

function trackingQueries() {
  const history = db.select({
    contactId: deliveries.contactId,
    acceptedAt: sql<Date | null>`max(case when ${deliveries.status} = 'sent' then coalesce(${deliveries.sentAt}, ${deliveries.createdAt}) end)`
      .mapWith(contacts.lastSentAt).as("accepted_at"),
    pending: sql<boolean>`bool_or(${deliveries.status} not in ('sent', 'failed', 'skipped'))`.as("pending"),
  }).from(deliveries).groupBy(deliveries.contactId).as("outreach_history");
  const latest = db.selectDistinctOn([deliveries.contactId], {
    contactId: deliveries.contactId,
    status: deliveries.status,
    subject: deliveries.subject,
    createdAt: deliveries.createdAt,
  }).from(deliveries).orderBy(deliveries.contactId, desc(deliveries.createdAt), desc(deliveries.id)).as("latest_outreach");
  // A pending/uncertain attempt must never be shown as safely unsent.
  const status = sql<OutreachContactStatus>`case
    when ${contacts.unsubscribedAt} is not null then 'unsubscribed'
    when coalesce(${history.pending}, false) then 'needs_review'
    when ${contacts.lastSentAt} is not null or ${history.acceptedAt} is not null then 'sent'
    else 'not_sent' end`;
  return { history, latest, status };
}

export async function listTrackedOutreachContacts(page: number, filter: OutreachStatusFilter, search: string) {
  const pageSize = 100;
  const { history, latest, status } = trackingQueries();
  // Treat wildcard characters as literal search input; all values remain bound parameters.
  const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const searchCondition = search ? or(
    ilike(contacts.email, term), ilike(contacts.fullName, term),
    ilike(contacts.firstName, term), ilike(contacts.companyName, term),
  ) : undefined;
  const condition = and(searchCondition, filter === "all" ? undefined : sql`${status} = ${filter}`);
  const [rows, [matched], [summary]] = await Promise.all([
    db.select({
      id: contacts.id, email: contacts.email, firstName: contacts.firstName, fullName: contacts.fullName,
      companyName: contacts.companyName, unsubscribedAt: contacts.unsubscribedAt,
      lastSentAt: sql<Date | null>`greatest(${contacts.lastSentAt}, ${history.acceptedAt})`.mapWith(contacts.lastSentAt),
      outreachStatus: status, lastAttemptAt: latest.createdAt, lastAttemptStatus: latest.status, lastAttemptSubject: latest.subject,
    }).from(contacts).leftJoin(history, eq(history.contactId, contacts.id)).leftJoin(latest, eq(latest.contactId, contacts.id))
      .where(condition).orderBy(desc(contacts.createdAt), desc(contacts.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(contacts).leftJoin(history, eq(history.contactId, contacts.id)).where(condition),
    db.select({
      all: count(),
      not_sent: sql<number>`count(*) filter (where ${status} = 'not_sent')`.mapWith(Number),
      sent: sql<number>`count(*) filter (where ${status} = 'sent')`.mapWith(Number),
      needs_review: sql<number>`count(*) filter (where ${status} = 'needs_review')`.mapWith(Number),
      unsubscribed: sql<number>`count(*) filter (where ${status} = 'unsubscribed')`.mapWith(Number),
    }).from(contacts).leftJoin(history, eq(history.contactId, contacts.id)),
  ]);
  return { contacts: rows, total: matched.value, eligible: summary.not_sent, summary, page, pageSize };
}

export async function getOutreachContactHistory(id: string, page: number) {
  const [contact] = await db.select({
    id: contacts.id, email: contacts.email, fullName: contacts.fullName, companyName: contacts.companyName,
  }).from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!contact) return null;
  const pageSize = 25;
  const [rows, [total]] = await Promise.all([
    db.select({
      id: deliveries.id, templateId: deliveries.templateId,
      templateLabel: sql<string>`coalesce(${templates.label}, case when ${deliveries.templateId} = 'credit_union_intro' then 'Credit union introduction' else ${deliveries.templateId} end)`,
      senderEmail: deliveries.senderEmail, subject: deliveries.subject, status: deliveries.status,
      createdAt: deliveries.createdAt, sentAt: deliveries.sentAt,
    }).from(deliveries).leftJoin(templates, eq(templates.id, deliveries.templateId))
      .where(eq(deliveries.contactId, id)).orderBy(desc(deliveries.createdAt), desc(deliveries.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(deliveries).where(eq(deliveries.contactId, id)),
  ]);
  return { contact, deliveries: rows, total: total.value, page, pageSize };
}
