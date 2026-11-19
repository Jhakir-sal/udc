import sgMail from "@sendgrid/mail";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HEARTPLAN_PRIVACY, HEARTPLAN_TERMS } from "@shared/heartPlanConsent";
import { authorizeWarmupReservation, finishWarmupReservation, pauseWarmup, recordOtherEmailTraffic } from "./orsaWarmup";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "hello@stepsafterlife.com";
const FROM_NAME = "Steps After Life";
export function isEmailDeliveryConfigured(): boolean {
  return Boolean(SENDGRID_API_KEY);
}
function firstDomain(domains: string | undefined): string | undefined {
  return domains?.split(",").map((d) => d.trim()).find(Boolean);
}

export function getAppUrl(): string {
  // In production, REPLIT_DOMAINS lists this deployment's domain(s),
  // with a custom domain (if configured) first.
  const deployedDomain = firstDomain(process.env.REPLIT_DOMAINS);
  if (process.env.REPLIT_DEPLOYMENT === "1" && deployedDomain) {
    return `https://${deployedDomain}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (deployedDomain) {
    return `https://${deployedDomain}`;
  }
  return "http://localhost:5000";
}

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log("[Email] SendGrid configured");
} else {
  console.log("[Email] SendGrid not configured — messages cannot be delivered");
}

interface EmailOptions {
  to: string;
  cc?: string;
  // Only use a custom sender for a verified, application-controlled identity.
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  // Outreach must distinguish an uncertain provider response from a definite
  // rejection; retrying a timeout can duplicate an accepted message.
  throwOnFailure?: boolean;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition: "inline" | "attachment";
    content_id?: string;
  }>;
  // Included in SendGrid Event Webhook payloads (bounce, dropped, …) so an
  // asynchronous delivery failure can be traced back to the record that
  // triggered the send.
  customArgs?: Record<string, string>;
  suppressRecipientLogging?: boolean;
  orsaOutreach?: boolean;
  warmupReservationId?: string;
  disableProviderClickTracking?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function buildReferralConfirmationRequestEmail(params: {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  referralId: string;
}): EmailOptions {
  const url = `${getAppUrl()}/referral-confirmation/${encodeURIComponent(params.referralId)}`;
  const company = escapeHtml(params.companyName);
  return {
    to: params.recipientEmail,
    subject: "Please confirm your referral progress-sharing choice",
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">
      <h2>Confirm limited progress sharing</h2>
      <p>Hello ${escapeHtml(params.recipientName || "there")},</p>
      <p>Our concierge team recorded that <strong>${company}</strong> referred your family. Nothing has been shared with the company.</p>
      <p>If you confirm after signing in, we will share only broad care-coordination milestones and overall completion. We will not share certificate images or data, Social Security numbers, dates of birth, addresses, provider or account names, beneficiaries, documents, notes, messages, government, credit or insurance details, or financial or payment data.</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#32453A;color:white;text-decoration:none;border-radius:6px">Review and decide</a></p>
      <p><strong>This is not a death notice.</strong> This link does not grant access to the case. You must sign in as the family member who owns it.</p>
    </div>`,
    text: `Hello ${params.recipientName || "there"},\n\nOur team recorded that ${params.companyName} referred your family. Nothing has been shared. Sign in to review and decide: ${url}\n\nOnly broad milestones and overall completion would be shared. This is not a death notice.`,
    customArgs: { email_type: "referral_family_confirmation", referral_id: params.referralId },
  };
}

export function buildFuneralHomeCertificateUploadEmail(params: {
  recipientEmail: string; funeralHomeName: string; uploadUrl: string; expiresAt: Date; inviteId: string;
}): EmailOptions {
  const home = escapeHtml(params.funeralHomeName);
  const url = escapeHtml(params.uploadUrl);
  const expiry = params.expiresAt.toLocaleDateString("en-US", { dateStyle: "medium" });
  return {
    to: params.recipientEmail,
    subject: "Secure death certificate upload request",
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>Secure certificate upload</h2><p>${home}, please upload the requested death certificate using the secure link below.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#32453A;color:#fff;text-decoration:none;border-radius:6px">Upload certificate</a></p><p>This link expires ${expiry} and can be used once. Do not forward it.</p></div>`,
    text: `${params.funeralHomeName},\n\nPlease upload the requested death certificate using this secure, single-use link:\n${params.uploadUrl}\n\nThe link expires ${expiry} and can be used once. Do not forward it.`,
    customArgs: { email_type: "funeral_home_certificate_upload", invite_id: params.inviteId },
  };
}

