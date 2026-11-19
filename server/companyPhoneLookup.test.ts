import test from "node:test";
import assert from "node:assert/strict";
import {
  contactPages, discoverCompanyPhone, extractPublishedPhone, isPublicAddress,
  normalizeCompanyPhone, sourceUrl,
} from "./companyPhoneLookup";

test("phone normalization supports dialable numbers, not SSNs, short codes or fake NANP", () => {
  assert.equal(normalizeCompanyPhone("(202) 555-0123"), "+12025550123");
  assert.equal(normalizeCompanyPhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizeCompanyPhone("1-800-555-0123;ext=12"), "+18005550123");
  for (const value of ["911", "123-45-6789", "0000000000", "+10000000000", "02079460958"]) {
    assert.equal(normalizeCompanyPhone(value), null, value);
  }
});
test("only published phone evidence is used; scripts, fax and fraud lines are not customer service", () => {
  assert.equal(extractPublishedPhone('<script>const secret="202-555-0123"</script>'), null);
  assert.equal(extractPublishedPhone('<p>Fax: <a href="tel:+12025550123">202-555-0123</a></p>'), null);
  assert.equal(extractPublishedPhone('<p>Fraud hotline: <a href="tel:+12025550123">202-555-0123</a></p>'), null);
  assert.equal(extractPublishedPhone('<p>Customer service <a href="tel:+12025550123">Call us</a></p>'), "+12025550123");
  assert.equal(extractPublishedPhone('<script type="application/ld+json">{"@type":"Organization","telephone":"+12025550123"}</script>'), "+12025550123");
  assert.equal(extractPublishedPhone('<p>Customer support: (202) 555-0123</p>'), "+12025550123");
  const departments = "<p>General Auto 202-555-0101</p><p>General Bank 202-555-0102</p><p>Privacy preferences. Call us at 202-555-0103</p>";
  assert.equal(extractPublishedPhone(departments, "Checking account"), "+12025550102");
  assert.equal(extractPublishedPhone(departments, "Auto loan"), "+12025550101");
});
test("SSRF and redirect protections reject private, metadata, mapped and deceptive addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "192.168.1.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fd00::1", "2001:db8::1", "2002:7f00:1::"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of ["http://bank.example", "https://127.0.0.1/", "https://2130706433/", "https://[::1]/", "https://bank.example:444/", "https://u:p@bank.example/", "https://bank.example/?email=private", "https://bank.example.attacker.com/"]) {
    assert.throws(() => sourceUrl(url, "bank.example"), undefined, url);
  }
  assert.equal(sourceUrl("https://help.bank.example/contact", "bank.example").hostname, "help.bank.example");
  assert.equal(contactPages('<a href="https://evil.example/contact">Contact</a><a href="/contact">Contact</a><a href="http://bank.example/support">Support</a>', "https://bank.example/", "bank.example").length, 1);
});
test("contact-page discovery is source-bound, cached, and has explicit failure states", async () => {
  let reads = 0;
  const fake = async (url: URL) => {
    reads++;
    return { url: url.href, html: url.pathname === "/lookup" ? '<a href="/contact-us">Contact customer service</a>' : '<p>Call support (202) 555-0123</p>' };
  };
  const found = await discoverCompanyPhone("https://bank.example/lookup", "bank.example", true, fake);
  assert.equal(found.evidence?.phone, "+12025550123");
  assert.equal(found.evidence?.sourceUrl, "https://bank.example/contact-us");
  await discoverCompanyPhone("https://bank.example/lookup", "bank.example", false, fake);
  assert.equal(reads, 2);
  assert.equal((await discoverCompanyPhone("https://bank.example/no-phone", "bank.example", true, async url => ({ url: url.href, html: "<p>Email support only</p>" }))).status, "not_found");
  assert.equal((await discoverCompanyPhone("https://bank.example/offline", "bank.example", true, async () => { throw new Error("offline"); })).status, "unavailable");
  assert.equal((await discoverCompanyPhone("https://bank.example/evil", "bank.example", true, async () => ({ url: "https://evil.example/", html: "<p>Call 202-555-0123</p>" }))).status, "unavailable");
});
