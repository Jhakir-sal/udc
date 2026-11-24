import test from "node:test";
import assert from "node:assert/strict";
import { getNerApiUrl, registerWithNer } from "./nerAdapter";

test("registry URL requires an explicit HTTP(S) endpoint and HTTPS in production", () => {
  const originalUrl = process.env.NER_API_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    process.env.NER_API_URL = "http://localhost:5001/";
    assert.equal(getNerApiUrl(), "http://localhost:5001");
    process.env.NODE_ENV = "production";
    assert.equal(getNerApiUrl(), null);
    for (const invalid of ["", "not-a-url", "https://user:pass@example.invalid", "https://example.invalid/?token=test", "https://example.invalid/#fragment"]) {
      process.env.NER_API_URL = invalid;
      assert.equal(getNerApiUrl(), null);
    }
    process.env.NER_API_URL = "https://example.invalid/";
    assert.equal(getNerApiUrl(), "https://example.invalid");
  } finally {
    if (originalUrl === undefined) delete process.env.NER_API_URL;
    else process.env.NER_API_URL = originalUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("NER registration requires explicit configuration and uses the configured endpoint and idempotency key", async () => {
  const originalUrl = process.env.NER_API_URL;
  const originalPath = process.env.NER_REGISTRATION_PATH;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    delete process.env.NER_API_URL;
    delete process.env.NER_REGISTRATION_PATH;
    globalThis.fetch = async (input, init) => {
      calls++;
      assert.equal(String(input), "https://ner.example.invalid/integration/registrations");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("idempotency-key"), "ner-registration:synthetic-enrollment");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        enrollmentId: "synthetic-enrollment", userId: "synthetic-user",
      });
      return Response.json({ reference: " synthetic-reference " });
    };
    const input = { enrollmentId: "synthetic-enrollment", userId: "synthetic-user" };
    await assert.rejects(registerWithNer(input), /NER integration is not configured/);
    process.env.NER_API_URL = "https://ner.example.invalid";
    await assert.rejects(registerWithNer(input), /NER integration is not configured/);
    assert.equal(calls, 0);
    process.env.NER_REGISTRATION_PATH = "/integration/registrations";
    process.env.NER_API_URL = "javascript:alert(1)";
    await assert.rejects(registerWithNer(input), /NER integration is not configured/);
    assert.equal(calls, 0);
    process.env.NER_API_URL = "https://ner.example.invalid";
    assert.deepEqual(await registerWithNer(input), { reference: "synthetic-reference" });
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 });
    await assert.rejects(registerWithNer(input), /NER registration failed \(503\)/);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(registerWithNer(input), /did not include a reference/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NER_API_URL;
    else process.env.NER_API_URL = originalUrl;
    if (originalPath === undefined) delete process.env.NER_REGISTRATION_PATH;
    else process.env.NER_REGISTRATION_PATH = originalPath;
  }
});
