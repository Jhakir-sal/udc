type CaseSummary = {
  id: string;
  status: string;
};

type AccountSummary = {
  certificateId: string;
  status: string;
};

const RESOLVED_ACCOUNT_STATUSES = new Set(["closed", "suspended"]);

export function isHeartPlanInvitationLateStage(
  certificates: CaseSummary[],
  accounts: AccountSummary[],
): boolean {
  if (certificates.length === 0) return false;

  return certificates.every((certificate) => {
    if (certificate.status === "completed") return true;
    const caseAccounts = accounts.filter((account) => account.certificateId === certificate.id);
    return caseAccounts.length > 0 &&
      caseAccounts.every((account) => RESOLVED_ACCOUNT_STATUSES.has(account.status));
  });
}