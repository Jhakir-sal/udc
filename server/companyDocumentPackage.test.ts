import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildCompanyDocumentPackage, certificateFilename } from "./companyDocumentPackage";

test("reviewed certificate and signed LPOA are downloaded together, without other files", () => {
  const certificate = Buffer.from("%PDF-test-certificate");
  const lpoa = "<!doctype html><html><body>Signed LPOA</body></html>";
  const files = unzipSync(buildCompanyDocumentPackage(certificate, "application/pdf", lpoa));
  assert.deepEqual(Object.keys(files).sort(), ["death-certificate.pdf", "signed-lpoa.html"]);
  assert.deepEqual(Buffer.from(files["death-certificate.pdf"]), certificate);
  assert.equal(strFromU8(files["signed-lpoa.html"]), lpoa);
});

test("certificate filenames come only from an approved content type", () => {
  assert.equal(certificateFilename("image/jpeg; charset=binary"), "death-certificate.jpg");
  assert.throws(() => certificateFilename("text/html"), /Unsupported/);
  assert.throws(() => buildCompanyDocumentPackage(Buffer.alloc(0), "application/pdf", "<html/>"), /Both reviewed/);
});