import OpenAI, { type ClientOptions } from "openai";

export function createOpenAIClient(options: Pick<ClientOptions, "timeout" | "maxRetries"> = {}): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  return new OpenAI({
    ...options,
    apiKey,
    baseURL: "https://api.openai.com/v1",
  });
}
