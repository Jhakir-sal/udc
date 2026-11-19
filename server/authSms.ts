import twilio from "twilio";
import type { User } from "@shared/models/auth";
import { isRingCentralConfigured, sendSmsViaRingCentral } from "./ringcentral";

type AuthSmsDependencies = {
  ringCentralConfigured: () => boolean;
  twilioConfigured: () => boolean;
  submitTwilio: (to: string, body: string) => Promise<{ status: string }>;
  sendRingCentral: (to: string, body: string) => Promise<boolean>;
};

const dependencies: AuthSmsDependencies = {
  ringCentralConfigured: isRingCentralConfigured,
  twilioConfigured: () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
  submitTwilio: async (to, body) => {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return client.messages.create({ to, body, from: process.env.TWILIO_PHONE_NUMBER });
  },
  sendRingCentral: sendSmsViaRingCentral,
};

/** Authentication traffic is separate from conversational and outreach texts.
 * Acceptance is not proof of handset delivery. Never retry an uncertain submission
 * through a second SMS provider; the verified-email recovery path remains available.
 */
export async function sendAuthenticationSms(
  to: string,
  body: string,
  recipientRole: User["role"] = "user",
  overrides: Partial<AuthSmsDependencies> = {},
): Promise<boolean> {
  const deps = { ...dependencies, ...overrides };
  // SAL staff use the owner's approved provider. A failed/uncertain submission
  // stays on the verified-email recovery path, never another SMS provider.
  if (recipientRole === "admin") {
    if (!deps.ringCentralConfigured()) return false;
    try {
      return await deps.sendRingCentral(to, body);
    } catch {
      console.error("[Auth SMS] RingCentral submission failed");
      return false;
    }
  }
  if (!deps.twilioConfigured()) return deps.sendRingCentral(to, body);
  try {
    const message = await deps.submitTwilio(to, body);
    const accepted = ["accepted", "queued", "sending", "sent", "delivered"].includes(message.status);
    console.info("[Auth SMS] Twilio submission", { status: message.status, accepted });
    return accepted;
  } catch (error: any) {
    const status = Number(error?.status);
    console.error("[Auth SMS] Twilio submission failed", {
      status: Number.isFinite(status) ? status : null,
      code: typeof error?.code === "number" ? error.code : null,
    });
    if (status >= 400 && status < 500 && status !== 408) {
      return deps.sendRingCentral(to, body);
    }
    return false;
  }
}