export function buildReferralProgressEmail(params: {
  notificationEmail: string;
  companyName: string;
  referralId: string;
  completedCount: number;
  totalCount: number;
  percent: number;
  completedMilestones: string[];
  latestMilestone?: string;
}): EmailOptions {
  const milestones = params.completedMilestones.length
    ? `<ul>${params.completedMilestones.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`
    : "<p>No broad milestones are complete yet.</p>";
  return {
    to: params.notificationEmail,
    subject: params.latestMilestone ? "Family-authorized case progress update" : "Family approved limited progress sharing",
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">
      <h2>Limited care-coordination progress</h2>
      <p>The family approved sharing limited progress with ${escapeHtml(params.companyName)}.</p>
      ${params.latestMilestone ? `<p>Latest milestone: <strong>${escapeHtml(params.latestMilestone)}</strong></p>` : ""}
      <p>Overall progress: <strong>${params.completedCount} of ${params.totalCount} milestones (${params.percent}%)</strong></p>
      ${milestones}
      <p>This update contains only broad milestones. For general coordination questions, contact the Steps After Life concierge team at support@stepsafterlife.com.</p>
      <p><strong>This is not a death notice.</strong> This email does not provide access to the family’s case.</p>
    </div>`,
    customArgs: { email_type: "referral_partner_progress", referral_id: params.referralId, milestone: params.latestMilestone || "initial" },
  };
}

export function buildCompanyDeathNoticeEmail(params: {
  companyName: string;
  notificationEmail: string;
  secureRecordId: string;
  portalUrl: string;
}) {
  const company = escapeHtml(params.companyName);
  const id = escapeHtml(params.secureRecordId);
  const portal = escapeHtml(params.portalUrl);
  return {
    to: params.notificationEmail,
    subject: "Secure death notification available",
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">
      <h2>Secure death notification</h2>
      <p>${company}, Steps After Life has verified a death associated with an account managed by your company.</p>
      <p>Secure record ID: <strong>${id}</strong></p>
      <p><a href="${portal}" style="display:inline-block;padding:12px 20px;background:#32453A;color:white;text-decoration:none;border-radius:6px">Open secure provider portal</a></p>
      <p>After reviewing the notice, your approved company representative can request a death certificate and signed limited power of attorney package through the portal. Steps After Life reviews each request before releasing any documents.</p>
      <p>This email contains no certificate, signed authorization, account, Social Security, date-of-birth, or account-number information. Sign in to your approved company account to review the limited notice.</p>
    </div>`,
    text: `${params.companyName}, Steps After Life has verified a death associated with an account managed by your company.\n\nSecure record ID: ${params.secureRecordId}\nOpen the secure provider portal: ${params.portalUrl}\n\nYour approved company representative can request a death certificate and signed limited power of attorney package through the portal. Steps After Life reviews each request before releasing any documents. No documents are attached to this email.`,
    customArgs: { email_type: "company_death_notice", secure_record_id: params.secureRecordId },
  };
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { to, cc, subject, html, text, attachments, customArgs, fromEmail, fromName, replyTo } = options;

  if (SENDGRID_API_KEY) {
    try {
      const outreach = options.orsaOutreach || customArgs?.sal_email_type === "orsa_email_campaign";
      if (outreach) {
        if (process.env.NODE_ENV !== "production" || process.env.REPLIT_DEPLOYMENT !== "1")
          throw new Error("ORSA delivery requires published production.");
        await authorizeWarmupReservation(options.warmupReservationId);
      } else {
        // Essential emails are measured, not blocked by outreach limits.
        try { await recordOtherEmailTraffic(undefined, [options.to, options.cc]
          .flatMap(value => value ? value.split(",").filter(part => part.trim()) : []).length); }
        catch {
          console.error("[Email] Could not meter non-ORSA traffic; pause outreach and review the provider dashboard.");
          try { await pauseWarmup("Other email traffic could not be measured. Review provider activity before resuming."); } catch { /* Outreach reservation fails closed if storage is unavailable. */ }
        }
      }
      await sgMail.send({
        to,
        ...(cc ? { cc } : {}),
        from: { email: fromEmail || FROM_EMAIL, name: fromName || FROM_NAME },
        ...(replyTo ? { replyTo } : {}),
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ""),
        ...(attachments ? { attachments: attachments as any } : {}),
        ...(customArgs ? { customArgs } : {}),
        ...(options.disableProviderClickTracking ? { trackingSettings: { clickTracking: { enable: false, enableText: false } } } : {}),
      });
      if (options.warmupReservationId) await finishWarmupReservation(options.warmupReservationId, true);
      if (options.suppressRecipientLogging) console.log("[Email] ORSA invitation sent");
      else console.log("[Email] Message sent");
      return true;
    } catch (error: any) {
      if (options.orsaOutreach || customArgs?.sal_email_type === "orsa_email_campaign") {
        try {
          if (options.warmupReservationId) await finishWarmupReservation(options.warmupReservationId, false);
          await pauseWarmup("An ORSA sending attempt failed. Review the provider result before resuming.");
        } catch { /* Route also stops; do not retry an uncertain submission. */ }
      }
      if (options.suppressRecipientLogging) console.error("[Email] ORSA invitation delivery failed");
      else console.error("[Email] Message delivery failed");
      if (options.throwOnFailure) throw error;
      return false;
    }
  }

  console.warn("[Email] Delivery is not configured; message was not sent");
  return false;
}

