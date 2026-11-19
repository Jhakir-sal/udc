import type { CaseFamilyAuthorization, CaseFamilyMembership, Certificate } from "@shared/schema";
import { FAMILY_SHARING_VERSION } from "@shared/familySharing";

type Membership = Pick<CaseFamilyMembership, "status" | "userId">;
type Case = Pick<Certificate, "id" | "userId" | "deceasedName">;

export function sharingDocumentStatus(grant: CaseFamilyAuthorization, membership: Membership, cert: Case) {
  const historicalReasons = [
    grant.revokedAt && "Authorization revoked or superseded",
    membership.status !== "active" && "Membership is no longer active",
    (!cert.userId || grant.authorizedBy !== cert.userId) && "Case ownership has changed or is no longer assigned",
    grant.agreementVersion !== FAMILY_SHARING_VERSION && "Agreement version is no longer current",
  ].filter((reason): reason is string => !!reason);
  return { historical: historicalReasons.length > 0, historicalReasons };
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (value: Date | null) => value ? value.toISOString() : "Not recorded";

// Deliberately accepts only case, membership, and signed-record data, never a
// provider payload or user object. Signature text is the immutable signer name.
export function renderSharingDocument(
  grant: CaseFamilyAuthorization, membership: Membership, cert: Case, nonce: string,
) {
  const status = sharingDocumentStatus(grant, membership, cert);
  const field = (label: string, value: unknown) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Family-sharing authorization</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;color:#182f33;max-width:850px;margin:40px auto;padding:0 24px}
h1,h2{line-height:1.25}h2{margin-top:32px}dt{font-weight:600}dd{margin:0 0 12px;overflow-wrap:anywhere}
.status{border:2px solid #516d6e;padding:16px}.wording{white-space:pre-wrap;border-left:3px solid #516d6e;padding-left:18px}
button{padding:10px 16px;cursor:pointer}footer{margin-top:32px;font-size:13px}
@media print{button,.instructions{display:none}body{margin:0;max-width:none}h2{break-after:avoid}.status{break-inside:avoid}}
</style></head><body>
<button id="print" type="button">Print / Save as PDF</button>
<p class="instructions">This private audit copy contains personal information. Store it securely.</p>
<h1>Family-sharing authorization and member acceptance</h1>
<div class="status"><strong>${status.historical ? "HISTORICAL — not a current authorization" : "Current authorization record"}</strong>
<p>${escape(status.historicalReasons.join("; ") || "This record alone is not proof of current case access. Identity, membership and authority checks still apply.")}</p></div>
<h2>Case and signed record</h2><dl>
${field("Case", cert.deceasedName)}${field("Case ID", cert.id)}${field("Authorization ID", grant.id)}
${field("Agreement version", grant.agreementVersion)}${field("Scope", grant.scope)}
${field("Membership status at export", membership.status)}</dl>
<h2>Exact signed wording</h2><div class="wording">${escape(grant.agreementText)}</div>
<h2>Owner authorization</h2><dl>
${field("Owner signature (typed)", grant.ownerSignature)}${field("Owner signed at (UTC)", date(grant.signedAt))}
${field("Authorizing account ID", grant.authorizedBy || "Account no longer available")}</dl>
<h2>Member acceptance</h2><dl>
${field("Acceptance", grant.memberAcceptedAt ? "Accepted" : "Not yet accepted")}
${field("Member signature (typed)", grant.memberSignature || "Not recorded")}
${field("Member accepted at (UTC)", date(grant.memberAcceptedAt))}
${field("Member account ID", membership.userId)}</dl>
<p>The member acceptance applies to the exact signed wording and version reproduced above.</p>
<h2>Authority review</h2><dl>
${field("Review outcome", grant.reviewStatus)}${field("Reviewed at (UTC)", date(grant.reviewedAt))}
${field("Reviewer account ID", grant.reviewedBy || "Not recorded")}${field("Review reason", grant.reviewReason || "Not recorded")}</dl>
<h2>Revocation and historical status</h2><dl>
${field("Revocation status", grant.revokedAt ? "Revoked / superseded" : "No revocation recorded")}
${field("Revoked at (UTC)", date(grant.revokedAt))}
${field("Record status", status.historical ? "Historical — does not confer access" : "Current record — access remains separately checked")}</dl>
<footer>Steps After Life · Private audit copy · Exported ${escape(new Date().toISOString())}.
Signed wording and signatures are reproduced from the stored record. Review and revocation status are as of export.
This copy is not a power of attorney and includes no identity-provider documents.</footer>
<script nonce="${escape(nonce)}">document.getElementById("print").addEventListener("click",()=>window.print());</script>
</body></html>`;
}
