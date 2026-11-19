export type AnalyticsProperties = Record<string, string | number | boolean>;

export type AnalyticsEventMap = {
  landing_cta_click: {
    cta: "register" | "login" | "team_login" | "partner_portal" | "heartplan" | "demo";
    placement: "header_mobile" | "header_desktop" | "hero";
  };
  demo_experience_click: {
    action: "select_experience" | "switch_experience" | "main_site";
    experience?: "family" | "partner" | "heartplan";
  };
  signup_account_created: { linked_certificate: boolean };
  signup_completed: { id_verification?: "verified" | "skipped" };
  login_success: {
    auth_path: "password" | "two_factor";
    destination_class: "home" | "heartplan_advisor" | "other";
  };
  heartplan_content_saved: {
    section: "profile" | "wishes" | "assets" | "contacts" | "legacy_messages";
    asset_category?:
      | "banking"
      | "investments"
      | "insurance"
      | "real_estate"
      | "vehicles"
      | "business"
      | "valuables"
      | "digital"
      | "subscription"
      | "membership"
      | "debt"
      | "other";
  };
  heartplan_section_nav: {
    section: "profile" | "wishes" | "documents" | "assets" | "contacts" | "legacy_messages";
    action: "back" | "defer" | "continue";
  };
  heartplan_living_plan_milestone: {
    milestone: "started" | "30_percent" | "50_percent" | "75_percent" | "100_percent";
  };
  admin_heartplan_stage_selected: {
    stage_band: "started" | "30_percent" | "50_percent" | "75_percent" | "complete";
  };
  admin_heartplan_stage_cleared: {
    stage_band: "started" | "30_percent" | "50_percent" | "75_percent" | "complete";
  };
  marketplace_provider_view: Record<string, never>;
  marketplace_provider_contact: { action: "phone" | "email" | "website" };
  referral_decision: { decision: "confirmed" | "declined" };
  admin_partner_created: {
    partner_type: "funeral_home" | "referral_company" | "marketplace_provider";
  };
  certificate_or_case_created: {
    workflow: "certificate_upload" | "manual_case";
    input_method?: "upload" | "manual";
    ocr_used?: boolean;
  };
  legacy_checkout_started: { surface: "dashboard" | "vault" };
  legacy_checkout_success: { surface: "dashboard" };
};

const HEARTPLAN_MILESTONES = [
  { threshold: 0, milestone: "started" },
  { threshold: 30, milestone: "30_percent" },
  { threshold: 50, milestone: "50_percent" },
  { threshold: 75, milestone: "75_percent" },
  { threshold: 100, milestone: "100_percent" },
] as const;

declare global {
  interface Window {
    umami?: {
      track: (event: string, properties?: AnalyticsProperties) => unknown;
    };
  }
}

export function trackAnalyticsEvent<Name extends keyof AnalyticsEventMap>(
  name: Name,
  properties: AnalyticsEventMap[Name],
): void {
  if (typeof window === "undefined") return;
  try {
    const result = window.umami?.track(name, properties);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Analytics must never interrupt the product action being measured.
  }
}

export function trackLivingHeartPlanMilestones(
  planId: string,
  status: string,
  percent: number,
): void {
  if (typeof window === "undefined" || status === "activated") return;

  const storageKey = `sal-heartplan-milestones-${planId}`;
  try {
    const tracked = new Set<string>(
      JSON.parse(window.localStorage.getItem(storageKey) || "[]"),
    );
    const reached = HEARTPLAN_MILESTONES.filter(
      ({ threshold, milestone }) => percent >= threshold && !tracked.has(milestone),
    );
    if (reached.length === 0) return;

    reached.forEach(({ milestone }) => tracked.add(milestone));
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(tracked)));

    reached.forEach(({ milestone }) => {
      trackAnalyticsEvent("heartplan_living_plan_milestone", { milestone });
    });
  } catch {
    // If durable browser storage is unavailable, skip rather than double-counting.
  }
}
