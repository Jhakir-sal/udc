import { readFileSync } from "node:fs";
import path from "node:path";
import { HEARTPLAN_PRIVACY, HEARTPLAN_TERMS } from "@shared/heartPlanConsent";
import { getAppUrl } from "./email";

export interface OrsaHeartPlanEmailSequenceDraft {
  id: string;
  suggestedSendDate: string;
  fromName: string;
  subject: string;
  preheader: string;
  ctaUrl: string;
  html: string;
  text: string;
  attachments: Array<{
    content: string;
    filename: string;
    type: "image/png";
    disposition: "inline";
    content_id: "orsa-logo";
  }>;
  status: "unsent";
}

const EMAIL_SENDER = "orsa Credit Union member benefits, powered by Steps After Life";
const SIGNATURE_TEXT = "Diana Milian\nCEO, Steps After Life\nin partnership with ORSA Credit Union";
const OFFER_COPY =
  "The ORSA HeartPlan offer is $50 one-time for lifetime access through December 1, 2026 at 11:59 p.m. ET. Complimentary ORSA Legacy access remains active through that deadline. After the deadline, HeartPlan is $149 one-time for lifetime access.";
const UNSUBSCRIBE_URL =
  "mailto:hello@stepsafterlife.com?subject=Unsubscribe%20from%20orsa%20member%20emails";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function getBrandedShell(unsubscribeUrl = UNSUBSCRIBE_URL): { style: string; header: string; footer: string; logo: Buffer } {
  const built = process.env.NODE_ENV === "production";
  const assetDirectory = built ? "dist/attachments" : "previews";
  const previewPath = path.resolve(assetDirectory, built ? "orsa-heartplan-email.html" : "orsa-heartplan-email-preview.html");
  const preview = readFileSync(previewPath, "utf8");
  const style = preview.match(/<style>[\s\S]*?<\/style>/)?.[0];
  const header = preview.match(/<header class="header">[\s\S]*?<\/header>/)?.[0];
  const footer = preview.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0];
  if (!style || !header || !footer) {
    throw new Error("The ORSA HeartPlan email preview is missing its branded shell");
  }

  const privacyUrl = `${getAppUrl()}${HEARTPLAN_PRIVACY.path}`;
  const termsUrl = `${getAppUrl()}${HEARTPLAN_TERMS.path}`;
  const brandedHeader = header.replace('src="orsa-approved-logo.png"', 'src="cid:orsa-logo"');
  const brandedFooter = footer
    .replace('<a href="#">Privacy Policy</a>', `<a href="${escapeHtml(privacyUrl)}">Privacy Policy</a>`)
    .replace('<a href="#">Terms and Conditions</a>', `<a href="${escapeHtml(termsUrl)}">Terms and Conditions</a>`)
    .replace('<a href="#">Unsubscribe</a>', `<a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>`);
  if (brandedFooter.includes('href="#"')) {
    throw new Error("The ORSA HeartPlan email footer contains a preview-only link");
  }

  return {
    style,
    header: brandedHeader,
    footer: brandedFooter,
    logo: readFileSync(path.resolve(assetDirectory, built ? "orsa-logo.png" : "orsa-approved-logo.png")),
  };
}

interface DraftContent {
  id: string;
  suggestedSendDate: string;
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  ctaLabel: string;
}