export function buildOrsaRosterInvitationEmail(params: {
  recipientEmail: string;
  recipientName?: string | null;
}): EmailOptions {
  const registerUrl = `${getAppUrl()}/heartplan-register?orsa_offer=1`;
  const privacyUrl = `${getAppUrl()}${HEARTPLAN_PRIVACY.path}`;
  const termsUrl = `${getAppUrl()}${HEARTPLAN_TERMS.path}`;
  const unsubscribeUrl = "mailto:hello@stepsafterlife.com?subject=Unsubscribe%20from%20orsa%20member%20emails";
  const built = process.env.NODE_ENV === "production";
  const assetDirectory = built ? "dist/attachments" : "previews";
  const template = readFileSync(path.resolve(assetDirectory, built ? "orsa-heartplan-email.html" : "orsa-heartplan-email-preview.html"), "utf8");
  const logo = readFileSync(path.resolve(assetDirectory, built ? "orsa-logo.png" : "orsa-approved-logo.png"));
  if (logo.length < 8 || !logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("The approved orsa email logo is not a PNG");
  }
  const firstName = params.recipientName?.trim().split(/\s+/)[0] || "";
  const replaceRequired = (html: string, original: string, replacement: string) => {
    if (!html.includes(original)) throw new Error(`The orsa email template is missing: ${original.slice(0, 40)}`);
    return html.replace(original, replacement);
  };
  let html = template.replace(/<section class="inbox"[\s\S]*?<\/section>\s*/, "");
  if (html === template) throw new Error("The orsa email template could not remove its preview-only inbox");
  html = replaceRequired(html, 'src="orsa-approved-logo.png"', 'src="cid:orsa-logo"');
  html = replaceRequired(html, 'href="#" aria-label="Activate my complimentary Heart Plan"',
    `href="${escapeHtml(registerUrl)}" aria-label="Activate my complimentary Heart Plan"`);
  html = replaceRequired(html, "Hello <strong>[First Name]</strong>,",
    firstName ? `Hello <strong>${escapeHtml(firstName)}</strong>,` : "Hello,");
  html = replaceRequired(html,
    "This invitation does not automatically enroll you. To create an account, accept the Terms and Conditions and acknowledge the Privacy Policy. Communications consent is optional. Verify your email address to activate member benefits. Your invitation and account are intended only for you.",
    "This invitation does not automatically enroll you. To create your account, accept the Terms and Conditions and acknowledge the Privacy Policy. Communications consent is optional. Verify this email address to activate your member benefits. Your invitation and account are intended only for you.");
  html = replaceRequired(html, '<a href="#">Privacy Policy</a>',
    `<a href="${escapeHtml(privacyUrl)}">Privacy Policy</a>`);
  html = replaceRequired(html, '<a href="#">Terms and Conditions</a>',
    `<a href="${escapeHtml(termsUrl)}">Terms and Conditions</a>`);
  html = replaceRequired(html, '<a href="#">Unsubscribe</a>',
    `<a href="${unsubscribeUrl}">Unsubscribe</a>`);
  if (html.includes('href="#"')) throw new Error("The orsa email contains a preview-only link");
  return {
    to: params.recipientEmail,
    orsaOutreach: true,
    disableProviderClickTracking: true,
    fromName: "orsa Credit Union member benefits, powered by Steps After Life",
    subject: "orsa Credit Union has provided you with a complimentary Heart Plan",
    html,
    text: `Hello${firstName ? ` ${firstName}` : ""},\n\norsa Credit Union has provided you with complimentary access to a Heart Plan from Steps After Life.\n\nYour Heart Plan gives you a private, secure place to record important wishes and information for the people you care about. It can help your loved ones understand what matters to you and what steps to take when they need it most.\n\nYour complimentary Heart Plan includes:\n- A secure place to record your wishes and important information\n- The ability to name trusted family members or contacts\n- Guided planning you can complete at your own pace\n- Support designed to help your loved ones when the time comes\n\nYour complimentary ORSA Heart Plan Legacy access ends December 1, 2026 at 11:59 p.m. Eastern Time. Until then, eligible ORSA members receive Legacy access at no charge. Secure lifetime HeartPlan Legacy access for $50 with a one-time purchase through December 1. After the deadline, lifetime Legacy costs $149 as a one-time payment. There is no subscription or automatic renewal. This benefit does not change ORSA membership, case coverage, or seat billing.\n\nActivate My Complimentary Heart Plan: ${registerUrl}\n\nIf you already have a Steps After Life account, sign in to that account rather than creating another. If a previously purchased 12-month extension expires, your Free plan remains available and your data is not deleted.\n\nThis invitation does not automatically enroll you. To create your account, accept the Terms and Conditions and acknowledge the Privacy Policy. Communications consent is optional. Verify this email address to activate your member benefits. Your invitation and account are intended only for you.\n\nQuestions? Contact Steps After Life at hello@stepsafterlife.com or 888-557-2083.\nSteps After Life · 21002 Mack Ave, Grosse Pointe Woods, MI 48236\nPrivacy Policy: ${privacyUrl}\nTerms and Conditions: ${termsUrl}\nUnsubscribe from member emails: ${unsubscribeUrl}`,
    attachments: [{
      content: logo.toString("base64"),
      filename: "orsa-credit-union.png",
      type: "image/png",
      disposition: "inline",
      content_id: "orsa-logo",
    }],
    customArgs: { email_type: "orsa_roster_invitation" },
    suppressRecipientLogging: true,
  };
}

