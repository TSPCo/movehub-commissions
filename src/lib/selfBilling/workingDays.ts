// Working-day maths for the self-billing deadlines (issue within 3 working days
// of month end; deemed acceptance after 5 working days). Working days exclude
// weekends and England & Wales bank holidays, counted on UK (Europe/London)
// calendar dates. Pure — unit-tested in workingDays.test.ts.

// From https://www.gov.uk/bank-holidays.json (england-and-wales). Extend each
// year; dates beyond the last listed year fall back to weekends only, with a
// warning, rather than failing.
const BANK_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  // 2027
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
  // 2028
  "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
]);
export const BANK_HOLIDAYS_LAST_YEAR = 2028;

/** A plain calendar date, no time or zone. */
export type DateOnly = { y: number; m: number; d: number };

export const iso = ({ y, m, d }: DateOnly) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The UK calendar date an instant falls on. */
export function londonDate(at: Date): DateOnly {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function addDays(date: DateOnly, n: number): DateOnly {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

let warned = false;
export function isWorkingDay(date: DateOnly): boolean {
  const dow = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (date.y > BANK_HOLIDAYS_LAST_YEAR && !warned) {
    warned = true;
    console.warn(`[workingDays] no bank holidays listed for ${date.y} — update BANK_HOLIDAYS in src/lib/selfBilling/workingDays.ts`);
  }
  return !BANK_HOLIDAYS.has(iso(date));
}

/** The nth working day after `date` (not counting `date` itself). */
export function addWorkingDays(date: DateOnly, n: number): DateOnly {
  let cur = date;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isWorkingDay(cur)) left--;
  }
  return cur;
}

export function compareDates(a: DateOnly, b: DateOnly) {
  return iso(a) < iso(b) ? -1 : iso(a) > iso(b) ? 1 : 0;
}

export const lastDayOfMonth = (year: number, month: number): DateOnly =>
  addDays({ y: month === 12 ? year + 1 : year, m: month === 12 ? 1 : month + 1, d: 1 }, -1);

/** Last UK date by which a month's self-billed invoice should be issued: 3 working days after month end. */
export const issueDeadline = (year: number, month: number) => addWorkingDays(lastDayOfMonth(year, month), 3);

/**
 * Last UK date on which an issued invoice can still be queried. With no query by
 * the end of this day it is treated as accepted: 5 working days after the
 * day the clock started (issue, or an admin confirming a queried invoice).
 */
export const queryDeadline = (clockFrom: Date) => addWorkingDays(londonDate(clockFrom), 5);

/** Deemed accepted once the UK date is past the query deadline. */
export const isDeemedAccepted = (clockFrom: Date, now: Date) => compareDates(londonDate(now), queryDeadline(clockFrom)) > 0;

/** Payment due date: 10 calendar days after acceptance. */
export const paymentDue = (acceptedAt: Date) => addDays(londonDate(acceptedAt), 10);

export const formatDateOnly = (d: DateOnly) =>
  new Date(Date.UTC(d.y, d.m - 1, d.d)).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
