import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("family estate plans presents only NER search and private saved documents", () => {
  const page = readFileSync(new URL("../client/src/pages/estate-plans.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  assert.deepEqual(
    [...page.matchAll(/<TabsTrigger value="([^"]+)"/g)].map((match) => match[1]),
    ["ner", "saved"],
  );
  assert.match(page, /queryKey: \["\/api\/family-documents"\]/);
  assert.doesNotMatch(page, /"\/api\/estate-registry"/);
  assert.match(app, /path="\/estate-registry" component=\{EstatePlans\}/);
});