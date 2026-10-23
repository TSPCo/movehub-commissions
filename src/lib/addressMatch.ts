const STOPWORDS = new Set(["flat", "apartment", "apt", "the", "and", "uk", "united", "kingdom"]);
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export function normalizePostcode(value: string | null | undefined): string | null {
  const match = value?.match(POSTCODE_RE);
  return match ? `${match[1]}${match[2]}`.toUpperCase() : null;
}

const ABBREVIATIONS: Record<string, string> = {
  rd: "road", st: "street", ave: "avenue", av: "avenue", ln: "lane", dr: "drive", cl: "close",
  ct: "court", cres: "crescent", pl: "place", gdns: "gardens", ter: "terrace", sq: "square", pk: "park",
};

const STREET_TYPES = new Set([
  "road", "street", "avenue", "lane", "drive", "close", "court", "crescent", "place", "gardens", "terrace",
  "square", "park", "way", "view", "grove", "rise", "mews", "walk", "row", "green", "hill",
]);

/** Optimal-string-alignment distance: one insert, delete, substitute or adjacent swap each cost 1. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Equal, or a likely typo of each other. Short words must match exactly
 * (Mill Lane and Hill Lane are different streets); one slip is allowed from
 * five letters, two from nine.
 */
function wordsClose(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const longest = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 4 || longest < 5) return false;
  return editDistance(a, b) <= (longest >= 9 ? 2 : 1);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(POSTCODE_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .filter((t) => t && !STOPWORDS.has(t));
}

export interface AddressLike {
  address: string;
  postcode?: string | null;
}

export type AddressMatch =
  | { kind: "exact" }
  /** Address and house number match but the postcodes are one character apart. */
  | { kind: "postcode-differs"; invoicePostcode: string; matterPostcode: string };

export function formatPostcode(normalized: string): string {
  return `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
}

function oneCharacterApart(a: string, b: string): boolean {
  return a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;
}

/**
 * Fuzzy match between an address as written on an invoice and an address
 * from InTouch. Both sides are free text (InTouch's line 1 sometimes carries
 * the town too), so this is deliberately tolerant on wording but strict on
 * the two things that identify a property: the postcode (when both sides
 * give one) and every house/flat number.
 *
 * A postcode that is a single character out (SR5 vs ST5) is most likely a
 * typo, so it still matches — but only when the address text matches in full
 * without the postcode's help — and the result says so for the caller to flag.
 */
export function matchAddress(invoiceLine: AddressLike, matter: AddressLike): AddressMatch | null {
  const invPostcode = normalizePostcode(invoiceLine.postcode) ?? normalizePostcode(invoiceLine.address);
  const matterPostcode = normalizePostcode(matter.postcode) ?? normalizePostcode(matter.address);

  if (invPostcode && matterPostcode && invPostcode !== matterPostcode) {
    if (!oneCharacterApart(invPostcode, matterPostcode)) return null;
    if (!addressTextMatches(invoiceLine, matter, false)) return null;
    return { kind: "postcode-differs", invoicePostcode: invPostcode, matterPostcode };
  }
  const postcodeAgrees = !!invPostcode && invPostcode === matterPostcode;
  return addressTextMatches(invoiceLine, matter, postcodeAgrees) ? { kind: "exact" } : null;
}

export function addressesMatch(invoiceLine: AddressLike, matter: AddressLike): boolean {
  return matchAddress(invoiceLine, matter)?.kind === "exact";
}

function addressTextMatches(invoiceLine: AddressLike, matter: AddressLike, postcodeAgrees: boolean): boolean {
  const invTokens = new Set(tokens(invoiceLine.address));
  const matterTokens = tokens(matter.address);

  const matterNumbers = matterTokens.filter((t) => /\d/.test(t));
  if (matterNumbers.some((n) => !invTokens.has(n))) return false;

  const matterWords = matterTokens.filter((t) => !/\d/.test(t) && t.length > 2);
  if (matterWords.length === 0) return matterNumbers.length > 0 && postcodeAgrees;

  // The street name is the first word after the house number; the town word
  // alone must never be enough (31 Mill Lane ≠ 31 Hoplands Road, same town).
  const lastNumberAt = matterTokens.map((t) => /\d/.test(t)).lastIndexOf(true);
  const streetKey = matterTokens.slice(lastNumberAt + 1).find((t) => !/\d/.test(t) && t.length > 2);
  const invWords = [...invTokens];
  const invHas = (w: string) => invWords.some((t) => wordsClose(t, w));
  if (streetKey && !invHas(streetKey)) return false;

  // Same postcode and same numbers already pins the property down to a handful
  // of doors, so one shared word is enough.
  if (postcodeAgrees) return matterWords.some(invHas);

  // Without a postcode a missing street type ("118 Hiltingbury" for "118
  // Hiltingbury Road") is fine, but a different one (Road vs View) is not.
  const invHasType = invWords.some((t) => STREET_TYPES.has(t));
  const matterTypes = matterWords.filter((w) => STREET_TYPES.has(w));
  if (invHasType && matterTypes.length > 0 && !matterTypes.some((t) => invTokens.has(t))) return false;

  const expected = invHasType ? matterWords : matterWords.filter((w) => !STREET_TYPES.has(w));
  const needed = expected.length > 0 ? expected : matterWords;
  return needed.filter(invHas).length / needed.length >= 0.6;
}
