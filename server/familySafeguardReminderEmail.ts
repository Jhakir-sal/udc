export type SafeguardReminderKind = "id" | "owner_approval";

const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[ch]!);

export function buildFamilySafeguardReminderEmail(input: {
  kind: SafeguardReminderKind;
  to: string;
  appUrl: string;
}) {
  const idNeeded = input.kind === "id";
  // This is a normal sign-in destination, never an authentication or access token.
  const url = `${input.appUrl.replace(/\/$/, "")}/${idNeeded ? "family-access" : ""}`;
  const subject = idNeeded ? "A quick reminder to complete your ID check" : "Please review your family sharing permissions";
  const message = idNeeded
    ? "Your Steps After Life concierge is reminding you to complete your identity verification. Sign in to your account and follow the ID verification steps. If a check is already in progress, review its status before starting another."
    : "Your Steps After Life concierge is reminding you that a family member is waiting for your sharing permission. Sign in and open Case member safeguards to review the person and sign only if you wish to share access. Complete your own setup checks first if prompted.";
  const safety = "Please do not reply with an ID photo or other private documents. Use the secure account steps only. This reminder does not approve anyone, grant case access, or establish power of attorney.";
  return {
    to: input.to, subject,
    text: `${message}\n\nSign in: ${url}\n\n${safety}\n\nSteps After Life`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#32453a"><h2>${escape(subject)}</h2><p>${escape(message)}</p><p><a href="${escape(url)}">Sign in securely</a></p><p>${escape(safety)}</p><p>Steps After Life</p></div>`,
    disableProviderClickTracking: true,
    suppressRecipientLogging: true,
  };
}
