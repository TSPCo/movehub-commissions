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

/**
 * Fuzzy match between an address as written on an invoice and an address
 * from InTouch. Both sides are free text (InTouch's line 1 sometimes carries
 * the town too), so this is deliberately tolerant on wording but strict on
 * the two things that identify a property: the postcode (when both sides
 * give one) and every house/flat number.
 */
export function addressesMatch(invoiceLine: AddressLike, matter: AddressLike): boolean {
  const invPostcode = normalizePostcode(invoiceLine.postcode) ?? normalizePostcode(invoiceLine.address);
  const matterPostcode = normalizePostcode(matter.postcode) ?? normalizePostcode(matter.address);
  if (invPostcode && matterPostcode && invPostcode !== matterPostcode) return false;

  const invTokens = new Set(tokens(invoiceLine.address));
  const matterTokens = tokens(matter.address);

  const matterNumbers = matterTokens.filter((t) => /\d/.test(t));
  if (matterNumbers.some((n) => !invTokens.has(n))) return false;

  const matterWords = matterTokens.filter((t) => !/\d/.test(t) && t.length > 2);
  if (matterWords.length === 0) return matterNumbers.length > 0 && !!invPostcode && invPostcode === matterPostcode;

  // The street name is the first word after the house number; the town word
  // alone must never be enough (31 Mill Lane ≠ 31 Hoplands Road, same town).
  const lastNumberAt = matterTokens.map((t) => /\d/.test(t)).lastIndexOf(true);
  const streetKey = matterTokens.slice(lastNumberAt + 1).find((t) => !/\d/.test(t) && t.length > 2);
  if (streetKey && !invTokens.has(streetKey)) return false;

  const hits = matterWords.filter((w) => invTokens.has(w)).length;
  const postcodeAgrees = !!invPostcode && invPostcode === matterPostcode;
  // Same postcode and same numbers already pins the property down to a handful
  // of doors, so one shared word is enough; without it we need most of them.
  return postcodeAgrees ? hits >= 1 : hits / matterWords.length >= 0.6;
}
