/** Match the personal workspace, not the separate /heartplans admin list. */
export function isPersonalHeartPlanPath(pathname: string): boolean {
  return pathname === "/heartplan"
    || pathname.startsWith("/heartplan/")
    || pathname === "/heartplan-register";
}

/** Carry the planner search through staff completion navigation. */
export function adminHeartPlansHref(q = ""): string {
  return `/heartplans${q ? `?q=${encodeURIComponent(q)}` : ""}`;
}

export function adminHeartPlanDetailHref(planId: string, q = ""): string {
  return `/admin/heartplan/${encodeURIComponent(planId)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
}
