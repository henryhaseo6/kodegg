// SEKSI MENTAH TIAP SUMBER — apa yang benar-benar dikatakan sumber, disimpan
// apa adanya, tak direkonstruksi.
//
// Masalah yang dibereskan. Halaman sumber tak ditarik tiap run (hemat kuota &
// beban), jadi saat dilewati kita memakai "carry-forward": pakai lagi kode dari
// penarikan sebelumnya. Sebelumnya carry-forward itu disusun ulang dari
// KELUARAN KITA SENDIRI — `prev.active`/`prev.archive` disaring field `sources`
// — dan itu melingkar: kita bertanya "apa kata Den?" kepada catatan kita, bukan
// kepada Den.
//
// Kelingkaran itu bocor karena `sources` tak menyimpan SEKSI. Kode yang RoCodes
// daftarkan aktif tapi Den nyatakan mati diarsipkan memakai entri dari daftar
// AKTIF, sehingga arsipnya tercatat bersumber RoCodes saja. Hasilnya 245 dari
// 294 arsip Clover Retribution "milik RoCodes", dan saat RoCodes berbalik
// menyatakan semuanya aktif sementara halaman Den kebetulan dilewati, tak ada
// satu pun vonis expired yang tersisa — 994 kode mati hidup kembali (7 Agu 2026).
//
// Yang disimpan di sini cuma DAFTAR KODE per seksi per sumber per game. Detail
// kode (reward, tanggal) tetap diambil dari data utama saat menyusun ulang;
// yang tak boleh ditebak hanyalah SIAPA menaruh kode itu di seksi MANA. Dengan
// begitu berkasnya kecil: ±711 KB berbanding 14 MB roblox-codes.json.
//
// Entri hanya ditimpa untuk sumber yang BENAR-BENAR ditarik run ini. Sumber yang
// dilewati mempertahankan catatan terakhirnya — itulah gunanya.

import { readFile, writeFile } from "node:fs/promises";

export async function bacaSeksi(berkas) {
  try { return JSON.parse(await readFile(berkas, "utf8")); }
  catch { return { at: null, g: {} }; }
}

/** Catat hasil tarikan NYATA sebuah sumber untuk sebuah game. */
export function catatSeksi(memo, gameId, sumber, hasil, nowMs) {
  const kode = (arr) => [...new Set((arr ?? []).map((c) => String(c.code)).filter(Boolean))];
  ((memo.g[gameId] ??= {})[sumber] = { a: kode(hasil.active), x: kode(hasil.archive), at: nowMs });
}

/**
 * Susun ulang kontribusi sebuah sumber yang DILEWATI run ini.
 *
 * Seksinya dari memo (fakta yang direkam saat sumber terakhir ditarik); detail
 * kodenya dari `detail` (peta kode→objek, dibangun dari data run sebelumnya
 * TANPA menyaring sumber — penyaringan itulah yang dulu merusak).
 *
 * @returns {{active: object[], archive: object[]}|null} null bila belum pernah
 *   ada catatan untuk pasangan game+sumber ini.
 */
export function susunUlang(memo, gameId, sumber, detail) {
  const s = memo.g?.[gameId]?.[sumber];
  if (!s) return null;
  const ambil = (arr) => (arr ?? []).map((k) => detail.get(String(k).toLowerCase()) ?? { code: k }).filter(Boolean);
  return { active: ambil(s.a), archive: ambil(s.x) };
}

/** Buang game yang sudah tak ada di katalog supaya berkas tak menggelembung. */
export async function simpanSeksi(berkas, memo, idHidup, nowIso) {
  for (const id of Object.keys(memo.g)) if (!idHidup.has(id)) delete memo.g[id];
  memo.at = nowIso;
  await writeFile(berkas, JSON.stringify(memo));
}
