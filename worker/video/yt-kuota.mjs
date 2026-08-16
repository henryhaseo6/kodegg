// Pencatat pemakaian kuota YouTube Data API — per HARI PACIFIC (siklus resetnya).
//
// KENAPA ADA. `MAX_PER_DAY` di make-videos.mjs sudah disetel ulang enam kali
// (45→43→52→65→46→57), dan tiap kali dengan cara yang sama: membaca SATU angka
// total di konsol Google, lalu membaginya dengan jumlah upload hari itu. Cara itu
// mustahil memisahkan biaya upload dari biaya pekerjaan lain yang kebetulan ikut
// jalan — jadi tiap kali komposisi harinya berubah, angka "unit per video"-nya
// ikut bergeser dan konstantanya harus ditebak ulang.
//
// Terbukti 12 Agu 2026: konsol menunjukkan 1.483 unit terpakai tak lama sesudah
// reset dengan hanya 3 upload — terlihat seperti pemborosan liar. Yang membakar
// bukan uploadnya (±490) melainkan antrean kemarin yang menguras berbarengan di
// run pertama: 7 playlist tertunda + 6 thumbnail tertunda (±990).
//
// YANG DICATAT DI SINI FAKTA: berapa kali tiap metode API dipanggil. Unitnya
// ESTIMASI dari tarif di bawah. Kalau konsol memberi angka lain, yang salah
// tarifnya — jumlah panggilannya tidak pernah salah, dan dari situ tarif yang
// benar bisa dihitung mundur tanpa menebak.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// KODEGG_DATA: dipakai untuk MENGUJI dengan data buatan tanpa mengotori catatan
// asli (sama seperti audit-data.mjs). Kosong = worker/data seperti biasa.
const DATA = process.env.KODEGG_DATA || resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const FILE = resolve(DATA, "kuota-yt.json");
const hariPT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Kuota harian satu project Google Cloud. Angka konsol, bukan tebakan.
export const KUOTA_HARIAN = Number(process.env.YT_KUOTA_HARIAN || 10000);

// TARIF. Yang `list`/`insert`/`update`/`set` = tarif resmi dokumentasi YouTube
// (list 1, tulis 50). `videos.insert` SENGAJA TIDAK memakai angka dokumentasi
// (1.600): kalau benar segitu, 47 upload dalam sehari (5 Agu 2026) akan menelan
// 75.200 unit, sementara konsol hari itu mencatat 10.038 — jadi tarif yang
// ditagihkan ke project ini jelas bukan 1.600.
//
// NOL — DIUKUR, bukan ditaksir. 13 Agu 2026, run dengan jumlah panggilan yang
// tercatat lengkap (inilah gunanya pencatat ini): konsol 1.660 → 3.677 unit,
// selisih 2.017. Panggilan run itu, dihargai dengan tarif dokumentasi (tulis 50,
// baca 1) dan videos.insert DIABAIKAN:
//   playlistItems.insert ×22, thumbnails.set ×13, playlists.insert ×2,
//   playlists.update ×1                                        = 1.900
//   playlists.list ×93, videos.list ×13, playlistItems.list ×11 =   117
//                                                          jumlah = 2.017  ← PAS
// Sisa untuk 13 videos.insert: 0. Jadi upload TIDAK ditagih ke "Queries per day"
// sama sekali; yang membatasinya kuota TERPISAH "Video Uploads per day" (100).
//
// Ini membatalkan premis yang dipakai bertahun di make-videos.mjs — angka
// "163,6 unit per video" itu ternyata ongkos playlist+thumbnail+pembacaan yang
// MENYERTAI upload, bukan harga uploadnya. Dokumentasi Google menyebut 1.600
// untuk videos.insert; yang ditagihkan ke project ini bukan itu.
//
// Kalau suatu hari konsol tak lagi cocok, ubah DI SINI (atau lewat env
// YT_UNIT_UPLOAD) — jangan menggeser MAX_PER_DAY, karena itu mencampur ulang dua
// hal yang beda: jumlah video vs harga per panggilan.
const TARIF_UPLOAD = Number(process.env.YT_UNIT_UPLOAD || 0);
const tarif = (metode) => {
  if (metode === "videos.insert") return TARIF_UPLOAD;
  if (metode === "search.list") return 100; // termahal — jangan dipakai di jalur otomatis
  if (/\.(insert|update|delete|set)$/.test(metode)) return 50;
  return 1; // list & sisanya
};

