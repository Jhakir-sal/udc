import { z } from "zod";

export const bulkSmsInput = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(10000),
  attestation: z.string().trim().min(40).max(3000),
  smsPermissionConfirmed: z.literal(true),
  timezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
  }, "Choose a valid time zone."),
  timezoneConfirmed: z.literal(true),
  intervalSeconds: z.number().int().min(2).max(300),
  dailyLimit: z.number().int().min(1).max(10000),
  scheduledAt: z.string().datetime(),
}).strict();

export function bulkSmsClock(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value || "";
  return { dayKey: `${part("year")}-${part("month")}-${part("day")}`, withinHours: Number(part("hour")) >= 9 && Number(part("hour")) < 19 };
}

export function bulkSmsExclusion(input: {
  active: boolean; name: string | null; phone: string | null; shared: boolean;
  stopped: boolean; attempted: boolean; signedUp: boolean;
}) {
  if (!input.active) return "Inactive member";
  if (!input.name?.trim()) return "Member name missing";
  if (!input.phone || !/^\+1[2-9]\d{9}$/.test(input.phone)) return "Usable North American phone required";
  if (input.shared) return "Phone shared by multiple active members";
  if (input.stopped) return "SMS opt-out — do not contact";
  if (input.attempted) return "Previously attempted — no automatic resend";
  if (input.signedUp) return "Account already activated";
  return null;
}
