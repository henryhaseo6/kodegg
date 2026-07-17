// Tes LAPISAN VERIFIKASI sumber wiki. Inilah yang menjaga kepercayaan:
// hanya kode aktif, tidak pernah menyebar kode expired atau sampah, dan diam
// (mempertahankan kode lama) saat struktur wiki berubah.
//
// Memakai fixture wikitext (bukan jaringan) agar deterministik. Fungsi internal
// diuji lewat perilaku fetchWiki dengan fetch yang di-stub.

import { test } from "node:test";
import assert from "node:assert/strict";

const UA = "test";

// Wikitext WuWa mini: 1 kode aktif + 1 kode EXPIRED di section berbeda.
const WUWA_WT = `
==Active==
{| class="wikitable"
!Code !! Rewards
|-
|<code>GOODCODE1</code>||{{Card List|Astrite*50;Shell Credit*10000|delim=;}}
|}
==Expired==
{| class="wikitable"
|-
|<code>DEADCODE9</code>||{{Card List|Astrite*10|delim=;}}
|}
`;

// Wiki tanpa section Active sama sekali → struktur berubah.
const NO_ACTIVE_WT = `
==Overview==
Some intro text with a stray <code>NOTACODE</code> that must be ignored.
==Expired==
|<code>OLD1</code>||stuff
`;

// Section Active ada tapi kosong (parser tak menemukan kode) → anggap rusak.
const EMPTY_ACTIVE_WT = `
==Active==
No codes here, just prose.
==Expired==
|<code>OLD2</code>||stuff
`;

// ageDays: umur edit terakhir yang dilaporkan stub (default 1 hari = fresh).
function stubWikitext(wt, ageDays = 1) {
  const ts = new Date(Date.now() - ageDays * 86400000).toISOString();
  return async (url) => {
    const s = String(url);
    if (s.includes("prop=revisions")) {
      return {
        ok: true,
        json: async () => ({ query: { pages: { 1: { revisions: [{ timestamp: ts }] } } } }),
      };
    }
    if (s.includes("action=parse")) {
      return { ok: true, json: async () => ({ parse: { wikitext: { "*": wt } } }) };
    }
    throw new Error(`tak terduga: ${url}`);
  };
}

const oneGame = { wuwa: { name: "Wuthering Waves" } };

async function runWiki(wt) {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(wt);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?t=${Math.random()}`);
    return await fetchWiki({ games: oneGame, userAgent: UA });
  } finally {
    globalThis.fetch = real;
  }
}

test("hanya kode dari section Active — Expired diabaikan total", async () => {
  const r = await runWiki(WUWA_WT);
  const codes = r.items.map((i) => i.code);
  assert.deepEqual(codes, ["GOODCODE1"]);
  assert.ok(!codes.includes("DEADCODE9"), "kode expired tidak boleh muncul");
  assert.ok(r.covered.has("wuwa"));
});

test("reward terparse dari Card List (verbatim + normalisasi jumlah)", async () => {
  const r = await runWiki(WUWA_WT);
  assert.equal(r.items[0].reward, "Astrite ×50 · Shell Credit ×10000");
});

test("section Active hilang (struktur berubah) → GAGAL, bukan menebak", async () => {
  const r = await runWiki(NO_ACTIVE_WT);
  assert.equal(r.items.length, 0);
  assert.ok(!r.covered.has("wuwa"), "game tak boleh ter-cover → kode lama dipertahankan");
  assert.equal(r.failed, 1);
});

test("Active ada tapi 0 kode terparse → GAGAL (jangan kosongkan diam-diam)", async () => {
  const r = await runWiki(EMPTY_ACTIVE_WT);
  assert.equal(r.items.length, 0);
  assert.ok(!r.covered.has("wuwa"));
  assert.equal(r.failed, 1);
});

// Regresi: WuWa menyisipkan kolom "Server" antara kode & reward — reward parser
// harus mencari sel Card List, bukan mengandalkan indeks tetap.
const WUWA_SERVER_COL = `
==Active==
{| class="wikitable"
!Code !! Server !! Rewards
|-
|<code>SRVCODE1</code>||All||{{Card List|Astrite*100;Shell Credit*10000|delim=;}}
|}
`;

// AFK: kode dalam <p>, kolom tanggal di belakang reward (tak boleh ikut).
const AFK_STYLE = `
==Active==
{| class="wikitable"
|-
!Code !! Rewards !! Released
|-
|<p style="color:Orange;">AFKJTEST1</p>||{{Diamonds|1000}}<br/>{{Gold|50k}} || May 18, 2024
|}
==Expired==
|<p style="color:Orange;">DEADAFK</p>||{{Diamonds|1}} || Jan 1, 2020
`;

test("kolom Server WuWa: reward tetap terparse dari sel Card List", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(WUWA_SERVER_COL);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?s=${Math.random()}`);
    const r = await fetchWiki({ games: { wuwa: { name: "Wuthering Waves" } }, userAgent: UA });
    assert.equal(r.items[0].code, "SRVCODE1");
    assert.equal(r.items[0].reward, "Astrite ×100 · Shell Credit ×10000");
  } finally {
    globalThis.fetch = real;
  }
});

