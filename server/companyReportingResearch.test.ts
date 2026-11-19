import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCompanyDirectorySchema } from "../shared/schema";
import { companyResearchNotes, PRIORITY_COMPANY_REPORTING_RESEARCH } from "../shared/companyReportingResearch";

test("all eight priorities have dated official-source research that fits the directory", () => {
  assert.deepEqual(PRIORITY_COMPANY_REPORTING_RESEARCH.map((r) => r.officialDomain).sort(),
    ["att.com", "bankofamerica.com", "chase.com", "consumersenergy.com", "dteenergy.com", "schwab.com", "ssa.gov", "verizon.com"]);
  for (const research of PRIORITY_COMPANY_REPORTING_RESEARCH) {
    const source = research.sources.map((s) => s.url).join("\n");
    const notes = companyResearchNotes(research);
    assert.ok(createCompanyDirectorySchema.safeParse({ ...research, source, notes }).success, research.name);
    assert.match(research.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(research.department && research.channels && research.documents && research.limitations);
    assert.match(notes, /Pending staff routing review; NOT email-ready/);
    assert.equal("notificationEmail" in research, false);
    for (const { url } of research.sources) {
      const parsed = new URL(url);
      assert.equal(parsed.protocol, "https:");
      assert.ok(parsed.hostname === research.officialDomain || parsed.hostname.endsWith(`.${research.officialDomain}`) ||
        (research.officialDomain === "ssa.gov" && parsed.hostname === "www.usa.gov"), url);
    }
  }
});

test("SSA uses official reporting and Consumers distinguishes takeover from estate settlement", () => {
  const ssa = PRIORITY_COMPANY_REPORTING_RESEARCH.find((r) => r.officialDomain === "ssa.gov")!;
  assert.match(ssa.channels, /Funeral homes generally report/);
  assert.match(ssa.channels, /800-772-1213/);
  assert.match(ssa.limitations, /not accepted by email or online/);
  const consumers = PRIORITY_COMPANY_REPORTING_RESEARCH.find((r) => r.officialDomain === "consumersenergy.com")!;
  assert.match(consumers.documents, /staff must confirm/);
  assert.match(consumers.limitations, /not a general estate settlement/);
});

test("research recording requires authenticated admin confirmation and only fills empty metadata", () => {
  const handler = readFileSync(new URL("./companyReportingResearch.ts", import.meta.url), "utf8");
  assert.match(handler, /isAuthenticated, isAdmin, async/);
  assert.match(handler, /req\.body\?\.confirm !== "record-research-only"/);
  assert.match(handler, /db\.transaction/);
  assert.match(handler, /target: companyDirectory\.officialDomain/);
  assert.match(handler, /coalesce\(nullif\(trim\(\$\{companyDirectory.source\}\), ''\), excluded.source\)/);
  assert.match(handler, /coalesce\(nullif\(trim\(\$\{companyDirectory.notes\}\), ''\), excluded.notes\)/);
  assert.doesNotMatch(handler, /sendEmail|sendSms|notificationEmail:|verifiedAt:|verifiedBy:|companyDeathNotices|certificateRelease/);
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /registerCompanyReportingResearch\(app, isAuthenticated, isAdmin\)/);
});
