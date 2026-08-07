// PENJAGA VIDEO HARIAN — satu tanggal, satu video.
//
// KENAPA ADA. top50-video dan codes-roundup tak menyimpan catatan apa pun
// tentang video yang sudah dibuat, jadi tak ada yang mencegah dua run untuk
// tanggal yang SAMA menghasilkan dua video identik.
//
// Terjadi 7 Agu 2026 pada roundup. Jadwal 6 Agu (17:35 UTC) tak muncul selama
// berjam-jam karena GitHub Actions sedang penuh, lalu disimpulkan dijatuhkan
// permanen dan disusulkan manual pukul 01:35. Tujuh belas menit kemudian cron
// yang "hilang" itu datang — 8,3 jam telat — dan mengunggah video kedua yang
// isinya persis sama.
//
// Pelajarannya bukan "jangan menyusulkan manual", melainkan: KETIADAAN RUN TAK
// BISA DIBEDAKAN dari "belum datang". Keduanya terlihat identik dari luar, jadi
// pencegahannya tak boleh bersandar pada penilaian manusia tentang mana yang
// sedang terjadi — harus ada catatan yang bisa diperiksa mesin.
//
// Penjaga ini menutup seluruh kelasnya sekaligus: cron telat yang menyusul,
// dispatch manual dobel, atau re-run yang tak sengaja.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, "..", "data", "video-harian.json");

const baca = () => {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; }
};

/**
 * Video untuk (jenis, tanggal) yang sudah pernah diunggah — atau null.
 * @param {string} jenis  "top50" | "roundup"
 * @param {string} tgl    YYYY-MM-DD
 */
export function sudahDibuat(jenis, tgl) {
  const j = baca();
  return j?.[jenis]?.[tgl] ?? null;
}

/**
 * Catat video yang baru diunggah. Dipanggil SESUDAH unggahan berhasil — bukan
 * sebelum render, supaya render yang gagal di tengah tak meninggalkan catatan
 * palsu yang memblokir percobaan berikutnya.
 */
export function catatDibuat(jenis, tgl, { id, url }) {
  const j = baca();
  (j[jenis] ??= {})[tgl] = { id, url, at: new Date().toISOString() };
  // Simpan 120 tanggal terakhir per jenis — cukup untuk empat bulan, dan
  // mencegah berkasnya tumbuh selamanya.
  const kunci = Object.keys(j[jenis]).sort();
  for (const k of kunci.slice(0, Math.max(0, kunci.length - 120))) delete j[jenis][k];
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(j, null, 1) + "\n");
}
