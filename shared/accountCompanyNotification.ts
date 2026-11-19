export type NotificationCompany = {
  id: string;
  name: string;
  // Staff may edit the saved candidate, but only recipient is eligible to send.
  notificationEmail: string | null;
  officialDomain: string;
  status: string;
  canEmail: boolean;
  recipient: string | null;
  routingExceptionApproved?: boolean;
};

export const normalizeNotificationCompany = (name: string) =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

export function exactNotificationMatches<T extends { name: string; aliases: string[] }>(accountName: string, companies: T[]): T[] {
  const key = normalizeNotificationCompany(accountName);
  if (!key) return [];
  return companies.filter((company) => [company.name, ...company.aliases]
    .some((name) => normalizeNotificationCompany(name) === key));
}

export type AccountCompanyNotification = {
  accountId: string;
  certificateId: string;
  accountName: string;
  internalNotes: string | null;
  deathRecordVerified: boolean;
  company: NotificationCompany | null;
  suggestions: NotificationCompany[];
  linked: boolean;
  routingIssue: string | null;
  reporting: {
    company: string;
    portal: string;
    phone: string;
    notes: string;
    emailAcceptance: string;
    sourceUrl: string;
    staffPortal?: { url: string; note: string };
  } | null;
  notice: {
    id: string;
    status: string;
    secureRecordId: string;
    sentAt: string | null;
    acknowledgedAt: string | null;
  } | null;
  preview: { subject: string; text: string };
};
