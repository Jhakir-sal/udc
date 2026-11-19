import test from "node:test";
import assert from "node:assert/strict";
import { formatPhone, phoneDigits } from "./utils";

test("phone enrollment preserves US national digits when a country-code number is pasted", () => {
  for (const value of ["+15555550123", "15555550123", "+1 (555) 555-0123", "5555550123"]) {
    assert.equal(formatPhone(value), "555-555-0123");
    assert.equal(phoneDigits(formatPhone(value)), "5555550123");
  }
});

test("phone formatting remains stable for partial and already-formatted national input", () => {
  assert.equal(formatPhone(""), "");
  assert.equal(formatPhone("55"), "55");
  assert.equal(formatPhone("55555"), "555-55");
  assert.equal(formatPhone("555-555-0123"), "555-555-0123");
  assert.equal(formatPhone(formatPhone("+15555550123")), "555-555-0123");
});
