// Wawasan per-game yang DITURUNKAN DARI DATA KITA SENDIRI.
//
// KENAPA ADA. Video kode kita dinilai "templated" (surat YouTube 13 Agu 2026),
// dan penilaian itu tepat: naskah VO cuma menerima empat masukan — nama game,
// jumlah kode, dan dua boolean — sehingga 24-57 video sehari lahir dari empat
// kemungkinan kalimat. Yang membedakan cuma nama game dan satu angka.
//
// Jalur Roblox punya jawaban: grafik pemain 24 jam dari database R2 kita
// (src/player-series.mjs). Jalur MOBILE tak bisa ikut — tak ada universeId, tak
// ada Roblox Charts, dan tak akan pernah ada. Padahal justru video mobile yang
// direview manusia (Whiteout Survival), dan justru di sana videonya paling
// telanjang: tanpa gambar promosi, tanpa grafik, tanpa pita statistik.
//
// Modul ini aset setara untuk SEMUA game, dan sumbernya barang yang tak dimiliki
// kanal lain: ARSIP KODE KITA SENDIRI. Sejak worker jalan, tiap kode disimpan
// dengan tanggal rilis dan tanggal matinya, dan tak pernah dihapus (prinsip
// CLAUDE.md: arsip = database). Dari 26 kode AFK Journey bertanggal, misalnya,
// terbaca bahwa gelombang kode datang tiap ~9 hari dan yang terakhir 9 Agu.
// Itu bukan variasi kosmetik — itu informasi yang harus punya riwayat berbulan
// untuk bisa diucapkan, dan kita punya riwayatnya.
//
// ATURAN KERAS, sama dengan yang berlaku untuk pita statistik: DATA NYATA ATAU
// DIAM. Tiap fungsi di sini memulangkan null saat buktinya kurang, dan pemanggil
// WAJIB menghilangkan kalimat/adegannya — bukan menggantinya dengan tebakan.
// Preseden yang tak boleh diulang: `synthSeries` mengarang bentuk grafik lalu
// turunannya dipajang sebagai "PEAK PLAYERS 53.7K"; dihapus 9 Agu 2026.

const HARI = 86400000;

/** Tanggal rilis yang BOLEH DIPERCAYA.
 *
 *  - `firstSeenAt` SENGAJA TIDAK dipakai: itu kapan WORKER pertama melihat kode,
 *    bukan kapan kode rilis. Untuk game yang katalognya masuk sekaligus, seluruh
 *    kode lama akan ber-firstSeenAt hari yang sama dan "siklus rilis" jadi
 *    karangan berbentuk grafik. Aturan yang sama sudah dipakai jalur "kode baru"
 *    (lihat catatan roundup: usia harus dibuktikan c.date, bukan firstSeen).
 *  - `bulk` = umur tak diketahui (impor pertama sebuah game) → dibuang.
 *  - Tanggal di MASA DEPAN dibuang. Bukan teori: r1999 menyimpan satu kode
 *    ber-date 2026-12-26 (salah parse di sumber). Satu tanggal liar cukup untuk
 *    merusak median jeda dan membuat kita menyiarkan angka ngawur.
 */
