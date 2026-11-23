import test from "node:test";
import assert from "node:assert/strict";
import { getAppUrl } from "./email";
import { buildOrsaHeartPlanEmailSequenceDrafts, getOrsaHeartPlanEmailSchedule } from "./orsaEmailSequenceDrafts";

test("builds approved ORSA drafts plus a separately tracked link-recovery follow-up", () => {
  const drafts = buildOrsaHeartPlanEmailSequenceDrafts();
  const expectedDates = ["2026-10-02", "2026-09-29", "2026-10-12", "2026-10-22", "2026-11-01", "2026-11-17", "2026-11-24", "2026-11-30"];
  const appUrl = getAppUrl();

  assert.equal(drafts.length, 8);
  assert.deepEqual(drafts.map(({ suggestedSendDate }) => suggestedSendDate), expectedDates);
  assert.deepEqual(getOrsaHeartPlanEmailSchedule(), drafts.map(({ id, suggestedSendDate }) => ({ id, suggestedSendDate })));

  for (const draft of drafts) {
    assert.equal(draft.status, "unsent");
    assert.equal(draft.fromName, "orsa Credit Union member benefits, powered by Steps After Life");
    assert.ok(draft.subject);
    assert.ok(draft.preheader);
    assert.doesNotMatch(draft.preheader, /[$€£]|\b(?:price|cost|one-time)\b/i);
    assert.ok(draft.preheader.length <= 100);
    assert.match(draft.html, new RegExp(draft.preheader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(draft.ctaUrl, `${appUrl}/heartplan-register?orsa_offer=1`);
    assert.match(draft.html, /src="cid:orsa-logo"/);
    assert.match(draft.html, /background: #28473a/);
    assert.match(draft.html, /ORSA Credit Union/);
    assert.match(draft.html, /Diana Milian<br>CEO, Steps After Life<br>in partnership with ORSA Credit Union/);
    assert.match(draft.html, /href="https?:\/\/[^"]+\/heartplan-register\?orsa_offer=1"/);
    assert.match(draft.text, /\/heartplan-register\?orsa_offer=1/);
    assert.match(draft.html, /\/legal\/privacy/);
    assert.match(draft.html, /\/legal\/terms/);
    assert.match(draft.html, /mailto:hello@stepsafterlife.com\?subject=Unsubscribe/);
    assert.match(draft.html, /Questions\? Contact Steps After Life at hello@stepsafterlife.com/);
    assert.match(draft.text, /Questions\? Contact Steps After Life at hello@stepsafterlife.com/);
    assert.doesNotMatch(draft.html + draft.text, /support@stepsafterlife\.com/);
    assert.match(draft.html, /Steps After Life · 21002 Mack Ave, Grosse Pointe Woods, MI 48236/);
    assert.match(draft.text, /21002 Mack Ave, Grosse Pointe Woods, MI 48236/);
    assert.equal(draft.attachments[0]?.content_id, "orsa-logo");
    assert.equal(draft.attachments[0]?.disposition, "inline");
    assert.equal(draft.attachments[0]?.type, "image/png");
    assert.ok(Buffer.from(draft.attachments[0]!.content, "base64").subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));

    const allCopy = `${draft.subject}\n${draft.preheader}\n${draft.html}\n${draft.text}`;
    assert.match(allCopy, /\$50 one-time for lifetime access through December 1, 2026 at 11:59 p\.m\. ET/);
    assert.match(allCopy, /Complimentary ORSA Legacy access remains active through that deadline/);
    assert.match(allCopy, /After the deadline, HeartPlan is \$149 one-time for lifetime access/);
    assert.doesNotMatch(allCopy, /\$27|\$150|\$500|\$1,500|\$3,000/);
    assert.doesNotMatch(allCopy, /famil(?:y|ies).{0,50}(?:created|already|joined)|(?:created|already|joined).{0,50}famil(?:y|ies)/i);
    assert.doesNotMatch(allCopy, /“|”|under five minutes|less than five minutes|takes? (?:an|one) evening|our team is there to help/i);
    assert.doesNotMatch(draft.html, /href="#"|\[First Name\]|<section class="inbox"/);
  }

  const finalReminder = drafts.find(draft => draft.id === "ends-tomorrow")!;
  assert.match(finalReminder.subject, /Ends tomorrow/i);
  assert.doesNotMatch(finalReminder.subject, /Last day/i);
  assert.match(finalReminder.preheader, /put what matters into words/i);
});

test("escapes the recipient name and supports a no-name sample", () => {
  const named = buildOrsaHeartPlanEmailSequenceDrafts({ recipientName: "<A & 'B'>" })[0]!;
  assert.match(named.html, /Hello <strong>&lt;A<\/strong>/);
  assert.doesNotMatch(named.html, /Hello <strong><A/);
  assert.match(named.text, /Hello <A,/);

  const unnamed = buildOrsaHeartPlanEmailSequenceDrafts()[0]!;
  assert.match(unnamed.html, /<p>Hello,<\/p>/);
  assert.match(unnamed.text, /^Hello,/);
  assert.doesNotMatch(unnamed.html, /\[First Name\]/);
});

test("intro and recovery keep activation copy brief, accurate, and paired with offer terms", () => {
  const drafts = buildOrsaHeartPlanEmailSequenceDrafts();
  for (const id of ["launch-week", "link-recovery"]) {
    const draft = drafts.find(item => item.id === id)!;
    assert.equal(draft.subject, id === "link-recovery" ? "Activate your ORSA HeartPlan account" : "Protect your future and family with HeartPlan");
    assert.equal(draft.preheader, "A simple step today can help the people you love tomorrow.");
    for (const content of [draft.html, draft.text]) {
      assert.match(content, /Activating your account helps protect your future and family\./);
      assert.match(content, /Activate My Account/);
      assert.match(content, /verify your email/i);
      assert.match(content, /\$50 one-time for lifetime access/);
    }
    const body = draft.text.split("\n\nDiana Milian")[0];
    assert.ok(body.trim().split(/\s+/).length <= 140, "Activation body stays brief, including offer terms and backup link");
  }
  const recovery = drafts.find(item => item.id === "link-recovery")!;
  assert.match(recovery.html, /copy this address into your browser/i);
  assert.match(recovery.text, /Backup registration address:/);
  assert.doesNotMatch(recovery.html + recovery.text, /ct\.sendgrid\.net/);
});