import type { Express, RequestHandler } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { caseEvents, connectedAccounts, documentAccountLinks, familyDocuments } from "@shared/schema";
import { assignDocumentAccounts } from "@shared/documentAccountLinks";

async function listCaseLinks(certId: string, source: Pick<typeof db, "select"> = db) {
  return source.select({
    documentId: documentAccountLinks.documentId,
    accountId: documentAccountLinks.accountId,
  }).from(documentAccountLinks)
    .innerJoin(familyDocuments, eq(familyDocuments.id, documentAccountLinks.documentId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, documentAccountLinks.accountId))
    .where(and(eq(familyDocuments.certificateId, certId), eq(connectedAccounts.certificateId, certId)))
    .orderBy(asc(documentAccountLinks.documentId), asc(documentAccountLinks.accountId));
}

export function registerDocumentAccountLinks(app: Express, authenticated: RequestHandler) {
  const staff = (handler: (req: any, res: any, actor: any) => Promise<unknown>): RequestHandler =>
    async (req: any, res) => {
      res.set("Cache-Control", "private, no-store");
      try {
        const actorId = req.session?.userId || req.user?.claims?.sub;
        const actor = actorId ? await storage.getUser(actorId) : null;
        if (!actor) return res.status(401).json({ message: "Sign in required." });
        if (actor.role !== "admin") return res.status(403).json({ message: "Staff access required." });
        if (!(await storage.getCertificate(req.params.certId))) {
          return res.status(404).json({ message: "Case not found." });
        }
        await handler(req, res, actor);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.issues[0]?.message || "Invalid account selection." });
        }
        console.error("Document account assignment failed:", error instanceof Error ? error.name : "Unknown error");
        res.status(503).json({ message: "Document assignments could not be loaded or saved. Refresh and try again." });
      }
    };

  const root = "/api/admin/case/:certId";
  app.get(`${root}/document-account-links`, authenticated, staff(async (req, res) => {
    res.json(await listCaseLinks(req.params.certId));
  }));
  app.put(`${root}/family-documents/:documentId/accounts`, authenticated, staff(async (req, res, actor) => {
    const { accountIds } = assignDocumentAccounts.parse(req.body);
    const { certId, documentId } = req.params;
    const outcome = await db.transaction(async tx => {
      // Lock the source document so two tabs cannot interleave replacement sets,
      // and document deletion cannot race a successful assignment.
      const [document] = await tx.select({ id: familyDocuments.id }).from(familyDocuments)
        .where(and(eq(familyDocuments.id, documentId), eq(familyDocuments.certificateId, certId))).for("update");
      if (!document) return { status: 404, message: "Uploaded document not found in this case." } as const;
      if (accountIds.length) {
        const accounts = await tx.select({ id: connectedAccounts.id }).from(connectedAccounts)
          .where(and(inArray(connectedAccounts.id, accountIds), eq(connectedAccounts.certificateId, certId)))
          .orderBy(asc(connectedAccounts.id)).for("update");
        if (accounts.length !== accountIds.length) {
          return { status: 400, message: "Select only accounts belonging to this case. Refresh if an account was removed." } as const;
        }
      }
      const before = await tx.select({ accountId: documentAccountLinks.accountId }).from(documentAccountLinks)
        .where(eq(documentAccountLinks.documentId, documentId));
      const next = new Set(accountIds);
      const removed = before.filter(link => !next.has(link.accountId)).map(link => link.accountId);
      const previous = new Set(before.map(link => link.accountId));
      const added = accountIds.filter(id => !previous.has(id));
      if (removed.length) {
        await tx.delete(documentAccountLinks).where(and(
          eq(documentAccountLinks.documentId, documentId), inArray(documentAccountLinks.accountId, removed),
        ));
      }
      if (added.length) {
        await tx.insert(documentAccountLinks).values(added.map(accountId => ({
          documentId, accountId, assignedBy: actor.id,
        })));
      }
      if (added.length || removed.length) {
        await tx.insert(caseEvents).values({
          certificateId: certId, actorId: actor.id, actorRole: "admin",
          actorName: `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || "SAL staff",
          eventType: "document_accounts_assigned",
          description: `Updated account assignments for uploaded document ${documentId}: ${added.length} added, ${removed.length} removed. Organization only; no document approval or release.`,
        });
      }
      return { status: 200, links: await listCaseLinks(certId, tx) } as const;
    });
    if (outcome.status !== 200) return res.status(outcome.status).json({ message: outcome.message });
    res.json(outcome.links);
  }));
}
