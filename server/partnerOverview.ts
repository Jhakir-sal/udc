import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PARTNER_OVERVIEW_FILENAME, PARTNER_OVERVIEW_SHA256 } from "@shared/outreach";

export type PartnerOverviewAttachment = {
  content: string;
  filename: string;
  type: "application/pdf";
  disposition: "attachment";
};

const DEV_FILE = "attached_assets/0_Steps_After_Life_—_What_we_do_1790298006885.pdf";
const PRODUCTION_FILE = "dist/attachments/partner-overview.pdf";

export async function loadPartnerOverview(expectedSha256?: string) {
  const location = path.resolve(process.env.NODE_ENV === "production" ? PRODUCTION_FILE : DEV_FILE);
  const bytes = await readFile(location);
  if (bytes.length === 0 || bytes.length > 2_000_000 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("The approved partner overview PDF is unavailable or invalid");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== PARTNER_OVERVIEW_SHA256) {
    throw new Error("The approved one-page partner overview PDF is missing or changed");
  }
  if (expectedSha256 && sha256 !== expectedSha256) {
    throw new Error("The partner overview PDF changed since this template was saved");
  }
  return {
    sha256,
    info: { filename: PARTNER_OVERVIEW_FILENAME, size: bytes.length, pages: 1, sha256 },
    attachment: {
      content: bytes.toString("base64"),
      filename: PARTNER_OVERVIEW_FILENAME,
      type: "application/pdf",
      disposition: "attachment",
    } satisfies PartnerOverviewAttachment,
  };
}