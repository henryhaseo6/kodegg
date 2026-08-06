// PROBE DESKRIPSI ROBLOX — pengamatan, BUKAN sumber kode.
//
// PERTANYAAN YANG DIJAWAB: kalau pengembang menempelkan kode di deskripsi game
// Roblox, apakah itu muncul di sana LEBIH DULU daripada di Roblox Den/RoCodes?
// Kalau ya, kita punya jalur hulu gratis untuk sepertiga katalog; kalau tidak,
// gagasan ini mati dengan bukti, bukan dengan dugaan.
//
// KENAPA LAYAK DICOBA padahal hulu lain sudah mati satu per satu (Discord butuh
// bot di server, X berbayar, group shout Roblox null + throttle 429 setelah ~5
// permintaan): deskripsi ini SUDAH ikut terbawa di `games.roblox.com/v1/games`
// yang kita panggil tiap jam untuk jumlah pemain. Nol permintaan tambahan.
// Diukur 6 Agu 2026: 164 dari 491 game (33%) memuat minimal satu kode kita.
//
// DUA HAL YANG MEMBUAT PENGUKURAN INI MUDAH KELIRU, dan keduanya ditangani:
//
// 1. BIAS AWAL. Saat probe pertama jalan, hampir semua kandidat sudah lebih dulu
//    kita punya dari Den/RoCodes. Kalau itu ikut dihitung, deskripsi akan tampak
//    "menemukan" ratusan kode padahal ia cuma mengeja ulang yang sudah tayang.
//    Maka tiap kandidat dicap `sudahPunya` pada penampakan PERTAMA — dan hanya
//    yang belum kita punya saat itu yang boleh dihitung sebagai temuan.
//
// 2. EKSTRAKSI TERLALU KETAT. Menyaring ketat di sini akan membuang justru kode
//    yang sedang dicari, dan tak ada yang memberitahu. Jadi ekstraksi sengaja
//    LONGGAR — token mirip-kode direkam apa adanya. Penyaring sesungguhnya
//    datang belakangan dan gratis: kandidat baru bermakna kalau kelak benar-benar
//    muncul sebagai kode di data kita. Presisi tak dibutuhkan di tahap catat.
//
// TIDAK menyentuh situs sama sekali. Isinya cuma catatan waktu.

// Kata yang pasti bukan kode tapi lolos bentuknya (ALLCAPS/berangka).
const BUKAN = new Set(
  ("update updates new codes code roblox discord twitter youtube group server servers players player "
    + "like likes visit visits follow following subscribe join joined free vip gamepass shop store "
    + "welcome thanks thank sorry fixed fix bug bugs event events halloween christmas summer winter "
    + "update1 v1 v2 v3 alpha beta release released soon http https www com gg gift gifts").split(" "),
);

/**
 * Token mirip-kode dari deskripsi. Longgar dengan sengaja (lihat catatan 2).
 * @param {string} desc
 * @returns {string[]}
 */
export function kandidatKode(desc) {
  const teks = String(desc ?? "");
  if (!teks) return [];
  // Buang URL & handle dulu — keduanya kaya token ALLCAPS/berangka yang bukan kode.
  const bersih = teks.replace(/https?:\/\/\S+/g, " ").replace(/@\w+/g, " ");
  const out = new Set();
  for (const t of bersih.match(/[A-Za-z0-9_!-]{4,30}/g) ?? []) {
    const kata = t.replace(/^[-_!]+|[-_!]+$/g, "");
    if (kata.length < 4 || kata.length > 30) continue;
    if (!/[A-Za-z]/.test(kata)) continue;          // harus ada huruf
    if (BUKAN.has(kata.toLowerCase())) continue;
    const adaAngka = /\d/.test(kata);
    const kapitalBeruntun = /[A-Z]{4,}/.test(kata);
    const camel = /[a-z][A-Z]/.test(kata);
    if (!adaAngka && !kapitalBeruntun && !camel) continue;
    out.add(kata);
  }
  return [...out];
}

/**
 * Satu putaran pencatatan.
 *
 * @param {object} o
 * @param {Map<number,{desc:string, gid:string}>} o.deskripsi  universeId → deskripsi & id game kita
 * @param {(gid:string)=>Set<string>} o.kodeKita  kode yang SUDAH kita punya (aktif+arsip, huruf kecil)
 * @param {object} o.memo   isi data/desc-probe.json
 * @param {number} o.now
 * @returns {{memoBaru: object, baru: object[]}}
 */
