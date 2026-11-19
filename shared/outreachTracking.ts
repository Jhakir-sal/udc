export const OUTREACH_CONTACT_STATUSES = ["not_sent", "sent", "needs_review", "unsubscribed"] as const;
export type OutreachContactStatus = typeof OUTREACH_CONTACT_STATUSES[number];
export type OutreachStatusFilter = OutreachContactStatus | "all";
export type OutreachSummary = Record<OutreachStatusFilter, number>;
export type OutreachTrackedContact = {
  id: string;
  email: string;
  firstName: string | null;
  fullName: string | null;
  companyName: string | null;
  unsubscribedAt: string | null;
  lastSentAt: string | null;
  outreachStatus: OutreachContactStatus;
  lastAttemptAt: string | null;
  lastAttemptStatus: string | null;
  lastAttemptSubject: string | null;
};
export type OutreachHistory = {
  contact: { id: string; email: string; fullName: string | null; companyName: string | null };
  deliveries: Array<{
    id: string;
    templateId: string;
    templateLabel: string;
    senderEmail: string;
    subject: string;
    status: string;
    createdAt: string;
    sentAt: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};
