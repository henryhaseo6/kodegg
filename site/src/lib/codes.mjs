// Pembaca cache codes.json untuk build SSG.
//
// Situs TIDAK memanggil API pihak ketiga — worker yang menarik, situs membaca
// cache (lihat Cetak Biru Pipeline). Impor registry game langsung dari worker
// supaya daftar game hanya hidup di satu tempat.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { GAMES, iconUrl, gameSlug } from "../../../worker/src/games.mjs";

// JANGAN memakai import.meta.url di sini: Vite mem-bundle modul ini saat
// `astro build`, sehingga import.meta.url menunjuk ke lokasi bundel — bukan
// file sumber — dan path relatifnya putus (gejalanya: build sukses tapi 0 kode).
// process.cwd() saat astro dev/build selalu = root proyek situs (site/), dan
// worker/ adalah sibling-nya. Override lewat env untuk fleksibilitas deploy.
const CACHE =
  process.env.KODEGG_CODES ?? resolve(process.cwd(), "../worker/data/codes.json");

/** Nama tampilan game: dari registry bila dikenal, kalau tidak pakai judul sumber. */
function displayName(item) {
  return GAMES[item.game]?.name ?? item.gameName ?? "—";
}

/** Teks yang dicari oleh kotak pencarian (mirror atribut data-search di mockup). */
function searchIndex(item) {
  return [displayName(item), item.reward ?? "", item.code ?? ""]
    .join(" ")
    .toLowerCase();
}

// Ambang "kode baru": BARU bila kodenya BARU DITARIK (firstSeen) ATAU baru
// dirilis menurut sumber, dalam 24 jam terakhir. Tak butuh tanggal rilis dari
// sumber — banyak sumber (WSCO, NIKKE) tak punya; yang penting gamenya sudah
// dipantau sebelumnya, artinya ini benar-benar tambahan baru. Kode `bulk`
// (impor pertama sebuah game, umur tak diketahui) tak ikut, biar menambah game
// baru tak membanjiri badge. Jendela sengaja pendek: badge jangan lengket lama.
const NEW_MS = 24 * 3600 * 1000;
const NOW_MS = Date.now();

function shape(item) {
  // Dua kunci sort terpisah:
  //  - dateMs      = TANGGAL RILIS dari sumber (mis. createdAt tracker, tanggal
  //                  livestream). Ini "seberapa baru KODENYA".
  //  - firstSeenMs = kapan KodeGG pertama melihatnya ("ditemukan"/Terpantau).
  // Sort "Terbaru" mengutamakan dateMs; firstSeenMs HANYA tiebreak untuk kode
  // yang sumbernya tak memberi tanggal rilis (mis. NIKKE editorial, Whiteout).
  // Sengaja TIDAK menaikkan kode ke atas hanya karena baru ditemukan — kalau
  // tidak, tiap kali menambah game, seluruh kodenya (walau lama) membanjiri atas.
  const dateMs = Date.parse(item.date ?? "") || 0;
  const firstSeenMs = Date.parse(item.firstSeenAt ?? "") || 0;
  // rankMs = kunci sort "Terbaru" (kode paling baru di atas):
  //  - tanggal RILIS sumber bila ada (mis. createdAt tracker, tanggal livestream);
  //  - kalau tak ada, firstSeen — TAPI hanya untuk kode GENUINE baru (muncul di
  //    game yang sudah dipantau). Kode `bulk` (import pertama, umur tak diketahui)
  //    → 0, supaya menambah game baru tak membanjiri puncak. Kode NIKKE/Whiteout
  //    yang benar-benar baru dirilis nanti tetap nongol paling atas.
  const rankMs = dateMs || (item.bulk ? 0 : firstSeenMs);
  // newMs = "seberapa baru kode ini bagi pembaca": dirilis sumber ATAU baru
  // kami tarik — mana yang lebih baru. Kode bulk hanya boleh lewat tanggal rilis.
  // newMs = dasar badge "BARU". Memakai TANGGAL RILIS sumber; firstSeen hanya
  // dipakai bila sumber tak memberi tanggal (umur tak diketahui — dan itu beda
  // dari diketahui-tua). Dulu max(dateMs, firstSeenMs): kode lama yang baru kita
  // TEMUKAN ikut dicap BARU — kejadian 2 Agu 2026, Shindo Life "5YearSL2!" rilis
  // 23 Des 2025 (222 hari) tampil BARU karena RoCodes baru memunculkannya hari
  // itu. Sejalan dengan saringan usia pemicu notif/video di fetch-roblox.
  const newMs = dateMs || (item.bulk ? 0 : firstSeenMs);
  return {
    ...item,
    name: displayName(item),
    icon: iconUrl(item.game),
    gameSlug: item.game ? gameSlug(item.game) : null,
    redeemUrl: GAMES[item.game]?.redeemUrl ?? item.sourceUrl ?? null,
    search: searchIndex(item),
    rankMs,
    firstSeenMs,
    isNew: !item.perm && newMs > 0 && NOW_MS - newMs <= NEW_MS,
  };
}

export async function loadCodes() {
  let raw;
  try {
    raw = JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    // Build tidak boleh gagal hanya karena worker belum pernah jalan.
    return { updatedAt: null, active: [], archive: [], games: [], counts: { active: 0, archived: 0 } };
  }

  // "Terbaru" = tanggal RILIS sumber dulu (kode paling baru), lalu kode tanpa
  // tanggal rilis di belakang diurut dari yang terakhir ditemukan. Tidak memakai
  // firstSeen sebagai kunci utama → menambah game tak lagi membanjiri atas.
  const active = (raw.active ?? [])
    .map(shape)
    .sort((a, b) => b.rankMs - a.rankMs || b.firstSeenMs - a.firstSeenMs);
  // Arsip: sama — rankMs dulu, lalu firstSeen sebagai tiebreak.
  const archive = (raw.archive ?? [])
    .map(shape)
    .sort((a, b) => b.rankMs - a.rankMs || b.firstSeenMs - a.firstSeenMs);

  // Dropdown game dibangun dari data yang BENAR-BENAR ada, bukan daftar hardcoded
  // — mockup menawarkan Wuthering Waves/MLBB/Free Fire yang belum punya sumber.
  const present = new Set(active.map((c) => c.game).filter(Boolean));
  const games = Object.entries(GAMES)
    .filter(([id]) => present.has(id))
    .map(([id, meta]) => ({ id, name: meta.name }))
    .sort((a, b) => a.name.localeCompare(b.name)); // dropdown filter urut A–Z

  return {
    updatedAt: raw.updatedAt ?? null,
    counts: raw.counts ?? { active: active.length, archived: archive.length },
    active,
    archive,
    games,
  };
}