const draftContent: DraftContent[] = [
  {
    id: "link-recovery",
    suggestedSendDate: "2026-10-02",
    subject: "Activate your ORSA HeartPlan account",
    preheader: "A simple step today can help the people you love tomorrow.",
    heading: "Activate your account. Help protect your family.",
    paragraphs: [
      "Activating your account helps protect your future and family.",
      "ORSA has partnered with Steps After Life to offer HeartPlan, a private place for your wishes and important information. Create your account using the button below, then verify your email to get started.",
      "If our earlier link did not open, please use the button below.",
      OFFER_COPY,
    ],
    ctaLabel: "Activate My Account",
  },
  {
    id: "launch-week",
    suggestedSendDate: "2026-09-29",
    subject: "Protect your future and family with HeartPlan",
    preheader: "A simple step today can help the people you love tomorrow.",
    heading: "Protect your future and family",
    paragraphs: [
      "Activating your account helps protect your future and family.",
      "ORSA has partnered with Steps After Life to offer HeartPlan, a private place for your wishes and important information. Create your account using the button below, then verify your email to get started.",
      OFFER_COPY,
    ],
    ctaLabel: "Activate My Account",
  },
  {
    id: "getting-started",
    suggestedSendDate: "2026-10-12",
    subject: "What would your family need to know?",
    preheader: "A few important details can make difficult days easier to navigate.",
    heading: "Start with what matters most",
    paragraphs: [
      "If your family needed to find your wishes or important information, would they know where to look? Even a small start can help bring those details together.",
      "With HeartPlan, you can organize your wishes, important documents and accounts, trusted contacts, and personal messages in one place. You can return to your plan as life changes.",
      OFFER_COPY,
    ],
    ctaLabel: "Start My HeartPlan",
  },
  {
    id: "trusted-contacts",
    suggestedSendDate: "2026-10-22",
    subject: "Help the people you trust find clarity",
    preheader: "Put your wishes and the people who matter in one place.",
    heading: "Make it easier to know who to turn to",
    paragraphs: [
      "When plans are unclear, loved ones may not know who to call or where to find important details. Writing down your wishes and naming trusted contacts can give them a clearer starting point.",
      "HeartPlan gives ORSA members a private place to keep those details, along with important documents, accounts, and personal messages for their loved ones.",
      OFFER_COPY,
    ],
    ctaLabel: "Explore HeartPlan",
  },
  {
    id: "thirty-days-left",
    suggestedSendDate: "2026-11-01",
    subject: "30 days left for your ORSA HeartPlan offer",
    preheader: "A little time now can make a lasting difference for your family.",
    heading: "A helpful reminder about your ORSA offer",
    paragraphs: [
      "Your ORSA member offer for HeartPlan is available through December 1, 2026. HeartPlan helps you gather important wishes and information in one place, so the people you care about have more clarity when they need it.",
      OFFER_COPY,
    ],
    ctaLabel: "Get My HeartPlan",
  },
  {
    id: "planning-for-loved-ones",
    suggestedSendDate: "2026-11-17",
    subject: "Give your family clarity with HeartPlan",
    preheader: "Keep your wishes, trusted people, and personal messages together.",
    heading: "Make important information easier to find",
    paragraphs: [
      "Planning ahead is a thoughtful way to help the people you love. HeartPlan gives you a private place to record your wishes, important documents and accounts, trusted contacts, and personal messages.",
      OFFER_COPY,
    ],
    ctaLabel: "Explore HeartPlan",
  },
  {
    id: "one-week-left",
    suggestedSendDate: "2026-11-24",
    subject: "One week left for your ORSA HeartPlan offer",
    preheader: "One small step now can help your loved ones feel more prepared.",
    heading: "Your ORSA offer ends in one week",
    paragraphs: [
      "This is a one-week reminder that the ORSA member offer ends December 1, 2026 at 11:59 p.m. ET. HeartPlan can keep your wishes, important information, trusted contacts, and personal messages together for your loved ones.",
      OFFER_COPY,
    ],
    ctaLabel: "Get My HeartPlan",
  },
  {
    id: "ends-tomorrow",
    suggestedSendDate: "2026-11-30",
    subject: "Ends tomorrow: your ORSA HeartPlan offer",
    preheader: "There is still time to put what matters into words.",
    heading: "Your ORSA offer ends tomorrow",
    paragraphs: [
      "Your ORSA member offer for HeartPlan ends tomorrow, December 1, 2026 at 11:59 p.m. ET. If you would like lifetime access at the ORSA rate, you can get started before the offer ends.",
      OFFER_COPY,
      "Thank you for trusting us to help you plan for the people you love.",
    ],
    ctaLabel: "Get My HeartPlan Now",
  },
];

