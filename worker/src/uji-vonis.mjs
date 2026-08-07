// Vonis uji lapangan → jalur arsip.
//
// Seluruh pipeline menilai kode dari PERILAKU AGREGATOR: berapa sumber
// mendaftarkan, berapa umurnya, siapa yang ragu. Uji lapangan adalah satu-satunya
// masukan yang benar-benar MENCOBA kodenya di dalam game. Karena itu ia berdiri
// di atas semua aturan lain — termasuk kesepakatan dua sumber primer.
//
// Bukan teori: DRAGDRIVEDANGCAP didaftarkan aktif oleh RoCodes, tak diragukan
// siapa pun, lolos setiap saringan otomatis yang kita punya, dan ditolak game.
// WEHEARYOU dan IDULADHA2026 sama. Tanpa jalur ini, ketiganya tetap terpampang
// sebagai kode yang bisa dipakai, dan tak ada aturan otomatis yang akan pernah
// menemukannya — sumbernya sendiri yang salah.
//
// VONIS TERBARU MENANG. Sengaja: kode redeem bisa dihidupkan lagi oleh developer,
// dan uji ulang adalah cara membetulkannya. `uji-lapangan.mjs` memang mengizinkan
// kode yang sama diuji berkali-kali pada tanggal berbeda; di sinilah riwayat itu
// dibaca — yang dipakai cuma vonis paling akhir, bukan yang pertama.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, "..", "data", "uji-lapangan.json");

/**
 * @param {Record<string, {slug?: string}>} games peta game (kunci = id game)
 * @returns {Set<string>} kunci `${idGame}:${kode huruf kecil}` yang TERBUKTI mati
 */
export function vonisMati(games = {}) {
  let memo;
  try { memo = JSON.parse(fs.readFileSync(BERKAS, "utf8")); }
  catch { return new Set(); }

  // Id game TIDAK selalu sama dengan slug — 14 game memakai id ringkas
  // ("bloxfruits") sementara slug situsnya bertanda hubung ("blox-fruits").
  // uji-lapangan.json mencatat slug (itu yang dilihat user di URL), jadi
  // pemetaan balik harus lewat peta game, bukan disamakan begitu saja.
  const idDariSlug = new Map();
  for (const [id, g] of Object.entries(games)) {
    idDariSlug.set(id, id);
    if (g?.slug) idDariSlug.set(g.slug, id);
  }

  const akhir = new Map(); // `${id}:${kode}` → { tgl, vonis }
  for (const u of memo.uji ?? []) {
    const id = idDariSlug.get(u.game);
    if (!id) continue; // game sudah tak ada di katalog
    const k = `${id}:${String(u.code).toLowerCase()}`;
    const lama = akhir.get(k);
    if (!lama || String(u.diuji) >= lama.tgl) akhir.set(k, { tgl: String(u.diuji), vonis: u.vonis });
  }
  return new Set([...akhir].filter(([, v]) => v.vonis === "mati").map(([k]) => k));
}
