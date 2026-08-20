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

/** Entri yang menunggu untuk jenis tertentu ("short" | "roundup" | "top50"). */
export function ambilPending(kind) {
  return baca().filter((x) => x.kind === kind);
}

/** SEMUA entri yang menunggu, apa pun jenisnya. */
export function semuaPending() {
  return baca();
}

/** Entri yang boleh DICOBA sekarang — yang masih dalam masa jeda dilewati.
 *
 *  Kenapa perlu jeda. 19 Agu 2026 YouTube menolak semua thumbnail dengan
 *  "The user has uploaded too many thumbnails recently" — batas laju per-KANAL,
 *  bukan kuota unit (kuota hari itu baru 31% terpakai). Antreannya tetap dicoba
 *  tiap jam selama 11 jam, 28 kali, semuanya gagal. Percobaan yang ditolak tetap
 *  dihitung sebagai `thumbnails.set`, jadi rem kuota kita ikut terkikis oleh
 *  panggilan yang sejak awal mustahil berhasil — dan mengetuk terus-menerus
 *  persis saat kanal sedang dibatasi laju bukan cara membuat batasnya dibuka.
 */
export function siapDicoba(kind = null, sekarang = new Date()) {
  return baca().filter((x) => (!kind || x.kind === kind) && !(x.tungguSampai && new Date(x.tungguSampai) > sekarang));
}

/** Pasang jeda sesudah gagal — makin sering gagal, makin panjang: 1, 2, 4, 8,
 *  maksimum 12 jam. Dipakai untuk penolakan yang sifatnya SEKANAL (semua entri
 *  ikut dijeda) maupun yang cuma mengenai satu video (entri itu saja). */
export function tundaPending(videoIds, sekarang = new Date()) {
  const set = new Set(videoIds);
  tulis(baca().map((x) => {
    if (!set.has(x.videoId)) return x;
    const n = (x.gagalBerturut ?? 0) + 1;
    const jam = Math.min(12, 2 ** (n - 1));
    return { ...x, gagalBerturut: n, tungguSampai: new Date(sekarang.getTime() + jam * 3600e3).toISOString() };
  }));
}
