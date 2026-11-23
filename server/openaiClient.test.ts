import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIClient } from "./openaiClient";
import { speechToText } from "./integrations/audio/client";

test("uses the direct OpenAI endpoint and preserves per-client options", () => {
  const saved = {
    key: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    legacyKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    legacyBaseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  };
  try {
    process.env.OPENAI_API_KEY = "test-direct-key";
    process.env.OPENAI_BASE_URL = "https://example.invalid/v1";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-legacy-key";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://example.invalid/legacy";
    const client = createOpenAIClient({ timeout: 30_000, maxRetries: 0 });
    assert.equal(client.apiKey, "test-direct-key");
    assert.equal(client.baseURL, "https://api.openai.com/v1");
    assert.equal(client.timeout, 30_000);
    assert.equal(client.maxRetries, 0);
  } finally {
    restoreEnv("OPENAI_API_KEY", saved.key);
    restoreEnv("OPENAI_BASE_URL", saved.baseUrl);
    restoreEnv("AI_INTEGRATIONS_OPENAI_API_KEY", saved.legacyKey);
    restoreEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", saved.legacyBaseUrl);
  }
});

test("audio initialization works without a key and transcription fails explicitly when used", async () => {
  const previous = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    assert.throws(() => createOpenAIClient(), /OPENAI_API_KEY is not configured/);
    process.env.OPENAI_API_KEY = " ";
    await assert.rejects(speechToText(Buffer.from("synthetic")), /OPENAI_API_KEY is not configured/);
  } finally {
    restoreEnv("OPENAI_API_KEY", previous);
  }
});

test("transcription uses the direct endpoint and returns the provider response", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = "test-direct-key";
    let requestUrl = "";
    let requestBody: FormData | undefined;
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      if (init?.body instanceof FormData) requestBody = init.body;
      return new Response(JSON.stringify({ text: "Synthetic transcript" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    assert.equal(await speechToText(Buffer.from("synthetic")), "Synthetic transcript");
    assert.equal(requestUrl, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(requestBody?.get("model"), "gpt-4o-mini-transcribe");
    assert.ok(requestBody?.get("file") instanceof Blob);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("OPENAI_API_KEY", previousKey);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
