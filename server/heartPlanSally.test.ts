import assert from "node:assert/strict";
import test from "node:test";
import { buildSallySystemPrompt, completeSallyAnswer } from "./heartPlanSally";

function promptFor(question: string) {
  return buildSallySystemPrompt({
    userContext: "The visitor is NOT signed in.",
    currentPath: `/heartplan?question=${encodeURIComponent(question)}`,
    suggestContact: false,
  });
}

test("Sally receives the complete HeartPlan product contract", () => {
  const prompt = promptFor("What is Heart Plan and what should I do next?");

  assert.match(prompt, /secure pre-death planning workspace/i);
  assert.match(prompt, /separate from an active family case opened after a death/i);

  for (const section of [
    "personal information",
    "end-of-life wishes",
    "document vault",
    "assets and accounts",
    "trusted contacts",
    "Legacy Messages",
  ]) {
    assert.match(prompt, new RegExp(section, "i"));
  }
  assert.match(prompt, /recommend the most relevant unfinished section/i);
  assert.match(prompt, /strong starting order/i);
});

test("Sally receives accurate tiers, storage, aliases, and credential safety rules", () => {
  const prompt = promptFor("Does heart plant have a paid tier?");

  assert.match(prompt, /"Heart Plan" or "heart plant".*mean HeartPlan/i);
  assert.match(prompt, /Free plans include 100 MB/i);
  assert.match(prompt, /one-time \$149 lifetime purchase, not a subscription/i);
  assert.match(prompt, /secure lifetime Legacy access for \$50 one time/i);
  assert.match(prompt, /lifetime Legacy costs \$149 one time/i);
  assert.match(prompt, /storage to 1 GB/i);
  assert.match(prompt, /never ask them to put passwords, private keys, or full sensitive account credentials into chat/i);
  assert.match(prompt, /Never ask for or repeat passwords, codes, SSNs, or other sensitive data/i);
});

test("Sally completion uses the injected AI provider rather than a live model", async () => {
  let request: any;
  const fakeClient = {
    chat: {
      completions: {
        async create(input: any) {
          request = input;
          return { choices: [{ message: { content: "Start with your trusted contacts." } }] };
        },
      },
    },
  };
  const systemPrompt = promptFor("What should I do next?");

  const answer = await completeSallyAnswer({
    client: fakeClient,
    systemPrompt,
    history: [{ role: "user", content: "What should I do next in my Heart Plan?" }],
  });

  assert.equal(answer, "Start with your trusted contacts.");
  assert.equal(request.model, "gpt-4o");
  assert.equal(request.max_tokens, 500);
  assert.equal(request.messages[0].role, "system");
  assert.equal(request.messages[0].content, systemPrompt);
  assert.equal(request.messages[1].content, "What should I do next in my Heart Plan?");
});