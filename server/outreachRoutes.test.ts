import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { outreachContacts, outreachDeliveries, outreachTemplates } from "@shared/schema";
import { registerOutreachRoutes } from "./outreachRoutes";
import { loadPartnerOverview } from "./partnerOverview";
import { sendEmail } from "./email";

test("admin outreach imports named contacts, preserves details on reimport, saves templates and previews", async () => {
  const app = express();
  const delivered: Parameters<typeof sendEmail>[0][] = [];
  registerOutreachRoutes(app, (_req, _res, next) => next(), (_req, _res, next) => next(), {
    send: async options => { delivered.push(options); return true; },
    unsubscribeAvailable: async () => true,
    deliveryConfigured: () => true,
    isPublished: () => true,
  });
  const suffix = crypto.randomUUID();
  const email = `outreach-test-${suffix}@example.org`;
  const ccEmail = `outreach-copy-${suffix}@example.org`;
  let contactId: string | undefined;
  let templateId: string | undefined;
  let attachedTemplateId: string | undefined;
  const createdTemplateIds: string[] = [];

  async function call(method: string, path: string, body?: unknown, query: Record<string, string> = {}, targetApp = app, params: Record<string, string> = {}) {
    const layer = (targetApp as any).router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method.toLowerCase()]);
    assert.ok(layer, `${method} ${path} exists`);
    const handler = layer.route.stack.at(-1).handle;
    const result: { status: number; body: any } = { status: 200, body: null };
    const response = {
      set: () => response,
      type: () => response,
      status: (value: number) => { result.status = value; return response; },
      json: (value: unknown) => { result.body = value; return response; },
      send: (value: unknown) => { result.body = value; return response; },
    };
    await handler({ body, query, params }, response);
    return result;
  }

  try {
    const importResult = await call("POST", "/api/admin/outreach/import", {
      csv: `Email Address,Name,Company Name\nbad-email,Unknown,Harbor Credit Union\n${email},,Harbor Credit Union\n${email},Pat Johnson,Harbor Credit Union`,
    });
    assert.equal(importResult.status, 200);
    assert.equal(importResult.body.imported, 1);
    assert.equal(importResult.body.skipped, 2);
    assert.deepEqual(importResult.body.skippedRows.map((row: { reason: string }) => row.reason), ["missing or invalid email", "missing name"]);
    const [contact] = await db.select().from(outreachContacts).where(eq(outreachContacts.email, email));
    assert.equal(contact.firstName, "Pat");
    assert.equal(contact.fullName, "Pat Johnson");
    contactId = contact.id;

    let authoredBody = "Dear {{first_name}}, let's talk to {{company_name}}.";
    const saved = await call("POST", "/api/admin/outreach/templates", {
      label: "Partner greeting",
      subject: "Hello {{company_name}}",
      body: authoredBody,
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.body, authoredBody);
    templateId = saved.body.id;
    createdTemplateIds.push(templateId!);
    const revisedBody = "Dear {{first_name}}, let's introduce {{company_name}} to Steps After Life.";
    const editPath = "/api/admin/outreach/templates/:id";
    assert.equal((await call("PATCH", editPath, { label: "", subject: "Hello", body: revisedBody }, {}, app, { id: templateId! })).status, 400);
    assert.equal((await call("PATCH", editPath, { label: "Changed", subject: "Hello", body: revisedBody }, {}, app, { id: "credit_union_intro" })).status, 404);
    const edited = await call("PATCH", editPath, {
      label: "Revised partner greeting", subject: "Hello {{company_name}}", body: revisedBody,
    }, {}, app, { id: templateId! });
    assert.equal(edited.status, 200);
    assert.notEqual(edited.body.id, templateId);
    assert.equal(edited.body.body, revisedBody);
    createdTemplateIds.push(edited.body.id);
    const [archivedOriginal] = await db.select().from(outreachTemplates).where(eq(outreachTemplates.id, templateId!));
    assert.equal(archivedOriginal.body, authoredBody);
    assert.ok(archivedOriginal.archivedAt);
    assert.equal((await call("POST", "/api/admin/outreach/preview", { contactId, templateId })).status, 404);
    assert.equal((await call("PATCH", editPath, { label: "Changed", subject: "Hello", body: revisedBody }, {}, app, { id: templateId! })).status, 404);
    templateId = edited.body.id;
    authoredBody = revisedBody;
    const preview = await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId, ccEmail,
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.to, email);
    assert.match(preview.body.subject, /Harbor Credit Union/);
    assert.match(preview.body.text, /Dear Pat/);
    assert.match(preview.body.text, /To stop receiving partnership emails:/);
    assert.match(preview.body.text, /21002 Mack Ave Grosse Pointe Woods Mi 48236/);
    assert.match(preview.body.html, /21002 Mack Ave Grosse Pointe Woods Mi 48236/);
    assert.equal(preview.body.attachment, null);
    assert.equal((await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId, ccEmail: email,
    })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId, mailingAddress: "Other mailing address",
    })).status, 400);

    const attached = await call("POST", "/api/admin/outreach/templates", {
      label: "Partner one-pager",
      subject: "Overview for {{company_name}}",
      body: "Hi {{first_name}}, I've attached our one-page overview.",
      attachPartnerOverview: true,
    });
    assert.equal(attached.status, 201);
    attachedTemplateId = attached.body.id;
    createdTemplateIds.push(attachedTemplateId!);
    assert.equal(attached.body.attachmentSha256, (await loadPartnerOverview()).sha256);
    const attachmentPreview = await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId: attachedTemplateId,
    });
    assert.equal(attachmentPreview.status, 200);
    assert.equal(attachmentPreview.body.attachment.pages, 1);
    assert.equal(attachmentPreview.body.attachment.sha256, attached.body.attachmentSha256);
    assert.match(attachmentPreview.body.attachment.filename, /\.pdf$/);
    const pdfView = await call("GET", "/api/admin/outreach/partner-overview");
    assert.equal(pdfView.status, 200);
    assert.equal(pdfView.body.subarray(0, 5).toString(), "%PDF-");
    assert.equal(pdfView.body.length, attachmentPreview.body.attachment.size);

    const sendInput = {
      contactIds: [contactId], templateId: attachedTemplateId,
      ccEmail,
    };
    assert.equal((await call("POST", "/api/admin/outreach/send", { ...sendInput, mailingAddress: "Other mailing address" })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/send", { ...sendInput, ccEmail: "invalid" })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/send", { ...sendInput, ccEmail: email })).status, 400);
    assert.equal(delivered.length, 0);
    await db.update(outreachTemplates).set({ attachmentSha256: "0".repeat(64) })
      .where(eq(outreachTemplates.id, attachedTemplateId));
    assert.equal((await call("POST", "/api/admin/outreach/send", sendInput)).status, 503);
    assert.equal(delivered.length, 0);
    await db.update(outreachTemplates).set({ attachmentSha256: attached.body.attachmentSha256 })
      .where(eq(outreachTemplates.id, attachedTemplateId));
    const sendResult = await call("POST", "/api/admin/outreach/send", sendInput);
    assert.equal(sendResult.status, 200);
    assert.equal(sendResult.body.sent, 1);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].to, email);
    assert.equal(delivered[0].fromEmail, "hello@stepsafterlife.com");
    assert.equal(delivered[0].fromName, "Steps After Life");
    assert.equal(delivered[0].replyTo, "hello@stepsafterlife.com");
    assert.equal(delivered[0].cc, ccEmail);
    assert.equal(delivered[0].attachments?.[0].filename, "steps-after-life-logo.png");
    assert.equal(delivered[0].attachments?.[0].disposition, "inline");
    assert.equal(delivered[0].attachments?.[0].content_id, "sal-outreach-logo");
    assert.match(delivered[0].html, /src="cid:sal-outreach-logo"/);
    assert.match(preview.body.html, /src="data:image\/png;base64,/);
    assert.equal(delivered[0].attachments?.[1].filename, attachmentPreview.body.attachment.filename);
    assert.equal(
      crypto.createHash("sha256").update(Buffer.from(delivered[0].attachments![1].content, "base64")).digest("hex"),
      attached.body.attachmentSha256,
    );
    const withoutCc = await call("POST", "/api/admin/outreach/send", {
      contactIds: [contactId], templateId: "credit_union_intro",
    });
    assert.equal(withoutCc.body.sent, 1);
    assert.equal(delivered[1].cc, undefined);
    assert.equal(delivered[1].attachments?.length, 1);
    assert.equal(delivered[1].attachments?.[0].content_id, "sal-outreach-logo");
    const testEmail = `outreach-preview-${suffix}@example.org`;
    const testInput = {
      testEmail, templateId: attachedTemplateId,
      ccEmail,
    };
    assert.equal((await call("POST", "/api/admin/outreach/test-send", { ...testInput, mailingAddress: "Other mailing address" })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/test-send", { ...testInput, testEmail: "invalid" })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/test-send", { ...testInput, testEmail: email })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/test-send", { ...testInput, ccEmail: testEmail })).status, 400);
    assert.equal(delivered.length, 2);
    const testPreview = await call("POST", "/api/admin/outreach/test-preview", testInput);
    assert.equal(testPreview.status, 200);
    assert.equal(testPreview.body.to, testEmail);
    assert.match(testPreview.body.subject, /^\[TEST\]/);
    assert.match(testPreview.body.html, /TEST EMAIL · SAMPLE DETAILS/);
    assert.match(testPreview.body.html, /src="data:image\/png;base64,/);
    assert.match(testPreview.body.text, /21002 Mack Ave Grosse Pointe Woods Mi 48236/);
    assert.doesNotMatch(testPreview.body.html, /href=/);
    assert.equal(testPreview.body.attachment.sha256, attached.body.attachmentSha256);
    const deliveriesBefore = await db.select().from(outreachDeliveries).where(eq(outreachDeliveries.contactId, contactId));
    const [contactBeforeTest] = await db.select().from(outreachContacts).where(eq(outreachContacts.id, contactId));
    const testResult = await call("POST", "/api/admin/outreach/test-send", testInput);
    assert.equal(testResult.status, 200);
    assert.equal(testResult.body.to, testEmail);
    assert.equal(delivered.length, 3);
    assert.equal(delivered[2].to, testEmail);
    assert.equal(delivered[2].fromEmail, "hello@stepsafterlife.com");
    assert.equal(delivered[2].fromName, "Steps After Life");
    assert.equal(delivered[2].replyTo, "hello@stepsafterlife.com");
    assert.equal(delivered[2].cc, ccEmail);
    assert.equal(delivered[2].subject, testPreview.body.subject);
    assert.match(delivered[2].html, /src="cid:sal-outreach-logo"/);
    assert.equal(delivered[2].attachments?.[0].content_id, "sal-outreach-logo");
    assert.equal(delivered[2].attachments?.[1].filename, testPreview.body.attachment.filename);
    const deliveriesAfter = await db.select().from(outreachDeliveries).where(eq(outreachDeliveries.contactId, contactId));
    const [contactAfterTest] = await db.select().from(outreachContacts).where(eq(outreachContacts.id, contactId));
    assert.equal(deliveriesAfter.length, deliveriesBefore.length);
    assert.equal(contactAfterTest.lastSentAt?.getTime(), contactBeforeTest.lastSentAt?.getTime());
    const pdfContent = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF").toString("base64");
    const upload = { filename: "Approved outreach.pdf", content: pdfContent };
    const uploadedInput = { contactIds: [contactId], templateId, attachment: upload };
    assert.equal((await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId, attachment: { ...upload, content: "broken" },
    })).status, 400);
    assert.equal((await call("POST", "/api/admin/outreach/send", {
      ...uploadedInput, attachment: { ...upload, content: "broken" },
    })).status, 400);
    assert.equal(delivered.length, 3);
    assert.equal((await db.select().from(outreachDeliveries).where(eq(outreachDeliveries.templateId, templateId!))).length, 0);
    const uploadedPreview = await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId, attachment: upload,
    });
    assert.equal(uploadedPreview.status, 200);
    assert.equal(uploadedPreview.body.attachment.filename, upload.filename);
    assert.equal(uploadedPreview.body.attachment.size, Buffer.from(pdfContent, "base64").length);
    assert.equal((await call("POST", "/api/admin/outreach/send", uploadedInput)).body.sent, 1);
    assert.equal(delivered[3].attachments?.[1].filename, upload.filename);
    assert.equal(delivered[3].attachments?.[1].content, pdfContent);
    const uploadedOnBuiltin = await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId: "credit_union_intro", attachment: upload,
    });
    assert.equal(uploadedOnBuiltin.status, 200);
    assert.match(uploadedOnBuiltin.body.text, /I've attached a brief overview/);
    assert.equal((await call("POST", "/api/admin/outreach/preview", {
      contactId, templateId: attachedTemplateId, attachment: upload,
    })).status, 400);
    const draftApp = express();
    const draftDelivered: Parameters<typeof sendEmail>[0][] = [];
    registerOutreachRoutes(draftApp, (_req, _res, next) => next(), (_req, _res, next) => next(), {
      send: async options => { draftDelivered.push(options); return true; },
      unsubscribeAvailable: async () => true,
      deliveryConfigured: () => true,
      isPublished: () => false,
    });
    const draftStatus = await call("GET", "/api/admin/outreach", undefined, {}, draftApp);
    assert.equal(draftStatus.body.configured, false);
    assert.equal(draftStatus.body.testConfigured, true);
    assert.equal((await call("POST", "/api/admin/outreach/test-send", testInput, {}, draftApp)).status, 200);
    assert.equal(draftDelivered.length, 1);
    assert.equal((await call("POST", "/api/admin/outreach/send", sendInput, {}, draftApp)).status, 503);
    assert.equal(draftDelivered.length, 1);
    const rejectedApp = express();
    registerOutreachRoutes(rejectedApp, (_req, _res, next) => next(), (_req, _res, next) => next(), {
      send: async () => {
        const error = new Error("Forbidden") as Error & {
          response: { statusCode: number; body: { errors: { field: string }[] } };
        };
        error.response = { statusCode: 403, body: { errors: [{ field: "from" }] } };
        throw error;
      },
      deliveryConfigured: () => true,
      isPublished: () => false,
    });
    const rejectedTest = await call("POST", "/api/admin/outreach/test-send", testInput, {}, rejectedApp);
    assert.equal(rejectedTest.status, 502);
    assert.match(rejectedTest.body.error, /not a verified sender/);

    const reimport = await call("POST", "/api/admin/outreach/import", { csv: `email\n${email}` });
    assert.equal(reimport.status, 200);
    const [preserved] = await db.select().from(outreachContacts).where(eq(outreachContacts.id, contactId));
    assert.equal(preserved.fullName, "Pat Johnson");
    assert.equal(preserved.companyName, "Harbor Credit Union");
    assert.equal(preserved.unsubscribeToken, contact.unsubscribeToken);
    const listed = await call("GET", "/api/admin/outreach", undefined, { page: "1" });
    assert.equal(listed.status, 200);
    assert.ok(listed.body.contacts.some((row: { id: string }) => row.id === contactId));
    assert.ok(listed.body.templates.some((row: { id: string; body: string }) => row.id === templateId && row.body === authoredBody));
    assert.ok(listed.body.total >= 1);
    assert.equal(listed.body.testConfigured, true);
    assert.equal((await call("GET", "/api/admin/outreach", undefined, { page: "-1" })).status, 400);
    const history = await db.select().from(outreachDeliveries).where(eq(outreachDeliveries.templateId, attachedTemplateId!));
    assert.equal(history.length, 1);
    assert.equal((await call("DELETE", "/api/admin/outreach/templates/:id", undefined, {}, app, { id: "credit_union_intro" })).status, 404);
    const deleted = await call("DELETE", "/api/admin/outreach/templates/:id", undefined, {}, app, { id: attachedTemplateId! });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);
    assert.equal((await call("DELETE", "/api/admin/outreach/templates/:id", undefined, {}, app, { id: attachedTemplateId! })).status, 404);
    assert.equal((await call("POST", "/api/admin/outreach/preview", { contactId, templateId: attachedTemplateId })).status, 404);
    assert.equal((await call("POST", "/api/admin/outreach/test-preview", { ...testInput, templateId: attachedTemplateId })).status, 404);
    assert.equal((await call("POST", "/api/admin/outreach/send", sendInput)).status, 404);
    const afterDelete = await call("GET", "/api/admin/outreach", undefined, { page: "1" });
    assert.ok(!afterDelete.body.templates.some((row: { id: string }) => row.id === attachedTemplateId || row.id === saved.body.id));
    const [retainedTemplate] = await db.select().from(outreachTemplates).where(eq(outreachTemplates.id, attachedTemplateId!));
    assert.ok(retainedTemplate.archivedAt);
    assert.equal((await db.select().from(outreachDeliveries).where(eq(outreachDeliveries.templateId, attachedTemplateId!))).length, 1);
  } finally {
    if (contactId) await db.delete(outreachDeliveries).where(eq(outreachDeliveries.contactId, contactId));
    await db.delete(outreachContacts).where(eq(outreachContacts.email, email));
    for (const id of createdTemplateIds) await db.delete(outreachTemplates).where(eq(outreachTemplates.id, id));
  }
});