export function buildVerificationCodeEmail(params: {
  recipientEmail: string;
  code: string;
  purpose: "login_2fa" | "phone_verification" | "registration" | "password_reset";
}): EmailOptions {
  const { recipientEmail, code, purpose } = params;

  const purposeText = purpose === "login_2fa"
    ? "Sign-In Verification"
    : purpose === "registration"
    ? "Account Registration"
    : purpose === "password_reset"
    ? "Password Reset"
    : "Account Verification";

  const purposeDescription = purpose === "login_2fa"
    ? "Complete your sign-in to Steps After Life"
    : purpose === "registration"
    ? "Complete your account registration"
    : purpose === "password_reset"
    ? "Use this code to reset your Steps After Life password. If you didn't request this, you can safely ignore this email"
    : "Verify your identity";

  const subject = `${code} — Steps After Life ${purposeText} Code`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">${purposeText}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                ${purposeDescription}. Enter the verification code below:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f7f4; border-radius: 8px; margin: 24px 0; border: 1px solid #D6CDB3;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="color: #956834; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Verification Code</p>
                    <p style="color: #32453A; font-size: 36px; font-weight: bold; font-family: monospace; letter-spacing: 8px; margin: 0;">${code}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 0 0 8px;">
                This code expires in <strong>10 minutes</strong>.
              </p>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 0;">
                If you did not request this code, please ignore this email or contact support@stepsafterlife.com.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is an automated message from Steps After Life.<br>
                Do not share this code with anyone.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to: recipientEmail,
    subject,
    html,
  };
}

