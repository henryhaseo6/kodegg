// Giliran penyegaran ikon: seluruh katalog terlewati dalam SIKLUS hari, dengan
// beban harian yang rata.
//
// KENAPA PERLU CATATAN SENDIRI, bukan mtime berkas. Di CI, berkas datang dari
// `git checkout` — mtime-nya waktu clone, bukan waktu ikon itu ditarik. Semua
// berkas jadi "sama tuanya" tiap run, dan pemilihan giliran akan mengulang
// game yang sama terus sementara sisanya tak pernah kebagian. Catatan ini
// hidup di worker/data (ikut ter-commit workflow), jadi ia tahan antar-run.
//
// Jatah harian DIHITUNG, bukan dipatok: total dibagi panjang siklus. Katalog
// Roblox tumbuh terus (544 game enam hari lalu, 632 hari ini), dan angka mati
// akan diam-diam memperpanjang siklusnya tiap kali katalog bertambah.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Tanggal UTC (YYYY-MM-DD). Cukup kasar untuk urusan "sudah berapa hari lalu",
 *  dan tak menimbulkan pertanyaan zona waktu seperti stempel jam. */
export const hariIni = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Pilih game yang giliran ikonnya disegarkan hari ini.
 *
 * @param {string[]} ids        seluruh game yang punya ikon
 * @param {string}   berkas     path catatan giliran (JSON)
 * @param {{siklusHari?: number, minPerHari?: number}} opt
 * @returns {{pilih: string[], perHari: number, catat: (berhasil: string[]) => void}}
 */
export function giliranIkon(ids, berkas, { siklusHari = 30, minPerHari = 1 } = {}) {
  let catatan = {};
  try { catatan = JSON.parse(readFileSync(berkas, "utf8")) ?? {}; } catch { /* pertama kali */ }

  const perHari = Math.max(minPerHari, Math.ceil(ids.length / siklusHari));
  // Yang BELUM PERNAH tercatat didahulukan — itu game yang baru masuk katalog,
  // dan ikonnya kemungkinan besar memang belum pernah ditarik. Sisanya urut dari
  // yang paling lama tak disegarkan.
  const pilih = [...ids]
    .sort((a, b) => (catatan[a] ?? "0000-00-00").localeCompare(catatan[b] ?? "0000-00-00") || a.localeCompare(b))
    .slice(0, perHari);

  return {
    pilih,
    perHari,
    /** Dicatat SETELAH penarikan, dan HANYA yang berhasil. Mencatat yang gagal
     *  akan mendorongnya ke ujung antrean — game yang sumbernya sedang bermasalah
     *  justru harus dicoba lagi besok, bukan ditunda sebulan. */
    catat(berhasil) {
      const t = hariIni();
      for (const id of berhasil) catatan[id] = t;
      // Game yang sudah tak ada di katalog dibuang, supaya catatannya tak
      // membengkak selamanya oleh game yang sudah lama hilang.
      const hidup = new Set(ids);
      for (const k of Object.keys(catatan)) if (!hidup.has(k)) delete catatan[k];
      try { writeFileSync(berkas, JSON.stringify(catatan, null, 1) + "\n"); } catch { /* catatan gagal ≠ ikon gagal */ }
    },
  };
}

/** Ringkasan untuk log: berapa yang sudah pernah disegarkan & yang paling tua. */
export function ringkasGiliran(ids, berkas) {
  let catatan = {};
  try { catatan = JSON.parse(readFileSync(berkas, "utf8")) ?? {}; } catch { /* belum ada */ }
  const tercatat = ids.filter((i) => catatan[i]).length;
  const tua = ids.map((i) => catatan[i]).filter(Boolean).sort()[0] ?? "-";
  return `${tercatat}/${ids.length} tercatat · paling lama disegarkan ${tua}`;
}

export const berkasGiliran = (dataDir, nama) => resolve(dataDir, nama);
