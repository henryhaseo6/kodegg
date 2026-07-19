// KodeGG — penarik kode ROBLOX (vertikal terpisah dari game mobile).
// Sumber: RoCodes.gg (real-time). Output: data/roblox-codes.json.
//
// Jalankan: node fetch-roblox.mjs
// Struktur output mirror codes.json (active/archive + firstSeenAt + arsip
// terakumulasi lewat mergeWithPrevious) + peta `games` (meta per game: nama,
// slug, universeId utk thumbnail, howTo langkah redeem, verified).
//
// Cadence: churn kode Roblox cepat → dijadwalkan lebih sering dari mobile
// (lihat .github/workflows/update-roblox.yml).

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ROBLOX_GAMES, robloxSlug } from "./src/roblox-games.mjs";
import { fetchRoCodes } from "./src/sources/rocodes.mjs";
import { crossCheckActive } from "./src/sources/roblox-crosscheck.mjs";
import { mergeWithPrevious } from "./src/archive.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/roblox-codes.json");

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { active: [], archive: [] };
  }
}

// Jumlah pemain KONKUREN (realtime) per game dari API RESMI Roblox — dipakai
// untuk sort "Terpopuler". `id` di respons = universeId, `playing` = pemain aktif.
async function fetchPlayers(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50).join(",");
    try {
      const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${batch}`);
      if (!res.ok) continue;
      for (const g of (await res.json()).data ?? []) out[g.id] = g.playing ?? 0;
    } catch {
      /* API sibuk → biarkan; nilai lama dipertahankan */
    }
  }
  return out;
}

async function main() {
  const now = new Date().toISOString();
  const prev = await readPrevious();

  const freshActive = [];
  const freshArchive = [];
  const games = {};
  const covered = new Set();
  let failed = 0;

  await Promise.all(
    Object.entries(ROBLOX_GAMES).map(async ([id, meta]) => {
      try {
        const { active, archive, meta: m } = await fetchRoCodes(meta.slug);
        // Cross-check: tandai kode yang JUGA aktif di situs editorial (badge Verified).
        const { set: xset, bySite } = await crossCheckActive(meta.checkSlug ?? meta.slug);
        const src = { source: "RoCodes.gg", sourceUrl: `https://rocodes.gg/codes/${meta.slug}` };
        let nVer = 0;
        for (const c of active) {
          const verified = xset.has((c.code ?? "").trim().toLowerCase());
          if (verified) nVer += 1;
          freshActive.push({ game: id, gameName: meta.name, ...src, ...c, verified });
        }
        // Atribusi = HANYA situs yg mengkonfirmasi ≥1 kode aktif RoCodes.
        const roActive = new Set(active.map((c) => (c.code ?? "").trim().toLowerCase()));
        const xsrc = bySite.filter((s) => [...s.set].some((c) => roActive.has(c))).map((s) => s.name);
        for (const c of archive) freshArchive.push({ game: id, gameName: meta.name, ...src, ...c, status: "expired" });
        games[id] = {
          name: meta.name,
          slug: robloxSlug(id),
          rocodesSlug: meta.slug,
          genres: meta.genres ?? [],
          universeId: m.universeId,
          placeId: m.placeId,
          verified: m.verified,
          crossCheck: xsrc, // situs editorial yg mengkonfirmasi kode game ini
          howTo: m.howTo,
        };
        covered.add(id);
        console.log(`  [${id}] ✓ ${active.length} aktif (${nVer} verified${xsrc.length ? ` via ${xsrc.join("+")}` : ""}) + ${archive.length} arsip`);
      } catch (err) {
        failed += 1;
        console.log(`  [${id}] · gagal: ${err.message}`);
      }
    }),
  );

  const { active, archive, newlyArchived } = mergeWithPrevious(freshActive, freshArchive, prev, covered, now);

  // Pertahankan meta game dari run sebelumnya bila game gagal ditarik run ini
  // (biar halaman/thumbnail tak hilang saat RoCodes down sesaat).
  const mergedGames = { ...(prev.games ?? {}), ...games };

  // Player count realtime (langsung dari Roblox) untuk semua game yang punya
  // universeId. Gagal fetch → pertahankan nilai lama (jangan nol-kan ranking).
  const uids = [...new Set(Object.values(mergedGames).map((g) => g.universeId).filter(Boolean))];
  const players = await fetchPlayers(uids);
  for (const g of Object.values(mergedGames)) {
    if (g.universeId && players[g.universeId] != null) g.players = players[g.universeId];
  }

  const payload = {
    updatedAt: now,
    counts: { active: active.length, archived: archive.length, games: Object.keys(mergedGames).length },
    games: mergedGames,
    active,
    archive,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 2));

  // Kode BARU run ini (buat notifikasi/heuristik "Baru") → new-roblox-codes.json.
  const newly = active.filter((c) => c.firstSeenAt === now && c.code);
  await writeFile(resolve(dirname(OUT), "new-roblox-codes.json"), JSON.stringify({ generatedAt: now, codes: newly }, null, 2));

  console.log(
    `✓ data/roblox-codes.json — ${payload.counts.active} aktif, ${payload.counts.archived} arsip ` +
      `(+${newlyArchived} baru diarsipkan), ${Object.keys(games).length}/${Object.keys(ROBLOX_GAMES).length} game OK` +
      (failed ? `, ${failed} gagal` : ""),
  );
}

main().catch((e) => {
  console.error("fetch-roblox gagal:", e);
  process.exit(1);
});