test("AFK: kode dari <p>, reward tanpa kolom tanggal, Expired diabaikan", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(AFK_STYLE);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?a=${Math.random()}`);
    const r = await fetchWiki({ games: { afkj: { name: "AFK Journey" } }, userAgent: UA });
    const codes = r.items.map((i) => i.code);
    assert.deepEqual(codes, ["AFKJTEST1"], "hanya Active; DEADAFK diabaikan");
    assert.equal(r.items[0].reward, "Diamonds ×1000 · Gold ×50k", "tanggal 'May 18' tidak ikut");
  } finally {
    globalThis.fetch = real;
  }
});

test("guard kesegaran: wiki basi → AKTIF di-skip & tak covered, tapi ARSIP tetap diambil", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(WUWA_WT, 200); // 200 hari basi
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?stale=${Math.random()}`);
    const r = await fetchWiki({ games: { wuwa: { name: "Wuthering Waves" } }, userAgent: UA });
    assert.equal(r.items.length, 0, "wiki basi tak boleh menyumbang kode AKTIF");
    assert.ok(!r.covered.has("wuwa"), "tak ter-cover → kode aktif lama dipertahankan");
    assert.equal(r.failed, 0, "basi bukan kegagalan — arsip tetap sukses diambil");
    assert.ok(r.expired.has("wuwa:DEADCODE9"), "kode Expired tetap diarsipkan walau wiki basi");
  } finally {
    globalThis.fetch = real;
  }
});

test("guard kesegaran: wiki fresh (<60 hari) → kode diambil normal", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(WUWA_WT, 3); // 3 hari, fresh
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?fresh=${Math.random()}`);
    const r = await fetchWiki({ games: { wuwa: { name: "Wuthering Waves" } }, userAgent: UA });
    assert.deepEqual(r.items.map((i) => i.code), ["GOODCODE1"]);
    assert.ok(r.covered.has("wuwa"));
  } finally {
    globalThis.fetch = real;
  }
});

test("HI3: kode '''bold''' + reward {{Item|Nama|quantity=N}}, hanya Active", async () => {
  const HI3 = `
==Active==
{| class="wikitable"
!Code||Date||Occasion||Rewards
|-
|'''G5MPONNQUT'''||July 11||Event||{{Item|Asterite|rarity=4|quantity=500}}{{Item|Crystals|rarity=5|quantity=100}}
|}
==Expired==
|'''DEADHI3'''||Jan 1||x||{{Item|Asterite|quantity=1}}`;
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(HI3);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?hi3=${Math.random()}`);
    const r = await fetchWiki({ games: { hi3: { name: "Honkai Impact 3rd" } }, userAgent: UA });
    assert.deepEqual(r.items.map((i) => i.code), ["G5MPONNQUT"], "hanya Active; DEADHI3 diabaikan");
    assert.equal(r.items[0].reward, "Asterite ×500 · Crystals ×100");
  } finally {
    globalThis.fetch = real;
  }
});

// --- Parser TEMPLATE (wiki HoYo gi/hsr/zzz) ---

const GI_TEMPLATE = `
==Active Codes==
{{Code Row|GENSHINGLOBAL1|G|Primogem*60;Mora*10000|2026-07-01|unknown}}
{{Code Row|GENSHINCN1|CN|Primogem*100|2026-06-01|indef}}
`;

