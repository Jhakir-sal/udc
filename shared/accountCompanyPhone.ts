export interface AccountCompanyPhoneResult {
  status: "verified" | "needs_website" | "not_found" | "unavailable";
  phone: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  sourceKind: "directory" | "staff_confirmed" | null;
  companyName: string;
  canManage: boolean;
  message?: string;
}
