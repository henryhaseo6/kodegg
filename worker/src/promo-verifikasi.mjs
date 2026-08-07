// VONIS MANUAL untuk kode PROMO Roblox — satu-satunya kebenaran yang kita punya.
//
// KENAPA MANUAL, padahal semua yang lain otomatis.
//
// Kode promo Roblox ditukar di roblox.com/promocodes, dan Roblox sudah bertahun
// tak menerbitkan yang baru. Akibatnya daftar di agregator membeku dan tak ada
// yang mengoreksinya — sementara kita tak punya cara memeriksanya sendiri:
// menukar kode butuh akun yang login, dan endpoint katalog Roblox menolak tanpa
// token XSRF. Bahkan seandainya bisa dibaca, "item off-sale" tak berarti
// "kodenya mati": itemnya diberikan lewat kode, bukan dijual.
//
// Diuji manual 7 Agu 2026 oleh user di akun sungguhan:
//   SPIDERCOLA   → "Code already redeemed"  = MASIH JALAN
//   TWEETROBLOX  → "Invalid promo code"     = mati
//   FREENGNBOI   → "Invalid promo code"     = mati
//   FREENGNGON   → "Invalid promo code"     = mati
//
// Tiga dari empat kode yang kita pajang AKTIF ternyata mati — 75% salah, di
// bagian situs yang tampil lintas-halaman, bukan cuma di satu game.
//
// DAN INI PEMBUKTIAN TERKUAT bahwa "dua sumber sepakat" bukan bukti independen:
// RoCodes DAN Roblox Den sama-sama menyatakan keempatnya aktif. Den sendiri
// menulis di tooltip-nya bahwa mereka memantau agregator lain (lihat
// den-rocodes-asal-kode di catatan), jadi kesepakatan mereka bisa berarti satu
// sumber yang dikutip dua kali. Untuk kode game, cross-check masih berguna
// karena sumbernya bergerak dan saling menambal; untuk promo yang membeku
// bertahun, ia cuma mengulang kesalahan yang sama dengan lebih percaya diri.
//
// Daftar ini menang atas kedua sumber. Kalau kelak Roblox menerbitkan promo
// baru dan kodenya benar-benar hidup, hapus entrinya dari sini — bukan
// sebaliknya.

/** Kode promo yang TERBUKTI mati lewat percobaan langsung. */
export const PROMO_MATI = {
  TWEETROBLOX: "2026-08-07",
  FREENGNBOI: "2026-08-07",
  FREENGNGON: "2026-08-07",
};

/** Kode promo yang TERBUKTI masih jalan. Dicatat supaya kelak terlihat kapan
 *  terakhir benar-benar diperiksa — bukan sekadar "sumber bilang aktif". */
export const PROMO_HIDUP = {
  SPIDERCOLA: "2026-08-07",
};

/**
 * Terapkan vonis manual ke hasil agregator.
 * @param {{active: object[], archive: object[]}} p
 * @returns {{active: object[], archive: object[], dipindah: string[]}}
 */
export function terapkanVonis(p) {
  const mati = new Set(Object.keys(PROMO_MATI).map((k) => k.toUpperCase()));
  const dipindah = [];
  const active = [];
  const archive = [...(p.archive ?? [])];
  for (const c of p.active ?? []) {
    const k = String(c.code ?? "").toUpperCase();
    if (mati.has(k)) {
      dipindah.push(c.code);
      archive.push({ ...c, status: "expired", expiredBy: "uji-manual", expiredAt: new Date().toISOString() });
      continue;
    }
    // Tanggal uji manual dibawa serta supaya situs bisa menyatakan KAPAN kode
    // ini benar-benar dicoba — klaim yang jauh lebih kuat daripada "dua sumber
    // mendaftarkannya", dan satu-satunya yang benar-benar kita punya di sini.
    const ujiAt = PROMO_HIDUP[k];
    active.push(ujiAt ? { ...c, ujiManualAt: ujiAt } : c);
  }
  return { active, archive, dipindah };
}