export function buildNextOfKinNotificationEmail(params: {
  nextOfKinName: string;
  deceasedName: string;
  blockchainId: string;
  submitterName: string;
  submitterOrganization: string;
}): EmailOptions {
  const { nextOfKinName, deceasedName, blockchainId, submitterName, submitterOrganization } = params;
  const appUrl = getAppUrl();

  const subject = `Steps After Life — A case has been opened on behalf of ${deceasedName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Care Plan</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Dear ${nextOfKinName},</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                We are writing to inform you that a blockchain-verified death certificate record has been created for <strong>${deceasedName}</strong>.
              </p>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                This record was submitted by <strong>${submitterName}</strong> at <strong>${submitterOrganization}</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f7f4; border-radius: 8px; margin: 24px 0; border: 1px solid #D6CDB3;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="color: #956834; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Blockchain Certificate ID</p>
                    <p style="color: #32453A; font-size: 18px; font-weight: bold; font-family: monospace; margin: 0;">${blockchainId}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                The Steps After Life concierge team will be managing the following on your behalf:
              </p>
              <ul style="color: #444; line-height: 2; font-size: 14px; padding-left: 20px; margin: 0 0 24px;">
                <li>Notifying connected service providers and financial institutions</li>
                <li>Managing account closures, suspensions, and transfers</li>
                <li>Coordinating government notifications (SSA, VA, Medicare)</li>
                <li>Credit protection with major bureaus</li>
                <li>Estate and benefits coordination</li>
              </ul>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                To view real-time updates on your case, please create your Steps After Life family account:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Create Your Family Account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 24px 0 0; text-align: center;">
                Once registered, you will have full visibility into every action being taken, 
                and you can communicate directly with the SAL concierge team.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is an automated notification from Steps After Life.<br>
                If you did not expect this message, please contact us at support@stepsafterlife.com.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to: "",
    subject,
    html,
  };
}

export function buildFamilyInvitationEmail(params: {
  recipientName: string;
  deceasedName: string;
  inviteToken: string;
  registrationReference: string;
  senderName?: string;
  senderDisplayName?: string;
  sharedAccess?: boolean;
  deceasedRelationshipToRecipient?: string | null;
}): EmailOptions {
  const recipientName = escapeHtml(params.recipientName || "Family Member");
  const deceasedName = escapeHtml(params.deceasedName);
  const senderName = escapeHtml(params.senderDisplayName || params.senderName || "A family member");
  const sharedAccess = params.sharedAccess === true;
  const allowedRelationships = new Set([
    "father", "mother", "parent", "spouse", "partner", "sibling", "brother", "sister",
    "son", "daughter", "child", "grandfather", "grandmother", "grandparent", "relative",
    "friend", "loved one",
  ]);
  const relationshipCandidate = String(params.deceasedRelationshipToRecipient || "").trim().toLowerCase();
  const relationship = allowedRelationships.has(relationshipCandidate) ? relationshipCandidate : "loved one";
  const appUrl = getAppUrl();
  const registerUrl = `${appUrl}/family-register?token=${encodeURIComponent(params.inviteToken)}`;
  const subject = `A private invitation from Steps After Life`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Family Account Invitation</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Dear ${recipientName},</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                I’m sorry for the loss of your ${escapeHtml(relationship)} (<strong>${deceasedName}</strong>). Please accept our heartfelt condolences. There is no easy way through a loss like this, and we hope you are giving yourself the space to grieve and lean on the people who love you.
              </p>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                ${sharedAccess ? `${senderName} has invited you to help with this family case. Accept the invitation, verify your identity, and review the sharing permission to get started. Private documents remain restricted until these checks are complete.` : "A case has been started with Steps After Life to help organize the practical tasks that may follow a loss. Some initial information may already be available, and our team will guide you through anything else that is needed."}
              </p>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                Whenever you feel ready, you can securely review what has been started and provide any additional information available to your account.
              </p>
              <p style="color: #32453A; font-size: 14px; margin: 0 0 20px;">
                <strong>Account registration reference:</strong> ${escapeHtml(params.registrationReference)}<br>
                <span style="color: #666; font-size: 12px;">This helps our team find your case. It does not verify a death or grant access.</span>
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${registerUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Review the Family Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                There is no rush. Our team is here to help with as much of the process as we can so your family can focus on one another. We can also recommend services or resources and help coordinate with the funeral home when needed.
              </p>
              <p style="color: #444; line-height: 1.7; font-size: 15px; margin: 0 0 20px;">
                Please reach out to either of us directly anytime:<br>
                <strong>George:</strong> <a href="mailto:George@stepsafterlife.com" style="color:#32453A;">George@stepsafterlife.com</a><br>
                <strong>Diana:</strong> <a href="mailto:Diana@stepsafterlife.com" style="color:#32453A;">Diana@stepsafterlife.com</a><br>
                <strong>Phone:</strong> <a href="tel:+18885572083" style="color:#32453A;">888-557-2083</a>
              </p>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                With heartfelt sympathy,<br><br>
                <strong>${senderName}</strong><br>
                Steps After Life
              </p>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 0;">
                This invitation link expires in 7 days. If you did not expect this email, please contact us at support@stepsafterlife.com.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is an automated invitation from Steps After Life.<br>
                Your privacy is our priority — all data is encrypted and secured.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textRelationship = relationship;
  return {
    to: "",
    subject,
    html,
    text: `Dear ${params.recipientName || "Family Member"},

 I’m sorry for the loss of your ${textRelationship} (${params.deceasedName}). Please accept our heartfelt condolences. There is no easy way through a loss like this, and we hope you are giving yourself the space to grieve and lean on the people who love you.

 ${sharedAccess ? `${params.senderDisplayName || params.senderName || "A family member"} has invited you to help with this family case. Accept the invitation, verify your identity, and review the sharing permission to get started. Private documents remain restricted until these checks are complete.` : "A case has been started with Steps After Life to help organize the practical tasks that may follow a loss. Some initial information may already be available, and our team will guide you through anything else that is needed."}

Whenever you feel ready, you can securely review what has been started and provide any additional information available to your account:
${registerUrl}

Account registration reference: ${params.registrationReference}
This helps our team find your case. It does not verify a death or grant access.

There is no rush. Our team is here to help with as much of the process as we can so your family can focus on one another. We can also recommend services or resources and help coordinate with the funeral home when needed.

Please reach out to either of us directly anytime:
George: George@stepsafterlife.com
Diana: Diana@stepsafterlife.com
Phone: 888-557-2083

With heartfelt sympathy,

 ${params.senderDisplayName || params.senderName || "A family member"}
Steps After Life

This invitation link expires in 7 days.`,
    customArgs: { email_type: "family_invitation" },
  };
}

export function buildLpoaSignatureRequestEmail(params: {
  recipientEmail: string;
  recipientName: string;
  deceasedName: string;
  replacementRequired: boolean;
  reason: string;
}): EmailOptions {
  const { recipientEmail, recipientName, deceasedName, replacementRequired, reason } = params;
  const appUrl = getAppUrl();
  const onboardingUrl = `${appUrl}/onboarding`;
  const escape = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const subject = replacementRequired
    ? `Action required — sign a corrected authorization for ${deceasedName}`
    : `Action required — complete your authorization for ${deceasedName}`;
  const action = replacementRequired ? "sign a corrected Limited Power of Attorney" : "complete your Limited Power of Attorney";

  return {
    to: recipientEmail,
    subject,
    text: `Hello ${recipientName}, the Steps After Life concierge team needs you to ${action}. Sign in at ${onboardingUrl}. Reason: ${reason}`,
    html: `
<!doctype html>
<html>
<body style="margin:0;padding:32px;background:#f4f4f4;font-family:Arial,sans-serif;color:#26352d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="padding:28px 36px;background:#32453A;color:#D6CDB3"><h1 style="margin:0;font-family:Georgia,serif;font-size:24px">Steps After Life</h1></td></tr>
        <tr><td style="padding:36px">
          <h2 style="margin:0 0 16px;font-size:20px">Authorization signature needed</h2>
          <p style="line-height:1.6">Hello ${escape(recipientName)},</p>
          <p style="line-height:1.6">The concierge team needs you to ${escape(action)} for <strong>${escape(deceasedName)}</strong>.</p>
          <p style="line-height:1.6;padding:12px;background:#f8f7f4;border-left:3px solid #956834"><strong>Why:</strong> ${escape(reason)}</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${onboardingUrl}" style="display:inline-block;padding:14px 28px;border-radius:7px;background:#32453A;color:#fff;text-decoration:none;font-weight:600">Review and sign securely</a>
          </p>
          <p style="font-size:13px;color:#66756d;line-height:1.5">For your protection, sign in to your existing account before reviewing the authorization. Do not forward this message.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    customArgs: {
      notification_type: "lpoa_signature_request",
    },
  };
}

