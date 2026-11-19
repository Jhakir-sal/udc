import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatOcrDate(value: unknown): string {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return raw;
}

export function formatPhone(value: string): string {
  const digits = phoneDigits(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function handlePhoneChange(setter: (v: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(formatPhone(e.target.value));
  };
}

export function phoneDigits(value?: string | null): string {
  const d = String(value || "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

function isNearMatchDigits(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 10 || a === b) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 2) break;
  }
  if (diff === 1) return true;
  if (diff === 2) {
    for (let i = 0; i < a.length - 1; i++) {
      if (
        a[i] !== b[i] &&
        a[i] === b[i + 1] &&
        a[i + 1] === b[i] &&
        a.slice(0, i) === b.slice(0, i) &&
        a.slice(i + 2) === b.slice(i + 2)
      ) {
        return true;
      }
    }
  }
  return false;
}

export interface PhoneContact {
  label: string;
  name?: string | null;
  phone?: string | null;
}

export function getPhoneMismatchWarnings(contacts: PhoneContact[]): string[] {
  const list = contacts
    .map((c) => ({ ...c, digits: phoneDigits(c.phone) }))
    .filter((c) => c.digits.length >= 10);
  const warnings: string[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.digits === b.digits) continue;
      const sameName =
        a.name && b.name && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
      if (sameName) {
        warnings.push(
          `${a.name} is listed as both ${a.label} (${formatPhone(a.digits)}) and ${b.label} (${formatPhone(b.digits)}) with different phone numbers — one may be a typo. Verify the correct number before sending texts.`
        );
      } else if (isNearMatchDigits(a.digits, b.digits)) {
        warnings.push(
          `The ${a.label} number (${formatPhone(a.digits)}) and the ${b.label} number (${formatPhone(b.digits)}) are nearly identical — possible typo. Verify both numbers before sending texts.`
        );
      }
    }
  }
  return warnings;
}

export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatSsnInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
