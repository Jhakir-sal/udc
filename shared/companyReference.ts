/** Imported research is deliberately separate from approved operational routing. */
export type CompanyReferenceEntry = {
  id: string;
  category: string;
  company: string;
  department: string;
  email: string;
  portal: string;
  phone: string;
  fax: string;
  mailingAddress: string;
  emailAcceptance: string;
  notes: string;
  whenToNotify: string;
  sourceQuality: string;
  sourceUrl: string;
  sourceReportedDate: string;
  hasEmailCandidate: boolean;
  needsReview: true;
  staffPortal?: {
    url: string;
    note: string;
  };
};

export type CompanyReferenceCatalog = {
  entries: CompanyReferenceEntry[];
  categories: string[];
  total: number;
  emailCandidates: number;
  workbookDate: string;
};
