import type { User } from "@shared/models/auth";
import type { HeartPlan, PlanAsset } from "@shared/schema";
import { isDemoAccountEmail } from "@shared/demoAccounts";

export function canAccessFinancialDiscovery(
  user: Pick<User, "email" | "isDemoAccount"> | null | undefined,
): boolean {
  return Boolean(user?.isDemoAccount && isDemoAccountEmail(user.email));
}

export function financialInventoryForConcierge(
  plan: Pick<HeartPlan, "status">,
  assets: PlanAsset[],
): PlanAsset[] {
  return plan.status === "activated" ? assets : [];
}