function tanggalSah(c, nowMs) {
  if (!c || c.bulk === true || !c.date) return null;
  const t = Date.parse(c.date);
  if (!Number.isFinite(t) || t > nowMs) return null;
  return t;
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Siklus rilis kode sebuah game, dari arsip + daftar aktif.
 *
 * "Gelombang" = satu HARI rilis, bukan satu kode: sumber sering menerbitkan 3
 * kode sekaligus saat livestream, dan menghitungnya sebagai tiga peristiwa
 * membuat jedanya terbaca 0 hari.
 *
 * @param {object[]} riwayat  seluruh kode game ini (aktif + arsip)
 * @param {{nowMs?: number, minGelombang?: number}} opt
 * @returns {{gelombang:number, jedaMedian:number, terakhirMs:number, hariSejak:number,
 *            jatuhTempo:boolean, totalKode:number}|null}
 */
export function siklusRilis(riwayat, { nowMs = Date.now(), minGelombang = 5, maksGelombang = 10 } = {}) {
  const hari = new Set();
  let totalKode = 0;
  for (const c of riwayat ?? []) {
    const t = tanggalSah(c, nowMs);
    if (t == null) continue;
    totalKode += 1;
    hari.add(new Date(t).toISOString().slice(0, 10));
  }
  const semuaTgl = [...hari].sort();

  // GELOMBANG, bukan tanggal. Rilis yang berdekatan (≤2 hari) adalah peristiwa
  // yang SAMA dipecah jadi dua baris di sumber — mis. livestream yang kodenya
  // menyusul besoknya. Menghitungnya sebagai dua siklus membuat "jarak antar-
  // rilis" tertarik ke bawah oleh jeda satu hari yang sebenarnya bukan jeda.
  // Jarak diukur dari AWAL gelombang, bukan dari tanggal sebelumnya. Kalau dari
  // tanggal sebelumnya, gelombangnya bisa menyambung tanpa batas: Genshin rilis
  // 10, 12, lalu 13 Agu — tiap langkah cuma 1-2 hari, jadi ketiganya menyatu jadi
  // satu "gelombang" sepanjang tiga hari, dan rantainya bisa terus memanjang
  // selama sumbernya rajin. Gelombang seharusnya berarti ledakan pendek.
  const gelombang = [];
  for (const d of semuaTgl) {
    const ekor = gelombang[gelombang.length - 1];
    if (ekor && (Date.parse(d) - Date.parse(ekor[0])) / HARI <= 2) ekor.push(d);
    else gelombang.push([d]);
  }
  if (gelombang.length < minGelombang) return null;

  // JENDELA: hanya gelombang TERAKHIR yang dipakai menghitung "biasanya".
  //
  // Tanpa ini, dua kode AFK Journey dari 2024 ikut menarik rentangnya jadi 864
  // hari — seluruh siklus 2026 tergencet di 14% kanan grafik, dan sumbunya
  // berlabel "28 Mar" tanpa tahun sehingga terbaca sebagai Maret tahun ini.
  // Grafik yang salah baca lebih buruk daripada tak ada grafik.
  //
  // Yang ditanya penonton juga "sekarang ritmenya gimana", bukan "rata-rata
  // sepanjang masa". Riwayat dua tahun lalu menjawab pertanyaan yang tak
  // seorang pun ajukan.
  // WAKIL tiap gelombang = tanggal TERAKHIRNYA, dan semua angka diturunkan dari
  // deret wakil yang sama ini: jeda, tanggal yang dipajang, sampai "sejak rilis
  // terakhir".
  //
  // Dulu wakilnya tanggal AWAL, sementara "sejak rilis terakhir" dihitung dari
  // rilis terbaru — dan keduanya tampil berdampingan di layar. Genshin 13 Agu
  // 2026 memajang "SEJAK TERAKHIR: 0 hari" tepat di atas deretan yang tanggal
  // terakhirnya "10 Agu". Dua definisi berbeda dalam satu adegan; penonton tak
  // punya cara tahu mana yang benar.
  const dipakai = gelombang.slice(-maksGelombang);
  const wakil = dipakai.map((g) => Date.parse(g[g.length - 1]));
  const jeda = [];
  for (let i = 1; i < wakil.length; i++) jeda.push((wakil[i] - wakil[i - 1]) / HARI);
  const jm = median(jeda);
  if (jm == null) return null;
  // RENTANG, bukan cuma median. Satu angka ("tiap ~7 hari") terdengar seperti
  // jadwal, padahal kita tak tahu jadwal developer — yang kita punya cuma sebaran
  // jarak yang pernah terjadi. Arahan user 14 Agu 2026: "jangan dibuat rata-rata,
  // bikin aja misalnya 4-21 hari, karena kan kita gak tau juga kapan pastinya
  // kodenya drop." Median tetap dipulangkan (berguna untuk mengurutkan/menakar),
  // tapi yang DIPAJANG rentangnya.
  const jedaMin = Math.max(1, Math.round(Math.min(...jeda)));
  const jedaMaks = Math.round(Math.max(...jeda));

  // Dihitung dari tanggal rilis TERAKHIR (bukan awal gelombang terakhir):
  // pertanyaannya "kode terbaru umurnya berapa hari", dan itu yang dilihat
  // penonton di kartu kode.
  const terakhirMs = Date.parse(semuaTgl[semuaTgl.length - 1]);
  const hariSejak = Math.floor((nowMs - terakhirMs) / HARI);
  return {
    // Yang DIPAKAI menghitung, bukan seluruh riwayat: angka di layar harus
    // menggambarkan periode yang sama dengan yang divisualkan. Sebelumnya "15
    // gelombang" mencakup 2024 sementara grafiknya praktis cuma memperlihatkan
    // 2026 — dua periode berbeda dalam satu adegan.
    gelombang: dipakai.length,
    gelombangTotal: gelombang.length,
    // Tanggal mulai tiap gelombang di jendela. Dipulangkan dari sini (bukan
    // dihitung ulang di renderer) supaya angka di layar dan angka di naskah VO
    // tak mungkin berasal dari dua perhitungan berbeda — kembar yang meleset
    // justru yang paling susah ketahuan.
    hari: dipakai.map((g) => g[g.length - 1]),
    // Jeda antar-gelombang terakhir, terbaru di kanan. Inilah "ritme"-nya: enam
    // angka ini bercerita lebih cepat daripada grafik sebar mana pun.
    jedaTerakhir: jeda.slice(-6).map((x) => Math.round(x)),
    jedaMedian: Math.round(jm),
    jedaMin,
    jedaMaks,
    terakhirMs,
    hariSejak,
    // "Jatuh tempo" = sudah lewat jarak TERPANJANG yang pernah tercatat, bukan
    // lewat rata-ratanya. Dengan median, game yang jaraknya 4-21 hari akan
    // dinyatakan "telat" pada hari ke-9 — padahal jarak 21 hari sudah pernah
    // terjadi dan sama sekali tak aneh.
    //
    // Disajikan sebagai PENGAMATAN ("jaraknya 4-21 hari, terakhir 4 hari lalu"),
    // bukan RAMALAN ("besok keluar kode baru") — kita tak tahu jadwal developer,
    // dan menebaknya di depan penonton cuma menukar kredibilitas dengan drama.
    jatuhTempo: hariSejak > jedaMaks,
    /** Sudah berada DI DALAM rentang jarak yang biasa terjadi. */
    dalamRentang: hariSejak >= jedaMin && hariSejak <= jedaMaks,
    totalKode,
  };
}

/**
 * Kode yang waktunya hampir habis — urgensi JUJUR, bukan "buruan!" yang dipukul
 * rata ke semua video seperti naskah lama.
 *
 * Hanya memakai `endsAt` (pernyataan sumber soal kapan kode berhenti berlaku).
 * Kode yang sudah lewat tak masuk sini: sejak 13 Agu 2026 ia otomatis pindah ke
 * arsip (src/archive.mjs), jadi kalau masih tersisa di daftar aktif, itu bug —
 * dan menampilkannya sebagai "hampir habis" akan menyembunyikan bug itu.
 */
export function kodeSekarat(codes, { nowMs = Date.now(), dalamHari = 14 } = {}) {
  const out = [];
  for (const c of codes ?? []) {
    if (!c?.endsAt) continue;
    const t = Date.parse(c.endsAt);
    if (!Number.isFinite(t) || t <= nowMs) continue;
    const sisa = (t - nowMs) / HARI;
    if (sisa <= dalamHari) out.push({ code: c.code, sisaHari: Math.max(0, Math.floor(sisa)), endsAt: c.endsAt });
  }
  return out.sort((a, b) => a.sisaHari - b.sisaHari);
}

/**
 * Kode yang rilis dalam N hari terakhir — "yang benar-benar baru hari ini".
 * Memakai tanggalSah, jadi kode impor massal tak pernah menyamar jadi baru.
 */
export function kodeBaru(codes, { nowMs = Date.now(), dalamHari = 3 } = {}) {
  const out = [];
  for (const c of codes ?? []) {
    const t = tanggalSah(c, nowMs);
    if (t == null) continue;
    const umur = (nowMs - t) / HARI;
    if (umur <= dalamHari) out.push({ code: c.code, umurHari: Math.floor(umur) });
  }
  return out.sort((a, b) => a.umurHari - b.umurHari);
}

/**
 * Kedalaman arsip kode sebuah game: berapa yang masih hidup, berapa yang sudah
 * mati, dan sejak kapan kami mencatatnya.
 *
 * KENAPA INI YANG DIPAJANG, bukan "posisi siklus". Bar posisi siklus menjawab
 * "sudah sejauh mana kita menunggu" — dan di video yang dipicu KODE BARU
 * jawabannya selalu "baru mulai", jadi barnya kosong melompong justru di
 * keadaan yang paling sering terbit (arahan user 14 Agu 2026: "aneh aja untuk
 * video dengan kode yang baru keluar ditulisnya 1 hari").
 *
 * Kedalaman arsip tak punya masalah itu: angkanya bermakna sama kuatnya di
 * video kode baru maupun video biasa. Dan ia memperlihatkan hal yang tak bisa
 * ditiru cepat — kode mati TIDAK dihapus di sini, jadi jumlah "sudah mati" itu
 * bukti bahwa game ini benar-benar diikuti dari waktu ke waktu, bukan disalin
 * sekali dari agregator lain.
 *
 * `sejakMs` memakai firstSeenAt — dan justru DI SINILAH field itu tepat: yang
 * ditanya "sejak kapan KAMI mencatat", bukan "kapan kodenya rilis". (Untuk
 * pertanyaan kedua, lihat tanggalSah di atas, yang sengaja menolaknya.)
 *
 * @param {object[]} aktif  kode aktif game ini
 * @param {object[]} arsip  kode arsip game ini
 */
export function kedalamanArsip(aktif, arsip) {
  const a = (aktif ?? []).length, m = (arsip ?? []).length;
  if (a + m === 0) return null;
  // HANYA firstSeenAt. TIDAK boleh jatuh ke `date`.
  //
  // `date` = kapan kode DIRILIS developer; firstSeenAt = kapan WORKER pertama
  // melihatnya. Yang ditanya di layar "diarsipkan sejak kapan", jadi jawabannya
  // yang kedua. Versi pertama memakai keduanya dan langsung melahirkan klaim
  // palsu: AFK Journey menyimpan dua kode ber-date Maret 2024, sehingga video
  // memajang "DIARSIPKAN SEJAK 28 Mar 2024" — dua tahun sebelum worker ini ada.
  //
  // Kode tanpa firstSeenAt dilewati, bukan ditambal dari field lain. Lebih baik
  // tanggalnya tak muncul daripada muncul salah.
  let sejakMs = Infinity;
  for (const c of [...(aktif ?? []), ...(arsip ?? [])]) {
    const p = c?.firstSeenAt ? Date.parse(c.firstSeenAt) : NaN;
    if (Number.isFinite(p) && p < sejakMs) sejakMs = p;
  }
  return { aktif: a, mati: m, total: a + m, sejakMs: Number.isFinite(sejakMs) ? sejakMs : null };
}

/**
 * Ringkasan satu baris untuk log/laporan — memudahkan melihat game mana yang
 * videonya akan dapat adegan tambahan dan mana yang polos.
 */
export function ringkasWawasan(w) {
  const b = [];
  if (w.siklus) b.push(`siklus ${w.siklus.gelombang} gelombang/${w.siklus.jedaMin}-${w.siklus.jedaMaks}h`);
  if (w.arsip) b.push(`arsip ${w.arsip.aktif}+${w.arsip.mati}`);
  if (w.sekarat?.length) b.push(`${w.sekarat.length} sekarat`);
  if (w.baru?.length) b.push(`${w.baru.length} baru`);
  return b.length ? b.join(" · ") : "tak ada wawasan (adegan tambahan dilewati)";
}
