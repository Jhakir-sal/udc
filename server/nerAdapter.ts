export type NerRegistrationInput = { enrollmentId: string; userId: string };

export function getNerApiUrl(): string | null {
  const configured = process.env.NER_API_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) ||
        (process.env.NODE_ENV === "production" && url.protocol !== "https:") ||
        url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** External contract is intentionally isolated until NER provides its schema. */
export async function registerWithNer(input: NerRegistrationInput): Promise<{ reference: string }> {
  const baseUrl = process.env.NER_API_URL?.trim();
  const path = process.env.NER_REGISTRATION_PATH;
  if (!baseUrl || !getNerApiUrl() || !path) throw new Error("NER integration is not configured; retry after NER_API_URL and NER_REGISTRATION_PATH are set");
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST", headers: {
      "content-type": "application/json",
      "idempotency-key": `ner-registration:${input.enrollmentId}`,
    },
    body: JSON.stringify({ enrollmentId: input.enrollmentId, userId: input.userId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`NER registration failed (${response.status})`);
  const data = await response.json() as { reference?: unknown };
  if (typeof data.reference !== "string" || !data.reference.trim()) throw new Error("NER registration response did not include a reference");
  return { reference: data.reference.trim() };
}