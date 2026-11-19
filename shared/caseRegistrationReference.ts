// A display-only case locator. It is reversible to the case UUID for staff
// lookup, but is never a signup credential or evidence that a death was verified.
const prefix = "SAL-REG-";
const referencePattern = /^SAL-REG-(?:[0-9A-Z]{5}-){4}[0-9A-Z]{5}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function caseRegistrationReference(caseId: string): string {
  if (!uuidPattern.test(caseId)) throw new Error("Invalid case ID");
  const digits = BigInt(`0x${caseId.replace(/-/g, "")}`).toString(36).toUpperCase().padStart(25, "0");
  return prefix + digits.match(/.{5}/g)!.join("-");
}

export function caseIdFromRegistrationReference(reference: string): string | null {
  const normalized = reference.trim().toUpperCase();
  if (!referencePattern.test(normalized)) return null;
  let value = BigInt(0);
  for (const digit of normalized.slice(prefix.length).replace(/-/g, "")) {
    value = value * BigInt(36) + BigInt(parseInt(digit, 36));
  }
  if (value >= (BigInt(1) << BigInt(128))) return null;
  const hex = value.toString(16).padStart(32, "0");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return caseRegistrationReference(id) === normalized ? id : null;
}