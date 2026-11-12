import { test } from "node:test";
import assert from "node:assert/strict";
import { missingInvoiceFields, normalisePostcode, normaliseVatNumber, parseMaxOpenCases, parseStaffDetails } from "./staffDetails";

test("normalises postcodes and rejects junk", () => {
  assert.equal(normalisePostcode("sk4 1aa"), "SK4 1AA");
  assert.equal(normalisePostcode("SW1A1AA"), "SW1A 1AA");
  assert.equal(normalisePostcode("M11AE"), "M1 1AE");
  assert.equal(normalisePostcode("12345"), null);
});

test("normalises VAT numbers", () => {
  assert.equal(normaliseVatNumber("gb 123 4567 89"), "GB123456789");
  assert.equal(normaliseVatNumber("123456789"), "GB123456789");
  assert.equal(normaliseVatNumber("GB123456789001"), "GB123456789001");
  assert.equal(normaliseVatNumber("GB12345"), null);
});

test("max open cases: blank clears, must be a whole number in range", () => {
  assert.deepEqual(parseMaxOpenCases(""), { ok: true, value: null });
  assert.deepEqual(parseMaxOpenCases(null), { ok: true, value: null });
  assert.deepEqual(parseMaxOpenCases("90"), { ok: true, value: 90 });
  assert.deepEqual(parseMaxOpenCases(0), { ok: true, value: 0 });
  assert.equal(parseMaxOpenCases("12.5").ok, false);
  assert.equal(parseMaxOpenCases(-1).ok, false);
  assert.equal(parseMaxOpenCases(501).ok, false);
  assert.equal(parseMaxOpenCases("lots").ok, false);
});

test("VAT number is required only when VAT registered", () => {
  assert.equal(parseStaffDetails({ vatRegistered: true }).ok, false);
  assert.equal(parseStaffDetails({ vatRegistered: true, vatNumber: "nope" }).ok, false);
  const r = parseStaffDetails({ vatRegistered: false, vatNumber: "GB123456789" });
  assert.ok(r.ok && r.details.vatNumber === null);
});

test("trims fields and treats blanks as null", () => {
  const r = parseStaffDetails({ legalName: "  Sam   Rodgers ", addressLine2: "  ", postcode: "sk41aa", maxOpenCases: "" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.details.legalName, "Sam Rodgers");
  assert.equal(r.details.addressLine2, null);
  assert.equal(r.details.postcode, "SK4 1AA");
  assert.equal(r.details.maxOpenCases, null);
});

test("lists what's missing for invoicing", () => {
  assert.deepEqual(missingInvoiceFields(null), ["legal or trading name", "address", "town/city", "postcode"]);
  assert.deepEqual(
    missingInvoiceFields({ legalName: "Sam", addressLine1: "1 High St", city: "Stockport", postcode: "SK4 1AA", vatRegistered: true, vatNumber: null }),
    ["VAT number"]
  );
});
