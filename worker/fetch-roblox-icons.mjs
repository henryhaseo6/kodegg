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
// MODE GILIRAN: segarkan sebagian katalog tiap hari, seluruhnya terlewati dalam
// 30 hari. Jatah hariannya dihitung dari jumlah game, jadi katalog yang tumbuh
// tak diam-diam memperpanjang siklusnya.
const GILIR = process.argv.includes("--gilir");
const SIKLUS = Number(process.env.IKON_SIKLUS_HARI || 30);
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

  // Giliran hari ini. Di luar mode ini, perilakunya persis seperti dulu.
  let giliran = null, sasaran = null;
  if (GILIR) {
    const { giliranIkon, ringkasGiliran } = await import("./src/gilir-ikon.mjs");
    const berkas = resolve(HERE, "data/ikon-giliran-roblox.json");
    const semua = entries.map(([id]) => id);
    giliran = giliranIkon(semua, berkas, { siklusHari: SIKLUS });
    sasaran = new Set(giliran.pilih);
    console.log(`giliran ikon Roblox: ${giliran.perHari}/hari dari ${semua.length} game (siklus ${SIKLUS} hari) · ${ringkasGiliran(semua, berkas)}`);
  }

  let ok = 0, skip = 0, fail = 0;
  const berhasil = [];
  for (const [id, g] of entries) {
    const out = resolve(OUT_DIR, `${id}.png`);
    // Mode giliran menyegarkan yang terpilih WALAU berkasnya sudah ada — itu
    // memang tujuannya. Yang tak terpilih dilewati apa pun keadaannya.
    if (GILIR && !sasaran.has(id)) { skip += 1; continue; }
    if (!GILIR && !FORCE && (await exists(out))) { skip += 1; continue; }
    const url = urlByUniverse[g.universeId];
    if (!url) { console.log(`  [${id}] · tak ada thumbnail`); fail += 1; continue; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await optimize(Buffer.from(await res.arrayBuffer()));
      await writeFile(out, bytes);
      console.log(`  [${id}] ✓ ${(bytes.length / 1024) | 0} KB`);
      berhasil.push(id);
      ok += 1;
    } catch (err) {
      console.log(`  [${id}] · gagal: ${err.message}`);
      fail += 1;
    }
  }
  if (giliran) giliran.catat(berhasil);
  console.log(`✓ icon Roblox — ${ok} ${GILIR ? "disegarkan" : "baru"}, ${skip} dilewati, ${fail} gagal`);
}

main().catch((e) => { console.error(e); process.exit(1); });
