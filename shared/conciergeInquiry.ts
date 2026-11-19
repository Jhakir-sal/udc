import { z } from "zod";

export const conciergeInquirySchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: z.string().trim().min(7).max(30)
    .refine(value => /^[+\d().\s-]+$/.test(value) && value.replace(/\D/g, "").length >= 7
      && value.replace(/\D/g, "").length <= 15, "Enter a valid phone number."),
  careLocation: z.string().trim().max(200).default(""),
  bestTime: z.string().trim().max(120).default(""),
  contactPermission: z.literal(true),
  website: z.string().max(0).optional(),
}).strict();

export type ConciergeInquiryInput = z.infer<typeof conciergeInquirySchema>;
export const conciergeInquiryStatuses = ["new", "contacted", "closed"] as const;
export type ConciergeInquiryStatus = typeof conciergeInquiryStatuses[number];

export interface ConciergeInquiryRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  careLocation: string;
  bestTime: string;
  status: ConciergeInquiryStatus;
  notificationStatus: "pending" | "accepted" | "failed";
  createdAt: string;
  updatedAt: string;
}
