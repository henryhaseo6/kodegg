// PROBE DESKRIPSI ROBLOX — arsip pengamatan, BUKAN sumber kode.
//
// PERTANYAAN: kalau pengembang menempelkan kode di deskripsi game Roblox,
// apakah itu muncul di sana LEBIH DULU daripada kode itu sampai ke Roblox Den /
// RoCodes? Kalau ya, kita punya jalur hulu gratis; kalau tidak, gagasan ini mati
// dengan bukti.
//
// RANCANGANNYA PROSPEKTIF, dan itu satu-satunya cara menjawabnya jujur:
// kumpulkan dulu selama berminggu-minggu, baru cocokkan dengan kode yang datang
// BELAKANGAN. Mengukur "apakah kode yang sudah kita punya ada di deskripsi
// sekarang" — cara pertama yang dicoba — tak membuktikan apa pun, dan angkanya
// (33%) menyesatkan: banyak kode Roblox berupa kata biasa yang muncul di
// deskripsi apa pun. Game "Wanted [POLICE]" berkode "POLICE"; ada pula "SHARDS",
// "FUTURE", "Pet". Disaring ke kode berangka yang juga kode TERBARU game itu,
// 33% runtuh jadi 4,7%.
//
// ONGKOSNYA NOL: deskripsi sudah ikut terbawa di `games.roblox.com/v1/games`
// yang dipanggil tiap jam untuk jumlah pemain. Hulu lain sudah mati semua —
// Discord butuh bot di server, X berbayar, group shout Roblox null lalu throttle
// 429 setelah ~5 permintaan.
//
// ─── TIGA JEBAKAN, SEMUANYA MEMBUAT HASILNYA TERLALU BAGUS ───────────────────
//
// 1. TOKEN YANG SEJAK DULU DI SANA. Kalau "gems" sudah setahun ada di deskripsi
//    lalu kelak jadi kode, kita akan mengklaim deskripsi mendahului berbulan-
//    bulan — padahal itu kebetulan murni. Pembedanya: pengumuman kode adalah
//    SUNTINGAN. Maka token yang sudah ada saat probe MULAI dicap `awal` dan tak
//    pernah dihitung sebagai bukti; hanya token yang MUNCUL BELAKANGAN yang
//    berarti, karena kemunculannya berarti deskripsinya benar-benar diubah.
//
// 2. KODE YANG SUDAH KITA PUNYA. Saat token pertama terlihat, bisa jadi kodenya
//    sudah lebih dulu tayang di situs kita dari Den/RoCodes. Dicap `sudahPunya`
//    dan dikeluarkan — kalau tidak, deskripsi tampak "menemukan" ratusan kode
//    padahal cuma mengeja ulang yang sudah ada.
//
// 3. EKSTRAKSI YANG MEMBUANG DIAM-DIAM. Aturan berbasis BENTUK (harus berangka /
//    ALLCAPS / camelCase) membuang 17,4% bentuk kode nyata kita — starcodeheo,
//    Magicbus, happyhalloween, Chandler. Kode yang tak pernah dicatat mustahil
//    dibuktikan pernah ada di deskripsi, dan tak ada yang memberitahu bahwa ia
//    hilang. Maka bentuk TIDAK dipakai menyaring sama sekali.
//
// Yang dipakai menyaring cuma SEBARAN: kode itu khas satu game, kata umum
// tersebar di banyak game. Diukur atas 490 deskripsi — token tersering semuanya
// kata biasa (game 21x, controls 19x, every 19x, xbox 10x), sementara token yang
// hanya muncul di satu game memuat 315 kode nyata kita. Saringan ini dihitung
// ulang tiap run dari datanya sendiri, jadi tak bisa basi diam-diam seperti
// kamus yang ditulis tangan.

const HARI = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Token dari deskripsi. Sengaja TANPA saringan bentuk (lihat jebakan 3).
 * @returns {string[]}
 */
export function tokenDeskripsi(desc) {
  const teks = String(desc ?? "");
  if (!teks) return [];
  // URL & handle dibuang — keduanya kaya token yang bukan kode.
  const bersih = teks.replace(/https?:\/\/\S+/g, " ").replace(/@\w+/g, " ");
  const out = new Set();
  for (const t of bersih.match(/[A-Za-z0-9_!-]{4,30}/g) ?? []) {
    const kata = t.replace(/^[-_!]+|[-_!]+$/g, "");
    if (kata.length < 4 || kata.length > 30) continue;
    if (!/[A-Za-z]/.test(kata)) continue;
    out.add(kata);
  }
  return [...out];
}

/**
 * Satu putaran pencatatan.
 *
 * @param {object} o
 * @param {Map<number,{desc:string, gid:string}>} o.deskripsi
 * @param {(gid:string)=>Set<string>} o.kodeKita  kode yang SUDAH kita punya (huruf kecil)
 * @param {object} o.memo   isi data/desc-probe.json
 * @returns {{memoBaru: object, baru: object[], awal: boolean}}
 */
