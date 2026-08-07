// PERBAIKAN SEKALI-JALAN: mengisi ulang tanggal & reward kode yang detailnya
// pernah dikarang oleh susunUlang().
//
// Duduk perkaranya. Versi pertama memo seksi (7 Agu 2026) memakai cadangan
// `?? { code: k }` saat detail sebuah kode tak ada di data — melahirkan objek
// telanjang tanpa `date` maupun `reward`. Cadangan itu sudah dibuang, tapi entri
// yang telanjur lahir MEMBERI MAKAN DIRINYA SENDIRI: memo menyebut kodenya ada
// di daftar aktif sumber, pencarian detail menemukan entri karangan tadi, dan
// nilai kosongnya dipakai lagi. Tanpa tanggal, `sepi-den` — yang sengaja
// mensyaratkan umur diketahui — tak bisa menyentuhnya, sehingga kode Asura dari
// 2024 bertahan sebagai AKTIF tak peduli berapa kali worker jalan.
//
// Menunggu rotasi tak menolong: pengisian ulang hanya terjadi saat halaman
// sumbernya kebetulan ditarik segar, dan game bertrafik rendah bisa menunggu
// berjam-jam. Skrip ini menarik langsung sumber untuk game yang terdampak saja.
//
// TIDAK mengubah status kode. Ia cuma mengembalikan `date` dan `reward` yang
// hilang; keputusan arsip tetap milik worker pada run berikutnya — dan begitu
// tanggalnya kembali, aturan yang sudah ada akan bekerja sendiri.
//
//   node worker/pulihkan-detail.mjs [--tulis]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRoCodes } from "./src/sources/rocodes.mjs";
import { fetchRobloxDen } from "./src/sources/robloxden.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, "data", "roblox-codes.json");
const tulis = process.argv.includes("--tulis");

const d = JSON.parse(fs.readFileSync(BERKAS, "utf8"));
// Ciri entri karangan: TAK punya tanggal DAN tak punya reward. Kode asli nyaris
// selalu membawa setidaknya satu di antaranya; yang kehilangan keduanya sekaligus
// hampir pasti lahir dari cadangan itu.
const rusak = [...d.active, ...d.archive].filter((c) => !c.date && !c.reward);
const perGame = new Map();
for (const c of rusak) (perGame.get(c.game) ?? perGame.set(c.game, []).get(c.game)).push(c);

console.log(`kode tanpa date DAN reward: ${rusak.length} di ${perGame.size} game`);

let isiDate = 0, isiReward = 0, gagal = 0;
for (const [gid, list] of perGame) {
  const g = d.games[gid];
  if (!g) continue;
  const punya = new Map(); // kode huruf kecil → {date, reward}
  for (const [slug, fn] of [[g.rocodesSlug, fetchRoCodes], [g.denSlug, fetchRobloxDen]]) {
    if (!slug) continue;
    try {
      const r = await fn(slug);
      for (const c of [...(r.active ?? []), ...(r.archive ?? [])]) {
        const k = String(c.code).toLowerCase();
        const lama = punya.get(k) ?? {};
        punya.set(k, { date: lama.date ?? c.date ?? null, reward: lama.reward ?? c.reward ?? null });
      }
    } catch { gagal += 1; }
  }
  for (const c of list) {
    const p = punya.get(String(c.code).toLowerCase());
    if (!p) continue;
    if (!c.date && p.date) { c.date = p.date; isiDate += 1; }
    if (!c.reward && p.reward) { c.reward = p.reward; isiReward += 1; }
  }
  await new Promise((r) => setTimeout(r, 150));
}

console.log(`  tanggal terisi : ${isiDate}`);
console.log(`  reward terisi  : ${isiReward}`);
console.log(`  tarikan gagal  : ${gagal}`);
const sisa = [...d.active, ...d.archive].filter((c) => !c.date && !c.reward).length;
console.log(`  masih kosong   : ${sisa} (sumbernya memang tak memberi keduanya)`);

if (!tulis) { console.log("\n(mode laporan — tambahkan --tulis untuk menerapkan)"); process.exit(0); }
fs.writeFileSync(BERKAS, JSON.stringify(d, null, 2));
console.log("\n✓ ditulis");
