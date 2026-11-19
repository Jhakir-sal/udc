import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production build compiles artifacts without mutating the database", async () => {
  const source = await readFile(new URL("./build.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /child_process|drizzle-kit|db:push|pre-migrate|runPreMigration|runDbPush/);
  assert.match(source, /await viteBuild\(/);
  assert.match(source, /await esbuild\(/);
});
