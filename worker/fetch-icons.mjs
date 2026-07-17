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

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../site/public/assets/games");
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

  const results = await Promise.all(
    Object.entries(GAMES).map(async ([id, meta]) => {
      if (!meta.iconFile) return { id, skipped: "tanpa iconFile" };

      const out = resolve(OUT_DIR, meta.iconFile);
      if (!FORCE && (await exists(out))) return { id, skipped: "sudah ada" };

      const { bytes, source } = await fetchIcon(meta, {
        userAgent: UA,
        log: (m) => console.error(`  [${id}] ${m}`),
      });
      if (!bytes) return { id, failed: true };

      await writeFile(out, bytes);
      return { id, bytes: bytes.length, source };
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
