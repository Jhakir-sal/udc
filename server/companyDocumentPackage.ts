import { strToU8, zipSync } from "fflate";

export function certificateFilename(contentType: string): string {
  const mime = contentType.split(";")[0].toLowerCase().trim();
  const extension: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!extension[mime]) throw new Error("Unsupported certificate format");
  return `death-certificate.${extension[mime]}`;
}

export function buildCompanyDocumentPackage(certificate: Buffer, contentType: string, signedLpoaHtml: string): Buffer {
  if (!certificate.length || !signedLpoaHtml) throw new Error("Both reviewed documents are required");
  return Buffer.from(zipSync({
    [certificateFilename(contentType)]: new Uint8Array(certificate),
    "signed-lpoa.html": strToU8(signedLpoaHtml),
  }, { level: 0 }));
}