// KodeGG — worker katalog game → data/games.json (untuk "Jelajah Game").
//
// Sumber metadata: iTunes Lookup API (resmi, tak diblokir, tanpa API key) —
// sama seperti sumber icon. Memberi rating, jumlah rating, tanggal rilis, cover.
// Genre TIDAK diambil dari iTunes (terlalu generik) — pakai genre kurasi di
// catalog.mjs. Cover disimpan sebagai artwork iTunes (di-cache saat build).
//
// Jalankan: node fetch-catalog.mjs   (bagian dari build; katalog jarang berubah)

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOG } from "./src/catalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/games.json");
const UA = "KodeGGBot/1.0 (+https://kodegg.com)";

async function lookup(appleId) {
  const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(appleId)}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results?.[0] ?? null;
}

/** Cover 256px dari artwork iTunes (kotak, cukup untuk kartu). */
function cover(app) {
  const art = app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60;
  return art ? art.replace(/\/\d+x\d+[a-z]*\.(jpg|png|webp)$/i, "/256x256bb.jpg") : null;
}

async function main() {
  const now = new Date().toISOString();

  const rows = await Promise.all(
    Object.entries(CATALOG).map(async ([id, meta]) => {
      const base = {
        id,
        name: meta.name,
        genres: meta.genres,
        hasCodes: meta.hasCodes,
        online: true,
      };
      if (!meta.appleId) return { ...base, rating: null, ratingCount: 0, releasedAt: null, cover: null };
      try {
        const app = await lookup(meta.appleId);
        if (!app) throw new Error("bundleId tak ditemukan");
        return {
          ...base,
          rating: app.averageUserRating ? Math.round(app.averageUserRating * 10) / 10 : null,
          ratingCount: app.userRatingCount ?? 0,
          releasedAt: app.releaseDate?.slice(0, 10) ?? null,
          cover: cover(app),
        };
      } catch (err) {
        console.error(`✗ ${id}: ${err.message}`);
        return { ...base, rating: null, ratingCount: 0, releasedAt: null, cover: null };
      }
    }),
  );

  // Popularitas: peringkat berdasarkan jumlah rating (proxy paling objektif).
  const byPop = [...rows].sort((a, b) => b.ratingCount - a.ratingCount);
  const popRank = new Map(byPop.map((g, i) => [g.id, i]));

  // "Baru": rilis dalam 120 hari terakhir.
  const NEW_MS = 120 * 86400000;
  const games = rows.map((g) => ({
    ...g,
    pop: popRank.get(g.id),
    isNew: g.releasedAt ? Date.now() - Date.parse(g.releasedAt) < NEW_MS : false,
  }));

  const payload = { updatedAt: now, counts: { total: games.length }, games };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));

  const withCover = games.filter((g) => g.cover).length;
  console.log(`✓ data/games.json — ${games.length} game (${withCover} ada cover, ${games.filter((g) => g.hasCodes).length} berkode)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
