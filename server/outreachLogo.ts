import { readFile } from "node:fs/promises";
import path from "node:path";

export const OUTREACH_LOGO_CID = "sal-outreach-logo";

const LOGO_PATH = process.env.NODE_ENV === "production"
  ? "dist/attachments/outreach-logo.png"
  : "attached_assets/logo-horizontal.png";

let logoPromise: Promise<string> | undefined;

function logoBase64(): Promise<string> {
  if (!logoPromise) {
    logoPromise = readFile(path.resolve(LOGO_PATH)).then(bytes => {
      if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new Error("The outreach logo is not a PNG");
      }
      return bytes.toString("base64");
    }).catch(error => {
      logoPromise = undefined;
      throw error;
    });
  }
  return logoPromise;
}

export async function outreachLogoAttachment() {
  return {
    content: await logoBase64(),
    filename: "steps-after-life-logo.png",
    type: "image/png",
    disposition: "inline" as const,
    content_id: OUTREACH_LOGO_CID,
  };
}

export async function outreachPreviewHtml(html: string): Promise<string> {
  return html.replace(`cid:${OUTREACH_LOGO_CID}`, `data:image/png;base64,${await logoBase64()}`);
}