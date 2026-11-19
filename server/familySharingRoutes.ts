import type { Express, RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { FAMILY_SHARING_TEXT, FAMILY_SHARING_VERSION, memberIdVerified, sharingAccess, sharingSignatureMatches } from "@shared/familySharing";
import { renderSharingDocument, sharingDocumentStatus } from "./familySharingDocument";
import { caseEvents, caseFamilyAuthorizations, caseFamilyMemberships, certificates, familyDocuments, users } from "@shared/schema";
import { registerFamilySafeguardReminders } from "./familySafeguardReminders";

const actorId = (req: any): string | undefined => req.session?.userId || req.user?.claims?.sub;
const displayName = (user: any) => `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
const signatureSchema = z.object({
  typedName: z.string().trim().min(2).max(200),
  confirmed: z.literal(true),
  agreementVersion: z.literal(FAMILY_SHARING_VERSION),
});
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { httpStatus: status });
}

export async function familySharingSummary(membership: typeof caseFamilyMemberships.$inferSelect, cert: typeof certificates.$inferSelect) {
  const [member, owner, grants] = await Promise.all([
    storage.getUser(membership.userId),
    cert.userId ? storage.getUser(cert.userId) : undefined,
    db.select().from(caseFamilyAuthorizations).where(and(
      eq(caseFamilyAuthorizations.membershipId, membership.id), isNull(caseFamilyAuthorizations.revokedAt),
    )),
  ]);
  if (!member) return null;
  const grant = grants[0] || null;
  return {
    certificateId: cert.id, caseLabel: cert.deceasedName, memberUserId: member.id,
    memberName: displayName(member), email: member.email, membershipStatus: membership.status,
    identityStatus: member.idOverrideAt ? "staff_approved" : member.idVerificationStatus,
    ...sharingAccess(member, membership, cert.userId, grant),
    scope: grant?.scope || null, grantId: grant?.id || null,
    agreementVersion: FAMILY_SHARING_VERSION, agreementText: FAMILY_SHARING_TEXT,
    ownerName: displayName(owner) || null, reviewStatus: grant?.reviewStatus || null,
    grant: grant ? { ...grant, ownerSignedAt: grant.signedAt, memberSignedAt: grant.memberAcceptedAt } : null,
  };
}

export function registerFamilySharingRoutes(
  app: Express, authenticated: RequestHandler,
  ownerReady: (certificate: any, user: any) => Promise<boolean>,
) {
  registerFamilySafeguardReminders(app, authenticated);
  // This wrapper is deliberately fail-closed if the deployment schema is missing.
  const route = (handler: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try { await handler(req, res); }
    catch (error: any) {
      const status = error instanceof z.ZodError ? 400 : error.httpStatus || 503;
      res.status(status).json({ error: error instanceof z.ZodError ? "Complete the required confirmation fields." :
        error.httpStatus ? error.message : "Case access checks are temporarily unavailable. No access was granted." });
    }
  };
  const manageContext = async (req: any) => {
    const id = actorId(req);
    const [cert, actor] = await Promise.all([storage.getCertificate(req.params.certId), id ? storage.getUser(id) : undefined]);
    if (!cert || !actor || (actor.role !== "admin" && !(actor.role === "user" && actor.emailVerified && cert.userId === actor.id))) {
      fail(404, "Case not found");
    }
    return { cert, actor };
  };
  app.get("/api/case/:certId/family-authorization-documents", authenticated, route(async (req, res) => {
    const { cert } = await manageContext(req);
    const rows = await db.select({ grant: caseFamilyAuthorizations, membership: caseFamilyMemberships })
      .from(caseFamilyAuthorizations)
      .innerJoin(caseFamilyMemberships, eq(caseFamilyAuthorizations.membershipId, caseFamilyMemberships.id))
      .where(eq(caseFamilyMemberships.certificateId, cert.id))
      .orderBy(desc(caseFamilyAuthorizations.signedAt));
    res.json({ documents: rows.map(({ grant, membership }) => ({
      id: grant.id, memberName: grant.memberSignature || "Awaiting member acceptance",
      agreementVersion: grant.agreementVersion, scope: grant.scope, signedAt: grant.signedAt,
      memberAcceptedAt: grant.memberAcceptedAt, reviewStatus: grant.reviewStatus, revokedAt: grant.revokedAt,
      ...sharingDocumentStatus(grant, membership, cert),
      documentUrl: `/api/case/${encodeURIComponent(cert.id)}/family-authorization-documents/${encodeURIComponent(grant.id)}`,
    })) });
  }));

  app.get("/api/case/:certId/family-authorization-documents/:grantId", authenticated, route(async (req, res) => {
    const { cert } = await manageContext(req);
    const [row] = await db.select({ grant: caseFamilyAuthorizations, membership: caseFamilyMemberships })
      .from(caseFamilyAuthorizations)
      .innerJoin(caseFamilyMemberships, eq(caseFamilyAuthorizations.membershipId, caseFamilyMemberships.id))
      .where(and(eq(caseFamilyAuthorizations.id, req.params.grantId), eq(caseFamilyMemberships.certificateId, cert.id)));
    if (!row) fail(404, "Signed authorization not found");
    const nonce = randomBytes(18).toString("base64");
    res.set({
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename="family-sharing-authorization.html"`,
    });
    res.type("html").send(renderSharingDocument(row.grant, row.membership, cert, nonce));
  }));

  app.get("/api/family-access/checklist", authenticated, route(async (req, res) => {
    const id = actorId(req);
    const user = id ? await storage.getUser(id) : undefined;
    if (!user || user.role !== "user" || !user.emailVerified) fail(403, "A verified family account is required.");
    const rows = await db.select({ membership: caseFamilyMemberships, cert: certificates })
      .from(caseFamilyMemberships).innerJoin(certificates, eq(caseFamilyMemberships.certificateId, certificates.id))
      .where(and(eq(caseFamilyMemberships.userId, user.id), eq(caseFamilyMemberships.status, "active")));
    const summaries = await Promise.all(rows.filter(row => row.cert.userId !== user.id)
      .map(row => familySharingSummary(row.membership, row.cert)));
    // Only the case label and this member's requirements are exposed here.
    res.json({ members: summaries.filter(Boolean).map(summary => {
      const { email, grant, membershipStatus, ...safe } = summary!;
      return safe;
    }) });
  }));

  app.get("/api/case/:certId/family-authorizations", authenticated, route(async (req, res) => {
    const { cert, actor } = await manageContext(req);
    const memberships = await db.select().from(caseFamilyMemberships)
      .where(eq(caseFamilyMemberships.certificateId, cert.id));
    const summaries = await Promise.all(memberships.filter(m => m.userId !== cert.userId)
      .map(m => familySharingSummary(m, cert)));
    const owner = cert.userId ? await storage.getUser(cert.userId) : undefined;
    res.json({
      members: summaries.filter(Boolean), ownerName: displayName(owner),
      ownerCanAuthorize: actor.id === cert.userId && memberIdVerified(actor) && await ownerReady(cert, actor),
      agreementVersion: FAMILY_SHARING_VERSION, agreementText: FAMILY_SHARING_TEXT,
    });
  }));

  app.post("/api/case/:certId/family-members/:userId/authorize", authenticated, route(async (req, res) => {
    const { cert, actor } = await manageContext(req);
    if (actor.id !== cert.userId || actor.role !== "user") fail(403, "Only the case owner can sign sharing authorization.");
    const parsed = signatureSchema.extend({ scope: z.enum(["helper", "representative"]) }).parse(req.body);
    if (!memberIdVerified(actor) || !(await ownerReady(cert, actor))) {
      fail(409, "The case owner must complete ID and case authorization checks before sharing private information.");
    }
    if (!sharingSignatureMatches(parsed.typedName, actor)) fail(400, "The signature must match your verified legal name.");
    const grant = await db.transaction(async tx => {
      const [freshCert] = await tx.select().from(certificates).where(eq(certificates.id, cert.id)).for("update");
      if (freshCert?.userId !== actor.id) fail(409, "Case ownership changed. Refresh before signing.");
      const [membership] = await tx.select().from(caseFamilyMemberships).where(and(
        eq(caseFamilyMemberships.certificateId, cert.id), eq(caseFamilyMemberships.userId, req.params.userId),
      )).for("update");
      if (!membership || membership.status !== "active" || membership.userId === cert.userId) fail(404, "Active invited member not found.");
      await tx.update(caseFamilyAuthorizations).set({ revokedAt: new Date() }).where(and(
        eq(caseFamilyAuthorizations.membershipId, membership.id), isNull(caseFamilyAuthorizations.revokedAt),
      ));
      const [created] = await tx.insert(caseFamilyAuthorizations).values({
        membershipId: membership.id, authorizedBy: actor.id, ownerSignature: parsed.typedName,
        agreementVersion: FAMILY_SHARING_VERSION, agreementText: FAMILY_SHARING_TEXT, scope: parsed.scope,
        reviewStatus: parsed.scope === "representative" ? "pending" : "not_requested",
      }).returning();
      await tx.insert(caseEvents).values({
        certificateId: cert.id, actorId: actor.id, actorRole: actor.role, actorName: displayName(actor),
        eventType: "family_sharing_authorized", description: `Signed ${parsed.scope} sharing authorization for member ${membership.userId}; document ${created.id}.`,
      });
      return created;
    });
    res.status(201).json({ success: true, grantId: grant.id });
  }));

  app.post("/api/case/:certId/family-members/:userId/accept-sharing", authenticated, route(async (req, res) => {
    const id = actorId(req);
    if (!id || id !== req.params.userId) fail(403, "You may only accept your own sharing authorization.");
    const user = await storage.getUser(id);
    if (!user || user.role !== "user" || !user.emailVerified || !memberIdVerified(user)) fail(409, "Complete your ID check before accepting sharing.");
    const parsed = signatureSchema.extend({ grantId: z.string().min(1).max(100) }).parse(req.body);
    if (!sharingSignatureMatches(parsed.typedName, user)) fail(400, "The signature must match your verified legal name.");
    await db.transaction(async tx => {
      const [membership] = await tx.select().from(caseFamilyMemberships).where(and(
        eq(caseFamilyMemberships.certificateId, req.params.certId), eq(caseFamilyMemberships.userId, id),
      )).for("update");
      if (!membership || membership.status !== "active") fail(404, "Active invited member not found.");
      const [cert] = await tx.select().from(certificates).where(eq(certificates.id, membership.certificateId));
      const [grant] = await tx.select().from(caseFamilyAuthorizations).where(and(
        eq(caseFamilyAuthorizations.id, parsed.grantId), eq(caseFamilyAuthorizations.membershipId, membership.id),
        isNull(caseFamilyAuthorizations.revokedAt),
      )).for("update");
      if (!cert || !sharingAccess(user, membership, cert.userId, grant).sharingAuthorized) fail(409, "Ask the case owner for current signed sharing authorization.");
      if (!grant.memberAcceptedAt) {
        await tx.update(caseFamilyAuthorizations).set({ memberSignature: parsed.typedName, memberAcceptedAt: new Date() })
          .where(eq(caseFamilyAuthorizations.id, grant.id));
        await tx.insert(caseEvents).values({
          certificateId: cert.id, actorId: id, actorRole: user.role, actorName: displayName(user),
          eventType: "family_sharing_accepted", description: `Member accepted sharing document ${grant.id}.`,
        });
      }
    });
    res.json({ success: true });
  }));

  app.post("/api/admin/case/:certId/family-members/:userId/review-authority", authenticated, route(async (req, res) => {
    const { cert, actor } = await manageContext(req);
    if (actor.role !== "admin") fail(403, "Staff authority review is required.");
    const parsed = z.object({
      grantId: z.string().min(1).max(100), decision: z.enum(["approved", "rejected", "revoked"]),
      reason: z.string().trim().min(10).max(2000), evidenceDocumentId: z.string().min(1).max(100).optional(),
      authorityExpiresAt: z.string().datetime({ offset: true }).optional(),
      expectedReviewedAt: z.string().datetime({ offset: true }).nullable().optional(),
    }).parse(req.body);
    if (parsed.decision === "approved") {
      if (!parsed.authorityExpiresAt || new Date(parsed.authorityExpiresAt).getTime() <= Date.now()) {
        fail(400, "Approval requires a future authority end time based on the reviewed evidence.");
      }
      const evidence = parsed.evidenceDocumentId ? await storage.getFamilyDocument(parsed.evidenceDocumentId) : undefined;
      if (!evidence || evidence.certificateId !== cert.id) fail(400, "Approval requires an authority document attached to this same case.");
    }
    await db.transaction(async tx => {
      const [membership] = await tx.select().from(caseFamilyMemberships).where(and(
        eq(caseFamilyMemberships.certificateId, cert.id), eq(caseFamilyMemberships.userId, req.params.userId),
      )).for("update");
      if (!membership || membership.status !== "active") fail(404, "Active invited member not found.");
      const [member] = await tx.select().from(users).where(eq(users.id, membership.userId));
      const [grant] = await tx.select().from(caseFamilyAuthorizations).where(and(
        eq(caseFamilyAuthorizations.id, parsed.grantId), eq(caseFamilyAuthorizations.membershipId, membership.id),
        isNull(caseFamilyAuthorizations.revokedAt),
      )).for("update");
      const [currentCert] = await tx.select().from(certificates).where(eq(certificates.id, cert.id));
      if (!grant || grant.scope !== "representative" ||
        !member || (parsed.decision !== "revoked" && !sharingAccess(member, membership, currentCert?.userId || null, grant).helperAccess)) {
        fail(409, "A current representative request, verified ID, and accepted sharing agreement are required.");
      }
      // Re-review requires the version displayed to staff. A stale tab must not
      // overwrite a concurrent renewal or revocation.
      if ((grant.reviewedAt?.toISOString() || null) !== (parsed.expectedReviewedAt || null)) {
        fail(409, "Authority review changed. Refresh before recording a new decision.");
      }
      const reviewedAt = new Date(Math.max(Date.now(), (grant.reviewedAt?.getTime() || 0) + 1));
      if (parsed.decision === "approved") {
        const [evidence] = await tx.select().from(familyDocuments).where(and(
          eq(familyDocuments.id, parsed.evidenceDocumentId!), eq(familyDocuments.certificateId, cert.id),
        )).for("share");
        if (!evidence) fail(400, "Approval requires an authority document attached to this same case.");
      }
      if (parsed.decision === "approved" && new Date(parsed.authorityExpiresAt!).getTime() <= reviewedAt.getTime()) {
        fail(400, "The authority end time has already passed.");
      }
      await tx.update(caseFamilyAuthorizations).set({
        reviewStatus: parsed.decision, reviewedBy: actor.id, reviewedAt, reviewReason: parsed.reason,
        authorityExpiresAt: parsed.decision === "approved" ? new Date(parsed.authorityExpiresAt!) : null,
        evidenceDocumentId: parsed.decision === "approved" ? parsed.evidenceDocumentId : null,
      }).where(eq(caseFamilyAuthorizations.id, grant.id));
      await tx.insert(caseEvents).values({
        certificateId: cert.id, actorId: actor.id, actorRole: actor.role, actorName: displayName(actor),
        eventType: "family_representative_reviewed", description: `Representative authority ${parsed.decision} for member ${member.id}; document ${grant.id}. ${JSON.stringify({
          reason: parsed.reason, evidenceDocumentId: parsed.evidenceDocumentId || null,
          authorityExpiresAt: parsed.decision === "approved" ? parsed.authorityExpiresAt : null,
          previousReview: { status: grant.reviewStatus, reviewedBy: grant.reviewedBy, reviewedAt: grant.reviewedAt,
            reason: grant.reviewReason, evidenceDocumentId: grant.evidenceDocumentId, authorityExpiresAt: grant.authorityExpiresAt },
        })}`,
      });
    });
    res.json({ success: true });
  }));
}
