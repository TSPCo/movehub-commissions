import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementPeriod, isRolloutMonth, renderAgreement } from "./agreementText";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

test("signing mid-month starts on the 1st of next month and runs 12 months", () => {
  const p = agreementPeriod(new Date("2026-11-12T15:00:00Z"));
  assert.equal(ymd(p.startDate), "2026-12-01");
  assert.equal(ymd(p.endDate), "2027-11-30");
});

test("signing on the 1st (UK time) starts that month", () => {
  const p = agreementPeriod(new Date("2027-01-01T09:00:00Z"));
  assert.equal(ymd(p.startDate), "2027-01-01");
  assert.equal(ymd(p.endDate), "2027-12-31");
  // 23:30 UTC on 31 May is 00:30 on 1 June in the UK
  assert.equal(ymd(agreementPeriod(new Date("2027-05-31T23:30:00Z")).startDate), "2027-06-01");
});

test("a renewal can't start before the current agreement ends", () => {
  const p = agreementPeriod(new Date("2027-10-15T09:00:00Z"), new Date("2027-12-01T00:00:00Z"));
  assert.equal(ymd(p.startDate), "2027-12-01");
  assert.equal(ymd(p.endDate), "2028-11-30");
});

test("agreement text fills in the parties and the VAT status", () => {
  const supplier = { legalName: "Sam Test", addressLine1: "1 High St", addressLine2: null, city: "Stockport", postcode: "SK4 1AA", vatRegistered: false, vatNumber: null };
  const p = agreementPeriod(new Date("2026-11-12T15:00:00Z"));
  const text = renderAgreement({ supplier, ...p, ratePence: 10000 });
  assert.match(text, /Sam Test, of 1 High St, Stockport, SK4 1AA\. Not VAT-registered\./);
  assert.match(text, /from 1 December 2026 to 30 November 2027/);
  assert.match(text, /£100\.00 per completion/);
  assert.match(text, /Ashley Roberts, Founder/);
});

test("launch: a first agreement signed in November 2026 starts 1 November", () => {
  const signed = new Date("2026-11-20T15:00:00Z");
  assert.equal(isRolloutMonth(signed), true);
  const p = agreementPeriod(signed, undefined, true);
  assert.equal(ymd(p.startDate), "2026-11-01");
  assert.equal(ymd(p.endDate), "2027-10-31");
  // 30 Nov 23:30 UTC is still 30 Nov in the UK; 1 Dec 00:30 UK time is not.
  assert.equal(isRolloutMonth(new Date("2026-11-30T23:30:00Z")), true);
  assert.equal(isRolloutMonth(new Date("2026-12-01T00:30:00Z")), false);
});
