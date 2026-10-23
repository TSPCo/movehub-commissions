import test from "node:test";
import assert from "node:assert/strict";
import { addressesMatch, matchAddress, formatPostcode } from "./addressMatch";

const line = (address: string, postcode: string | null = null) => ({ address, postcode });
const matter = (address: string, postcode: string | null) => ({ address, postcode });

test("exact address with matching postcode", () => {
  assert.ok(addressesMatch(line("27 Henderson Road", "NG19 9DJ"), matter("27 Henderson Road", "NG19 9DJ")));
});

test("abbreviations and case are ignored", () => {
  assert.ok(addressesMatch(line("27 henderson rd"), matter("27 Henderson Road", "NG19 9DJ")));
});

test("postcode on the invoice line can be inside the address text", () => {
  assert.ok(addressesMatch(line("27 Henderson Road NG19 9DJ"), matter("27 Henderson Road", "NG19 9DJ")));
});

test("different postcode never matches, even with a perfect address", () => {
  assert.equal(addressesMatch(line("27 Henderson Road", "NG19 9DJ"), matter("27 Henderson Road", "SO53 5NT")), false);
});

test("every house number must be present", () => {
  assert.equal(addressesMatch(line("28 Henderson Road"), matter("27 Henderson Road", "NG19 9DJ")), false);
  assert.equal(addressesMatch(line("Flat 2, 27 Henderson Road"), matter("Flat 3, 27 Henderson Road", "NG19 9DJ")), false);
});

test("the town alone is not enough", () => {
  assert.equal(addressesMatch(line("31 Mill Lane Newtown"), matter("31 Hoplands Road Newtown", "NG19 9DJ")), false);
});

test("typo in the street name, no postcode", () => {
  assert.ok(addressesMatch(line("12 heolf goffa"), matter("12 Heol Goffa", "SA15 3EJ")));
  assert.ok(addressesMatch(line("1 savil drive"), matter("1 Savile Drive", "WF4 6JP")));
  assert.ok(addressesMatch(line("1 Gainsbrough Road"), matter("1 Gainsborough Road", "SR4 8HU")));
  assert.ok(addressesMatch(line("3 Milten Close"), matter("3 Milton Close", "LN4 1TR")));
  assert.ok(addressesMatch(line("30 Oake Road"), matter("30 Oakes Road", "IP32 6PW")));
  assert.ok(addressesMatch(line("114 centenaty way"), matter("114 Centenary Way", "TF10 7GU")));
});

test("swapped letters in the street name, postcode agrees", () => {
  assert.ok(addressesMatch(line("16 Outgnag Lane", "NG19 9DJ"), matter("16 Outgang Lane", "NG19 9DJ")));
});

test("missing street type, no postcode", () => {
  assert.ok(addressesMatch(line("118 Hiltingbury"), matter("118 Hiltingbury Road", "SO53 5NT")));
  assert.ok(addressesMatch(line("40 Alverstone"), matter("40 Alverstone Road", "L18 1HD")));
  assert.ok(addressesMatch(line("14 Winden"), matter("14 Winden Close", "WF3 3JQ")));
  assert.ok(addressesMatch(line("23 langlands"), matter("23 Langlands Road", "BD16 1QJ")));
});

test("a different street type is not a missing one", () => {
  assert.equal(addressesMatch(line("14a South Road"), matter("14a South View", "DN12 1PW")), false);
  assert.equal(addressesMatch(line("31 Mill Lane"), matter("31 Mill Road", "NG19 9DJ")), false);
});

test("short street names must match exactly", () => {
  assert.equal(addressesMatch(line("5 Hill Lane"), matter("5 Mill Lane", "NG19 9DJ")), false);
  assert.equal(addressesMatch(line("5 Park Road"), matter("5 Dark Road", "NG19 9DJ")), false);
});

test("similar but different long street names do not match", () => {
  assert.equal(addressesMatch(line("29 Blackburn Road"), matter("29 Blackthorn Drive", "NG6 8PZ")), false);
  assert.equal(addressesMatch(line("29 Blackburn Road"), matter("29 Oak Drive", "YO7 3RF")), false);
});

