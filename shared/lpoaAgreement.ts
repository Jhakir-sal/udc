import { z } from "zod";

export const LEGACY_LPOA_AGREEMENT_VERSION = "legacy-standard-v1";
export const CURRENT_LPOA_AGREEMENT_VERSION = "standard-2026-08-28-v1";

export const lpoaAgreementSnapshotSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  grantParagraph: z.string(),
  authorizedActions: z.array(z.string()),
  diligenceParagraph: z.string(),
  limitationParagraph: z.string(),
  acknowledgementParagraph: z.string(),
});

export type LpoaAgreementSnapshot = z.infer<typeof lpoaAgreementSnapshotSchema>;

export const LEGACY_LPOA_AGREEMENT: LpoaAgreementSnapshot = {
  title: "LIMITED POWER OF ATTORNEY",
  subtitle: "Standard — End-of-Life Resolution Services",
  grantParagraph:
    "I hereby grant this limited power of attorney to Steps After Life, Inc., represented by their authorized agent, Diana Milian, whose address is 21002 Mack Ave., Grosse Pointe Woods, MI 48236, to act on behalf of the Principal in all matters related to the end of life resolution services they provide. This limited power of attorney authorizes Steps After Life, Inc. to perform the following actions:",
  authorizedActions: [
    "Communicate and interact with relevant resolution authorities, organizations, or entities.",
    "Obtain and review resolution documents, records, and information pertaining to the Principal.",
    "Handle estate matters, including the limited management and distribution of assets and liabilities, as required.",
    "Deliver any necessary documents, contracts, or agreements related to resolution matters on behalf of the Principal.",
    "Represent the Principal in non-legal or financial resolution and negotiations, if necessary.",
    "Act on behalf of the Principal to identify debtors and creditors for the purpose of account resolution, including communicating and coordinating with credit reporting agencies and similar organizations, as well as obtaining a copy of the credit report as needed.",
  ],
  diligenceParagraph:
    "Steps After Life, Inc. and its authorized agent are expected to act diligently, in good faith, and in the best interests of the Principal. They shall provide regular updates to me, the Principal, regarding all actions taken on behalf of the Principal under this limited power of attorney.",
  limitationParagraph:
    "This limited power of attorney is granted solely for resolution matters and does not grant Steps After Life, Inc. or its authorized agents any authority control over other legal or medical decisions.",
  acknowledgementParagraph:
    "By signing below, I acknowledge that I fully understand the terms and conditions of this limited power of attorney and willingly grant Steps After Life, Inc. the authority to represent the Principal for resolution matters.",
};

// Any wording change must create a new version and a new snapshot object.
// Never edit a released agreement in place: signatures persist this object verbatim.
export const CURRENT_LPOA_AGREEMENT: LpoaAgreementSnapshot = LEGACY_LPOA_AGREEMENT;

const AGREEMENTS_BY_VERSION: Record<string, LpoaAgreementSnapshot> = {
  [LEGACY_LPOA_AGREEMENT_VERSION]: LEGACY_LPOA_AGREEMENT,
  [CURRENT_LPOA_AGREEMENT_VERSION]: CURRENT_LPOA_AGREEMENT,
};

export function serializeLpoaAgreement(snapshot: LpoaAgreementSnapshot): string {
  return JSON.stringify(snapshot);
}

export function resolveLpoaAgreement(
  version: string,
  serializedSnapshot: string | null | undefined,
): LpoaAgreementSnapshot {
  if (serializedSnapshot) {
    const parsed = lpoaAgreementSnapshotSchema.safeParse(JSON.parse(serializedSnapshot));
    if (!parsed.success) {
      throw new Error(`Invalid stored LPOA agreement snapshot for version ${version}`);
    }
    return parsed.data;
  }

  const versionedAgreement = AGREEMENTS_BY_VERSION[version];
  if (!versionedAgreement) {
    throw new Error(`Unknown LPOA agreement version: ${version}`);
  }
  return versionedAgreement;
}