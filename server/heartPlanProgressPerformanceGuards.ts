import assert from "node:assert/strict";

export const progressProjectionKeys = [
  "id", "status", "tier", "fullName", "createdAt", "updatedAt", "upgradedAt", "certificateId",
  "activatedAt", "activatedByName", "lastReviewedAt", "pendingActivationRequests", "ownerId",
  "ownerEmail", "ownerFirstName", "ownerLastName", "emailVerified", "profileComplete", "wishesComplete",
  "documents", "assets", "contacts", "letters", "failedContactDeliveries", "primaryContactStatus", "lastEventAt",
].sort();

// Fields evaluated in SQL are permitted here, but never in the returned projection.
export const scanFields: Record<string, string[]> = {
  heart_plans: ["id", "user_id", "status", "tier", "full_name", "date_of_birth", "created_at", "updated_at",
    "upgraded_at", "certificate_id", "activated_at", "activated_by_name", "last_reviewed_at"],
  users: ["id", "email", "first_name", "last_name", "email_verified"],
  plan_wishes: ["plan_id", "resting_preference"],
  plan_documents: ["plan_id"],
  plan_assets: ["plan_id"],
  plan_letters: ["plan_id"],
  plan_contacts: ["plan_id", "email", "is_primary", "info_email_failed_at", "created_at"],
  plan_events: ["plan_id", "created_at"],
  plan_activation_requests: ["plan_id", "status"],
};

export interface ExplainNode {
  "Node Type": string;
  "Relation Name"?: string;
  Alias?: string;
  Output?: string[];
  "Actual Loops": number;
  "Actual Rows": number;
  Plans?: ExplainNode[];
  [key: string]: unknown;
}

export function planNodes(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.Plans || []).flatMap(planNodes)];
}

export function assertProgressSql(text: string) {
  assert.doesNotMatch(text, /select\s+(?:distinct\s+)?(?:[\w"]+\.)?\*/i, "Broad SELECT * projection");
  assert.doesNotMatch(text, /"(?:object_path|pending_object_path|body|content|notes|estimated_value|account_number_hint|institution|street|phone|address|stripe_checkout_session_id|password|password_hash)"/i,
    "Private fields must not be fetched for staff progress");
  for (const match of Array.from(text.matchAll(/"([^"]+)"\."([^"]+)"/g))) {
    const fields = scanFields[match[1]];
    if (fields) assert.ok(fields.includes(match[2]), `${match[1]}: private/future SQL field ${match[2]}`);
  }
}

export function assertProgressPlan(root: ExplainNode, expectedRows: number) {
  assert.equal(root["Actual Rows"], expectedRows, "One result row per scoped plan");
  const nodes = planNodes(root);
  for (const table of Object.keys(scanFields)) {
    const scans = nodes.filter(node => node["Relation Name"] === table);
    assert.equal(scans.length, 1, `${table}: expected exactly one scan node`);
    const scan = scans[0];
    // Parallelism is disabled by the fixture so loops can be compared directly.
    assert.equal(scan["Actual Loops"], 1, `${table}: repeated/per-plan scans`);
  }
  // Heap scan Output can list the entire physical tuple even for a narrow SQL projection.
  // Inspect projected expressions above scans instead (plus compiled SQL and returned keys).
  for (const node of nodes.filter(node => !node["Relation Name"])) {
    for (const expression of node.Output || []) {
      for (const match of Array.from(expression.matchAll(/(\w+)\.(\w+|\*)/g))) {
        const fields = scanFields[match[1]];
        if (fields) assert.ok(fields.includes(match[2]), `${match[1]}: broad/private projected output ${expression}`);
      }
    }
  }
  for (const node of nodes.filter(node => node["Node Type"] === "Aggregate")) {
    assert.ok(node["Actual Loops"] <= 1, "Grouped counts must not aggregate per planner");
  }
}

export function assertProgressRows(rows: Record<string, unknown>[]) {
  assert.ok(rows.length > 0);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), progressProjectionKeys);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_FIXTURE/, "Synthetic private sentinel leaked");
}
