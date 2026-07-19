// Kode PERMANEN terkurasi — "lantai" tepercaya per game.
//
// Kenapa ada: sebagian kode permanen (welcome code) TIDAK dikembalikan API/wiki
// kita — mis. GENSHINGIFT tak ada di seria/ennead, WUTHERINGGIFT hanya di wiki
// WuWa yang sering basi. Daftar ini menjamin kode permanen SELALU tampil dan
// benar, lalu sumber otomatis menambah kode temporer di atasnya.
//
// SIFAT & PEMELIHARAAN:
// - Isi HANYA kode yang benar-benar mapan (welcome code sejak rilis). Kode
//   livestream/event JANGAN di sini — itu tugas sumber otomatis.
// - Reward di sini adalah cadangan: bila sumber live mengembalikan kode yang
//   sama, reward dari SUMBER yang dipakai (lebih terkini). Jadi angka reward
//   yang berubah tetap otomatis ikut.
// - Ini satu-satunya data kode yang ditulis tangan. Tinjau ~tiap beberapa bulan;
//   kode welcome sangat jarang dicabut, tapi bukan mustahil.
//
// Diverifikasi 2026-07-16 (lihat riwayat chat: pencarian + wuwastatus/game8).

import { codeKey } from "../normalize.mjs";

export const CURATED = {
  gi: [
    // Reward VERBATIM (diverifikasi Fandom wiki + pockettactics, Jul 2026).
    // Welcome code "periodik": sering aktif, kadang kena max-usage lalu balik.
    { code: "GENSHINGIFT", reward: "Primogem ×50 · Hero's Wit ×3" },
  ],
  zzz: [
    {
      code: "ZENLESSGIFT",
      reward:
        "50 polychrome, two official investigator logs, three w-engine power supplies, and one bangboo algorithm module",
    },
  ],
  wuwa: [
    {
      code: "WUTHERINGGIFT",
      reward:
        "Astrite ×50 · Premium Resonance Potion ×2 · Medium Revival Inhaler ×2 · Medium Energy Bag ×2 · Shell Credit ×15000",
    },
  ],
};

/** Set kode yang berstatus permanen (dipakai untuk menandai perm:true saat dedup). */
export const CURATED_KEYS = new Set(
  Object.entries(CURATED).flatMap(([game, list]) => list.map((c) => `${game}:${c.code}`)),
);

/**
 * Kembalikan item kode permanen (perm:true) untuk game yang ada di registry.
 * Selalu "covered" — kode permanen harus tetap tampil walau sumber lain gagal.
 */
export function fetchCurated({ games }) {
  const items = [];
  const covered = new Set();
  for (const [id, list] of Object.entries(CURATED)) {
    const meta = games[id];
    if (!meta) continue;
    covered.add(id);
    for (const c of list) {
      items.push({
        game: id,
        gameName: meta.name,
        code: c.code,
        reward: c.reward,
        status: "active",
        perm: true,
        endsAt: null,
        claimUrl: null,
        source: "curated",
        sourceUrl: meta.redeemUrl ?? null,
      });
    }
  }
  return { items, covered, failed: 0 };
}

// Skor kelengkapan reward (sama seperti di hoyo.mjs): null terendah, selain itu
// makin panjang makin lengkap. Untuk CROSS-CHECK lintas-sumber.
const rewardScore = (r) => (r == null ? -1 : String(r).length);

/**
 * Gabungkan kode dari SEMUA sumber (API, wiki, wuwastatus, curated), dedup per
 * (game:code), dengan CROSS-CHECK:
 * - Identitas & atribusi diambil dari sumber prioritas tertinggi (urutan input).
 * - Reward diambil dari sumber mana pun yang paling LENGKAP → data yang terpotong
 *   di satu sumber diperbaiki sumber lain (mis. reward ZZZ terpotong di seria,
 *   utuh di ennead; reward HI3 dari API vs wiki).
 * - Kode yang tercatat permanen ditandai perm:true (tampil "Tanpa batas").
 */
export function combineCodes(sourceItems, curatedItems) {
  const byKey = new Map();
  for (const item of [...sourceItems, ...curatedItems]) {
    const key = codeKey(item);
    const cur = byKey.get(key);
    if (!cur) {
      // `sources` = daftar SEMUA sumber yang menyumbang kode ini (untuk atribusi
      // per-kode di kartu). `source` tetap = sumber utama/pemenang (yang pertama,
      // sesuai urutan prioritas argumen). Kode bisa datang dari >1 sumber, mis.
      // ZZZY2ANNIV: identitas+reward dari hoyo-codes, tanggal dari crimsonwitch.
      // sourceUrls = peta nama-sumber → URL-nya, biar TIAP sumber bisa dilink
      // di kartu (bukan cuma primary). Sumber tanpa URL tak masuk peta (jadi teks).
      byKey.set(key, {
        ...item,
        // Item bisa datang dg daftar sumber sendiri (mis. editorial: >1 situs
        // cross-check dalam satu item) — pertahankan; kalau tidak, mulai dari
        // sumber tunggalnya.
        sources: item.sources?.length ? [...item.sources] : item.source ? [item.source] : [],
        sourceUrls:
          item.sourceUrls && Object.keys(item.sourceUrls).length
            ? { ...item.sourceUrls }
            : item.source && item.sourceUrl
              ? { [item.source]: item.sourceUrl }
              : {},
      });
    } else {
      if (rewardScore(item.reward) > rewardScore(cur.reward)) {
        cur.reward = item.reward; // sumber lebih lengkap menang untuk reward
      }
      // Tanggal SUMBER (mis. discovery dari wiki) — API HoYo tak punya tanggal,
      // jadi ambil dari sumber mana pun yang menyediakannya.
      if (!cur.date && item.date) cur.date = item.date;
      // Waktu kedaluwarsa (mis. crimsonwitch untuk kode livestream) — ambil dari
      // sumber mana pun yang punya, untuk countdown di kartu.
      if (!cur.endsAt && item.endsAt) cur.endsAt = item.endsAt;
      // Permanen bila DITANDAI permanen oleh sumber mana pun (mis. tot.wiki
      // End Date 2099) — biar kartu tampil "Tanpa batas", bukan tanggal rilis.
      if (item.perm) cur.perm = true;
      // Catat sumber tambahan (dedup, pertahankan urutan prioritas). Item bisa
      // membawa >1 sumber (mis. editorial cross-check) → gabung semuanya.
      for (const s of item.sources?.length ? item.sources : item.source ? [item.source] : []) {
        if (!cur.sources.includes(s)) cur.sources.push(s);
      }
      for (const [s, u] of Object.entries(item.sourceUrls ?? (item.source && item.sourceUrl ? { [item.source]: item.sourceUrl } : {}))) {
        if (!cur.sourceUrls[s]) cur.sourceUrls[s] = u;
      }
    }
  }
  for (const item of byKey.values()) {
    if (CURATED_KEYS.has(codeKey(item))) item.perm = true;
  }
  return [...byKey.values()];
}
