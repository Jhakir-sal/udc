import { OUTREACH_PDF_MAX_BYTES } from "@shared/outreach";

export type OutreachPdfInput = { filename: string; content: string };

/** Decode and verify the exact bytes that will be passed to the mail provider. */
export function validateOutreachPdf(input: OutreachPdfInput | undefined) {
  if (!input) return undefined;
  const { filename, content } = input;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _().-]{0,119}\.pdf$/i.test(filename) ||
      filename.includes("..") || !/^[A-Za-z0-9+/]+={0,2}$/.test(content) ||
      content.length > Math.ceil(OUTREACH_PDF_MAX_BYTES / 3) * 4) {
    throw new Error("Choose a PDF under 5 MB with a simple filename");
  }
  const bytes = Buffer.from(content, "base64");
  if (!bytes.length || bytes.length > OUTREACH_PDF_MAX_BYTES ||
      bytes.toString("base64") !== content ||
      !/^%PDF-\d\.\d/.test(bytes.subarray(0, 8).toString("ascii")) ||
      !bytes.subarray(-1024).toString("latin1").includes("%%EOF")) {
    throw new Error("The overview is not a valid PDF under 5 MB");
  }
  return { filename, content: bytes.toString("base64"), type: "application/pdf", disposition: "attachment" as const };
}