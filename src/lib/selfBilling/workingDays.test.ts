import { test } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, iso, isDeemedAccepted, issueDeadline, lastDayOfMonth, londonDate, paymentDue, queryDeadline } from "./workingDays";

test("skips weekends", () => {
  // Fri 13 Nov 2026 + 1 working day = Mon 16 Nov
  assert.equal(iso(addWorkingDays({ y: 2026, m: 11, d: 13 }, 1)), "2026-11-16");
});

test("skips England & Wales bank holidays, including substitute days", () => {
  // Thu 24 Dec 2026 + 1 → Christmas (Fri) and Boxing Day substitute (Mon 28) skipped → Tue 29
  assert.equal(iso(addWorkingDays({ y: 2026, m: 12, d: 24 }, 1)), "2026-12-29");
  // Easter 2027: Good Friday 26 Mar, Easter Monday 29 Mar
  assert.equal(iso(addWorkingDays({ y: 2027, m: 3, d: 25 }, 1)), "2027-03-30");
});

test("issue deadline is 3 working days after month end", () => {
  assert.deepEqual(lastDayOfMonth(2026, 11), { y: 2026, m: 11, d: 30 });
  assert.equal(iso(issueDeadline(2026, 11)), "2026-12-03"); // Mon 30 Nov → Tue, Wed, Thu
  assert.equal(iso(issueDeadline(2026, 12)), "2027-01-06"); // Thu 31 Dec → Jan 1 holiday, weekend → Mon 4, Tue 5, Wed 6
  assert.equal(iso(lastDayOfMonth(2028, 2)), "2028-02-29");
});

test("UK date of an instant follows British Summer Time", () => {
  // 23:30 UTC on 31 Mar 2027 is 00:30 BST on 1 Apr
  assert.equal(iso(londonDate(new Date("2027-03-31T23:30:00Z"))), "2027-04-01");
  assert.equal(iso(londonDate(new Date("2026-12-31T23:30:00Z"))), "2026-12-31");
});

test("deemed acceptance after 5 working days with no query", () => {
  const issued = new Date("2026-12-02T10:00:00Z"); // Wed
  assert.equal(iso(queryDeadline(issued)), "2026-12-09"); // Thu, Fri, Mon, Tue, Wed
  assert.equal(isDeemedAccepted(issued, new Date("2026-12-09T22:00:00Z")), false);
  assert.equal(isDeemedAccepted(issued, new Date("2026-12-10T08:00:00Z")), true);
});

test("payment due 10 calendar days after acceptance", () => {
  assert.equal(iso(paymentDue(new Date("2026-12-10T08:00:00Z"))), "2026-12-20");
});