export function buildActivationRequestConfirmEmail(params: {
  requesterName: string;
  plannerName: string;
  token: string;
}): EmailOptions {
  const { requesterName, plannerName, token } = params;
  const appUrl = getAppUrl();
  const confirmUrl = `${appUrl}/activation-confirm?token=${token}`;

  const subject = `Steps After Life — Please Confirm Your Report`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">HeartPlan Activation Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Dear ${requesterName},</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                We are so sorry for your loss. You recently reported the passing of
                <strong>${plannerName}</strong>, who named you as a trusted contact on their HeartPlan.
              </p>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                To protect ${plannerName}'s plan, please confirm your report by clicking the button below.
                Once confirmed, our concierge team will review the request and begin carrying out
                ${plannerName}'s wishes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${confirmUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Confirm My Report
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 0;">
                This confirmation link expires in 7 days. If you did not submit this report,
                you can safely ignore this email — no action will be taken without confirmation
                and concierge review. Questions? Contact us at support@stepsafterlife.com.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is an automated message from Steps After Life.<br>
                Your privacy is our priority — all data is encrypted and secured.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: "", subject, html };
}

export function buildTrustedContactInfoEmail(params: {
  contactName: string;
  plannerName: string;
}): EmailOptions {
  const { contactName, plannerName } = params;
  const appUrl = getAppUrl();
  const reportUrl = `${appUrl}/report-loss`;

  const subject = `Steps After Life — ${plannerName} Named You a Trusted Contact`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">You Are a Trusted Contact</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Dear ${contactName},</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                <strong>${plannerName}</strong> has <strong>started</strong> a HeartPlan and named you as a trusted contact —
                a private plan that records their wishes so loved ones are supported when the time comes.
              </p>
              <p style="color:#32453A;line-height:1.6;font-size:15px;background:#f1f4f2;padding:12px;border-radius:8px;margin:0 0 16px;">
                <strong>This is not a death notice.</strong> ${plannerName} is actively planning ahead.
              </p>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                There is nothing you need to do right now. If ${plannerName} ever passes away,
                you can report the loss using the button below. Our concierge team will then
                verify the report and begin carrying out ${plannerName}'s wishes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${reportUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      How to Report a Loss
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 0;">
                Please keep this email for future reference. No action is ever taken without
                email confirmation and a review by our concierge team.
                Questions? Contact us at support@stepsafterlife.com.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is an automated message from Steps After Life.<br>
                Your privacy is our priority — all data is encrypted and secured.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: "", subject, html };
}

export function buildHeartPlanAdvisorInvitationEmail(params: {
  advisorName: string;
  plannerName: string;
  planId: string;
  accessLevel: "full" | "limited";
  permission: "view" | "edit";
}): EmailOptions {
  const { advisorName, plannerName, planId, accessLevel, permission } = params;
  const advisorUrl = `${getAppUrl()}/heartplan/advisor/${encodeURIComponent(planId)}`;
  const scopeText = accessLevel === "full"
    ? "Full access to the Heart Plan information shared through the advisor portal"
    : "Limited access to a fixed Heart Plan summary";
  const permissionText = permission === "edit"
    ? "You may review and edit information within that access scope."
    : "You may view information within that access scope, but you cannot change it.";
  const subject = `Steps After Life — ${plannerName} Named You a Trusted Advisor`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; font-family:Arial,sans-serif; background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;background:#f4f4f4;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#32453A;padding:32px 40px;text-align:center;">
          <h1 style="color:#D6CDB3;margin:0;font-size:24px;font-family:Georgia,serif;">Steps After Life</h1>
          <p style="color:#E5E6E1;margin:8px 0 0;font-size:14px;">You Are a Trusted Advisor</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="color:#32453A;margin:0 0 16px;font-size:20px;">Dear ${advisorName},</h2>
          <p style="color:#444;line-height:1.6;font-size:15px;"><strong>${plannerName}</strong> has <strong>started</strong> a Heart Plan and named you as a trusted advisor.</p>
          <p style="color:#32453A;line-height:1.6;font-size:15px;background:#f1f4f2;padding:12px;border-radius:8px;"><strong>This is not a death notice.</strong> ${plannerName} is actively planning ahead.</p>
          <div style="background:#f8f7f4;border:1px solid #e8e5df;border-radius:8px;padding:18px;margin:20px 0;">
            <p style="margin:0 0 8px;color:#32453A;"><strong>Access:</strong> ${accessLevel === "full" ? "Full" : "Limited"}</p>
            <p style="margin:0 0 8px;color:#32453A;"><strong>Permission:</strong> ${permission === "edit" ? "Can edit" : "View only"}</p>
            <p style="margin:0;color:#555;line-height:1.5;">${scopeText}. ${permissionText}</p>
          </div>
          <p style="color:#444;line-height:1.6;font-size:15px;">Access is tied to this email address. Sign in or create your Steps After Life account with this same address.</p>
          <p style="text-align:center;margin:28px 0;"><a href="${advisorUrl}" style="display:inline-block;background:#32453A;color:#D6CDB3;text-decoration:none;padding:15px 34px;border-radius:8px;font-weight:600;">Open Advisor Access</a></p>
          <p style="color:#888;font-size:13px;line-height:1.6;">If you were not expecting this role, contact ${plannerName} or support@stepsafterlife.com. Do not forward this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { to: "", subject, html };
}

