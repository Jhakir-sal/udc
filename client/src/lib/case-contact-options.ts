export type CaseContactRole = "nextOfKin" | "primaryContact" | "informant";

export type CaseContactDraft = {
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  nextOfKinEmail: string;
  nextOfKinAddress: string;
  nextOfKinCity: string;
  nextOfKinState: string;
  nextOfKinZip: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  informantName: string;
  informantRelationship: string;
  informantPhone: string;
  informantEmail: string;
  informantAddress: string;
};

export type ContactCandidate = {
  id: string;
  name: string;
  source: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  relationship?: string | null;
};

const roleFields: Record<CaseContactRole, (keyof CaseContactDraft)[]> = {
  nextOfKin: [
    "nextOfKinName", "nextOfKinRelationship", "nextOfKinPhone", "nextOfKinEmail",
    "nextOfKinAddress", "nextOfKinCity", "nextOfKinState", "nextOfKinZip",
  ],
  primaryContact: ["contactName", "contactPhone", "contactEmail", "contactAddress"],
  informant: ["informantName", "informantRelationship", "informantPhone", "informantEmail", "informantAddress"],
};

export const emptyCaseContactDraft = (): CaseContactDraft => ({
  nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "", nextOfKinEmail: "",
  nextOfKinAddress: "", nextOfKinCity: "", nextOfKinState: "", nextOfKinZip: "",
  contactName: "", contactPhone: "", contactEmail: "", contactAddress: "",
  informantName: "", informantRelationship: "", informantPhone: "", informantEmail: "", informantAddress: "",
});

export function savedCaseContactDraft(role: CaseContactRole, certificate: any): CaseContactDraft {
  const fields = roleFields[role];
  const draft = emptyCaseContactDraft();
  for (const field of fields) draft[field] = String(certificate?.[field] ?? "") as never;
  return draft;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function displayName(firstName?: unknown, lastName?: unknown): string {
  return [nonEmpty(firstName), nonEmpty(lastName)].filter(Boolean).join(" ");
}

export function buildCaseContactOptions({
  certificate,
  owner,
  familyAccounts = [],
  relatives = [],
}: {
  certificate: any;
  owner?: any;
  familyAccounts?: any[];
  relatives?: any[];
}): ContactCandidate[] {
  const options: ContactCandidate[] = [];
  const savedRoles: { role: CaseContactRole; label: string; name?: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string; relationship?: string }[] = [
    {
      role: "nextOfKin", label: "Saved case contact · Next of Kin",
      name: certificate?.nextOfKinName, phone: certificate?.nextOfKinPhone, email: certificate?.nextOfKinEmail,
      address: certificate?.nextOfKinAddress, city: certificate?.nextOfKinCity, state: certificate?.nextOfKinState,
      zip: certificate?.nextOfKinZip, relationship: certificate?.nextOfKinRelationship,
    },
    {
      role: "primaryContact", label: "Saved case contact · Primary Contact",
      name: certificate?.contactName, phone: certificate?.contactPhone, email: certificate?.contactEmail, address: certificate?.contactAddress,
    },
    {
      role: "informant", label: "Saved case contact · Informant",
      name: certificate?.informantName, phone: certificate?.informantPhone, email: certificate?.informantEmail,
      address: certificate?.informantAddress, relationship: certificate?.informantRelationship,
    },
  ];
  for (const saved of savedRoles) {
    if (!nonEmpty(saved.name)) continue;
    options.push({
      id: `saved:${saved.role}`, name: saved.name!, source: saved.label, email: saved.email, phone: saved.phone,
      address: saved.address, city: saved.city, state: saved.state, zip: saved.zip, relationship: saved.relationship,
    });
  }

  familyAccounts.forEach((account, index) => {
    const name = nonEmpty(account?.accountName);
    if (!name) return;
    options.push({
      id: `family-account:${account?.id ?? index}`, name, source: "Linked family account",
      email: account?.email, phone: account?.phoneNumber,
    });
  });

  const ownerName = displayName(owner?.firstName, owner?.lastName);
  if (ownerName || nonEmpty(owner?.email)) {
    options.push({
      id: "case-owner", name: ownerName || String(owner.email), source: "Case owner account",
      email: owner?.email, phone: owner?.phoneNumber,
      relationship: certificate?.submitterRelationship,
    });
  }

  relatives.forEach((relative, index) => {
    if (relative?.dataSource !== "manual_entry" || relative?.unverified === true) return;
    const name = nonEmpty(relative?.fullName);
    if (!name) return;
    options.push({
      id: `manual-relative:${relative?.id ?? index}`, name, source: "Manually entered relative",
      email: relative?.email, phone: relative?.phone, address: relative?.address,
      city: relative?.city, state: relative?.state, zip: relative?.zipCode, relationship: relative?.relationship,
    });
  });
  return options;
}

export function mapCandidateToCaseContact(
  role: CaseContactRole,
  candidate: ContactCandidate,
): CaseContactDraft {
  const draft = emptyCaseContactDraft();
  const fields = roleFields[role];
  const prefix = role === "nextOfKin" ? "nextOfKin" : role === "informant" ? "informant" : "contact";
  const nameField = `${prefix}Name` as keyof CaseContactDraft;
  const phoneField = `${prefix}Phone` as keyof CaseContactDraft;
  const emailField = `${prefix}Email` as keyof CaseContactDraft;
  const addressField = `${prefix}Address` as keyof CaseContactDraft;

  const mapped: Partial<CaseContactDraft> = {
    [nameField]: candidate.name,
    [phoneField]: candidate.phone || "",
    [emailField]: candidate.email || "",
    [addressField]: role === "nextOfKin"
      ? candidate.address || ""
      : [candidate.address, candidate.city, candidate.state, candidate.zip].filter(Boolean).join(", "),
  };
  if (role === "nextOfKin") {
    mapped.nextOfKinAddress = candidate.address || "";
    mapped.nextOfKinCity = candidate.city || "";
    mapped.nextOfKinState = candidate.state || "";
    mapped.nextOfKinZip = candidate.zip || "";
    mapped.nextOfKinRelationship = candidate.relationship || "";
  } else if (role === "informant") {
    mapped.informantRelationship = candidate.relationship || "";
  }

  for (const field of fields) draft[field] = (mapped[field] ?? "") as never;
  return draft;
}

export function caseContactPayload(role: CaseContactRole, draft: CaseContactDraft): Record<string, string> {
  return Object.fromEntries(roleFields[role].map((field) => [field, draft[field]]));
}

export function caseContactRoleFields(role: CaseContactRole): (keyof CaseContactDraft)[] {
  return [...roleFields[role]];
}
