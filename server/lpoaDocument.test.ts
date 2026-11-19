import assert from "node:assert/strict";
import test from "node:test";
import type { LpoaDocument } from "@shared/schema";
import { renderLpoaDocument } from "./lpoaDocument";
import { readFileSync } from "node:fs";
import {
  CURRENT_LPOA_AGREEMENT,
  CURRENT_LPOA_AGREEMENT_VERSION,
  LEGACY_LPOA_AGREEMENT,
  LEGACY_LPOA_AGREEMENT_VERSION,
  serializeLpoaAgreement,
} from "@shared/lpoaAgreement";

const document: LpoaDocument = {
  id: "lpoa-1",
  userId: "user-1",
  certificateId: "case-1",
  principalName: "Alex <Planner>",
  principalAddress: "1 Main & State",
  signatureType: "typed",
  signatureData: "Alex <Planner>",
  consentAgreed: true,
  validUntil: "August 28, 2027",
  agreementVersion: CURRENT_LPOA_AGREEMENT_VERSION,
  agreementSnapshot: serializeLpoaAgreement(CURRENT_LPOA_AGREEMENT),
  ipAddress: null,
  status: "active",
  supersedesDocumentId: null,
  supersededByDocumentId: null,
  replacementRequestedAt: null,
  replacementRequestedBy: null,
  replacementReason: null,
  supersededAt: null,
  signedAt: new Date("2026-08-28T16:00:00Z"),
};

test("renders a printable LPOA and escapes stored signer content", () => {
  const html = renderLpoaDocument(document);
  assert.match(html, /LIMITED POWER OF ATTORNEY/);
  assert.match(html, /Alex &lt;Planner&gt;/);
  assert.match(html, /1 Main &amp; State/);
  assert.doesNotMatch(html, /Alex <Planner>/);
  assert.match(html, /Electronic signature consent accepted/);
  assert.match(html, new RegExp(CURRENT_LPOA_AGREEMENT_VERSION));
});

test("renders the immutable stored agreement snapshot instead of today's template", () => {
  const historicalWording = {
    ...CURRENT_LPOA_AGREEMENT,
    acknowledgementParagraph: "Historical wording accepted by this signer.",
  };
  const html = renderLpoaDocument({
    ...document,
    agreementSnapshot: serializeLpoaAgreement(historicalWording),
  });

  assert.match(html, /Historical wording accepted by this signer/);
  assert.doesNotMatch(html, new RegExp(CURRENT_LPOA_AGREEMENT.acknowledgementParagraph));
});

test("renders existing records through the explicit frozen legacy version", () => {
  const html = renderLpoaDocument({
    ...document,
    agreementVersion: LEGACY_LPOA_AGREEMENT_VERSION,
    agreementSnapshot: serializeLpoaAgreement(LEGACY_LPOA_AGREEMENT),
  });

  assert.match(html, /LIMITED POWER OF ATTORNEY/);
  assert.match(html, new RegExp(LEGACY_LPOA_AGREEMENT_VERSION));
});

test("concierge LPOA routes require authentication and admin access", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const route of [
    "/api/admin/case/:certId/lpoa",
    "/api/admin/case/:certId/lpoa/:documentId/document",
  ]) {
    assert.match(
      routes,
      new RegExp(`app\\.get\\("${route.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}", isAuthenticated, isAdmin,`),
    );
  }
});

test("case document library loads only documents explicitly assigned to that case", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.get("/api/admin/case/:certId/family-documents"');
  const end = routes.indexOf('app.post("/api/admin/family-accounts/:userId/documents"', start);
  const handler = routes.slice(start, end);

  assert.match(handler, /getFamilyDocumentsByCertificate\(certId\)/);
  assert.doesNotMatch(handler, /!d\.certificateId/);
  assert.doesNotMatch(handler, /getFamilyDocumentsByUsers/);
});