export function catatDeskripsi({ deskripsi, kodeKita, memo = {}, now = Date.now() }) {
  const memoBaru = { ...memo };
  const baru = [];

  // SARINGAN KATA UMUM, DIBANGUN DARI DATANYA SENDIRI — bukan dari kamus.
  //
  // Bentuk token tak bisa membedakan kode dari kata biasa: diukur atas 25.193
  // kode nyata kita, 26,8% berupa ALLCAPS tanpa angka (NEWMAP, TEAMSPAIN,
  // RAMADAN) — persis bentuk CONTROLS, ABILITY, SHIFTLOCK yang jelas bukan kode.
  //
  // Yang membedakan: KODE ITU KHAS SATU GAME, kata umum tersebar di banyak game.
  // Diukur 6 Agu 2026 atas 490 deskripsi: token tersering semuanya kata biasa
  // (game 21x, controls 19x, every 19x, play 16x, xbox 10x), sementara token yang
  // hanya muncul di SATU game memuat 315 kode nyata kita.
  //
  // Saringan ini merawat dirinya sendiri: saat game datang dan pergi, kata umum
  // tetap tersebar dan kode tetap khas. Kamus buatan tangan akan basi diam-diam.
  const UMUM_MIN = Number(process.env.DESC_UMUM_MIN || 4);
  const sebar = new Map();
  const perGame = new Map();
  for (const [uid, { desc, gid }] of deskripsi) {
    if (!gid) continue;
    const toks = kandidatKode(desc);
    perGame.set(uid, toks);
    for (const t of new Set(toks.map((x) => x.toLowerCase()))) sebar.set(t, (sebar.get(t) ?? 0) + 1);
  }

  for (const [uid, { gid }] of deskripsi) {
    if (!gid) continue;
    const kandidat = (perGame.get(uid) ?? []).filter((t) => (sebar.get(t.toLowerCase()) ?? 0) < UMUM_MIN);
    if (!kandidat.length) continue;
    const punya = kodeKita(gid);
    const g = (memoBaru[gid] = { ...(memoBaru[gid] ?? {}) });
    for (const k of kandidat) {
      const kunci = k.toLowerCase();
      const lama = g[kunci];
      if (lama) { lama.terakhir = now; lama.n = (lama.n ?? 1) + 1; continue; }
      // Penampakan PERTAMA: cap apakah kode ini sudah kita punya saat itu juga.
      // Tanpa cap ini seluruh pengukuran bias (lihat catatan 1 di atas).
      const sudahPunya = punya.has(kunci);
      g[kunci] = { tulis: k, pertama: now, terakhir: now, n: 1, ...(sudahPunya ? { sudahPunya: true } : {}) };
      if (!sudahPunya) baru.push({ game: gid, code: k });
    }
  }
  return { memoBaru, baru };
}

/**
 * Laporan: dari kandidat yang BELUM kita punya saat pertama terlihat di
 * deskripsi, mana yang kini sudah jadi kode nyata — dan berapa lama deskripsi
 * mendahului Den/RoCodes.
 *
 * @param {object} memo
 * @param {(gid:string)=>Map<string,number>} kodeKita  kode → firstSeenAt(ms)
 */
export function laporanDeskripsi(memo = {}, kodeKita, now = Date.now()) {
  let dipantau = 0, terbukti = 0;
  const unggul = [];
  for (const [gid, kodes] of Object.entries(memo)) {
    const nyata = kodeKita(gid);
    for (const [kunci, v] of Object.entries(kodes)) {
      if (v.sudahPunya) continue; // bias awal — tak dihitung
      dipantau++;
      const kitaMs = nyata.get(kunci);
      if (!kitaMs) continue;
      terbukti++;
      // Selisih positif = deskripsi lebih dulu. Nol/negatif = tidak.
      unggul.push({ game: gid, code: v.tulis, jam: (kitaMs - v.pertama) / 3600000 });
    }
  }
  unggul.sort((a, b) => b.jam - a.jam);
  const menang = unggul.filter((u) => u.jam > 0.5);
  console.log(`[desc-probe] ${dipantau} kandidat dipantau (belum kita punya saat terlihat) · ${terbukti} kelak jadi kode nyata · ${menang.length} di antaranya deskripsi LEBIH DULU`);
  for (const u of menang.slice(0, 8)) console.log(`  ↑ ${u.code} (${u.game}) — deskripsi mendahului ${u.jam.toFixed(1)} jam`);
  if (terbukti && !menang.length) console.log("  (tak satu pun mendahului — deskripsi menyusul, bukan mendahului)");
  return { dipantau, terbukti, menang: menang.length };
}
