import test from "node:test";
import assert from "node:assert/strict";
import { addressesMatch } from "./addressMatch";

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
