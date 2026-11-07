// Pure helpers for UK bank details: validating what staff enter, masking for
// display, and comparing saved details with what an invoice says. No secrets
// or database here, so it's unit-testable (see bankMatch.test.ts).

export interface BankDetails {
  accountName: string;
  sortCode: string; // 6 digits, no separators
  accountNumber: string; // 8 digits
}

export const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function formatSortCode(sortCode: string) {
  const d = digitsOnly(sortCode);
  return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : sortCode;
}

export const maskAccountNumber = (accountNumber: string) => `••••${digitsOnly(accountNumber).slice(-4)}`;
export const maskSortCode = (sortCode: string) => `••-••-${digitsOnly(sortCode).slice(-2)}`;

/** Validates and normalises what someone typed. Returns an error message, or the cleaned details. */
export function parseBankDetails(input: {
  accountName?: unknown;
  sortCode?: unknown;
  accountNumber?: unknown;
}): { ok: true; details: BankDetails } | { ok: false; error: string } {
  const accountName = typeof input.accountName === "string" ? input.accountName.trim().replace(/\s+/g, " ") : "";
  const sortCodeRaw = typeof input.sortCode === "string" ? input.sortCode.trim() : "";
  const accountNumberRaw = typeof input.accountNumber === "string" ? input.accountNumber.trim() : "";

  if (accountName.length < 2 || accountName.length > 70) {
    return { ok: false, error: "Enter the name on the account (as your bank shows it)." };
  }
  if (!/^\d{2}[- ]?\d{2}[- ]?\d{2}$/.test(sortCodeRaw)) {
    return { ok: false, error: "Sort code should be 6 digits, e.g. 12-34-56." };
  }
  if (!/^\d{8}$/.test(accountNumberRaw.replace(/[\s-]/g, ""))) {
    return { ok: false, error: "Account number should be 8 digits (add leading zeros if your bank gives you fewer)." };
  }
  return { ok: true, details: { accountName, sortCode: digitsOnly(sortCodeRaw), accountNumber: digitsOnly(accountNumberRaw) } };
}

const NAME_NOISE = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "ltd", "limited", "t/a", "ta", "the"]);

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t));
}

/**
 * Account names are written loosely on invoices ("S Rodgers", "Mr Sam Rodgers",
 * "SAM RODGERS LTD"), so this is forgiving: every word of the shorter name must
 * appear in the longer one, where a single letter counts as a matching initial.
 */
export function accountNamesMatch(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.some((u) => u === t || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u))));
}

export type BankCheckOutcome =
  | "MATCHED" // sort code + account number both match what's on file
  | "MISMATCH" // a sort code or account number on the invoice differs from what's on file
  | "NOT_ON_INVOICE" // details on file, but the invoice doesn't show any
  | "NO_DETAILS_ON_FILE"; // nothing saved for this person, so nothing to compare

export interface BankCheck {
  outcome: BankCheckOutcome;
  sortCodeMatches: boolean | null; // null = not on the invoice
  accountNumberMatches: boolean | null;
  accountNameMatches: boolean | null;
  /** Masked only — full numbers are never stored in the check result. */
  invoiceSortCode: string | null;
  invoiceAccountLast4: string | null;
  savedSortCode: string | null;
  savedAccountLast4: string | null;
  invoiceAccountName: string | null;
}

export function compareBankDetails(
  saved: BankDetails | null,
  invoice: { accountName?: string | null; sortCode?: string | null; accountNumber?: string | null } | null
): BankCheck {
  const invSort = digitsOnly(invoice?.sortCode);
  const invAcc = digitsOnly(invoice?.accountNumber);
  const invName = invoice?.accountName?.trim() || null;
  const hasSort = invSort.length > 0;
  const hasAcc = invAcc.length > 0;

  const base = {
    invoiceSortCode: hasSort ? maskSortCode(invSort) : null,
    invoiceAccountLast4: hasAcc ? invAcc.slice(-4) : null,
    savedSortCode: saved ? maskSortCode(saved.sortCode) : null,
    savedAccountLast4: saved ? saved.accountNumber.slice(-4) : null,
    invoiceAccountName: invName,
  };

  if (!saved) {
    return { ...base, outcome: "NO_DETAILS_ON_FILE", sortCodeMatches: null, accountNumberMatches: null, accountNameMatches: null };
  }

  // Leading zeros sometimes get dropped on invoices, so pad short account numbers.
  const sortCodeMatches = hasSort ? invSort === saved.sortCode : null;
  const accountNumberMatches = hasAcc ? invAcc.padStart(8, "0") === saved.accountNumber : null;
  const accountNameMatches = invName ? accountNamesMatch(invName, saved.accountName) : null;

  let outcome: BankCheckOutcome;
  if (sortCodeMatches === false || accountNumberMatches === false) outcome = "MISMATCH";
  else if (sortCodeMatches === null && accountNumberMatches === null) outcome = "NOT_ON_INVOICE";
  else outcome = "MATCHED";

  return { ...base, outcome, sortCodeMatches, accountNumberMatches, accountNameMatches };
}

/** Flags for the invoice check, worded for whoever is about to pay it. */
export function bankCheckFlags(check: BankCheck, changedSinceLastPaymentAt: Date | null): string[] {
  const flags: string[] = [];
  if (check.outcome === "MISMATCH") {
    const parts: string[] = [];
    if (check.sortCodeMatches === false) parts.push(`sort code ${check.invoiceSortCode} vs ${check.savedSortCode} on file`);
    if (check.accountNumberMatches === false) {
      parts.push(`account ending ${check.invoiceAccountLast4} vs ${check.savedAccountLast4} on file`);
    }
    flags.push(`Bank details on the invoice don't match the ones saved for this person (${parts.join("; ")}). Don't pay until confirmed with them directly.`);
  }
  if (check.outcome === "NO_DETAILS_ON_FILE" && (check.invoiceSortCode || check.invoiceAccountLast4)) {
    flags.push("This person hasn't saved bank details in the app, so the account on the invoice can't be verified.");
  }
  if (check.outcome === "MATCHED" && check.sortCodeMatches === null) {
    flags.push("Invoice shows an account number but no sort code — check the sort code before paying.");
  }
  if (check.outcome === "MATCHED" && check.accountNumberMatches === null) {
    flags.push("Invoice shows a sort code but no account number — check the account before paying.");
  }
  if (check.accountNameMatches === false) {
    flags.push(`Account name on the invoice ("${check.invoiceAccountName}") doesn't look like the name saved for this person.`);
  }
  if (changedSinceLastPaymentAt) {
    flags.push(
      `Bank details were changed on ${changedSinceLastPaymentAt.toLocaleDateString("en-GB")}, since their last paid invoice — confirm the new account with them (not by replying to an email) before paying.`
    );
  }
  return flags;
}
