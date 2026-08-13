// Sumber wuwastatus.com: hanya kode Active, arsip diabaikan, guard kesegaran,
// dan diam saat layout berubah. Fixture HTML (bukan jaringan) → deterministik.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchWuwaStatus } from "../src/sources/wuwastatus.mjs";

const UA = "test";
const games = { wuwa: { name: "Wuthering Waves" } };

// Tanggal "Last updated" WAJIB relatif ke saat tes dijalankan, karena sumbernya
// punya guard kesegaran (MAX_AGE_DAYS = 30) yang membandingkan ke Date.now().
//
// Fixture lama menulis "July 11, 2026" — segar waktu tesnya dibuat, lalu lewat
// ambang 30 hari pada 10 Agu 2026 dan membuat tiga tes ini merah tanpa ada satu
// baris pun berubah di kode produksi (wuwastatus tetap normal: run 13 Agu 2026
// memulangkan 1 kode). Tes yang membusuk sendiri lebih buruk daripada tak ada
// tes: yang merah permanen berhenti dibaca, dan kegagalan asli ikut tenggelam.
// Pola relatif ini sudah dipakai wiki.test.mjs (ageDays); di sini luput.
const BULAN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const hariEN = (mundurHari) => {
  const d = new Date(Date.now() - mundurHari * 86400000);
  return `${BULAN[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

// HTML mini meniru struktur wuwastatus: section Active + Archive terpisah.
function pageHTML({ updated = hariEN(3), active = "", archive = "" }) {
  return `
    <div>Last updated: <strong>${updated}</strong></div>
    <h2>Active Codes</h2>
    ${active}
    <h2>Livestream Code Archive</h2>
    ${archive}
    <h2>How to Redeem</h2>`;
}
const card = (code, tag, rewards) => `
  <div class="code-card ${tag}">
    <span class="code-text" id="code-${code}">${code}</span>
    <button class="copy-btn" data-code="${code}">Copy</button>
    <span class="code-tag ${tag}">${tag}</span>
    <div class="code-rewards"><span class="code-rewards-label">Rewards</span>${rewards}</div>
  </div>`;

function stub(html) {
  return async () => ({ ok: true, text: async () => html });
}

async function run(html) {
  const real = globalThis.fetch;
  globalThis.fetch = stub(html);
  try {
    return await fetchWuwaStatus({ games, userAgent: UA });
  } finally {
    globalThis.fetch = real;
  }
}

test("ambil kode Active (permanen + livestream), abaikan Archive", async () => {
  const html = pageHTML({
    active:
      card("WUTHERINGGIFT", "permanent", "<strong>50 Astrites</strong> · <strong>15,000 Shell Credits</strong>") +
      card("LIVESTREAM35", "livestream", "<strong>100 Astrites</strong>"),
    archive: card("EXPIRED33", "livestream", "<strong>100 Astrites</strong>"),
  });
  const r = await run(html);
  const codes = r.items.map((i) => i.code).sort();
  assert.deepEqual(codes, ["LIVESTREAM35", "WUTHERINGGIFT"]);
  assert.ok(!codes.includes("EXPIRED33"), "kode arsip tidak boleh ikut");
  assert.ok(r.covered.has("wuwa"));
});

test("kartu permanen → perm:true; livestream → perm:false; reward terparse", async () => {
  const html = pageHTML({
    active: card("WUTHERINGGIFT", "permanent", "<strong>50 Astrites</strong> · <strong>15,000 Shell Credits</strong>"),
  });
  const r = await run(html);
  assert.equal(r.items[0].perm, true);
  assert.equal(r.items[0].reward, "50 Astrites · 15,000 Shell Credits");
});

test("reward tidak bocor ke konten setelah div (kartu terakhir)", async () => {
  // Regresi: <strong> di luar div code-rewards (status bar, info versi) tak boleh ikut.
  const html = pageHTML({
    active:
      card("WUTHERINGGIFT", "permanent", "<strong>50 Astrites</strong> · <strong>15,000 Shell Credits</strong>") +
      `<div class="status-bar"><strong>Version 3.5 is now live</strong> · <strong>3.6 Preview</strong></div>`,
  });
  const r = await run(html);
  assert.equal(r.items[0].reward, "50 Astrites · 15,000 Shell Credits", "info versi tak boleh mencemari reward");
});

test("guard kesegaran: 'Last updated' terlalu lama → skip", async () => {
  const html = pageHTML({
    updated: "January 1, 2020",
    active: card("WUTHERINGGIFT", "permanent", "<strong>x</strong>"),
  });
  const r = await run(html);
  assert.equal(r.items.length, 0, "situs basi tak menyumbang kode");
  assert.ok(!r.covered.has("wuwa"));
  assert.equal(r.failed, 1);
});

// Ambang MAX_AGE_DAYS = 30 dipatok dari DUA sisi. Tanpa sisi "masih dipercaya",
// guard yang kelewat ketat (mis. ambang tak sengaja jadi 3 hari) tetap hijau —
// dan sumbernya hilang diam-diam dari produksi, persis kegagalan yang paling
// susah kelihatan karena hasilnya cuma "kode wuwa berkurang".
test("guard kesegaran: 29 hari masih dipercaya, 31 hari ditolak", async () => {
  const isi = card("WUTHERINGGIFT", "permanent", "<strong>50 Astrites</strong>");
  const muda = await run(pageHTML({ updated: hariEN(29), active: isi }));
  assert.deepEqual(muda.items.map((i) => i.code), ["WUTHERINGGIFT"], "29 hari harus lolos");
  assert.equal(muda.failed, 0);

  const tua = await run(pageHTML({ updated: hariEN(31), active: isi }));
  assert.equal(tua.items.length, 0, "31 hari harus ditolak");
  assert.equal(tua.failed, 1);
});

test("layout berubah (section Active hilang) → skip, bukan sampah", async () => {
  const r = await run("<div>Last updated: <strong>July 11, 2026</strong></div><p>redesigned page</p>");
  assert.equal(r.items.length, 0);
  assert.ok(!r.covered.has("wuwa"));
  assert.equal(r.failed, 1);
});

test("section Active ada tapi 0 kode → skip", async () => {
  const r = await run(pageHTML({ active: "<p>No active codes right now.</p>" }));
  assert.equal(r.items.length, 0);
  assert.equal(r.failed, 1);
});
