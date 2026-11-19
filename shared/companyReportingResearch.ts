/** Official-source research, not routing approval or permission to send documents. */
export type CompanyReportingResearch = {
  name: string;
  officialDomain: string;
  category: "financial" | "real_estate" | "miscellaneous";
  isNational: boolean;
  checkedOn: string;
  department: string;
  channels: string;
  documents: string;
  limitations: string;
  sources: { label: string; url: string }[];
};

export const PRIORITY_COMPANY_REPORTING_RESEARCH: readonly CompanyReportingResearch[] = [
  {
    name: "DTE Energy", officialDomain: "dteenergy.com", category: "real_estate", isNational: false,
    checkedOn: "2026-10-18", department: "Customer service — Death of an Account Holder",
    channels: "Call 855-838-7258 and follow the account-holder death options for start, stop, or move service.",
    documents: "Detailed cover letter with your contact information and requested action; death certificate. For an estate account or transfer into your name, DTE additionally lists estate documentation, trust papers, tax documentation or EIN, and a state-issued driver's license/ID or Social Security card.",
    limitations: "Confirm the submission destination with DTE by phone. No accepted death-notification email published in the reviewed source.",
    sources: [{ label: "DTE: My Profile & Preferences — Death of an Account Holder", url: "https://www.dteenergy.com/us/en/residential/billing-and-payments/online-account/my-profile.html" }],
  },
  {
    name: "Consumers Energy", officialDomain: "consumersenergy.com", category: "real_estate", isNational: false,
    checkedOn: "2026-10-18", department: "Residential customer service / Start Service",
    channels: "For taking over after a death, select Start Service and request service in the survivor's own name. Consumers closes the old account and issues its final bill. For assistance or other estate requests call 800-477-5050, Mon–Fri 8 a.m.–5 p.m.",
    documents: "Start-service guidance lists service address/date, SSN, driver's license or state ID, and final-bill address when stopping service. Death-specific certificate and representative-authority requirements are not published in these sources; staff must confirm them.",
    limitations: "The Start Service route is confirmed for taking over service, not a general estate settlement or third-party death-reporting portal. Do not use general fax/upload channels for death documents without instructions. No accepted death-notification email found.",
    sources: [
      { label: "Consumers: Start, Stop or Transfer Service — taking over after a death", url: "https://www.consumersenergy.com/residential/account-and-billing/start-stop-service" },
      { label: "Consumers: Help Center — residential phone", url: "https://www.consumersenergy.com/contact-us.aspx" },
    ],
  },
  {
    name: "Verizon Wireless", officialDomain: "verizon.com", category: "real_estate", isNational: true,
    checkedOn: "2026-10-18", department: "Mobile customer service / deceased account handling",
    channels: "Estate executor: call 800-922-0204 or visit a Verizon Company Store (not an authorized retailer). Use the linked executor transfer/disconnect form when directed, or to request a transfer.",
    documents: "Account owner's name, mobile number and account PIN. Bring death certificate and executor paperwork for verification; phone handling may require uploading the death certificate. Transfer to an executor requires executorship paperwork.",
    limitations: "Requirements depend on account role and requested action. This research covers mobile service, not Fios. No accepted death-notification email published.",
    sources: [
      { label: "Verizon: What to do when someone on your mobile account passes away", url: "https://www.verizon.com/support/deceased-account-handling/" },
      { label: "Verizon: Executor transfer or disconnect form", url: "https://www.verizon.com/support/transfer-service/deceased-request-executor/" },
    ],
  },
  {
    name: "AT&T", officialDomain: "att.com", category: "real_estate", isNational: true,
    checkedOn: "2026-10-18", department: "Wireless account support — Manage due to death",
    channels: "Call 800-331-0500 or choose CHAT on the official support page when available. A retail-store visit may be required without the account passcode.",
    documents: "If the passcode is unknown, AT&T may request account/mobile numbers, account holder name, relationship, your contact email, last four digits of the holder's SSN, and one of a relevant accident report, death certificate or obituary.",
    limitations: "The contact email requested is the caller's address, not a notification destination. Requirements are conditional. Wireless only; confirm other product processes separately. No accepted death-notification email published.",
    sources: [{ label: "AT&T: Change a wireless account due to a life event — Manage due to death", url: "https://www.att.com/support/article/my-account/KM1113355/" }],
  },
  {
    name: "Bank of America", officialDomain: "bankofamerica.com", category: "financial", isNational: true,
    checkedOn: "2026-10-18", department: "Estate Servicing Operations",
    channels: "Start at bankofamerica.com/estateservices, call 888-689-4466 (Mon–Fri 9 a.m.–8 p.m. Eastern), or visit a financial center. Documents: secure Estate Services upload, financial center, or mail to Bank of America — Estate Servicing Operations, PO Box 31655, Tampa, FL 33631-1655.",
    documents: "Initial notification: deceased's full legal name and SSN. Guide generally calls for a certified death certificate and applicable trust, marriage/birth or probate documents; court-issued authority or small-estate affidavit and bank forms depend on the account/state. Confirm case-specific requirements with the team.",
    limitations: "Use official secure upload for documents when possible; do not send originals that cannot be returned. The guide states a POA ends at the account owner's death. No accepted death-notification email published.",
    sources: [{ label: "Bank of America: Estate Services Resource Guide, pages 3–5 and 10", url: "https://images.em.bankofamerica.com/estateservices/Estate_Services_Resource_Guide.pdf" }],
  },
  {
    name: "Chase", officialDomain: "chase.com", category: "financial", isNational: true,
    checkedOn: "2026-10-18", department: "Chase Estate Services — Retail and Card Accounts",
    channels: "Use Notify us online from Estate Services, call 866-926-6909 (Mon–Fri 8 a.m.–7 p.m. ET), or schedule a branch meeting. Chase says it shares the initial notification across the bank.",
    documents: "May request death certificate, reporter's identification, relationship to deceased, and deceased's SSN and/or account number. Authority documentation and further requirements depend on account and state.",
    limitations: "Updates/closures have product-specific teams: Auto 877-828-4771; Home Lending 866-299-6752; J.P. Morgan investments 800-648-4782. No accepted death-notification email published.",
    sources: [
      { label: "Chase: Estate Services", url: "https://www.chase.com/personal/estate-services" },
      { label: "Chase: Estate Services FAQs — authority and documents", url: "https://www.chase.com/personal/estate-services/faqs" },
    ],
  },
  {
    name: "Charles Schwab", officialDomain: "schwab.com", category: "financial", isNational: true,
    checkedOn: "2026-10-18", department: "Estate Services / Inheritance Center",
    channels: "Use the official Notify Schwab secure form at notification.schwab.com/notify. Estate Services assistance: 877-566-2284, Mon–Fri 8:30 a.m.–8 p.m. ET, including non-US support.",
    documents: "Initial notification needs full name and SSN. A copy of the death certificate is required for next steps; upload now or later in Schwab's secure process. Further inheritance paperwork depends on the account.",
    limitations: "The notification form is for US residents; non-US clients should contact Estate Services for instructions. No accepted death-notification email published.",
    sources: [
      { label: "Schwab: Losing a loved one", url: "https://www.schwab.com/life-events/losing-a-loved-one" },
      { label: "Schwab: Official death notification form", url: "https://notification.schwab.com/notify" },
    ],
  },
  {
    name: "Social Security Administration", officialDomain: "ssa.gov", category: "miscellaneous", isNational: true,
    checkedOn: "2026-10-18", department: "SSA official death reporting / funeral-home reporting",
    channels: "Funeral homes generally report the death. If not reported, call SSA at 800-772-1213; TTY 800-325-0778 (Mon–Fri 8 a.m.–7 p.m. in most US time zones), or contact a local SSA office. Outside the US, use the official Federal Benefits Unit guidance.",
    documents: "SSA's public reporting instructions request deceased's name, SSN, date of birth and date of death. A death certificate is not needed to begin the phone report; USAGov says it will be needed later to complete it. Ask SSA about proof required for survivor benefits.",
    limitations: "Use SSA's official process, not SAL email notices or a generic company portal. Public death reports are not accepted by email or online. Never collect these identifiers in directory notes.",
    sources: [
      { label: "SSA: What to do when someone dies", url: "https://www.ssa.gov/personal-record/when-someone-dies" },
      { label: "USAGov: Report the death of a Social Security or Medicare beneficiary", url: "https://www.usa.gov/social-security-report-a-death" },
    ],
  },
];

export function companyResearchNotes(research: CompanyReportingResearch): string {
  return `Checked: ${research.checkedOn}. Pending staff routing review; NOT email-ready.\nDepartment: ${research.department}\nChannels: ${research.channels}\nDocuments: ${research.documents}\nLimits: ${research.limitations}`;
}