export function buildIncompleteHeartPlanIntakeReminderEmail(params: {
  plannerName: string;
  variant: 0 | 1 | 2;
}): EmailOptions {
  const benefits = [
    "Clear information can help your family avoid confusion and delays during probate and other estate administration. A HeartPlan does not replace legal documents or guarantee that probate can be avoided.",
    "A few thoughtful answers now can reduce the time and administrative burden your family may face later.",
    "Organizing key details can help reduce avoidable professional, administrative, or court costs. It is general planning support, not legal advice.",
  ] as const;
  const continueUrl = `${getAppUrl()}/heartplan`;
  const subject = "A gentle reminder to continue your HeartPlan";
  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;background:#f4f4f4;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#32453A;padding:30px 40px;text-align:center;"><h1 style="color:#D6CDB3;margin:0;font:24px Georgia,serif;">Steps After Life</h1></td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#32453A;margin:0 0 16px;font-size:20px;">Hello ${params.plannerName},</h2>
        <p style="color:#444;line-height:1.6;font-size:15px;">Your HeartPlan still has a few sections waiting for you. There is no need to complete everything at once.</p>
        <p style="color:#444;line-height:1.6;font-size:15px;">${benefits[params.variant]}</p>
        <p style="text-align:center;margin:28px 0;"><a href="${continueUrl}" style="display:inline-block;background:#32453A;color:#D6CDB3;text-decoration:none;padding:15px 34px;border-radius:8px;font-weight:600;">Continue My HeartPlan</a></p>
        <p style="color:#777;font-size:13px;line-height:1.5;">Reminders stop once all six plan sections are filled out. You can return at any time to update your information.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { to: "", subject, html };
}

export function buildTeamVerificationEmail(params: {
  email: string;
  code: string;
}): EmailOptions {
  const { email, code } = params;

  const subject = "Steps After Life — Team Account Verification Code";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Team Account Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Verify Your Email</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                A team account is being created for <strong>${email}</strong>. Use the verification code below to continue:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f7f4; border-radius: 8px; margin: 24px 0; border: 1px solid #D6CDB3;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="color: #956834; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Verification Code</p>
                    <p style="color: #32453A; font-size: 36px; font-weight: bold; font-family: monospace; letter-spacing: 8px; margin: 0;">${code}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #888; line-height: 1.6; font-size: 13px; margin: 16px 0 0;">
                This code expires in 10 minutes. If you did not request this, please ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                Steps After Life — Internal Team Portal
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to: email,
    subject,
    html,
  };
}

export function buildCertificateIdEmail(params: {
  recipientName: string;
  deceasedName: string;
  blockchainId: string;
  email: string;
}): EmailOptions {
  const { recipientName, deceasedName, blockchainId, email } = params;
  const appUrl = getAppUrl();

  const subject = `Steps After Life — Your Secure Certificate ID for ${deceasedName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Secure Certificate Delivery</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Welcome, ${recipientName}</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                Your email has been verified and your family account is now active. As promised, here is the blockchain-verified Certificate ID for the case of <strong>${deceasedName}</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f7f4; border-radius: 8px; margin: 24px 0; border: 1px solid #D6CDB3;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="color: #956834; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Blockchain Certificate ID</p>
                    <p style="color: #32453A; font-size: 18px; font-weight: bold; font-family: monospace; margin: 0;">${blockchainId}</p>
                    <p style="color: #577178; font-size: 12px; margin: 8px 0 0;">Case: ${deceasedName}</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff8f0; border-radius: 8px; margin: 0 0 24px; border: 1px solid #e8d5b8;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="color: #956834; font-size: 13px; font-weight: 600; margin: 0 0 4px;">Important Security Notice</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0;">Keep this Certificate ID safe. You will need it to access your case on the Steps After Life platform. Do not share it with anyone you do not trust.</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/login" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Sign In to Your Account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is a secure, automated message from Steps After Life.<br>
                Your privacy is our priority — all data is encrypted and secured.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to: email,
    subject,
    html,
  };
}

// Planner-facing alert: the trusted-contact info email keeps bouncing/failing,
// so the address appears undeliverable and should be corrected in the plan.
export function buildTrustedContactEmailUndeliverableEmail(params: {
  plannerEmail: string;
  plannerName: string;
  contactName: string;
  contactEmail: string;
}): EmailOptions {
  const { plannerEmail } = params;
  // Contact details are planner-entered — escape before interpolating into HTML.
  const plannerName = escapeHtml(params.plannerName);
  const contactName = escapeHtml(params.contactName);
  const contactEmail = escapeHtml(params.contactEmail);
  const appUrl = getAppUrl();
  const contactsUrl = `${appUrl}/heartplan`;

  const subject = `Action Needed — We Couldn't Reach Your Trusted Contact ${params.contactName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Trusted Contact Email Issue</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">Dear ${plannerName},</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                We've tried several times to send your trusted contact <strong>${contactName}</strong>
                their "how to report a loss" instructions, but every attempt has failed.
                Their email address appears to be undeliverable.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff8f0; border-radius: 8px; margin: 0 0 24px; border: 1px solid #e8d5b8;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="color: #956834; font-size: 13px; font-weight: 600; margin: 0 0 4px;">Address on file</p>
                    <p style="color: #666; font-size: 14px; font-family: monospace; margin: 0;">${contactEmail}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                Please check the address for typos and update it in your HeartPlan.
                Once corrected, we'll automatically send ${contactName} their instructions.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${contactsUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Update Trusted Contact
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                This is an automated message from Steps After Life.<br>
                Questions? Contact us at support@stepsafterlife.com.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: plannerEmail, subject, html };
}

