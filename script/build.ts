import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, writeFile } from "fs/promises";
import { createHash } from "node:crypto";
import { PARTNER_OVERVIEW_SHA256 } from "../shared/outreach";
import { COMPANY_REFERENCE_FILE, parseCompanyReference } from "../server/companyReference";

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

function getProductionSiteUrl() {
  const configuredValue = process.env.PRODUCTION_SITE_URL;

  if (!configuredValue) {
    throw new Error(
      "Set PRODUCTION_SITE_URL before building.",
    );
  }

  const siteUrl = new URL(
    configuredValue.startsWith("http")
      ? configuredValue
      : `https://${configuredValue}`,
  );

  if (siteUrl.hostname.endsWith(".replit.dev")) {
    throw new Error(
      "Production social metadata cannot use a .replit.dev development address.",
    );
  }

  return siteUrl.origin;
}

async function buildAll() {
  const productionSiteUrl = getProductionSiteUrl();

  // Build artifacts only. Publishing owns production schema migrations;
  // changing the database here can invalidate its already-computed schema diff.
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild({
    plugins: [
      {
        name: "production-social-metadata",
        transformIndexHtml(html) {
          return html.replaceAll("%PRODUCTION_SITE_URL%", productionSiteUrl);
        },
      },
    ],
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
  const pdf = await readFile("attached_assets/0_Steps_After_Life_—_What_we_do_1790298006885.pdf");
  if (createHash("sha256").update(pdf).digest("hex") !== PARTNER_OVERVIEW_SHA256) {
    throw new Error("The approved one-page partner overview PDF is missing or changed");
  }
  await mkdir("dist/attachments", { recursive: true });
  const companyReference = await readFile(`attached_assets/${COMPANY_REFERENCE_FILE}`);
  parseCompanyReference(companyReference); // Fail the build rather than publish a broken reference list.
  await writeFile(`dist/attachments/${COMPANY_REFERENCE_FILE}`, companyReference);
  await writeFile("dist/attachments/partner-overview.pdf", pdf);
  const logo = await readFile("attached_assets/logo-horizontal.png");
  if (logo.length < 8 || !logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("The outreach logo is missing or not a PNG");
  }
  await writeFile("dist/attachments/outreach-logo.png", logo);
  const orsaTemplate = await readFile("previews/orsa-heartplan-email-preview.html");
  const orsaLogo = await readFile("previews/orsa-approved-logo.png");
  if (orsaLogo.length < 8 || !orsaLogo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("The approved orsa email logo is missing or not a PNG");
  }
  await writeFile("dist/attachments/orsa-heartplan-email.html", orsaTemplate);
  await writeFile("dist/attachments/orsa-logo.png", orsaLogo);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
