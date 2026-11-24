import type { Express, RequestHandler } from "express";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { canFamilyAccessCase } from "./caseAuthorization";
import { caseEvents, nerSearchChecks } from "@shared/schema";
import { NER_OUTCOME_LABELS, nerFamilyReportInput, nerSearchInput, type NerSearchResult } from "@shared/nerSearch";
import { getNerApiUrl } from "./nerAdapter";

type Transport = (input: z.infer<typeof nerSearchInput>, url: string) => Promise<{ status: number; body: unknown }>;
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { httpStatus: status }); };
const normalizeName = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const actorName = (actor: any) => `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || (actor.role === "admin" ? "SAL staff account" : "Family account");

const transport: Transport = async (input, url) => {
  const response = await fetch(`${url}/api/estates/guest-search`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      firstName: input.firstName, lastName: input.lastName,
      yearOfBirth: input.yearOfBirth || "", zipCode: input.zipCode || "", maidenName: input.maidenName || "",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // A web page, payment challenge, or redirect is not an empty result set.
  return { status: response.status, body: response.ok && response.headers.get("content-type")?.includes("application/json") ? await response.json() : null };
};

export function nerProviderResult(status: number, body: any): Pick<NerSearchResult, "source" | "success" | "outcome" | "message" | "results"> {
  const result = (outcome: NerSearchResult["outcome"], results: NerSearchResult["results"] = []) => ({
    source: (outcome.startsWith("completed_") ? "api" : "redirect") as "api" | "redirect",
    success: outcome.startsWith("completed_"), outcome, message: NER_OUTCOME_LABELS[outcome], results,
  });
  if ([301, 302, 303, 307, 308, 401, 402, 403].includes(status)) return result("redirect_required");
  if (status < 200 || status >= 300) return result("unavailable");
  // Do not infer completion from an error, redirect, pending wrapper, or an unknown schema.
  if (body && !Array.isArray(body) && (body.success === false || body.error || body.errors ||
    body.source === "redirect" || body.completed === false || body.requiresPayment || body.requiresVerification ||
    (body.status && !["success", "completed"].includes(body.status)))) return result("unrecognized_response");
  const rows = Array.isArray(body) ? body : body?.success === true && Array.isArray(body.results) ? body.results : null;
  if (!rows || rows.some((row: unknown) => !row || typeof row !== "object" || Array.isArray(row))) return result("unrecognized_response");
  // Guest search candidates only. Never relay private registry rows or grant access to them.
  const field = (value: unknown) => typeof value === "string" ? value.slice(0, 200) : undefined;
  const results = rows.map((row: any) => ({
    principalName: field(row.principalName) || field(row.name),
    documentType: field(row.documentType) || field(row.type),
    jurisdiction: field(row.jurisdiction),
  }));
  if (rows.length && results.some((row: any) => !row.principalName)) return result("unrecognized_response");
  return result(results.length ? "completed_match" : "completed_no_match", results);
}

export function registerNerSearchRoutes(app: Express, authenticated: RequestHandler, searchProvider: Transport = transport) {
  const route = (handler: (req: any, res: any) => Promise<any>): RequestHandler => async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    try { await handler(req, res); }
    catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0]?.message || "Invalid search details." });
      return res.status(error.httpStatus || 503).json({ message: error.httpStatus ? error.message : "Search history could not be saved or confirmed. Review the history before searching again." });
    }
  };
  const getActor = async (req: any) => {
    const id = req.session?.userId || req.user?.claims?.sub;
    const actor = id ? await storage.getUser(id) : undefined;
    if (!actor) fail(401, "Sign in required.");
    return actor!;
  };
  const getCase = async (id: string, actor: any, adminOnly = false) => {
    if (adminOnly && actor.role !== "admin") fail(403, "Staff access required.");
    const certificate = await storage.getCertificate(id);
    if (!certificate) fail(404, "Case not found.");
    if (actor.role !== "admin" && !(await canFamilyAccessCase(certificate, actor.id))) fail(403, "Case access required.");
    return certificate!;
  };

  app.get("/api/ner-external/info", (_req, res) => {
    const url = getNerApiUrl();
    if (!url) return res.status(503).json({ message: "Registry integration is not configured or is invalid." });
    return res.json({
      name: "National Estate Registry",
      url,
      guestSearchUrl: `${url}/guest-search`,
      description: "Search the National Estate Registry to find information about a family member's estate plan. Helps avoid probate delays and locate critical documents.",
      pricing: {
        searchFee: "$3.50",
        foundFee: "$7.00 additional if estate found",
      },
    });
  });

  app.post("/api/ner-external/search", authenticated, route(async (req, res) => {
    const actor = await getActor(req);
    const data = nerSearchInput.parse(req.body);
    if (data.certificateId) await getCase(data.certificateId, actor);
    const url = getNerApiUrl();
    if (!url) return fail(503, "Registry integration is not configured or is invalid.");
    const name = `${data.firstName} ${data.lastName}`;
    // Persist the request before making any external call; no audit write means no search.
    const record = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ner-search:${actor.id}`}))`);
      const recent = await tx.select().from(nerSearchChecks).where(and(
        eq(nerSearchChecks.actorId, actor.id), eq(nerSearchChecks.source, "sal_request"),
        gte(nerSearchChecks.requestedAt, new Date(Date.now() - 3600000)),
      ));
      if (recent.length >= 20) fail(429, "Search limit reached. Review existing results before requesting another search.");
      if (recent.some(row => row.normalizedName === normalizeName(name) && row.requestedAt.getTime() > Date.now() - 30000)) {
        fail(429, "A search for this name was just requested. Review its status before searching again.");
      }
      const [inserted] = await tx.insert(nerSearchChecks).values({
        certificateId: data.certificateId || null, actorId: actor.id, actorName: actorName(actor), actorRole: actor.role || "user",
        searcherName: actorName(actor), searchedName: name, normalizedName: normalizeName(name),
        yearOfBirth: data.yearOfBirth || null, zipCode: data.zipCode || null, maidenName: data.maidenName || null,
        source: "sal_request", outcome: "submitted",
      }).returning();
      return inserted;
    });
    let result: ReturnType<typeof nerProviderResult>;
    try {
      const response = await searchProvider(data, url);
      result = nerProviderResult(response.status, response.body);
    } catch { result = nerProviderResult(503, null); }
    await db.transaction(async tx => {
      await tx.update(nerSearchChecks).set({
        outcome: result.outcome, completedAt: result.source === "api" ? new Date() : null,
        resultCount: result.source === "api" ? result.results.length : null,
      }).where(eq(nerSearchChecks.id, record.id));
      if (data.certificateId) await tx.insert(caseEvents).values({
        certificateId: data.certificateId, actorId: actor.id, actorName: actorName(actor),
        actorRole: actor.role || "user", eventType: "ner_search_recorded",
        description: NER_OUTCOME_LABELS[result.outcome],
      });
    });
    res.json({ ...result, searchUrl: `${url}/guest-search`, historyRecorded: true, caseLinked: !!data.certificateId } satisfies NerSearchResult);
  }));

  for (const adminOnly of [true, false]) {
    const root = adminOnly ? "/api/admin/case/:certId/ner-searches" : "/api/case/:certId/ner-searches";
    app.get(root, authenticated, route(async (req, res) => {
      const actor = await getActor(req);
      const certificate = await getCase(req.params.certId, actor, adminOnly);
      const records = await db.select().from(nerSearchChecks).where(eq(nerSearchChecks.certificateId, certificate.id))
        .orderBy(desc(nerSearchChecks.requestedAt)).limit(50);
      res.json({
        externalHistoryAvailable: false,
        records: records.map(({ actorId: _actorId, certificateId: _certId, normalizedName, ...record }) => ({
          ...record, matchesCaseName: !!normalizedName && normalizedName === normalizeName(certificate.deceasedName),
        })),
      });
    }));
    app.post(`${root}/family-report`, authenticated, route(async (req, res) => {
      const actor = await getActor(req);
      const certificate = await getCase(req.params.certId, actor, adminOnly);
      const data = nerFamilyReportInput.parse(req.body);
      if (new Date(data.searchedAt).getTime() > Date.now() + 60000) fail(400, "A reported search cannot be in the future.");
      const name = `${data.firstName} ${data.lastName}`;
      const record = await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ner-report:${actor.id}`}))`);
        const [total] = await tx.select({ value: count() }).from(nerSearchChecks).where(and(
          eq(nerSearchChecks.actorId, actor.id), eq(nerSearchChecks.source, "family_report"),
          gte(nerSearchChecks.requestedAt, new Date(Date.now() - 3600000)),
        ));
        if (Number(total.value) >= 20) fail(429, "Too many reports. Review the saved history.");
        const [inserted] = await tx.insert(nerSearchChecks).values({
          certificateId: certificate.id, actorId: actor.id, actorName: actorName(actor), actorRole: actor.role || "user",
          searcherName: data.searcherName || (actor.role === "admin" ? "Family (reported)" : actorName(actor)),
          searchedName: name, normalizedName: normalizeName(name), source: "family_report", outcome: "family_reported",
          reportedAt: new Date(data.searchedAt), reportedOutcome: data.result, reportNotes: data.notes || null,
        }).returning();
        await tx.insert(caseEvents).values({
          certificateId: certificate.id, actorId: actor.id, actorName: actorName(actor),
          actorRole: actor.role || "user", eventType: "ner_family_search_reported",
          description: "A reported search was recorded, not independently confirmed by NER.",
        });
        return inserted;
      });
      res.status(201).json({ id: record.id });
    }));
  }
}
