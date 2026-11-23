import assert from "node:assert/strict";
import test from "node:test";
import { getEntraIssuer } from "./oidc";

const tenantId = "11111111-2222-3333-4444-555555555555";

test("Entra issuer is pinned to the configured tenant's v2.0 endpoint", () => {
  assert.equal(
    getEntraIssuer(tenantId).href,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  );
  assert.equal(
    getEntraIssuer(tenantId, `https://login.microsoftonline.com/${tenantId.toUpperCase()}/v2.0`).href,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  );
  assert.throws(() => getEntraIssuer("organizations"));
  assert.throws(() => getEntraIssuer(tenantId, "https://login.microsoftonline.com/common/v2.0"));
  assert.throws(() => getEntraIssuer(tenantId, `http://login.microsoftonline.com/${tenantId}/v2.0`));
  assert.throws(() => getEntraIssuer(tenantId, `https://attacker.example/${tenantId}/v2.0`));
});
