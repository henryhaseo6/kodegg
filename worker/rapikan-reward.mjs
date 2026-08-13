// Pembersihan sekali-jalan: tanda kali BERTUMPUK di teks reward ("×x20").
//
// Jalankan: node worker/rapikan-reward.mjs          → laporan saja (tak menulis)
//           node worker/rapikan-reward.mjs --tulis  → tulis perubahannya
//
// ASALNYA sudah diperbaiki di src/sources/redeemtracker.mjs (sumber mengirim
// `quantity` yang sebagiannya sudah membawa "x", lalu kita menambahkan "×"
// lagi). Berkas ini membereskan yang TELANJUR tersimpan: 110 kode di 14 game
// per 13 Agu 2026.
//
// KENAPA ARSIP IKUT DIBERSIHKAN, padahal arsip tak pernah kita tulis ulang.
// Prinsipnya adalah tak menghapus/mengubah FAKTA — kode apa, kapan hidup, kapan
// mati. "×x20" bukan fakta dari sumber; itu cacat perakitan string milik kita
// sendiri, dan sumbernya tak pernah menuliskannya begitu. Membiarkannya bukan
// menjaga riwayat, cuma mengawetkan salah ketik kita di halaman arsip selamanya.
// Jumlah, nama item, dan segalanya yang lain tak berubah sedikit pun.
//
// Kode AKTIF sebetulnya pulih sendiri di run berikutnya (daftar aktif disusun
// ulang dari sumber tiap run). Tetap dibersihkan di sini supaya situs dan video
// tak memajang cacat itu sampai run berikutnya tiba.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = process.env.KODEGG_DATA || resolve(dirname(fileURLToPath(import.meta.url)), "data");
const TULIS = process.argv.includes("--tulis");

/** Runtun penanda kali (≥2) tepat sebelum angka → satu "×".
 *
 *  WAJIB didahului spasi (lookbehind). Tanpa syarat itu, nama item yang
 *  berakhiran "x" ikut termakan: "Box x20" akan terbaca sebagai runtun "x x"
 *  dan berubah jadi "Bo×20". Diuji di bawah supaya tak perlu dipercaya begitu
 *  saja. */
export const RAPIKAN = /(?<=\s)(?:[×x]\s*){2,}(?=\d)/gi;
export const rapikan = (t) => (typeof t === "string" ? t.replace(RAPIKAN, "×") : t);

// Uji cepat, dicetak tiap dijalankan: pembersih data yang salah lebih berbahaya
// daripada data yang kotor, jadi buktinya ditunjukkan sebelum menyentuh apa pun.
const UJI = [
  ["Summon Ticket ×x10", "Summon Ticket ×10"],
  ["Diamonds ×x1000 · Gold ×x20000", "Diamonds ×1000 · Gold ×20000"],
  ["Box x20", "Box x20"],                 // nama berakhiran x — JANGAN disentuh
  ["Gold ×20000", "Gold ×20000"],         // sudah benar — idempoten
  ["Mix 5 Pack ×x2", "Mix 5 Pack ×2"],
];
let lulus = 0;
for (const [masuk, harap] of UJI) {
  const dapat = rapikan(masuk);
  const ok = dapat === harap;
  lulus += ok ? 1 : 0;
  if (!ok) console.log(`  ✖ ${JSON.stringify(masuk)} → ${JSON.stringify(dapat)} (harusnya ${JSON.stringify(harap)})`);
}
console.log(`uji pola: ${lulus}/${UJI.length} lulus`);
if (lulus !== UJI.length) { console.error("pola tak lolos ujinya sendiri — berhenti."); process.exit(1); }

let total = 0;
for (const nama of ["codes.json", "roblox-codes.json"]) {
  const p = resolve(DATA, nama);
  let mentah, d;
  try { mentah = readFileSync(p, "utf8"); d = JSON.parse(mentah); } catch { console.log(`${nama}: dilewati (tak terbaca)`); continue; }
  // FORMAT BERKAS DIPERTAHANKAN PERSIS. fetch-codes menulis dengan indent 2 dan
  // tanpa newline penutup; menulis ulang dengan gaya lain membuat diff-nya
  // seluruh berkas (ribuan baris) untuk perubahan yang sebenarnya 110 kata —
  // dan run pipeline berikutnya akan mengembalikannya lagi, jadi tiap hari ada
  // dua commit raksasa yang isinya cuma spasi.
  const indent = (mentah.match(/^\{\n(\s+)"/)?.[1] ?? "  ").length;
  const newlineAkhir = mentah.endsWith("\n");
  let n = 0;
  const contoh = [];
  for (const daftar of [d.active, d.archive]) {
    for (const c of daftar ?? []) {
      const baru = rapikan(c.reward);
      if (baru !== c.reward) {
        if (contoh.length < 3) contoh.push(`${c.game}/${c.code}: ${c.reward} → ${baru}`);
        c.reward = baru; n += 1;
      }
    }
  }
  total += n;
  console.log(`${nama}: ${n} reward dirapikan`);
  for (const s of contoh) console.log(`   ${s}`);
  if (n && TULIS) writeFileSync(p, JSON.stringify(d, null, indent) + (newlineAkhir ? "\n" : ""));
}
console.log(TULIS ? `\n✓ ditulis (${total} reward)` : `\n(laporan saja — jalankan dengan --tulis untuk menyimpan ${total} perubahan)`);
