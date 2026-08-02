// Pengukur keandalan <lastmod> sitemap RoCodes & Roblox Den — MENCATAT SAJA.
//
// Pertanyaan yang mau dijawab: kalau sebuah kode BARU muncul di halaman sumber,
// apakah <lastmod> sitemap mereka ikut diperbarui saat itu juga?
//
// Kenapa penting — dua arah, dua-duanya soal uang & kecepatan:
//  1. Den kini digerbangi `lastmod` (halaman ditarik hanya bila stempelnya
//     berubah). Kalau stempel itu telat, kode baru dari Den ikut telat masuk.
//  2. RoCodes ditarik TANPA gerbang: 350 halaman × 24 jam = 8.400 permintaan/hari.
//     Kalau stempelnya terbukti jujur, RoCodes bisa digerbangi juga → tinggal
//     beberapa ratus permintaan/hari, hemat besar untuk kedua pihak.
//
// Keduanya bergantung pada fakta yang sama dan BELUM terukur. Jadi: catat dulu,
// putuskan setelah ada data. Jangan menebak — kecepatan deteksi kode adalah
// jualan utama KodeGG, salah tebak berarti kalah cepat tanpa sadar.
//
// Cara baca hasilnya (data/lastmod-probe.json):
//   selisihMenit ≈ 0   → stempel diperbarui bersamaan kode masuk (SEHAT, boleh digerbangi)
//   selisihMenit besar → stempel telat; menggerbangi sumber ini akan memperlambat
//   selisihMenit null  → slug tak ada di sitemap sumber itu
const MAKS_SAMPEL = 400;

/**
 * @param {object[]} kodeBaru  kode yang baru terdeteksi run ini (punya .game, .source/.sources)
 * @param {Map<string,number>} roIndex  slug RoCodes → lastmod(ms)
 * @param {Map<string,number>} denIndex slug Den → lastmod(ms)
 * @param {object} games  peta id → {rocodesSlug, denSlug}
 * @param {object[]} sebelumnya  isi probe sebelumnya
 */
export function rekamProbe(kodeBaru, roIndex, denIndex, games, sebelumnya = []) {
  const now = Date.now();
  const menit = (ms) => (ms > 0 ? Math.round((now - ms) / 60000) : null);
  const baru = [];
  const sudah = new Set();
  for (const c of kodeBaru) {
    if (sudah.has(c.game)) continue; // 1 sampel per game per run sudah cukup
    sudah.add(c.game);
    const g = games[c.game] ?? {};
    const src = c.sources?.length ? c.sources : [c.source].filter(Boolean);
    baru.push({
      pada: new Date(now).toISOString(),
      game: c.game,
      sumber: src,
      // Berapa menit LALU stempel sitemap diperbarui, dilihat dari saat kode ini
      // terdeteksi. Kecil = stempel ikut bergerak saat kode ditambahkan.
      roMenit: g.rocodesSlug ? menit(roIndex.get(g.rocodesSlug) ?? 0) : null,
      denMenit: g.denSlug ? menit(denIndex.get(g.denSlug) ?? 0) : null,
    });
  }
  return [...baru, ...sebelumnya].slice(0, MAKS_SAMPEL);
}

/** Ringkasan singkat untuk log run (median selisih per sumber). */
export function ringkasProbe(sampel) {
  const med = (arr) => {
    const a = arr.filter((x) => x != null).sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : null;
  };
  const ro = med(sampel.map((s) => s.roMenit));
  const den = med(sampel.map((s) => s.denMenit));
  return `probe lastmod (${sampel.length} sampel): RoCodes median ${ro ?? "—"} menit, Den median ${den ?? "—"} menit`;
}
