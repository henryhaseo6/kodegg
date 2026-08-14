// Naskah VO yang disusun DARI FAKTA, bukan dari cetakan.
//
// MASALAH YANG DIGANTIKAN. `voScript` lama (video/make-audio.mjs) menerima empat
// masukan — nama game, jumlah kode, dan dua boolean — jadi seluruh kanal cuma
// punya empat kemungkinan naskah. Peninjau YouTube menyebutnya "follows a strict
// template" (13 Agu 2026), dan itu bukan kesan: itu deskripsi akurat dari
// fungsinya. Yang berubah antar-video cuma nama game dan satu angka.
//
// CARA KERJA DI SINI. Naskah dirakit dari daftar kalimat, dan tiap kalimat punya
// SYARAT DATA. Tak ada data → kalimatnya HILANG, bukan diganti versi umum.
// Konsekuensinya sengaja: game yang datanya kaya dapat narasi panjang & spesifik,
// game yang datanya tipis dapat narasi pendek yang tetap jujur. Perbedaan antar-
// video jadi CERMIN dari perbedaan datanya — bukan variasi yang kita karang biar
// terlihat beragam. Itu bedanya "unik" dengan "disamar-samarkan".
//
// ATURAN YANG TAK BOLEH DILANGGAR:
//  1. JANGAN membacakan kode. TTS mengeja "AAu2FAUSPUa" jadi bunyi yang tak bisa
//     dipahami siapa pun. Tugas VO membingkai; kodenya dibaca dari layar.
//  2. JANGAN menyebut angka yang tak diukur. Semua angka di sini datang dari
//     video/wawasan.mjs, yang sudah memulangkan null saat buktinya kurang.
//  3. JANGAN meramal. "Biasanya tiap ~9 hari dan yang terakhir 4 hari lalu"
//     adalah pengamatan; "besok keluar kode baru" adalah tebakan yang dibayar
//     dengan kredibilitas.

/** Angka → kata untuk yang kecil. TTS membaca "3" dengan intonasi daftar; kata
 *  membuatnya terdengar seperti orang bercerita. Di atas sepuluh biarkan angka. */
const kata = (n) => ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh"][n] ?? String(n);

/** Reward mentah → enak diucapkan. "Bling ×20000" dibaca TTS sebagai "Bling kali
 *  20000"; tanda ×  harus jadi kata, dan pemisah "·" jadi jeda koma. */
function rewardUcap(teks) {
  if (!teks) return null;
  return String(teks)
    // Penanda kali BOLEH BERTUMPUK di data lama ("Invite Letters ×x20", 110 kode
    // dari sumber redeemtracker sebelum diperbaiki 13 Agu 2026), jadi `+` bukan
    // hiasan — tanpa itu keluarannya "kali sebanyak 20".
    //
    // Wajib didahului SPASI. Tanpa syarat itu, huruf "x" di tengah nama item ikut
    // tertelan: "Mix 5" jadi "Mi sebanyak 5".
    .replace(/\s(?:[×x]\s*)+(\d)/gi, " sebanyak $1")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Syarat redeem → enak diucapkan. Tanda kurung dibaca TTS sebagai jeda mati di
 *  tengah kalimat ("Union Level 2 ... kalahkan boss tutorial pertama"); dijadikan
 *  koma supaya mengalir sebagai satu kalimat. */
const syaratUcap = (t) => String(t ?? "").replace(/\s*\(([^)]*)\)/g, ", $1").replace(/\s{2,}/g, " ").trim();

