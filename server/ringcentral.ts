import { SDK } from "@ringcentral/sdk";

let rcClient: SDK | null = null;
let rcPhoneNumber: string | null = null;
let rcInitialized = false;

export function getRingCentralServer(environment: string | undefined): string {
  if (!environment || environment === "production") return "https://platform.ringcentral.com";
  if (environment === "sandbox") return "https://platform.devtest.ringcentral.com";
  throw new Error("RINGCENTRAL_ENVIRONMENT must be production or sandbox");
}

export async function initRingCentral(): Promise<boolean> {
  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const jwtToken = process.env.RINGCENTRAL_JWT_TOKEN;
  const rawPhone = process.env.RINGCENTRAL_PHONE_NUMBER || null;

  if (!clientId || !clientSecret || !jwtToken || !rawPhone) {
    console.log("RingCentral credentials not fully configured. SMS will fall back to Twilio.");
    return false;
  }

  const cleanDigits = rawPhone.replace(/\D/g, "");
  rcPhoneNumber = rawPhone.startsWith("+") ? rawPhone : `+1${cleanDigits.length === 11 && cleanDigits.startsWith("1") ? cleanDigits.slice(1) : cleanDigits}`;
  if (cleanDigits.length < 10) {
    console.error("RingCentral phone number is invalid (too short).");
    return false;
  }

  try {
    rcClient = new SDK({
      server: getRingCentralServer(process.env.RINGCENTRAL_ENVIRONMENT),
      clientId,
      clientSecret,
    });

    const platform = rcClient.platform();
    await platform.login({ jwt: jwtToken });
    rcInitialized = true;
    console.log(`RingCentral SMS initialized (from: ${rcPhoneNumber})`);
    return true;
  } catch (error: any) {
    console.error("Failed to initialize RingCentral:", error.message);
    rcClient = null;
    rcInitialized = false;
    return false;
  }
}

async function ensureAuthenticated(): Promise<boolean> {
  if (!rcClient) return false;
  const platform = rcClient.platform();
  const loggedIn = await platform.loggedIn();
  if (!loggedIn) {
    const jwtToken = process.env.RINGCENTRAL_JWT_TOKEN;
    if (!jwtToken) return false;
    try {
      await platform.login({ jwt: jwtToken });
      return true;
    } catch (error: any) {
      console.error("RingCentral re-authentication failed:", error.message);
      return false;
    }
  }
  return true;
}

export async function sendSmsViaRingCentral(to: string, body: string): Promise<boolean> {
  return Boolean(await submitSmsViaRingCentral(to, body));
}

/** A provider receipt is a submission, not a handset delivery confirmation. */
export async function submitSmsViaRingCentral(to: string, body: string): Promise<{ id: string | null; status: string } | null> {
  if (!rcClient || !rcPhoneNumber || !rcInitialized) {
    return null;
  }

  try {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      console.error("[RingCentral] Not authenticated, cannot send SMS");
      return null;
    }

    const platform = rcClient.platform();
    const response = await platform.post("/restapi/v1.0/account/~/extension/~/sms", {
      from: { phoneNumber: rcPhoneNumber },
      to: [{ phoneNumber: to }],
      text: body,
    });

    const data = await response.json();
    if (data.messageStatus === "Queued" || data.messageStatus === "Sent" || data.messageStatus === "Delivered") {
      console.log(`[RingCentral] SMS sent to ${to} (status: ${data.messageStatus})`);
      return { id: data.id ? String(data.id) : null, status: data.messageStatus };
    } else {
      console.error(`[RingCentral] SMS to ${to} returned status: ${data.messageStatus}`);
      return null;
    }
  } catch (error: any) {
    console.error(`[RingCentral] SMS failed to ${to}:`, error.message);
    return null;
  }
}

export function isRingCentralConfigured(): boolean {
  return rcInitialized;
}

/** Read-only lookup. Never submits, retries or changes an SMS message. */
export async function getRingCentralSmsStatus(messageId: string): Promise<{
  id: string; status: string; modifiedAt: string | null; errorCode: string | null;
}> {
  if (!/^\d+$/.test(messageId)) throw new Error("Invalid RingCentral message identifier");
  if (!rcInitialized || !rcClient || !await ensureAuthenticated()) throw new Error("RingCentral is not authenticated");
  const response = await rcClient.platform().get(`/restapi/v1.0/account/~/extension/~/message-store/${messageId}`);
  const data = await response.json();
  if (data.direction !== "Outbound" || data.type !== "SMS" || String(data.id) !== messageId ||
    typeof data.messageStatus !== "string") throw new Error("Unexpected RingCentral SMS status response");
  return {
    id: String(data.id), status: data.messageStatus, modifiedAt: data.lastModifiedTime || null,
    errorCode: typeof data.deliveryErrorCode === "string" ? data.deliveryErrorCode : null,
  };
}

export interface RcInboundMessage {
  id: string;
  from: string;
  body: string;
  createdAt: string;
}

let lastPollTime: string | null = null;

export async function fetchInboundSms(): Promise<RcInboundMessage[]> {
  if (!rcClient || !rcPhoneNumber || !rcInitialized) {
    return [];
  }

  try {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      console.error("[RingCentral] Not authenticated, cannot poll inbound SMS");
      return [];
    }

    const platform = rcClient.platform();
    const now = new Date();
    const since = lastPollTime || new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const messages: RcInboundMessage[] = [];
    // Drain every page before advancing the cursor. A 6,000-member campaign
    // must not lose STOP replies because more than 50 arrived between polls.
    for (let page = 1; ; page++) {
      const response = await platform.get("/restapi/v1.0/account/~/extension/~/message-store", {
        messageType: "SMS", direction: "Inbound", dateFrom: since,
        dateTo: now.toISOString(), perPage: 50, page,
      });
      const data = await response.json();
      if (!Array.isArray(data.records)) throw new Error("Invalid inbound SMS page");
      for (const record of data.records) {
        if (record.direction === "Inbound" && record.type === "SMS") {
          const fromNumber = record.from?.phoneNumber || "";
          const body = record.subject || "";
          if (fromNumber && body) {
            messages.push({
              id: String(record.id),
              from: fromNumber,
              body,
              createdAt: record.creationTime || record.lastModifiedTime || now.toISOString(),
            });
          }
        }
      }
      if (data.records.length < 50) break;
    }
    lastPollTime = now.toISOString();

    if (messages.length > 0) {
      console.log(`[RingCentral] Polled ${messages.length} inbound SMS`);
    }
    return messages;
  } catch (error: any) {
    console.error("[RingCentral] Failed to poll inbound SMS:", error.message);
    return [];
  }
}
