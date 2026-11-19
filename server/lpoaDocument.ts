import type { LpoaDocument } from "@shared/schema";
import { resolveLpoaAgreement } from "@shared/lpoaAgreement";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSignature(document: LpoaDocument): string {
  if (
    document.signatureType === "drawn" &&
    /^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/=\s]+$/.test(document.signatureData)
  ) {
    return `<img class="signature-image" src="${document.signatureData}" alt="Signature of ${escapeHtml(document.principalName)}">`;
  }

  return `<div class="typed-signature">${escapeHtml(document.signatureData)}</div>`;
}

export function renderLpoaDocument(document: LpoaDocument): string {
  const agreement = resolveLpoaAgreement(document.agreementVersion, document.agreementSnapshot);
  const signedAt = new Date(document.signedAt).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Detroit",
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Limited Power of Attorney — ${escapeHtml(document.principalName)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; color: #17202a; background: #eef2f6; font-family: Georgia, "Times New Roman", serif; line-height: 1.55; }
    main { box-sizing: border-box; width: min(8.5in, calc(100% - 32px)); min-height: 11in; margin: 28px auto; padding: .8in; background: white; box-shadow: 0 8px 30px rgba(15, 23, 42, .12); }
    h1 { margin: 0 0 6px; font-size: 22px; text-align: center; letter-spacing: .04em; }
    .subtitle { margin: 0 0 34px; text-align: center; color: #52606d; font-family: Arial, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    p, li { font-size: 14px; }
    li { margin-bottom: 7px; }
    .filled { font-weight: 700; border-bottom: 1px solid #52606d; }
    .signature-block { margin-top: 44px; padding-top: 20px; border-top: 1px solid #cbd5e1; }
    .signature-image { display: block; max-width: 320px; max-height: 110px; object-fit: contain; }
    .typed-signature { min-height: 58px; font-size: 28px; font-style: italic; display: flex; align-items: center; }
    .signature-line { width: 330px; max-width: 100%; border-top: 1px solid #17202a; margin-top: 6px; padding-top: 5px; font-family: Arial, sans-serif; font-size: 11px; color: #52606d; }
    .details { margin-top: 28px; padding: 14px; background: #f8fafc; border: 1px solid #dbe3ea; font-family: Arial, sans-serif; font-size: 12px; }
    .details div + div { margin-top: 5px; }
    @media print {
      body { background: white; }
      main { width: auto; min-height: auto; margin: 0; padding: .55in; box-shadow: none; }
    }
  </style>
</head>
<body>
<main>
  <h1>${escapeHtml(agreement.title)}</h1>
  <p class="subtitle">${escapeHtml(agreement.subtitle)}</p>
  <p>I, <span class="filled">${escapeHtml(document.principalName)}</span>, whose address is <span class="filled">${escapeHtml(document.principalAddress)}</span> ("Principal").</p>
  <p>${escapeHtml(agreement.grantParagraph)}</p>
  <ol>
    ${agreement.authorizedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("\n    ")}
  </ol>
  <p>This limited power of attorney is valid from the date of its execution until <span class="filled">${escapeHtml(document.validUntil)}</span>.</p>
  <p>${escapeHtml(agreement.diligenceParagraph)}</p>
  <p>${escapeHtml(agreement.limitationParagraph)}</p>
  <p>${escapeHtml(agreement.acknowledgementParagraph)}</p>
  <section class="signature-block">
    ${renderSignature(document)}
    <div class="signature-line">Signature of ${escapeHtml(document.principalName)}</div>
  </section>
  <section class="details" aria-label="Signing details">
    <div><strong>Signed:</strong> ${escapeHtml(signedAt)} ET</div>
    <div><strong>Signature method:</strong> ${document.signatureType === "drawn" ? "Drawn electronic signature" : "Typed electronic signature"}</div>
    <div><strong>Consent:</strong> ${document.consentAgreed ? "Electronic signature consent accepted" : "Consent not recorded"}</div>
    <div><strong>Agreement version:</strong> ${escapeHtml(document.agreementVersion)}</div>
    <div><strong>Document ID:</strong> ${escapeHtml(document.id)}</div>
  </section>
</main>
</body>
</html>`;
}