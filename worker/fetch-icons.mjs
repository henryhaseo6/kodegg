// KodeGG — penarik ICON GAME. Memakai RANTAI sumber (App Store → Play Store),
// lihat src/sources/icons.mjs. Kalau satu sumber gagal/tak punya game, lanjut
// ke berikutnya sampai dapat icon kotak.
//
// Jalankan: node fetch-icons.mjs          (idempoten: lewati yang sudah ada)
//           node fetch-icons.mjs --force  (timpa)
// Output  : ../site/public/assets/games/<iconFile>
//
// Idempoten & jarang berubah → jadwalkan mingguan atau jalankan saat menambah
// game, BUKAN tiap jam.

import { writeFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES } from "./src/games.mjs";
import { fetchIcon } from "./src/sources/icons.mjs";

// sharp OPSIONAL: bila terpasang, icon dikecilkan ke 128px (dipakai maksimal
// 38px di kartu → 512px = 100x over-delivery). Bila tak ada, tulis apa adanya
// (jalankan `npm i` di worker/ untuk mengaktifkan resize). Icon 128px ≈ 10-14KB.
const ICON_PX = 128;
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("⚠ sharp tak terpasang — icon ditulis ukuran asli (jalankan `npm i` di worker/ untuk resize).");
}
async function optimize(bytes) {
  if (!sharp) return bytes;
  try {
    return await sharp(bytes).resize(ICON_PX, ICON_PX, { fit: "cover" }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  } catch {
    return bytes;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../site/public/assets/games");
// IKON UKURAN PENUH (>=512px) DISIMPAN JUGA, bukan cuma versi 128px-nya.
//
// fetchIcon SUDAH mengunduh 512px dari sumber resmi (artworkUrl512 Apple, atau
// Play Store =s512), lalu optimize() mengecilkannya ke 128 untuk kartu situs —
// jadi selama ini bahan beresolusi penuh diunduh lalu dibuang tiap kali.
//
// Renderer video butuh yang besar: keping kolase digambar 272-512px, dan ikon
// 128px yang dipaksa sebesar itu terlihat pecah. Menyimpannya di sini menutup
// ketergantungan ke CDN Apple saat render — sesuai prinsip CLAUDE.md, "cache
// aset di server sendiri, jangan bergantung pihak ketiga".
//
// Ditaruh di worker/data (ikut di-commit workflow), BUKAN di site/public:
// gambar ini cuma dipakai perender video, dan mengirimkannya ke build situs
// berarti ~1,8 MB yang tak pernah diminta pengunjung mana pun.
const OUT_BESAR = resolve(HERE, "data/ikon-besar");
const BESAR_PX = 384;
const UA = "KodeGGBot/1.0 (+https://kodegg.com)";
const FORCE = process.argv.includes("--force");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(OUT_BESAR, { recursive: true });

  const results = await Promise.all(
    Object.entries(GAMES).map(async ([id, meta]) => {
      if (!meta.iconFile) return { id, skipped: "tanpa iconFile" };

      const out = resolve(OUT_DIR, meta.iconFile);
      // Ikon kecil sudah ada TAPI yang besar belum → tetap unduh. Tanpa ini,
      // seluruh katalog lama tak akan pernah punya versi besarnya.
      if (!FORCE && (await exists(out)) && (await exists(resolve(OUT_BESAR, meta.iconFile.replace(/\.png$/i, ".webp"))))) return { id, skipped: "sudah ada" };

      const { bytes, source } = await fetchIcon(meta, {
        userAgent: UA,
        log: (m) => console.error(`  [${id}] ${m}`),
      });
      if (!bytes) return { id, failed: true };

      const optimized = await optimize(bytes);
      await writeFile(out, optimized);
      // Versi besar: 384px WebP, bukan PNG 512 apa adanya.
      //
      // Ia cuma dipakai sebagai keping kolase yang di-blur 7px lalu diredupkan
      // 62% — mutu piksel demi piksel tak pernah terlihat. Diukur untuk 30
      // ikon: PNG 512 = 11,2 MB, WebP 384 = 0,7 MB. Selisih 10,5 MB itu masuk
      // riwayat git SELAMANYA dan tak bisa dihapus, jadi tak sepadan ditukar
      // dengan ketajaman yang tenggelam di balik blur.
      try {
        const besar = sharp
          ? await sharp(bytes).resize(BESAR_PX, BESAR_PX, { fit: "cover" }).webp({ quality: 80 }).toBuffer()
          : bytes;
        await writeFile(resolve(OUT_BESAR, meta.iconFile.replace(/\.png$/i, ".webp")), besar);
      } catch { /* besar gagal != ikon gagal */ }
      return { id, bytes: optimized.length, source };
    }),
  );

  for (const r of results) {
    if (r.failed) continue;
    if (r.skipped) console.log(`· ${r.id} — ${r.skipped}`);
    else console.log(`✓ ${r.id} — ${(r.bytes / 1024).toFixed(0)} KB (via ${r.source})`);
  }

  const failed = results.filter((r) => r.failed).length;
  if (failed) {
    console.error(`\n✗ ${failed} icon gagal di semua sumber`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
