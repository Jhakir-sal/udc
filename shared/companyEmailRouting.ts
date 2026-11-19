// Notification routing only. Do not use alternate-recipient approval as
// permission to join the company portal or access private documents.
export type CompanyRoutingApproval = {
  email: string;
  officialDomain: string;
  approvedBy: string;
  approvedAt: string;
  reason: string;
};

export function emailMatchesCompanyDomain(email: string, officialDomain: string): boolean {
  const parts = email.trim().toLowerCase().split("@");
  const expected = officialDomain.trim().toLowerCase().replace(/\.$/, "");
  const validDomain = (value: string) => value.length <= 253 && value.split(".").length >= 2 &&
    value.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0]) || !validDomain(parts[1]) || !validDomain(expected)) return false;
  return parts[1] === expected || parts[1].endsWith(`.${expected}`);
}

export function hasCurrentRoutingApproval(company: {
  notificationEmail: string | null;
  officialDomain: string;
  routingApproval?: CompanyRoutingApproval | null;
}): boolean {
  const approval = company.routingApproval;
  return !!approval && !!company.notificationEmail &&
    approval.email === company.notificationEmail &&
    approval.officialDomain === company.officialDomain &&
    !!approval.approvedBy && Number.isFinite(Date.parse(approval.approvedAt)) &&
    typeof approval.reason === "string" && approval.reason.trim().length >= 20;
}

export function hasVerifiedNotificationRouting(company: {
  status: string;
  notificationEmail: string | null;
  officialDomain: string;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  routingApproval?: CompanyRoutingApproval | null;
}): boolean {
  return company.status === "active" && !!company.notificationEmail && !!company.verifiedAt && !!company.verifiedBy &&
    (emailMatchesCompanyDomain(company.notificationEmail, company.officialDomain) || hasCurrentRoutingApproval(company));
}
