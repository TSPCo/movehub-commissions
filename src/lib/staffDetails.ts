// Pure parsing/validation for StaffDetails — no server imports, so it's unit-testable
// (see staffDetails.test.ts) and shared by the staff and admin endpoints.

export const MAX_OPEN_CASES_LIMIT = 500;
/** Most open cases a progressor can set for themselves; admins can set more. */
export const STAFF_MAX_OPEN_CASES = 75;

export type StaffDetailsInput = {
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  maxOpenCases: number | null;
};

type Parsed = { ok: true; details: StaffDetailsInput } | { ok: false; error: string };

const clean = (v: unknown, max: number) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** "sw1a1aa" → "SW1A 1AA". Returns null if it isn't a UK postcode shape. */
export function normalisePostcode(raw: string): string | null {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(s)) return null;
  return `${s.slice(0, -3)} ${s.slice(-3)}`;
}

/** "gb 123 4567 89" → "GB123456789". UK VAT numbers are 9 digits (12 for branch traders). */
export function normaliseVatNumber(raw: string): string | null {
  const s = raw.replace(/[\s.-]/g, "").toUpperCase().replace(/^GB/, "");
  if (!/^\d{9}(\d{3})?$/.test(s)) return null;
  return `GB${s}`;
}

export function parseMaxOpenCases(v: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === null || v === undefined || String(v).trim() === "") return { ok: true, value: null };
  const n = Number(String(v).trim());
  if (!Number.isInteger(n) || n < 0 || n > MAX_OPEN_CASES_LIMIT) {
    return { ok: false, error: `Max open cases must be a whole number between 0 and ${MAX_OPEN_CASES_LIMIT}.` };
  }
  return { ok: true, value: n };
}

export function parseStaffDetails(body: Record<string, unknown>): Parsed {
  const vatRegistered = body.vatRegistered === true || body.vatRegistered === "true";

  let postcode = clean(body.postcode, 10);
  if (postcode) {
    const p = normalisePostcode(postcode);
    if (!p) return { ok: false, error: "That doesn't look like a UK postcode." };
    postcode = p;
  }

  let vatNumber: string | null = null;
  if (vatRegistered) {
    const raw = clean(body.vatNumber, 20);
    if (!raw) return { ok: false, error: "Enter your VAT number, or untick “VAT registered”." };
    vatNumber = normaliseVatNumber(raw);
    if (!vatNumber) return { ok: false, error: "A UK VAT number is 9 digits, e.g. GB123456789." };
  }

  const cases = parseMaxOpenCases(body.maxOpenCases);
  if (!cases.ok) return cases;

  return {
    ok: true,
    details: {
      legalName: clean(body.legalName, 120),
      addressLine1: clean(body.addressLine1, 120),
      addressLine2: clean(body.addressLine2, 120),
      city: clean(body.city, 80),
      postcode,
      vatRegistered,
      vatNumber,
      maxOpenCases: cases.value,
    },
  };
}

/** What's still missing before a self-billed invoice can be issued to this person. */
export function missingInvoiceFields(d: Partial<StaffDetailsInput> | null | undefined): string[] {
  const missing: string[] = [];
  if (!d?.legalName) missing.push("legal or trading name");
  if (!d?.addressLine1) missing.push("address");
  if (!d?.city) missing.push("town/city");
  if (!d?.postcode) missing.push("postcode");
  if (d?.vatRegistered && !d.vatNumber) missing.push("VAT number");
  return missing;
}

/**
 * Staff can't set more than STAFF_MAX_OPEN_CASES; admins can. A figure already
 * above the cap (set by an admin, or carried over from Sales Progression) can
 * be kept or lowered — only raising it to something over the cap is blocked.
 */
export function checkStaffCasesLimit(next: number | null, previous: number | null, isAdmin: boolean): string | null {
  if (isAdmin || next == null || next <= STAFF_MAX_OPEN_CASES || (previous != null && next <= previous)) return null;
  return `Max open cases can be at most ${STAFF_MAX_OPEN_CASES}. Ask an admin if you need it higher.`;
}
