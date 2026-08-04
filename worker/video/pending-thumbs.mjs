// Antrean thumbnail yang GAGAL dipasang — dipakai video long (roundup & top50).
//
// Kenapa perlu: video long dijadwalkan ~21:45 UTC, setelah Shorts sepanjang hari
// menghabiskan kuota YouTube hari Pacific. Kejadian 3 Agu 2026: kedua video naik
// tapi thumbnail-nya ditolak `quotaExceeded`, dan kegagalan itu cuma dicatat
// "abaikan" — tak ada antrean, tak ada retry. Videonya tayang dengan potongan
// frame acak, yaitu hal PERTAMA yang dilihat orang di hasil pencarian.
//
// Berbeda dari thumbnail Shorts (potongan frame video, hilang bersama runner),
// thumbnail roundup/top50 DETERMINISTIK dari tanggalnya — bisa dirender ulang
// kapan saja tanpa mengunduh artifact. Jadi antrean ini cukup menyimpan
// {videoId, kind, date}, dan run berikutnya merender ulang lalu memasangnya.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../data/pending-thumbs.json");

const baca = () => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return []; } };
const tulis = (arr) => { try { writeFileSync(FILE, JSON.stringify(arr, null, 1) + "\n"); } catch { /* CI read-only? jangan gagalkan upload */ } };

/** Antrikan thumbnail yang gagal. Dedup by videoId; dibatasi 50 supaya tak liar. */
export function simpanPending(entri) {
  if (!entri?.videoId) return;
  const arr = baca().filter((x) => x.videoId !== entri.videoId);
  tulis([{ ...entri, gagalPada: new Date().toISOString() }, ...arr].slice(0, 50));
}

/** Coret dari antrean setelah berhasil dipasang. */
export function buangPending(videoId) {
  tulis(baca().filter((x) => x.videoId !== videoId));
}

/** Entri yang menunggu untuk jenis tertentu ("roundup" | "top50"). */
export function ambilPending(kind) {
  return baca().filter((x) => x.kind === kind);
}
