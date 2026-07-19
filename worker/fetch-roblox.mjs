// KodeGG — penarik kode ROBLOX (vertikal terpisah dari game mobile).
// Sumber kode: RoCodes.gg. Output: data/roblox-codes.json.
//
// Fase 3 — AUTO-EXPAND: daftar game bukan lagi statis. Tiap run:
//   1. SEED = ROBLOX_GAMES (kurasi, selalu ada).
//   2. AKUMULASI = game yang sudah masuk run sebelumnya (tak pernah dibuang → tak
//      ada 404/churn untuk halaman yang sudah terindeks).
//   3. DISCOVERY = game Roblox TERPOPULER saat ini (explore-api "top-playing-now")
//      yang punya halaman kode di RoCodes → ditambah, prioritas pemain terbanyak,
//      sampai batas MAX_GAMES.
// Game tanpa kode aktif otomatis gugur (fetchRoCodes gagal → di-skip).
//
// Konkurensi dibatasi (CONCURRENCY) supaya tak membanjiri RoCodes/situs editorial.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ROBLOX_GAMES, robloxSlug } from "./src/roblox-games.mjs";
import { fetchRoCodes } from "./src/sources/rocodes.mjs";
import { crossCheckActive } from "./src/sources/roblox-crosscheck.mjs";
import { discoverPopularWithCodes, inferGenres } from "./src/roblox-discover.mjs";
import { mergeWithPrevious } from "./src/archive.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/roblox-codes.json");
const MAX_GAMES = 60; // batas total game (kurasi + akumulasi + discovery)
const CONCURRENCY = 8; // game diproses paralel maksimal sekian sekaligus

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { active: [], archive: [] };
  }
}

// Jalankan fn untuk tiap item, maksimal `limit` bersamaan.
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

// Player count KONKUREN (realtime) dari API RESMI Roblox (sort "Terpopuler").
async function fetchPlayers(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50).join(",");
    try {
      const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${batch}`);
      if (!res.ok) continue;
      for (const g of (await res.json()).data ?? []) out[g.id] = g.playing ?? 0;
    } catch {
      /* API sibuk → pertahankan nilai lama */
    }
  }
  return out;
}

// Bangun daftar game run ini: seed + akumulasi prev + discovery populer (cap).
async function buildGameSet(prevGames) {
  const set = new Map(); // id → { rocodesSlug, name, genres, universeId?, players?, seed? }
  const slugs = new Set();
  const add = (id, e) => {
    if (set.has(id) || slugs.has(e.rocodesSlug)) return;
    set.set(id, e);
    slugs.add(e.rocodesSlug);
  };
  for (const [id, m] of Object.entries(ROBLOX_GAMES)) add(id, { rocodesSlug: m.slug, name: m.name, genres: m.genres ?? [], seed: true });
  for (const [id, g] of Object.entries(prevGames)) add(id, { rocodesSlug: g.rocodesSlug ?? g.slug ?? id, name: g.name, genres: g.genres ?? [], universeId: g.universeId, players: g.players });
  const popular = await discoverPopularWithCodes();
  for (const g of popular) {
    if (set.size >= MAX_GAMES) break;
    add(g.slug, { rocodesSlug: g.slug, name: g.name, genres: inferGenres(g.name, g.slug), universeId: g.universeId, players: g.players });
  }
  return set;
}

async function main() {
  const now = new Date().toISOString();
  const prev = await readPrevious();

  const set = await buildGameSet(prev.games ?? {});
  const entries = [...set.entries()];
  console.log(`memproses ${entries.length} game (seed ${Object.keys(ROBLOX_GAMES).length} + akumulasi/discovery)…`);

  const results = await mapLimit(entries, CONCURRENCY, async ([id, entry]) => {
    try {
      const { active, archive, meta: m } = await fetchRoCodes(entry.rocodesSlug);
      const { set: xset, bySite } = await crossCheckActive(entry.rocodesSlug);
      const name = entry.seed ? entry.name : m.name || entry.name; // nama bersih dari RoCodes utk hasil discovery
      const src = { source: "RoCodes.gg", sourceUrl: `https://rocodes.gg/codes/${entry.rocodesSlug}` };
      const fActive = [];
      const fArchive = [];
      let nVer = 0;
      for (const c of active) {
        const verified = xset.has((c.code ?? "").trim().toLowerCase());
        if (verified) nVer += 1;
        fActive.push({ game: id, gameName: name, ...src, ...c, verified });
      }
      const roActive = new Set(active.map((c) => (c.code ?? "").trim().toLowerCase()));
      const xsrc = bySite.filter((s) => [...s.set].some((c) => roActive.has(c))).map((s) => s.name);
      for (const c of archive) fArchive.push({ game: id, gameName: name, ...src, ...c, status: "expired" });
      console.log(`  [${id}] ✓ ${active.length} aktif (${nVer} verified) + ${archive.length} arsip`);
      return {
        id,
        ok: true,
        fActive,
        fArchive,
        meta: {
          name,
          slug: robloxSlug(id),
          rocodesSlug: entry.rocodesSlug,
          genres: entry.genres ?? [],
          universeId: m.universeId ?? entry.universeId ?? null,
          placeId: m.placeId ?? null,
          verified: m.verified,
          crossCheck: xsrc,
          howTo: m.howTo,
        },
      };
    } catch (err) {
      return { id, ok: false, err: err.message };
    }
  });

  const freshActive = [];
  const freshArchive = [];
  const games = {};
  const covered = new Set();
  let failed = 0;
  for (const r of results) {
    if (!r || !r.ok) {
      failed += 1;
      continue;
    }
    freshActive.push(...r.fActive);
    freshArchive.push(...r.fArchive);
    games[r.id] = r.meta;
    covered.add(r.id);
  }

  const { active, archive, newlyArchived } = mergeWithPrevious(freshActive, freshArchive, prev, covered, now);

  // Game yang gagal ditarik run ini tetap dipertahankan metanya (biar halaman &
  // thumbnail tak hilang saat sumber down sesaat).
  const mergedGames = { ...(prev.games ?? {}), ...games };

  // Player count realtime dari Roblox (untuk semua game ber-universeId).
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

  const newly = active.filter((c) => c.firstSeenAt === now && c.code);
  await writeFile(resolve(dirname(OUT), "new-roblox-codes.json"), JSON.stringify({ generatedAt: now, codes: newly }, null, 2));

  console.log(
    `✓ data/roblox-codes.json — ${payload.counts.active} aktif, ${payload.counts.archived} arsip ` +
      `(+${newlyArchived} baru diarsipkan), ${covered.size}/${entries.length} game OK, ${Object.keys(mergedGames).length} total` +
      (failed ? `, ${failed} gagal` : ""),
  );
}

main().catch((e) => {
  console.error("fetch-roblox gagal:", e);
  process.exit(1);
});
