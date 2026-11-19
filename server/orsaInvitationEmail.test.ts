import test from "node:test";
import assert from "node:assert/strict";
import { buildOrsaRosterInvitationEmail } from "./email";

test("ORSA roster invitation uses approved branded benefit email with working signup and legal links", () => {
  const email = buildOrsaRosterInvitationEmail({
    recipientEmail: "member@example.test",
    recipientName: "<Member>",
  });

  assert.equal(email.subject, "orsa Credit Union has provided you with a complimentary Heart Plan");
  assert.equal(email.fromName, "orsa Credit Union member benefits, powered by Steps After Life");
  assert.match(email.html, /Your complimentary Heart Plan is ready/);
  assert.match(email.html, /Hello <strong>&lt;Member&gt;<\/strong>/);
  assert.match(email.html, /\/heartplan-register/);
  assert.match(email.html, /\/legal\/privacy/);
  assert.match(email.html, /\/legal\/terms/);
  assert.match(email.html, /mailto:hello@stepsafterlife.com\?subject=Unsubscribe/);
  assert.match(email.html, /Questions\? Contact Steps After Life at hello@stepsafterlife.com/);
  assert.match(email.text || "", /Questions\? Contact Steps After Life at hello@stepsafterlife.com/);
  assert.doesNotMatch(email.html + email.text, /support@stepsafterlife\.com/);
  assert.match(email.html, /Communications consent is optional/);
  assert.match(email.html, /Verify this email address/);
  assert.match(email.html, /complimentary ORSA Heart Plan Legacy access ends December 1, 2026/);
  assert.match(email.html, /Secure lifetime HeartPlan Legacy access for \$50 with a one-time purchase through December 1/);
  assert.match(email.html, /After the deadline, lifetime Legacy costs \$149 as a one-time payment/);
  assert.match(email.html, /If you already have a Steps After Life account, sign in/);
  assert.match(email.text || "", /Secure lifetime HeartPlan Legacy access for \$50 with a one-time purchase through December 1/);
  assert.match(email.text || "", /After the deadline, lifetime Legacy costs \$149 as a one-time payment/);
  assert.doesNotMatch(email.html + email.text, /\$500|\$1,500|\$3,000/);
  assert.doesNotMatch(email.html, /href="#"|<section class="inbox"|\[First Name\]/);
  assert.match(email.html, /src="cid:orsa-logo"/);
  assert.equal(email.attachments?.[0]?.content_id, "orsa-logo");
  assert.equal(email.attachments?.[0]?.disposition, "inline");
  assert.match(email.text || "", /\/heartplan-register/);
  assert.doesNotMatch(email.html + email.text, /\$27|\$150|60.day|\$15(?!\d)|\$100|token=/i);
  assert.deepEqual(email.customArgs, { email_type: "orsa_roster_invitation" });
  assert.equal(email.suppressRecipientLogging, true);
});

test("ORSA roster invitation works without a member name", () => {
  const email = buildOrsaRosterInvitationEmail({ recipientEmail: "member@example.test" });
  assert.match(email.html, /Hello,/);
  assert.doesNotMatch(email.html, /\[First Name\]/);
});