/** Send windows and draft dates share one source of truth; this does not schedule delivery. */
export function getOrsaHeartPlanEmailSchedule(): Array<{ id: string; suggestedSendDate: string }> {
  return draftContent.map(({ id, suggestedSendDate }) => ({ id, suggestedSendDate }));
}

/**
 * Build email content only. This module has no delivery or scheduling behavior.
 */
export function buildOrsaHeartPlanEmailSequenceDrafts(params: {
  recipientName?: string | null;
  unsubscribeUrl?: string;
  trackingToken?: string;
} = {}): OrsaHeartPlanEmailSequenceDraft[] {
  const unsubscribeUrl = params.unsubscribeUrl || UNSUBSCRIBE_URL;
  const shell = getBrandedShell(unsubscribeUrl);
  const firstName = params.recipientName?.trim().split(/\s+/)[0] || "";
  const greetingHtml = firstName ? `Hello <strong>${escapeHtml(firstName)}</strong>,` : "Hello,";
  const greetingText = firstName ? `Hello ${firstName},` : "Hello,";
  const registerUrl = `${getAppUrl()}/heartplan-register?orsa_offer=1`;
  const trackedCtaUrl = params.trackingToken
    ? `${getAppUrl()}/api/orsa/email-campaign/click/${params.trackingToken}`
    : registerUrl;
  const openPixel = params.trackingToken
    ? `<img src="${escapeHtml(`${getAppUrl()}/api/orsa/email-campaign/open/${params.trackingToken}`)}" width="1" height="1" alt="" style="width:1px;height:1px;border:0">`
    : "";
  const privacyUrl = `${getAppUrl()}${HEARTPLAN_PRIVACY.path}`;
  const termsUrl = `${getAppUrl()}${HEARTPLAN_TERMS.path}`;
  const logo = shell.logo.toString("base64");

  return draftContent.map((draft) => {
    const htmlParagraphs = draft.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
    const textParagraphs = draft.paragraphs.join("\n\n");
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(draft.subject)}</title>
  ${shell.style}
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent" aria-hidden="true">${escapeHtml(draft.preheader)}</div>
  ${shell.header}
  <section class="content">
    <h1>${escapeHtml(draft.heading)}</h1>
    <p>${greetingHtml}</p>
    ${htmlParagraphs}
    <div class="button-wrap">
      <a class="button" href="${escapeHtml(trackedCtaUrl)}" aria-label="${escapeHtml(draft.ctaLabel)}">${escapeHtml(draft.ctaLabel)}</a>
    </div>
    ${draft.id === "link-recovery" ? `<p>If the button does not open, copy this address into your browser:<br><a href="${escapeHtml(registerUrl)}">${escapeHtml(registerUrl)}</a></p>` : ""}
    <p>${SIGNATURE_TEXT.split("\n").map(escapeHtml).join("<br>")}</p>
  </section>
  ${shell.footer}
  ${openPixel}
</body>
</html>`;
    const text = `${greetingText}\n\n${textParagraphs}\n\n${draft.ctaLabel}: ${trackedCtaUrl}${draft.id === "link-recovery" ? `\n\nBackup registration address: ${registerUrl}` : ""}\n\n${SIGNATURE_TEXT}\n\nQuestions? Contact Steps After Life at hello@stepsafterlife.com or 888-557-2083.\nSteps After Life · 21002 Mack Ave, Grosse Pointe Woods, MI 48236\nPrivacy Policy: ${privacyUrl}\nTerms and Conditions: ${termsUrl}\nUnsubscribe from member emails: ${unsubscribeUrl}`;

    return {
      id: draft.id,
      suggestedSendDate: draft.suggestedSendDate,
      fromName: EMAIL_SENDER,
      subject: draft.subject,
      preheader: draft.preheader,
      ctaUrl: registerUrl,
      html,
      text,
      attachments: [{
        content: logo,
        filename: "orsa-credit-union.png",
        type: "image/png",
        disposition: "inline",
        content_id: "orsa-logo",
      }],
      status: "unsent",
    };
  });
}