// Adapter destructoid (sources/editorial.mjs) — pemisahan section aktif↔expired.
// Fixture HTML (bukan jaringan) → deterministik.
//
// Ada di sini karena batas section-nya rapuh dengan cara yang khas: halaman
// destructoid menyebut kata "Expired" DUA kali — sekali sebagai judul section,
// sekali di prosa penutup ("kirim ke Expired list"). Memotong pada teks (seperti
// adapter situs lain) akan memotong di tempat yang salah, dan efeknya bukan
// meleset sedikit: seluruh daftar aktif pindah ke sisi expired → semua kode
// hidup diarsipkan sekaligus. Karena itu potongannya memakai atribut id heading.

import { test } from "node:test";
import assert from "node:assert/strict";

import { SITES } from "../src/sources/editorial.mjs";

const li = (code, reward) => `<li><strong>${code}</strong>—Redeem for ${reward}</li>`;

// Meniru struktur asli: heading ber-id, list <li><strong>, sisipan iklan/newsletter
// di tengah list, lalu prosa penutup yang menyebut "Expired list" sekali lagi.
function pageHTML({ aktif = "", expired = "" } = {}) {
  return `
    <h2 id="h-all-nikke-codes-list" class="wp-block-heading">All Nikke codes list</h2>
    <h3 id="h-active-nikke-codes" class="wp-block-heading">Active Nikke codes</h3>
    <ul class="wp-block-list">${aktif}</ul>
    <h3 id="h-expired-nikke-codes" class="wp-block-heading">Expired Nikke codes</h3>
    <ul class="wp-block-list">${expired}</ul>
    <h2 id="h-how-to-redeem" class="wp-block-heading">How to redeem</h2>
    <p>Tell us and we will move it to our Expired list, and we will quickly update our guide.</p>`;
}

test("kode dipisah menurut heading, bukan kemunculan kata 'Expired'", () => {
  const html = pageHTML({ aktif: li("PROTECTARKSTAR", "600 gems"), expired: li("NIKKE2023", "free rewards") });
  const { active, expired } = SITES.destructoid.parse(html);
  assert.deepEqual(
    active.map((c) => c.code),
    ["PROTECTARKSTAR"],
  );
  assert.deepEqual(expired, ["NIKKE2023"]);
});

test("prosa 'Expired list' di penutup tak menelan daftar aktif", () => {
  // Tanpa section expired sama sekali: satu-satunya kata "Expired" yang tersisa
  // ada di prosa penutup. Kalau adapter memotong di situ, kode aktif hilang.
  const html = `
    <h3 id="h-active-nikke-codes">Active Nikke codes</h3>
    <ul>${li("CHEERFORANIS", "300 gems")}</ul>
    <p>Send it to us and we will move it to our Expired list.</p>`;
  const { active, expired } = SITES.destructoid.parse(html);
  assert.deepEqual(
    active.map((c) => c.code),
    ["CHEERFORANIS"],
  );
  assert.deepEqual(expired, []);
});

test("section expired kosong → 0 expired, aktif tetap utuh", () => {
  // Kondisi NIKKE per 27 Agu 2026: judul Expired ADA tapi isinya kosong (situsnya
  // tak pernah memindahkan kode). Yang penting: jangan memulangkan sampah.
  const html = pageHTML({ aktif: li("COMMANDERLOVETRIAL", "20 ultra boost modules") });
  const { active, expired } = SITES.destructoid.parse(html);
  assert.equal(active.length, 1);
  assert.deepEqual(expired, []);
});

test("reward verbatim, penanda pembuka & (New) dirapikan", () => {
  const html = pageHTML({ aktif: `<li><strong>2026EATBETTER</strong>—Redeem for 2 Advanced Recruit Vouchers <strong>(New)</strong></li>` });
  const { active } = SITES.destructoid.parse(html);
  assert.equal(active[0].reward, "Redeem for 2 Advanced Recruit Vouchers");
});

test("sisipan iklan di tengah list tak memutus pembacaan kode", () => {
  const html = pageHTML({
    aktif: `${li("PUNYQUEEN", "free rewards")}</ul><div class="gamurs-ad-slot"></div><ul class="wp-block-list">${li("IAMNAYUTA", "free rewards")}`,
  });
  const { active } = SITES.destructoid.parse(html);
  assert.deepEqual(
    active.map((c) => c.code),
    ["PUNYQUEEN", "IAMNAYUTA"],
  );
});
