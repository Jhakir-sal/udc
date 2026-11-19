export type OutreachEmailAudience = "never_emailed" | "selected_message";
export const OUTREACH_GROUPS = [
  "all", "emailed", "texted", "both_contacted", "email_only", "sms_only",
  "not_emailed", "not_texted", "no_outreach", "email_opted_out", "sms_opted_out", "opted_out", "needs_review",
] as const;
export type OutreachGroup = typeof OUTREACH_GROUPS[number];
export type OutreachChannelState = "not_contacted" | "submitted" | "delivered" | "failed" | "needs_review" | "opted_out" | "missing_contact" | "shared_contact";
export interface OutreachMember {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  emailState: OutreachChannelState;
  smsState: OutreachChannelState;
  emailLastAttemptAt: string | null;
  smsLastAttemptAt: string | null;
  emailAttempted: boolean;
  smsAttempted: boolean;
  canEmail: boolean;
  canText: boolean;
  signedUp: boolean;
}
export interface OutreachOverview {
  members: OutreachMember[];
  counts: Record<OutreachGroup, number>;
  total: number;
  offset: number;
  limit: number;
  checkedAt: string;
  smsPaused: boolean;
  smsRunStatus: string | null;
}