export function catatDeskripsi({ deskripsi, kodeKita, memo = {}, now = Date.now() }) {
  const memoBaru = { ...memo };
  // Run PERTAMA menjadi garis dasar: semua yang terlihat saat itu dianggap
  // "sudah di sana" dan tak bisa dijadikan bukti (jebakan 1).
  const baseline = !memoBaru._mulai;
  if (baseline) {
    memoBaru._mulai = now;
    // Token yang SUDAH tercatat sebelum garis dasar ditegakkan ikut dicap.
    // Tanpa ini penjaganya bocor tepat di sambungannya: memo bisa sudah terisi
    // dari versi probe sebelumnya, dan token-token itu lewat cabang "sudah ada"
    // di bawah sehingga tak pernah dapat cap — lalu terhitung sebagai bukti,
    // padahal asal-usulnya persis sama tak diketahuinya. Terjadi 6 Agu 2026:
    // 1.076 dari 6.359 token lolos tanpa cap karena run sebelumnya memakai versi
    // probe yang belum mengenal garis dasar.
    for (const [gid, kodes] of Object.entries(memoBaru)) {
      if (gid === "_mulai") continue;
      for (const v of Object.values(kodes)) v.awal = true;
    }
  }

  const UMUM_MIN = Number(process.env.DESC_UMUM_MIN || 4);
  const sebar = new Map();
  const perGame = new Map();
  for (const [uid, { desc, gid }] of deskripsi) {
    if (!gid) continue;
    const toks = tokenDeskripsi(desc);
    perGame.set(uid, toks);
    for (const t of new Set(toks.map((x) => x.toLowerCase()))) sebar.set(t, (sebar.get(t) ?? 0) + 1);
  }

  const baru = [];
  const hariIni = HARI(now);
  for (const [uid, { gid }] of deskripsi) {
    if (!gid) continue;
    const kandidat = (perGame.get(uid) ?? []).filter((t) => (sebar.get(t.toLowerCase()) ?? 0) < UMUM_MIN);
    if (!kandidat.length) continue;
    const punya = kodeKita(gid);
    const g = (memoBaru[gid] = { ...(memoBaru[gid] ?? {}) });
    for (const k of kandidat) {
      const kunci = k.toLowerCase();
      const lama = g[kunci];
      if (lama) {
        // `terakhir` disimpan per HARI, bukan per jam. Kalau tiap jam berubah,
        // seluruh isi file ikut berubah tiap run dan riwayat git menggelembung
        // tanpa menambah satu pun informasi.
        if (lama.terakhir !== hariIni) lama.terakhir = hariIni;
        continue;
      }
      g[kunci] = {
        tulis: k,
        pertama: now,
        terakhir: hariIni,
        ...(baseline ? { awal: true } : {}),
        ...(punya.has(kunci) ? { sudahPunya: true } : {}),
      };
      if (!baseline && !punya.has(kunci)) baru.push({ game: gid, code: k });
    }
  }
  return { memoBaru, baru, awal: baseline };
}

/**
 * Laporan pembuktian. Hanya token yang MUNCUL BELAKANGAN (bukan `awal`) dan
 * BELUM kita punya saat itu (bukan `sudahPunya`) yang dihitung — sisanya tak
 * bisa membuktikan apa-apa, sekencang apa pun angkanya terlihat.
 *
 * @param {object} memo
 * @param {(gid:string)=>Map<string,number>} kodeKita  kode → firstSeenAt(ms)
 */
export function laporanDeskripsi(memo = {}, kodeKita, now = Date.now()) {
  const mulai = Number(memo._mulai) || 0;
  const umurHari = mulai ? (now - mulai) / 86400000 : 0;
  let sah = 0, terbukti = 0;
  const unggul = [];
  for (const [gid, kodes] of Object.entries(memo)) {
    if (gid === "_mulai") continue;
    const nyata = kodeKita(gid);
    for (const [kunci, v] of Object.entries(kodes)) {
      if (v.awal || v.sudahPunya) continue;
      sah++;
      const kitaMs = nyata.get(kunci);
      if (!kitaMs) continue;
      terbukti++;
      unggul.push({ game: gid, code: v.tulis, jam: (kitaMs - v.pertama) / 3600000 });
    }
  }
  unggul.sort((a, b) => b.jam - a.jam);
  const menang = unggul.filter((u) => u.jam > 0.5);
  console.log(`[desc-probe] arsip ${umurHari.toFixed(1)} hari · ${sah} token sah diawasi · ${terbukti} kelak jadi kode nyata · ${menang.length} deskripsi LEBIH DULU`);
  for (const u of menang.slice(0, 8)) console.log(`  ↑ ${u.code} (${u.game}) — deskripsi mendahului ${u.jam.toFixed(1)} jam`);
  if (umurHari < 3) console.log("  (arsip masih terlalu muda — angka di atas belum berarti apa-apa)");
  else if (terbukti && !menang.length) console.log("  (tak satu pun mendahului — deskripsi menyusul, bukan mendahului)");
  return { sah, terbukti, menang: menang.length, umurHari };
}
