// Katalog game ONLINE / live-service untuk halaman "Jelajah Game".
//
// Katalog = HANYA game yang KITA punya kodenya (dari GAMES registry). Placeholder
// "coming soon" (game populer tanpa sumber kode) SENGAJA tidak ditampilkan —
// kartunya kosong & membingungkan (dulu juga bikin duplikat saat game placeholder
// akhirnya masuk registry, mis. NIKKE/Whiteout). Tambahkan game ke sini hanya
// setelah punya sumber kodenya di games.mjs.
//
// Genre dikurasi di games.mjs (bukan dari iTunes yang cuma "Games,Roleplaying")
// supaya filter genre bermakna. Metadata lain (rating, tanggal rilis, cover,
// ratingCount) ditarik worker dari iTunes Lookup — lihat fetch-catalog.mjs.
//
// Aturan CLAUDE.md: hanya game online/live-service. Semua entri di sini online.

import { GAMES } from "./games.mjs";

/**
 * Katalog = semua game berkode dari GAMES. Bentuk seragam:
 * { name, genres, appleId, hasCodes:true }.
 */
export const CATALOG = Object.fromEntries(
  Object.entries(GAMES).map(([id, meta]) => [
    id,
    // pensiun ikut dibawa: halaman game & katalog perlu tahu bahwa sumber kode
    // game ini sudah tak ada, supaya "0 kode aktif" tidak terbaca sebagai
    // "kebetulan lagi kosong".
    { name: meta.name, genres: meta.genres ?? [], appleId: meta.appleId, hasCodes: true, pensiun: meta.pensiun ?? null },
  ]),
);

export const CATALOG_IDS = Object.keys(CATALOG);
