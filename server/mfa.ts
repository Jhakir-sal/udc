import crypto from "crypto";
import type { User } from "@shared/models/auth";
import { storage } from "./storage";
import { buildVerificationCodeEmail, sendEmail } from "./email";
import { sendAuthenticationSms } from "./authSms";
import { mfaCode } from "./verificationCodePurpose";

type ChallengeDependencies = {
  updateCode: (userId: string, code: string | null, expiry: Date | null) => Promise<void>;
  sendSms: (to: string, body: string, recipientRole: User["role"]) => Promise<boolean>;
  deliverEmail: typeof sendEmail;
};

export async function issueMfaChallenge(user: User, {
  updateCode = (id, code, expiry) => storage.updateUserPhoneVerification(id, code, expiry),
  sendSms = sendAuthenticationSms,
  deliverEmail = sendEmail,
}: Partial<ChallengeDependencies> = {}, channel: "auto" | "sms" | "email" = "auto"): Promise<"sms" | "email"> {
  if (channel === "sms" && (!user.phoneVerified || !user.phoneNumber)) {
    throw new Error("Verify a phone in Account Settings before requesting text codes");
  }
  if (channel === "email" && (!user.emailVerified || !user.email)) {
    throw new Error("No verified delivery address is available");
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  await updateCode(user.id, mfaCode(code), expiry);

  // Only a code delivered to a verified phone may be used as the SMS factor.
  if (channel !== "email" && user.phoneVerified && user.phoneNumber) {
    try {
      const sent = await sendSms(
        user.phoneNumber,
        `Steps After Life: Your sign-in code is ${code}. It expires in 10 minutes.`,
        user.role,
      );
      if (sent) return "sms";
    } catch (error) {
      console.error("[MFA] SMS submission failed");
    }
  }

  const email = user.email;
  if (!email || !user.emailVerified) throw new Error("No verified delivery address is available");
  const sent = await deliverEmail(buildVerificationCodeEmail({
    recipientEmail: email,
    code,
    purpose: "login_2fa",
  }));
  if (!sent) throw new Error("Verification code delivery failed");
  return "email";
}

export function mfaDeliveryDetails(user: User, sentVia: "sms" | "email") {
  const smsAvailable = !!(user.phoneVerified && user.phoneNumber);
  const emailAvailable = !!(user.emailVerified && user.email);
  return {
    destination: sentVia === "sms"
      ? `phone ending in ${user.phoneNumber?.replace(/\D/g, "").slice(-4)}`
      : user.email?.replace(/^([^@])[^@]*@/, "$1***@") || "",
    smsAvailable,
    emailAvailable,
    deliveryNote: sentVia === "email" && !smsAvailable
      ? "No verified phone is enrolled. Verify your phone in Account Settings to use text codes."
      : sentVia === "sms"
        ? "Text delivery can be delayed. If it does not arrive, request a code by email instead."
        : "This code was requested by email. Only the most recently requested code is valid.",
  };
}