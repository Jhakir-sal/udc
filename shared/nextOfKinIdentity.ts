import { z } from "zod";

export const nextOfKinIdentityInput = z.object({
  contactToken: z.string().length(64),
  version: z.string().nullable(),
  ssn: z.string().nullable().transform(value => value?.replace(/[- ]/g, "") || null).refine(value =>
    value === null || (/^\d{9}$/.test(value) && !/^(000|666|9)/.test(value) && value.slice(3, 5) !== "00" && value.slice(5) !== "0000"),
  "Enter a valid nine-digit SSN, or leave it blank."),
  dob: z.string().nullable().transform(value => value || null).refine(value => {
    if (value === null) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10);
  }, "Enter a valid date of birth that is not in the future."),
}).strict();

export interface NextOfKinIdentityStatus {
  hasSsn: boolean;
  hasDob: boolean;
  contactToken: string;
  version: string | null;
}
