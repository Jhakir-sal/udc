import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { certificates, nextOfKinPrivateIdentities, caseEvents } from "@shared/schema";
import { nextOfKinIdentityInput } from "@shared/nextOfKinIdentity";

type Identity = { ssn: string | null; dob: string | null };

// Domain-separated key: never store plaintext or reuse the session key directly.
function encryptionKey(secret = process.env.SESSION_SECRET) {
  if (!secret) throw new Error("Private identity encryption unavailable");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "sal-next-of-kin-v1", "private-identity", 32));
}

export function sealIdentity(identity: Identity, caseId: string, token: string, secret?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(`${caseId}:${token}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(identity), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function openIdentity(encrypted: string, caseId: string, token: string, secret?: string): Identity {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== "v1") throw new Error("Unsupported identity format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`${caseId}:${token}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

export function nextOfKinContactToken(cert: any) {
  return crypto.createHash("sha256").update(JSON.stringify([
    cert.id, cert.nextOfKinName, cert.nextOfKinEmail, cert.nextOfKinPhone, cert.nextOfKinRelationship,
  ])).digest("hex");
}

export function registerNextOfKinIdentity(app: Express, authenticated: RequestHandler) {
  const root = "/api/admin/case/:certId/next-of-kin-private-identity";
  const handler = (operation: "status" | "reveal" | "save"): RequestHandler => async (req: any, res) => {
    res.set({ "Cache-Control": "private, no-store", "Pragma": "no-cache" });
    try {
      const actorId = req.session?.userId || req.user?.claims?.sub;
      const actor = actorId ? await storage.getUser(actorId) : null;
      if (!actor) return res.status(401).json({ message: "Sign in required." });
      if (actor.role !== "admin") return res.status(403).json({ message: "Staff access required." });
      // Serialize saves/reveals with contact edits and other identity saves.
      const result = await db.transaction(async tx => {
        const [cert] = await tx.select().from(certificates).where(eq(certificates.id, req.params.certId)).for("update");
        if (!cert) return { status: 404, body: { message: "Case not found." } };
        const token = nextOfKinContactToken(cert);
        const [stored] = await tx.select().from(nextOfKinPrivateIdentities).where(eq(nextOfKinPrivateIdentities.certificateId, cert.id));
        const current = stored?.contactToken === token ? stored : undefined;
        const version = current ? crypto.createHash("sha256").update(current.encryptedIdentity).digest("hex") : null;
        const identity = current ? openIdentity(current.encryptedIdentity, cert.id, token) : { ssn: null, dob: null };
        const status = () => ({
          hasSsn: !!identity.ssn, hasDob: !!identity.dob, contactToken: token,
          version,
        });
        if (operation === "status") return { status: 200, body: status() };
        const audit = async (eventType: string, description: string) => {
          await tx.insert(caseEvents).values({
            certificateId: cert.id, actorId: actor.id, actorRole: "admin",
            actorName: `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || "SAL staff",
            eventType, description,
          });
        };
        if (operation === "reveal") {
          const input = z.object({ contactToken: z.string().length(64) }).strict().parse(req.body);
          if (input.contactToken !== token) return { status: 409, body: { message: "The next of kin changed. Refresh before continuing." } };
          await audit("next_of_kin_identity_viewed", "Staff accessed private next-of-kin transfer details.");
          return { status: 200, body: { ...status(), ...identity } };
        }
        const input = nextOfKinIdentityInput.parse(req.body);
        if (!cert.nextOfKinName?.trim()) return { status: 400, body: { message: "Save the next-of-kin contact first." } };
        if (input.contactToken !== token || input.version !== version) {
          return { status: 409, body: { message: "The contact or private details changed. Hide and reopen to load the latest information." } };
        }
        if (!input.ssn && !input.dob) {
          await tx.delete(nextOfKinPrivateIdentities).where(eq(nextOfKinPrivateIdentities.certificateId, cert.id));
          await audit("next_of_kin_identity_updated", "Staff cleared private next-of-kin transfer details.");
          return { status: 200, body: { hasSsn: false, hasDob: false, contactToken: token, version: null } };
        }
        const values = {
          certificateId: cert.id, contactToken: token,
          encryptedIdentity: sealIdentity({ ssn: input.ssn, dob: input.dob }, cert.id, token),
          updatedAt: new Date(),
        };
        await tx.insert(nextOfKinPrivateIdentities).values(values).onConflictDoUpdate({
          target: nextOfKinPrivateIdentities.certificateId, set: { ...values, updatedAt: sql`clock_timestamp()` },
        });
        await audit("next_of_kin_identity_updated", "Staff updated private next-of-kin transfer details.");
        return { status: 200, body: { saved: true } };
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      // Zod issues can contain submitted values: never return/log the raw error.
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Check the SSN and date of birth. Use nine digits and a valid birth date, or leave a field blank." });
      res.status(503).json({ message: "Private transfer details are unavailable. Please try again." });
    }
  };
  app.get(root, authenticated, handler("status"));
  app.post(`${root}/reveal`, authenticated, handler("reveal"));
  app.put(root, authenticated, handler("save"));
}
