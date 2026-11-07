import { test } from "node:test";
import assert from "node:assert/strict";
import { accountNamesMatch, bankCheckFlags, compareBankDetails, parseBankDetails } from "./bankMatch";

const saved = { accountName: "Sam Rodgers", sortCode: "123456", accountNumber: "01234567" };

test("parses and normalises entered details", () => {
  const r = parseBankDetails({ accountName: "  Sam   Rodgers ", sortCode: "12-34-56", accountNumber: "0123 4567" });
  assert.deepEqual(r, { ok: true, details: saved });
});

test("rejects bad sort codes and account numbers", () => {
  assert.equal(parseBankDetails({ accountName: "Sam", sortCode: "12345", accountNumber: "01234567" }).ok, false);
  assert.equal(parseBankDetails({ accountName: "Sam", sortCode: "123456", accountNumber: "1234567" }).ok, false);
  assert.equal(parseBankDetails({ accountName: "", sortCode: "123456", accountNumber: "01234567" }).ok, false);
});

test("names match loosely", () => {
  assert.ok(accountNamesMatch("MR SAM RODGERS", "Sam Rodgers"));
  assert.ok(accountNamesMatch("S Rodgers", "Sam Rodgers"));
  assert.ok(accountNamesMatch("Sam Rodgers Ltd", "Sam Rodgers"));
  assert.ok(!accountNamesMatch("Jo Bloggs", "Sam Rodgers"));
});

test("matching details pass with no flags", () => {
  const c = compareBankDetails(saved, { accountName: "Mr S Rodgers", sortCode: "12 34 56", accountNumber: "01234567" });
  assert.equal(c.outcome, "MATCHED");
  assert.deepEqual(bankCheckFlags(c, null), []);
});

test("a dropped leading zero still matches", () => {
  assert.equal(compareBankDetails(saved, { sortCode: "12-34-56", accountNumber: "1234567" }).outcome, "MATCHED");
});

test("different account number is a mismatch and never stores full numbers", () => {
  const c = compareBankDetails(saved, { accountName: "Sam Rodgers", sortCode: "12-34-56", accountNumber: "99998888" });
  assert.equal(c.outcome, "MISMATCH");
  assert.equal(c.accountNumberMatches, false);
  assert.ok(!JSON.stringify(c).includes("99998888"));
  assert.ok(!JSON.stringify(c).includes("01234567"));
  assert.match(bankCheckFlags(c, null)[0], /don't match/);
});

test("different sort code is a mismatch", () => {
  assert.equal(compareBankDetails(saved, { sortCode: "65-43-21", accountNumber: "01234567" }).outcome, "MISMATCH");
});

test("no bank details on the invoice is not flagged", () => {
  const c = compareBankDetails(saved, null);
  assert.equal(c.outcome, "NOT_ON_INVOICE");
  assert.deepEqual(bankCheckFlags(c, null), []);
});

test("invoice details but nothing on file is flagged", () => {
  const c = compareBankDetails(null, { sortCode: "123456", accountNumber: "01234567" });
  assert.equal(c.outcome, "NO_DETAILS_ON_FILE");
  assert.equal(bankCheckFlags(c, null).length, 1);
});

test("wrong name alone is flagged but numbers still match", () => {
  const c = compareBankDetails(saved, { accountName: "Jo Bloggs", sortCode: "123456", accountNumber: "01234567" });
  assert.equal(c.outcome, "MATCHED");
  assert.match(bankCheckFlags(c, null)[0], /Account name/);
});

test("recently changed details are flagged", () => {
  const c = compareBankDetails(saved, { sortCode: "123456", accountNumber: "01234567" });
  assert.match(bankCheckFlags(c, new Date("2026-11-01"))[0], /changed on 01\/11\/2026/);
});

test("suggests the most recent paid invoice's account and lists others", async () => {
  const { suggestFromInvoices } = await import("./bankMatch");
  const r = (id: string, date: string, paid: boolean, read: InvoiceRead) => ({ invoiceId: id, fileName: `${id}.pdf`, createdAt: new Date(date), paid, read });
  type InvoiceRead = { accountName?: string; sortCode?: string; accountNumber?: string } | null;
  const s = suggestFromInvoices([
    r("a", "2026-08-01", true, { accountName: "Sam Rodgers", sortCode: "12-34-56", accountNumber: "1234567" }),
    r("b", "2026-09-01", true, { accountName: "Sam Rodgers", sortCode: "123456", accountNumber: "01234567" }),
    r("c", "2026-10-01", false, { accountName: "Sam R", sortCode: "99-88-77", accountNumber: "55556666" }),
    r("d", "2026-10-05", false, null),
  ]);
  assert.deepEqual(s.suggestion, { accountName: "Sam Rodgers", sortCode: "12-34-56", accountNumber: "01234567" });
  assert.equal(s.agreeing, 2);
  assert.equal(s.invoicesWithDetails, 3);
  assert.equal(s.otherAccounts.length, 1);
  assert.equal(s.otherAccounts[0].accountLast4, "6666");
  assert.match(s.basis!, /paid invoice \(b\.pdf/);
});

test("no readable bank details means no suggestion", async () => {
  const { suggestFromInvoices } = await import("./bankMatch");
  const s = suggestFromInvoices([{ invoiceId: "x", fileName: "x.pdf", createdAt: new Date(), paid: true, read: { sortCode: "12" } }]);
  assert.equal(s.suggestion, null);
});