test("typo tolerance does not override a house number mismatch", () => {
  assert.equal(addressesMatch(line("2 Gainsbrough Road"), matter("1 Gainsborough Road", "SR4 8HU")), false);
});

test("unrelated street with the same house number", () => {
  assert.equal(addressesMatch(line("3 Milten Close"), matter("3 Farm Drive", "DE24 0HB")), false);
  assert.equal(addressesMatch(line("23 langlands"), matter("23 Wood Lane", "M31 4LT")), false);
});

test("matchAddress: same postcode is an exact match", () => {
  assert.deepEqual(matchAddress(line("27 Henderson Road", "NG19 9DJ"), matter("27 Henderson Road", "NG19 9DJ")), { kind: "exact" });
  assert.deepEqual(matchAddress(line("27 Henderson Road"), matter("27 Henderson Road", "NG19 9DJ")), { kind: "exact" });
});

test("matchAddress: a postcode one character out still matches, and says so", () => {
  assert.deepEqual(matchAddress(line("19 Chatham Road", "ST5 3QA"), matter("19 Chatham Road", "SR5 3QA")), {
    kind: "postcode-differs",
    invoicePostcode: "ST53QA",
    matterPostcode: "SR53QA",
  });
  assert.deepEqual(matchAddress(line("4 Elm Close", "NG19 9DK"), matter("4 Elm Close", "NG19 9DJ")), {
    kind: "postcode-differs",
    invoicePostcode: "NG199DK",
    matterPostcode: "NG199DJ",
  });
});

test("matchAddress: the one-character slip can come from the address text", () => {
  assert.equal(matchAddress(line("19 Chatham Road ST5 3QA"), matter("19 Chatham Road", "SR5 3QA"))?.kind, "postcode-differs");
});

test("matchAddress: street typos are still tolerated alongside a one-character postcode slip", () => {
  assert.equal(matchAddress(line("1 savil drive", "WF4 6JQ"), matter("1 Savile Drive", "WF4 6JP"))?.kind, "postcode-differs");
});

test("matchAddress: two or more characters out is a different postcode", () => {
  assert.equal(matchAddress(line("19 Chatham Road", "ST5 3QB"), matter("19 Chatham Road", "SR5 3QA")), null);
  assert.equal(matchAddress(line("19 Chatham Road", "NG19 9DJ"), matter("19 Chatham Road", "SR5 3QA")), null);
});

test("matchAddress: a different length postcode is not a one-character slip", () => {
  assert.equal(matchAddress(line("19 Chatham Road", "ST15 3QA"), matter("19 Chatham Road", "ST5 3QA")), null);
});

test("matchAddress: a one-character postcode slip never rescues a different property", () => {
  assert.equal(matchAddress(line("20 Chatham Road", "ST5 3QA"), matter("19 Chatham Road", "SR5 3QA")), null);
  assert.equal(matchAddress(line("19 Chatsworth Avenue", "ST5 3QA"), matter("19 Chatham Road", "SR5 3QA")), null);
  assert.equal(matchAddress(line("19 Chatham View", "ST5 3QA"), matter("19 Chatham Road", "SR5 3QA")), null);
  assert.equal(matchAddress(line("5 Hill Lane", "ST5 3QA"), matter("5 Mill Lane", "SR5 3QA")), null);
});

test("matchAddress: a postcode slip needs real words to corroborate, not just numbers", () => {
  assert.equal(matchAddress(line("12", "ST5 3QA"), matter("12", "SR5 3QA")), null);
});

test("addressesMatch only reports exact matches", () => {
  assert.equal(addressesMatch(line("19 Chatham Road", "ST5 3QA"), matter("19 Chatham Road", "SR5 3QA")), false);
});

test("formatPostcode puts the space back", () => {
  assert.equal(formatPostcode("ST53QA"), "ST5 3QA");
  assert.equal(formatPostcode("NG199DJ"), "NG19 9DJ");
});