// Concierge-facing alert: mirrors the planner alert so the team knows a
// trusted contact is unreachable even if the planner ignores their email.
export function buildTrustedContactEmailFailedAdminAlertEmail(params: {
  adminEmail: string;
  plannerName: string;
  contactName: string;
  contactEmail: string;
  planId: string;
}): EmailOptions {
  const { adminEmail, planId } = params;
  // Planner-entered values — escape before interpolating into HTML sent to
  // privileged (admin) recipients.
  const plannerName = escapeHtml(params.plannerName);
  const contactName = escapeHtml(params.contactName);
  const contactEmail = escapeHtml(params.contactEmail);
  const appUrl = getAppUrl();
  const reviewUrl = `${appUrl}/admin/heartplan/${encodeURIComponent(planId)}`;

  const subject = `Undeliverable Trusted Contact Email — ${params.contactName} (planner: ${params.plannerName})`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Undeliverable Trusted Contact Email</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">A trusted contact appears unreachable</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                The "how to report a loss" info email for a trusted contact has failed repeatedly,
                so automatic retries have been stopped. The planner has been asked to correct the
                address, but the contact currently has no way to report a loss.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f7f4; border-radius: 8px; margin: 24px 0; border: 1px solid #D6CDB3;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="color: #956834; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Details</p>
                    <p style="color: #32453A; font-size: 15px; margin: 0 0 6px;"><strong>Planner:</strong> ${plannerName}</p>
                    <p style="color: #32453A; font-size: 15px; margin: 0 0 6px;"><strong>Trusted contact:</strong> ${contactName}</p>
                    <p style="color: #32453A; font-size: 15px; margin: 0;"><strong>Failing address:</strong> <span style="font-family: monospace;">${contactEmail}</span></p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${reviewUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Plan
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                Steps After Life — Internal Concierge Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: adminEmail, subject, html };
}

export function buildActivationConfirmedAdminAlertEmail(params: {
  adminEmail: string;
  plannerName: string;
  requesterName: string;
  relationship?: string | null;
  planId: string;
}): EmailOptions {
  const { adminEmail, planId } = params;
  // These values originate from the public report form — escape them before
  // interpolating into HTML sent to privileged (admin) recipients.
  const plannerName = escapeHtml(params.plannerName);
  const requesterName = escapeHtml(params.requesterName);
  const relationship = params.relationship ? escapeHtml(params.relationship) : null;
  const appUrl = getAppUrl();
  const reviewUrl = `${appUrl}/admin/heartplan/${encodeURIComponent(planId)}`;

  const subject = `Action Needed — Death Report Confirmed for ${params.plannerName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #32453A; padding: 32px 40px; text-align: center;">
              <h1 style="color: #D6CDB3; margin: 0; font-size: 24px; font-family: 'Playfair Display', Georgia, serif;">Steps After Life</h1>
              <p style="color: #E5E6E1; margin: 8px 0 0; font-size: 14px;">Concierge Review Needed</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #32453A; margin: 0 0 16px; font-size: 20px;">A death report has been confirmed</h2>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 16px;">
                A trusted contact has confirmed their report of the passing of a HeartPlan planner.
                This request is now awaiting concierge review.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f7f4; border-radius: 8px; margin: 24px 0; border: 1px solid #D6CDB3;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="color: #956834; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Request Details</p>
                    <p style="color: #32453A; font-size: 15px; margin: 0 0 6px;"><strong>Planner:</strong> ${plannerName}</p>
                    <p style="color: #32453A; font-size: 15px; margin: 0 0 6px;"><strong>Reported by:</strong> ${requesterName}${relationship ? ` (${relationship})` : ""}</p>
                    <p style="color: #32453A; font-size: 15px; margin: 0;"><strong>Status:</strong> Awaiting concierge review</p>
                  </td>
                </tr>
              </table>
              <p style="color: #444; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
                Please review the request and approve or dismiss it from the plan detail page.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${reviewUrl}" style="display: inline-block; background-color: #32453A; color: #D6CDB3; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Review Activation Request
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f7f4; padding: 24px 40px; border-top: 1px solid #e8e5df;">
              <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                Steps After Life — Internal Concierge Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: adminEmail, subject, html };
}
