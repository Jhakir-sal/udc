export const HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS = 72 * 60 * 60 * 1000;
export const HEARTPLAN_INTAKE_REMINDER_VARIANT_COUNT = 3;

export function incompleteHeartPlanReminderCycle(params: {
  createdAt: Date;
  planStatus: string;
  isPlanComplete: boolean;
  now: Date;
}): number | null {
  if (params.planStatus !== "active" || params.isPlanComplete) return null;
  const elapsed = params.now.getTime() - params.createdAt.getTime();
  if (elapsed < HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS) return null;
  return Math.floor(elapsed / HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS);
}

export function incompleteHeartPlanReminderVariant(cycle: number): 0 | 1 | 2 {
  const normalizedCycle = Math.max(1, Math.floor(cycle));
  return ((normalizedCycle - 1) % HEARTPLAN_INTAKE_REMINDER_VARIANT_COUNT) as 0 | 1 | 2;
}

export function canClaimIncompleteHeartPlanReminder(params: {
  cycle: number;
  sentCycle: number;
  leaseExpiresAt?: Date | null;
  retryAt?: Date | null;
  now: Date;
}): boolean {
  return params.cycle > params.sentCycle
    && (!params.leaseExpiresAt || params.leaseExpiresAt <= params.now)
    && (!params.retryAt || params.retryAt <= params.now);
}