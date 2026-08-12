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
// 60 DIPILIH SUPAYA COCOK DENGAN ANGKA KONSOL YANG SUDAH TERUKUR, bukan
// diturunkan sendiri: make-videos.mjs mencatat 163,6 unit per video otomatis
// (pengukuran konsol 5–11 Agu 2026). Satu video memanggil videos.insert +
// videos.list (cek privacy) + playlists.list + playlistItems.list +
// playlistItems.insert (50) + thumbnails.set (50) = insert + 103 → insert ≈ 60.
//
// Sengaja TIDAK memakai angka yang lebih besar walau hitungan 12 Agu 2026 sempat
// cocok di ~110: menaksir terlalu mahal membuat rem menahan produksi di ~44
// video padahal jatahnya 57 — kerugian yang nyata, ditukar dengan bahaya yang
// cuma perkiraan. Kalau konsol nanti bilang lain, ubah DI SINI (atau lewat env
// YT_UNIT_UPLOAD); jangan lagi menggeser MAX_PER_DAY, karena itu mencampur ulang
// dua hal yang beda — jumlah video vs harga per panggilan.
const TARIF_UPLOAD = Number(process.env.YT_UNIT_UPLOAD || 60);
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

/** Ongkos satu video otomatis: insert + cek privacy (1) + cari playlist (1) +
 *  cek isi playlist (1) + masukkan ke playlist (50) + thumbnail (50) ≈ 163.
 *  Dipakai sebagai REM: berhenti SEBELUM unitnya kurang, bukan sesudah upload
 *  ditolak — penolakan terjadi setelah render, jadi waktunya telanjur terbuang. */
export const UNIT_PER_VIDEO = TARIF_UPLOAD + 1 + 1 + 1 + 50 + 50;

/** Ringkasan satu baris + rincian panggilan, untuk log run & laporan harian. */
export function ringkas() {
  const b = muat();
  const rinci = Object.entries(b.panggilan)
    .sort((a, b2) => tarif(b2[0]) * b2[1] - tarif(a[0]) * a[1])
    .map(([m, n]) => `${m}×${n}`)
    .join(" · ");
  return { hari: b.hari, unit: unitTerpakai(), sisa: unitSisa(), panggilan: { ...b.panggilan }, rinci };
}

/** Bungkus klien googleapis supaya TIAP panggilan tercatat tanpa harus menyentuh
 *  satu per satu tempat pemanggilnya — yang justru cara paling gampang membuat
 *  catatan ini bolong begitu ada pemanggil baru. */
export function pantau(yt) {
  return new Proxy(yt, {
    get(target, sumber) {
      const nilai = target[sumber];
      if (typeof sumber !== "string" || !nilai || typeof nilai !== "object") return nilai;
      return new Proxy(nilai, {
        get(res, metode) {
          const fn = res[metode];
          if (typeof sumber !== "string" || typeof metode !== "string" || typeof fn !== "function") return fn;
          return (...arg) => { catat(`${sumber}.${metode}`); return fn.apply(res, arg); };
        },
      });
    },
  });
}
