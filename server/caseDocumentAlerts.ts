import type { Express, RequestHandler } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { caseEvents, familyDocumentNotices, familyDocuments, type InsertFamilyDocument } from "@shared/schema";
import { markCaseDocumentsSeen, type CaseDocumentAlerts } from "@shared/caseDocumentAlerts";

export async function createFamilyDocumentWithNotice(input: InsertFamilyDocument) {
  return db.transaction(async tx => {
    const [document] = await tx.insert(familyDocuments).values(input).returning();
    if (document.certificateId && document.uploadedByRole === "user") {
      await tx.insert(familyDocumentNotices).values({ documentId: document.id, certificateId: document.certificateId });
    }
    return document;
  });
}

export function registerCaseDocumentAlerts(app: Express, authenticated: RequestHandler) {
  const route = (handler: (req: any, res: any, actor: any) => Promise<any>): RequestHandler => async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const id = req.session?.userId || req.user?.claims?.sub;
      const actor = id ? await storage.getUser(id) : null;
      if (!actor) return res.status(401).json({ message: "Sign in required." });
      if (actor.role !== "admin") return res.status(403).json({ message: "Staff access required." });
      if (!(await storage.getCertificate(req.params.certId))) return res.status(404).json({ message: "Case not found." });
      await handler(req, res, actor);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0]?.message || "Invalid document selection." });
      res.status(503).json({ message: "Document upload status could not be updated. Refresh the status before trying again." });
    }
  };
  const root = "/api/admin/case/:certId/document-alerts";
  app.get(root, authenticated, route(async (req, res) => {
    const rows = await db.select({
      documentId: familyDocumentNotices.documentId, createdAt: familyDocumentNotices.createdAt,
      total: sql<number>`count(*) over()`,
    }).from(familyDocumentNotices).where(and(
      eq(familyDocumentNotices.certificateId, req.params.certId), isNull(familyDocumentNotices.seenAt),
    )).orderBy(desc(familyDocumentNotices.createdAt), desc(familyDocumentNotices.documentId)).limit(100);
    res.json({
      unseenCount: Number(rows[0]?.total || 0), unseenDocumentIds: rows.map(row => row.documentId),
      latestUploadedAt: rows[0]?.createdAt.toISOString() || null,
    } satisfies CaseDocumentAlerts);
  }));
  app.post(`${root}/seen`, authenticated, route(async (req, res, actor) => {
    const { documentIds } = markCaseDocumentsSeen.parse(req.body);
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`document-alerts:${req.params.certId}`}))`);
      const scoped = await tx.select({ id: familyDocumentNotices.documentId }).from(familyDocumentNotices).where(and(
        eq(familyDocumentNotices.certificateId, req.params.certId), inArray(familyDocumentNotices.documentId, documentIds),
      ));
      if (scoped.length !== documentIds.length) return null;
      const changed = await tx.update(familyDocumentNotices).set({ seenAt: new Date(), seenBy: actor.id }).where(and(
        eq(familyDocumentNotices.certificateId, req.params.certId), inArray(familyDocumentNotices.documentId, documentIds),
        isNull(familyDocumentNotices.seenAt),
      )).returning({ id: familyDocumentNotices.documentId });
      if (changed.length) await tx.insert(caseEvents).values({
        certificateId: req.params.certId, actorId: actor.id, actorRole: "admin",
        actorName: `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || "SAL staff",
        eventType: "family_documents_seen",
        description: `Staff marked ${changed.length} family-uploaded document${changed.length === 1 ? "" : "s"} as seen. This does not approve the documents or verify their contents.`,
      });
      return { acknowledgedCount: changed.length };
    });
    if (!result) return res.status(409).json({ message: "The selected uploads changed or are not part of this case. Refresh the document list." });
    res.json(result);
  }));
}