function baca() {
  try {
    const d = JSON.parse(readFileSync(FILE, "utf8"));
    if (d?.hari === hariPT()) return d;
  } catch { /* belum ada / rusak → mulai bersih */ }
  return { hari: hariPT(), panggilan: {} };
}
let buku = null;
const muat = () => (buku ??= baca());

/** Catat satu panggilan API. Ditulis ke berkas seketika: runner CI sekali pakai,
 *  dan run bisa mati di tengah (kuota habis, timeout) — justru run seperti itu
 *  yang catatannya paling ingin kita punya. */
export function catat(metode) {
  const b = muat();
  b.panggilan[metode] = (b.panggilan[metode] ?? 0) + 1;
  try { writeFileSync(FILE, JSON.stringify(b, null, 1) + "\n"); } catch { /* jangan pernah menggagalkan upload */ }
}

/** Estimasi unit terpakai hari PT ini. */
export function unitTerpakai() {
  const b = muat();
  return Object.entries(b.panggilan).reduce((n, [m, jml]) => n + tarif(m) * jml, 0);
}
export const unitSisa = () => Math.max(0, KUOTA_HARIAN - unitTerpakai());

/** Ongkos satu video otomatis. DIUKUR, bukan dijumlah dari daftar tarif.
 *
 *  Penjumlahan teoretis memberi 103: insert (0) + cek privacy (1) + cari
 *  playlist (1) + cek isi playlist (1) + masukkan ke playlist (50) + thumbnail
 *  (50). Angka itu MELESET 45% dari kenyataan, dan melesetnya selalu ke arah
 *  yang sama — terlalu murah.
 *
 *  Ukuran 15 Agu 2026: konsol 7.323 unit untuk 49 video = 149/video. Selisihnya
 *  bukan kejutan sekali lewat melainkan biaya tetap yang tak masuk daftar itu:
 *  pengurasan antrean playlist tertunda (insert untuk video hari sebelumnya),
 *  pembuatan playlist baru (50), dan penyisiran playlists.list (344 panggilan).
 *  Angka serupa terukur 13 Agu (155/video).
 *
 *  KENAPA INI PENTING. Nilai ini dipakai sebagai REM: rem yang menaksir terlalu
 *  murah akan meloloskan video yang unitnya sebenarnya tak cukup — dan
 *  penolakannya baru terjadi SETELAH render, jadi waktunya sudah telanjur
 *  terbuang. Lebih baik berhenti satu video terlalu awal.
 *  Dipakai sebagai REM: berhenti SEBELUM unitnya kurang, bukan sesudah upload
 *  ditolak — penolakan terjadi setelah render, jadi waktunya telanjur terbuang. */
export const UNIT_PER_VIDEO = Number(process.env.YT_UNIT_PER_VIDEO || 150);

// JATAH PLAYLIST BARU PER HARI — batas yang TERPISAH dari kuota unit, dan yang
// justru lebih sering mengikat. Angkanya tak didokumentasikan Google; ~10/hari
// adalah pengamatan (pembuatan ke-11 dst ditolak). Bisa disetel lewat env kalau
// pengamatannya berubah.
export const PLAYLIST_HARIAN = Number(process.env.YT_PLAYLIST_HARIAN || 10);