test("gi template: Code Row aktif + tanggal discovery, reward plain, kode CN dilewati", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(GI_TEMPLATE);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?git=${Math.random()}`);
    const r = await fetchWiki({ games: { gi: { name: "Genshin Impact" } }, userAgent: UA });
    assert.deepEqual(r.items.map((i) => i.code), ["GENSHINGLOBAL1"], "kode CN (GENSHINCN1) dilewati");
    assert.equal(r.items[0].reward, "Primogem ×60 · Mora ×10000");
    assert.equal(r.items[0].date, "2026-07-01T00:00:00.000Z", "tanggal Discovered dipakai");
  } finally {
    globalThis.fetch = real;
  }
});

// HSR: reward {{Item List|…|mode=br}} bersarang, expiry beragam format.
const HSR_TEMPLATE = `
==All Codes==
{{Redemption Code Row|HSRINDEF1|ref=|A|{{Item List|Stellar Jade*100;Credit*50000|mode=br}}|2025-11-07|indef}}
{{Redemption Code Row|HSREXPDATE|ref=<ref name="x" />|A|{{Item List|Stellar Jade*100|mode=br}}|2023-04-26|2023-04-30}}
{{Redemption Code Row|HSREXPTIME|ref=|A|{{Item List|Stellar Jade*60|mode=br}}|2025-08-02|2025-08-03 23:59}}
{{Redemption Code Row|HSREXPKW|ref=|A|{{Item List|Stellar Jade*40|mode=br}}|2026-02-12|exp}}
`;

test("hsr template: reward Item List bersarang; expired via tanggal/jam/1-digit/keyword", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(HSR_TEMPLATE);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?hsrt=${Math.random()}`);
    const r = await fetchWiki({ games: { hsr: { name: "Honkai: Star Rail" } }, userAgent: UA });
    assert.deepEqual(r.items.map((i) => i.code), ["HSRINDEF1"], "hanya indef yang aktif");
    assert.equal(r.items[0].reward, "Stellar Jade ×100 · Credit ×50000", "reward dari Item List bersarang");
    assert.equal(r.items[0].date, "2025-11-07T00:00:00.000Z");
    // Ketiganya expired (tanggal lampau, tanggal+jam, keyword 'exp') → arsip.
    assert.ok(r.expired.has("hsr:HSREXPDATE"), "expiry tanggal lampau → expired");
    assert.ok(r.expired.has("hsr:HSREXPTIME"), "expiry dg jam → expired");
    assert.ok(r.expired.has("hsr:HSREXPKW"), "expiry keyword 'exp' → expired");
    assert.equal(r.expiredItems.filter((i) => i.game === "hsr").length, 3);
  } finally {
    globalThis.fetch = real;
  }
});

test("expired: kode di section Legacy/Expired dikembalikan sebagai expired (sinyal buang)", async () => {
  const WT = `
==Active==
{| class="wikitable"
|-
|<code>ACTIVE1</code>||{{Card List|Astrite*50|delim=;}}
|}
==Expired==
{| class="wikitable"
|-
|<code>DEAD1</code>||stuff
|-
|<code>DEAD2</code>||stuff
|}
==2025==
|<code>DEAD3</code>||old`;
  const real = globalThis.fetch;
  globalThis.fetch = stubWikitext(WT);
  try {
    const { fetchWiki } = await import(`../src/sources/wiki.mjs?exp=${Math.random()}`);
    const r = await fetchWiki({ games: { wuwa: { name: "Wuthering Waves" } }, userAgent: UA });
    assert.deepEqual(r.items.map((i) => i.code), ["ACTIVE1"], "hanya ACTIVE1 yang aktif");
    assert.ok(r.expired.has("wuwa:DEAD1"), "DEAD1 (Expired) ditandai");
    assert.ok(r.expired.has("wuwa:DEAD2"), "DEAD2 (Expired) ditandai");
    assert.ok(r.expired.has("wuwa:DEAD3"), "DEAD3 (section tahun 2025) ditandai");
    assert.ok(!r.expired.has("wuwa:ACTIVE1"), "kode aktif TIDAK ditandai expired");
  } finally {
    globalThis.fetch = real;
  }
});
