/** A UI shortcut into review, never an instruction to save or contact a company. */
export function shouldReadPastedAccounts(value: string): boolean {
  const text = value.trim();
  if (text.length < 10) return false;
  const requestedArtifact = /^(?:please\s+)?(?:draft|write|summari[sz]e|explain|describe|compare|list|review|tell me|show me)\b/i;
  const createNonAccountArtifact = /^(?:please\s+)?(?:create|write|draft)\s+(?:an?\s+|the\s+)?(?:email|sms|message|summary|report|letter|checklist)\b/i;
  if (requestedArtifact.test(text) || createNonAccountArtifact.test(text)) return false;
  const explicitRequest = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|create|import|extract|categorize|scan|read)\b[\s\S]{0,120}\b(?:accounts?|bank(?:ing)? details)\b/i;
  if (explicitRequest.test(text)) return true;
  // Keep ordinary short questions in chat, even if they mention an account.
  if (!/[\r\n]/.test(text) && /^(?:what|why|how|when|where|which|who|is|are|does|do|did|can|could|would|should)\b/i.test(text)) return false;
  const accountFields = /\b(?:checking|chequing|savings|credit card|acct|routing)\b|\baccount\s*(?:number\b|no\.?\b|#|ending\b)/i;
  const digits = /\d(?:[\s-]*\d){3}/;
  if (accountFields.test(text) && digits.test(text)) return true;
  return /[\r\n]/.test(text) && text.length >= 40 &&
    /\b(?:bank account|account details|subscription|membership)\b/i.test(text);
}