/**
 * Susun naskah VO.
 *
 * @param {object} p
 * @param {string} p.name            nama game
 * @param {number} p.activeCount     jumlah kode aktif
 * @param {object[]} [p.codes]       kode yang tampil (butuh .reward utk kalimat hadiah)
 * @param {object} [p.wawasan]       {siklus, sekarat, baru} dari video/wawasan.mjs
 * @param {object} [p.redeem]        {req, steps[]} dari registry redeem
 * @param {boolean} [p.allMode]      video "semua kode aktif" (umur kode tak diketahui)
 * @param {boolean} [p.isPromo]      Roblox promo codes (ditukar di web, bukan in-game)
 * @returns {{teks:string, dipakai:string[]}} dipakai = daftar kalimat yang lolos syarat
 */
export function susunNaskah({ name, activeCount, codes = [], wawasan = null, redeem = null, allMode = false, isPromo = false }) {
  const n = activeCount || codes.length || 0;
  const baru = wawasan?.baru ?? [];
  const sekarat = wawasan?.sekarat ?? [];
  const siklus = wawasan?.siklus ?? null;
  const dipakai = [];
  const B = [];
  const tambah = (nama, kalimat) => { if (kalimat) { B.push(kalimat); dipakai.push(nama); } };

  // 1. PEMBUKA. Tiga bentuk, dipilih oleh BUKTI umur kode — bukan oleh boolean
  //    yang disetel pemanggil. `baru` sudah menuntut tanggal rilis asli, jadi
  //    "kode baru" di sini selalu bisa dipertanggungjawabkan.
  if (baru.length) {
    const kapan = baru[0].umurHari === 0 ? "hari ini" : baru[0].umurHari === 1 ? "kemarin" : `${kata(baru[0].umurHari)} hari lalu`;
    tambah("pembuka-baru", `Ada ${kata(baru.length)} kode ${name} yang baru keluar ${kapan}, dan total ${n} kode masih aktif sekarang.`);
  } else if (allMode) {
    tambah("pembuka-semua", `Ini semua kode ${name} yang masih aktif. Ada ${n} kode, semuanya sudah diverifikasi.`);
  } else {
    tambah("pembuka", `Ada ${n} kode ${name} yang masih aktif hari ini, semuanya sudah diverifikasi.`);
  }

  // 2. HADIAH TERBESAR — verbatim dari sumber (aturan fidelitas CLAUDE.md),
  //    cuma dirapikan pengucapannya. Kalau tak ada reward tersimpan, kalimat ini
  //    hilang; inilah yang terjadi pada Whiteout Survival, yang keenam kodenya
  //    tak punya reward sama sekali.
  const terpanjang = [...codes].filter((c) => c.reward).sort((a, b) => String(b.reward).length - String(a.reward).length)[0];
  tambah("hadiah", terpanjang ? `Yang paling gede isinya ${rewardUcap(terpanjang.reward)}.` : null);

  // 3. URGENSI — hanya bila ADA kode yang benar-benar hampir habis. Naskah lama
  //    memukul rata "buruan ya, sebagian cuma aktif beberapa hari" ke SEMUA
  //    video, termasuk game yang kodenya permanen. Itu jenis kalimat yang bikin
  //    penonton berhenti percaya pada yang lain.
  if (sekarat.length) {
    const s = sekarat[0];
    const sisa = s.sisaHari <= 0 ? "kurang dari sehari" : s.sisaHari === 1 ? "tinggal sehari" : `tinggal ${kata(s.sisaHari)} hari`;
    tambah("urgensi", `Catat ya, satu kodenya ${sisa} lagi sebelum kedaluwarsa, jadi tukarkan sekarang.`);
  }

  // 4. SIKLUS — bagian yang tak dimiliki kanal lain, karena butuh arsip
  //    berbulan-bulan untuk bisa diucapkan.
  if (siklus) {
    // "dari N rilis terakhir", BUKAN "sudah N kali rilis yang kami rekam": N di
    // sini jumlah gelombang DI JENDELA (10), sedangkan yang kami rekam
    // seluruhnya lebih banyak (12 utk AFK Journey). Kalimat lama membuat VO
    // mengucapkan angka yang lebih kecil dari kenyataan sambil terdengar seperti
    // mengklaim keseluruhan — dan angka di layar pun jadi tak sama artinya.
    //
    // RENTANG, bukan rata-rata: "tiap sekitar 7 hari" terdengar seperti jadwal
    // yang kita ketahui. Yang kita punya cuma sebaran jarak yang pernah terjadi,
    // dan mengucapkannya apa adanya justru lebih berguna — penonton jadi tahu
    // kapan MASUK AKAL untuk mengecek lagi.
    const inti = `Dari ${siklus.gelombang} rilis terakhir yang kami catat, jarak antar-kode ${name} tak tentu: paling cepat ${siklus.jedaMin} hari, paling lama ${siklus.jedaMaks} hari.`;
    const ekor = siklus.jatuhTempo
      ? ` Yang terakhir sudah ${siklus.hariSejak} hari lalu, jadi sudah lewat dari rentang biasanya.`
      : siklus.dalamRentang
        ? ` Yang terakhir ${siklus.hariSejak} hari lalu, jadi sekarang sudah masuk rentangnya.`
        : ` Yang terakhir ${siklus.hariSejak} hari lalu.`;
    tambah("siklus", inti + ekor);
  }

  // 4b. KEDALAMAN ARSIP. Disebut hanya bila ADA kode mati yang tersimpan —
  //     tanpa itu kalimatnya cuma mengulang jumlah kode aktif yang sudah
  //     disebut di pembuka. Yang membuatnya layak diucapkan justru angka kode
  //     matinya: itu bukti game ini diikuti dari waktu ke waktu.
  const ar = wawasan?.arsip;
  if (ar && ar.mati > 0) {
    tambah("arsip", `Buat game ini kami sudah mencatat ${ar.total} kode: ${ar.aktif} masih aktif, ${ar.mati} sudah kedaluwarsa tapi tetap kami simpan di arsip.`);
  }

  // 5. CARA TUKAR. Langkahnya sudah tampil di layar; VO cuma menyebut syaratnya,
  //    karena itu yang paling sering bikin orang gagal menukar dan tak kelihatan
  //    kalau cuma dibaca sekilas.
  if (isPromo) {
    tambah("cara-promo", "Kode ini ditukarnya di roblox dot com garis miring promocodes, bukan di dalam game.");
  } else if (redeem?.req) {
    // "pastikan akunmu sudah ${req}" TERDENGAR RUSAK, karena `req` di registry
    // ditulis sebagai kalimat perintah ("Selesaikan tutorial awal...") maupun
    // frasa benda ("Union Level 2 (kalahkan boss tutorial pertama)") — tak ada
    // satu induk kalimat yang cocok untuk keduanya. Bentuk "Syaratnya: X" muat
    // untuk dua-duanya tanpa mengubah teks aslinya.
    tambah("cara-syarat", `Syaratnya satu: ${syaratUcap(redeem.req)}. Kalau belum, kodenya bakal ditolak.`);
  } else {
    tambah("cara", "Salin kodenya dari layar, terus tukarkan di dalam game.");
  }

  // 6. PENUTUP. Satu-satunya bagian yang memang sama di tiap video, dan itu
  //    wajar: ini identitas kanal, bukan isi.
  tambah("penutup", `Kode lengkap semua game, plus arsipnya, ada di kode gg dot com. Jangan lupa subscribe biar nggak ketinggalan kode berikutnya.`);

  return { teks: B.join(" "), dipakai };
}

/** Perkiraan durasi baca (detik). Dipakai pemanggil untuk memutuskan apakah
 *  naskahnya perlu dipangkas SEBELUM TTS dipanggil — mengukur sesudahnya berarti
 *  sudah membayar biayanya (dan untuk mesin berbayar, itu uang beneran). */
export const perkiraanDetik = (teks, katakataPerMenit = 165) =>
  (String(teks).trim().split(/\s+/).filter(Boolean).length / katakataPerMenit) * 60;
