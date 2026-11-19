import { CASE_TASK_KEYS } from "@shared/schema";

export const REFERRAL_CONSENT_VERSION = "2025-01";
export const REFERRAL_CONSENT_SCOPE = "broad_milestones_and_overall_completion";

export const SAFE_MILESTONE_LABELS: Record<(typeof CASE_TASK_KEYS)[number], string> = {
  case_created: "Care coordination started",
  certificate_uploaded: "Required intake received",
  verified_blockchain: "Initial review completed",
  accounts_added: "Service coordination prepared",
  notifications_sent: "Provider outreach underway",
  gov_agencies_notified: "Public-agency coordination underway",
  credit_protection: "Identity-protection coordination underway",
  insurance_benefits: "Benefits coordination underway",
  case_complete: "Care coordination completed",
};

export function safeMilestoneLabel(taskKey: string): string | null {
  return Object.prototype.hasOwnProperty.call(SAFE_MILESTONE_LABELS, taskKey)
    ? SAFE_MILESTONE_LABELS[taskKey as keyof typeof SAFE_MILESTONE_LABELS]
    : null;
}

export function safeProgress(tasks: Array<{ taskKey: string; completed: boolean }>) {
  const allowed = tasks.filter((task) => safeMilestoneLabel(task.taskKey));
  const completed = allowed.filter((task) => task.completed);
  return {
    completedCount: completed.length,
    totalCount: CASE_TASK_KEYS.length,
    percent: Math.round((completed.length / CASE_TASK_KEYS.length) * 100),
    completedMilestones: completed.map((task) => safeMilestoneLabel(task.taskKey)!),
  };
}

export function canSendReferralProgress(input: {
  referralStatus: string;
  companyActive: boolean;
  taskKey: string;
  completed: boolean;
}) {
  return input.referralStatus === "confirmed"
    && input.companyActive
    && input.completed
    && safeMilestoneLabel(input.taskKey) !== null;
}

// The database CAS is authoritative; this keeps the allowed state transition
// explicit for callers and focused unit tests.
export function canDecideReferral(status: string): boolean {
  return status === "pending_family_confirmation";
}