/** Sisa jatah playlist BARU hari PT ini, menurut catatan panggilan kita sendiri.
 *
 *  Dipakai jalur borongan untuk memutuskan boleh-tidaknya membuat playlist.
 *  Sebelumnya borongan menahan diri TANPA SYARAT, dan itu membuang jatah yang
 *  masih ada: 13 Agu 2026 hanya 7 dari ~10 terpakai, tapi dua video borongan
 *  tetap terbit tanpa playlist dan jadi yatim permanen (kodenya sudah ditandai
 *  posted, jadi takkan diulang).
 *
 *  Angkanya ESTIMASI — kalau meleset dan YouTube menolak, uploadVideo memulangkan
 *  playlistPending dan videonya masuk daftar "buat MANUAL" seperti biasa. Jadi
 *  salah tebak di sini menurunkan mutu, bukan menggagalkan upload. */
export const sisaPlaylist = () => Math.max(0, PLAYLIST_HARIAN - (muat().panggilan["playlists.insert"] ?? 0));

/** Ringkasan satu baris + rincian panggilan, untuk log run & laporan harian. */
export function ringkas() {
  const b = muat();
  const rinci = Object.entries(b.panggilan)
    .sort((a, b2) => tarif(b2[0]) * b2[1] - tarif(a[0]) * a[1])
    .map(([m, n]) => `${m}×${n}`)
    .join(" · ");
  return { hari: b.hari, unit: unitTerpakai(), sisa: unitSisa(), panggilan: { ...b.panggilan }, rinci };
}

// Resource yang dipakai proyek ini. DAFTAR TETAP, bukan hasil enumerasi:
// googleapis mendefinisikan resource sebagai properti non-enumerable, jadi
// Object.keys(yt) memulangkan kosong dan pembungkus otomatis akan diam-diam
// tak membungkus apa pun.
const RESOURCE = ["videos", "playlists", "playlistItems", "thumbnails", "commentThreads", "channels", "search", "captions"];

/** Bungkus klien googleapis supaya TIAP panggilan tercatat tanpa harus menyentuh
 *  satu per satu tempat pemanggilnya — yang justru cara paling gampang membuat
 *  catatan ini bolong begitu ada pemanggil baru.
 *
 *  JANGAN mem-Proxy objek layanannya langsung. googleapis memasang `videos`,
 *  `playlists`, dst sebagai properti data non-writable & non-configurable, dan
 *  spesifikasi Proxy MEWAJIBKAN trap `get` memulangkan nilai yang sama persis
 *  untuk properti seperti itu. Membungkusnya melanggar invarian dan melempar
 *  TypeError pada AKSES PERTAMA:
 *    'get' on proxy: property 'videos' is a read-only and non-configurable
 *    data property ... but the proxy did not return its actual value
 *  Terjadi 12 Agu 2026: seluruh upload gagal ~17 jam (jatuh ke _video-out/,
 *  jadi tak ada yang hilang, tapi tak ada yang tayang) sampai user menyadari
 *  tak ada video baru. Instrumentasi TAK BOLEH ada di jalur kritis.
 *
 *  Yang dipakai sekarang: objek turunan (prototype = klien asli) dengan
 *  properti resource DIDEFINISIKAN ULANG lewat defineProperty — membayangi
 *  properti non-writable induknya secara sah. Resource-nya sendiri boleh
 *  di-Proxy: metodenya ada di prototype, bukan properti own yang beku. */
export function pantau(yt) {
  try {
    const bungkus = Object.create(yt);
    for (const nama of RESOURCE) {
      const res = yt?.[nama];
      if (!res || typeof res !== "object") continue;
      const dipantau = new Proxy(res, {
        get(target, metode) {
          const fn = target[metode];
          if (typeof metode !== "string" || typeof fn !== "function") return fn;
          return (...arg) => {
            try { catat(`${nama}.${metode}`); } catch { /* catatan gagal ≠ panggilan gagal */ }
            return fn.apply(target, arg);
          };
        },
      });
      Object.defineProperty(bungkus, nama, { value: dipantau, enumerable: true, configurable: true });
    }
    return bungkus;
  } catch (e) {
    // Gagal membungkus = kehilangan CATATAN, bukan kehilangan fungsi. Pulangkan
    // klien apa adanya; lebih baik kuotanya tak tercatat daripada video tak naik.
    console.log(`  (pencatat kuota dilewati: ${e.message})`);
    return yt;
  }
}
