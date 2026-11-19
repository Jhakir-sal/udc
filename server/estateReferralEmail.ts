const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

export function buildEstateReferralRequestEmail(input: {
  to: string; recipientKind: "attorney" | "family"; reference: string;
}) {
  const subject = "Steps After Life — referral status request";
  const message = input.recipientKind === "attorney"
    ? "Your Steps After Life concierge is requesting a brief coordination update about a referral previously placed with your office. Please confirm whether contact has been made and the next coordination step or expected update date. This message does not establish an attorney-client relationship."
    : "Your Steps After Life concierge is checking in about your attorney referral. Please let us know whether you have connected with the attorney and when you expect the next update. If you need help reaching the office, please tell your concierge.";
  const text = `${message}\n\nCoordination reference: ${input.reference}\n\nReply to hello@stepsafterlife.com with a brief status update. Please do not send identity documents, account numbers, estate documents, legal advice, or other sensitive information by email. Ask your concierge for a secure way to share documents.\n\nSteps After Life\nhello@stepsafterlife.com\n888-557-2083`;
  return {
    to: input.to, subject, text,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#32453a">${text.split("\n\n").map(part => `<p>${escape(part).replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
    replyTo: "hello@stepsafterlife.com",
    disableProviderClickTracking: true,
    suppressRecipientLogging: true,
  };
}
