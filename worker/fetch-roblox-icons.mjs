// KodeGG — penarik ICON game Roblox. Pakai thumbnail API RESMI Roblox
// (universeId dari roblox-codes.json). Idempoten: lewati yang sudah ada.
//
// Jalankan: node fetch-roblox-icons.mjs [--force]
// Output  : ../site/public/assets/roblox/<id>.png
// Jadwalkan mingguan / saat menambah game (bukan tiap jam).

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../site/public/assets/roblox");
const DATA = resolve(HERE, "data/roblox-codes.json");
const FORCE = process.argv.includes("--force");
const ICON_PX = 128;

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("⚠ sharp tak terpasang — icon ditulis ukuran asli.");
}
async function optimize(bytes) {
  if (!sharp) return bytes;
  try {
    return await sharp(bytes).resize(ICON_PX, ICON_PX, { fit: "cover" }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  } catch {
    return bytes;
  }
}
const exists = async (p) => access(p).then(() => true).catch(() => false);

async function main() {
  const data = JSON.parse(await readFile(DATA, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });
  const entries = Object.entries(data.games ?? {}).filter(([, g]) => g.universeId);

  // Ambil peta universeId → imageUrl sekaligus (API mendukung batch).
  const ids = [...new Set(entries.map(([, g]) => g.universeId))];
  const urlByUniverse = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    const res = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${batch}&size=512x512&format=Png&isCircular=false`);
    if (!res.ok) continue;
    for (const d of (await res.json()).data ?? []) {
      if (d.state === "Completed" && d.imageUrl) urlByUniverse[d.targetId] = d.imageUrl;
    }
  }

  let ok = 0, skip = 0, fail = 0;
  for (const [id, g] of entries) {
    const out = resolve(OUT_DIR, `${id}.png`);
    if (!FORCE && (await exists(out))) { skip += 1; continue; }
    const url = urlByUniverse[g.universeId];
    if (!url) { console.log(`  [${id}] · tak ada thumbnail`); fail += 1; continue; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await optimize(Buffer.from(await res.arrayBuffer()));
      await writeFile(out, bytes);
      console.log(`  [${id}] ✓ ${(bytes.length / 1024) | 0} KB`);
      ok += 1;
    } catch (err) {
      console.log(`  [${id}] · gagal: ${err.message}`);
      fail += 1;
    }
  }
  console.log(`✓ icon Roblox — ${ok} baru, ${skip} dilewati, ${fail} gagal`);
}

main().catch((e) => { console.error(e); process.exit(1); });
