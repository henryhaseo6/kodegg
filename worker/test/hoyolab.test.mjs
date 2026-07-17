// Mining kode HoYoLAB: harus KETAT — hanya token dalam kurung/kutip dengan
// konteks "code" di dekatnya. Ini penjaga terhadap false-positive di halaman
// kode (fitur unggulan yang trust-nya wajib dijaga).

import { test } from "node:test";
import assert from "node:assert/strict";

import { mineCodes } from "../src/sources/hoyolab.mjs";

const codes = (t) => [...mineCodes(t).keys()];

test("ambil kode dalam [kurung] dengan konteks 'code' (mixed-case)", () => {
  assert.deepEqual(codes("...redeem the 100 Crystals code [TimeAlbum] to claim."), ["TimeAlbum"]);
});

test("ambil kode dalam \"kutip\" setelah 'redeem code'", () => {
  assert.deepEqual(codes('Use the redeem code "GENSHIN2026" now.'), ["GENSHIN2026"]);
});

test("TOLAK token dalam kurung TANPA konteks kode (mis. [Note])", () => {
  assert.deepEqual(codes("Please read [Important] and [Details] carefully."), []);
});

test("TOLAK teks biasa tanpa kurung/kutip (mis. 'code redemption page')", () => {
  assert.deepEqual(codes("Visit the code redemption page on the website."), []);
});

test("ambil reward yang menyertai bila ada", () => {
  const m = mineCodes("Redeem code [SUMMER26] for 60 Stellar Jade!");
  assert.equal(m.get("SUMMER26")?.reward, "60 Stellar Jade");
});
