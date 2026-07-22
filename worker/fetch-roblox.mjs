// KodeGG — penarik kode ROBLOX. Output: data/roblox-codes.json.
//
// DUA SUMBER PRIMER yang saling melengkapi + saling cross-check:
//   - RoCodes.gg   (fetchRoCodes)   — punya universeId, howTo, tanggal.
//   - Roblox Den   (fetchRobloxDen) — punya reward bagus, placeId, game lain.
// Kode di-UNION per game; tiap kode mencatat sumber mana yang punya. Kode yang
// ada di KEDUA primer = otomatis lebih terpercaya (saling konfirmasi).
//
// VERIFIED: kode ditandai verified bila dikonfirmasi ≥2 sumber (gabungan: primer
// yang punya kode + situs editorial cross-check). Cross-check editorial (5 situs)
// tetap dipakai sebagai lapisan tambahan.
//
// AUTO-EXPAND (Fase 3): seed kurasi + akumulasi + discovery game terpopuler
// (Roblox explore-api) yang ada di RoCodes ATAU Roblox Den, sampai MAX_GAMES.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ROBLOX_GAMES, robloxSlug } from "./src/roblox-games.mjs";
import { fetchRoCodes } from "./src/sources/rocodes.mjs";
import { fetchRobloxDen } from "./src/sources/robloxden.mjs";
import { crossCheckActive } from "./src/sources/roblox-crosscheck.mjs";
import { fetchPromoCodes } from "./src/sources/roblox-promo.mjs";
import { discoverPopularWithCodes, inferGenres } from "./src/roblox-discover.mjs";
import { mergeWithPrevious } from "./src/archive.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/roblox-codes.json");
const MAX_GAMES = 250; // batas atas; game tanpa kode aktif gugur → angka final natural (~150-250)
const CONCURRENCY = 5; // game paralel maks (rendah = tak membanjiri RoCodes/Den)
const CROSSCHECK_MIN = 10000; // cross-check editorial HANYA game populer (pemain ≥ ini) — beban terkendali
const ARCHIVE_CAP = 300; // arsip kode kedaluwarsa per game — besar biar praktis "selamanya" tanpa JSON meledak liar

// Sumber primer. url = untuk atribusi (dilink di kartu).
const PRIMARIES = [
  { name: "RoCodes.gg", fetch: fetchRoCodes, url: (s) => `https://rocodes.gg/codes/${s}`, slugKey: "rocodesSlug" },
  { name: "Roblox Den", fetch: fetchRobloxDen, url: (s) => `https://robloxden.com/game-codes/${s}`, slugKey: "denSlug" },
];

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { active: [], archive: [] };
  }
}

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

async function fetchPlayers(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50).join(",");
    try {
      const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${batch}`);
      if (!res.ok) continue;
      for (const g of (await res.json()).data ?? []) out[g.id] = g.playing ?? 0;
    } catch {
      /* pertahankan nilai lama */
    }
  }
  return out;
}

// placeId (dari Roblox Den) → universeId (untuk thumbnail & player count).
async function resolveUniverse(placeId) {
  try {
    const res = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return (await res.json()).universeId ?? null;
  } catch {
    return null;
  }
}

const isGeneric = (r) => !r || /^(free\s+)?(in-?game\s+)?(rewards?|gifts?|goodies|codes?)$/i.test(r.trim());

// Gabungkan hasil beberapa primer untuk 1 game. Tiap kode → sumber yang punya.
function mergeCodes(perSource) {
  const merge = (lists) => {
    const map = new Map(); // codeLower → item
    for (const { name, url, items } of lists) {
      for (const c of items) {
        const key = (c.code ?? "").trim().toLowerCase();
        if (!key) continue;
        let it = map.get(key);
        if (!it) {
          it = { code: c.code.trim(), reward: null, date: null, endsAt: null, sources: [], sourceUrls: {} };
          map.set(key, it);
        }
        if (!it.sources.includes(name)) it.sources.push(name);
        it.sourceUrls[name] = url;
        if ((!it.reward || isGeneric(it.reward)) && c.reward && !isGeneric(c.reward)) it.reward = c.reward;
        if (!it.date && c.date) it.date = c.date;
        if (!it.endsAt && c.endsAt) it.endsAt = c.endsAt;
      }
    }
    return [...map.values()];
  };
  return {
    active: merge(perSource.map((p) => ({ name: p.name, url: p.url, items: p.active }))),
    archive: merge(perSource.map((p) => ({ name: p.name, url: p.url, items: p.archive }))),
  };
}

async function buildGameSet(prevGames) {
  const set = new Map();
  const seen = new Set();
  const canon = (e) => e.rocodesSlug || e.denSlug;
  const add = (id, e) => {
    const k = canon(e);
    if (!k || set.has(id) || seen.has(k)) return;
    set.set(id, e);
    seen.add(k);
  };
  // Seed: coba KEDUA primer dg slug yang sama (den gagal → di-skip mulus).
  for (const [id, m] of Object.entries(ROBLOX_GAMES)) add(id, { rocodesSlug: m.slug, denSlug: m.slug, name: m.name, genres: m.genres ?? [], seed: true });
  for (const [id, g] of Object.entries(prevGames)) add(id, { rocodesSlug: g.rocodesSlug ?? g.slug ?? null, denSlug: g.denSlug ?? null, name: g.name, genres: g.genres ?? [], universeId: g.universeId, players: g.players });
  const popular = await discoverPopularWithCodes();
  for (const g of popular) {
    if (set.size >= MAX_GAMES) break;
    add(canon(g), { rocodesSlug: g.rocodesSlug, denSlug: g.denSlug, name: g.name, genres: g.featured ? [] : inferGenres(g.name, canon(g)), universeId: g.universeId, players: g.players, featured: g.featured, needsVerify: g.needsVerify });
  }
  return set;
}

// Dedup by universeId: game yg SAMA bisa punya >1 slug (mis. RoCodes "rivals" &
// "roblox-rivals", atau "fish-it" & "roblox-fish-it") → tampil dobel. universeId
// = identitas sejati game. Gabungkan: pilih survivor (dual-source dulu, lalu kode
// terbanyak, lalu nama terpendek), UNION kode dua slug (dedup per kode), lebur
// meta kosong. Jalan tiap run → dobel tak muncul lagi walau slug baru bermunculan.
function dedupByUniverse(gamesMap, activeArr, archiveArr) {
  const groups = new Map();
  for (const [id, g] of Object.entries(gamesMap)) {
    const uid = Number(g.universeId); // universeId bisa number ATAU string → samakan
    if (!uid) continue;
    (groups.get(uid) ?? groups.set(uid, []).get(uid)).push(id);
  }
  const remap = new Map(); // loserId → survivorId
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const nActive = (id) => activeArr.reduce((n, c) => n + (c.game === id ? 1 : 0), 0);
    const score = (id) => {
      const g = gamesMap[id];
      return [g.rocodesSlug && g.denSlug ? 1 : 0, nActive(id), -(g.name?.length ?? 99)];
    };
    ids.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2];
    });
    const survivor = ids[0];
    const s = gamesMap[survivor];
    for (const loser of ids.slice(1)) {
      remap.set(loser, survivor);
      const l = gamesMap[loser];
      if (!s.denSlug && l.denSlug) s.denSlug = l.denSlug;
      if ((s.howTo?.length ?? 0) < (l.howTo?.length ?? 0)) s.howTo = l.howTo;
      s.crossCheck = [...new Set([...(s.crossCheck ?? []), ...(l.crossCheck ?? [])])];
      s.verified = s.verified || l.verified;
      s.players = Math.max(s.players ?? 0, l.players ?? 0);
      delete gamesMap[loser];
    }
  }
  if (!remap.size) return { active: activeArr, archive: archiveArr };
  const reassign = (arr) => {
    const seen = new Set();
    const out = [];
    for (const c of arr) {
      const gid = remap.get(c.game) ?? c.game;
      const key = `${gid}|${(c.code ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(gid === c.game ? c : { ...c, game: gid, gameName: gamesMap[gid]?.name ?? c.gameName });
    }
    return out;
  };
  return { active: reassign(activeArr), archive: reassign(archiveArr) };
}

async function main() {
  const now = new Date().toISOString();
  const prev = await readPrevious();

  const set = await buildGameSet(prev.games ?? {});
  const entries = [...set.entries()];
  console.log(`memproses ${entries.length} game (2 primer: RoCodes + Roblox Den)…`);

  const results = await mapLimit(entries, CONCURRENCY, async ([id, entry]) => {
    // Tarik dari tiap primer yang punya slug untuk game ini.
    const perSource = [];
    let rocodesMeta = null;
    let denMeta = null;
    for (const p of PRIMARIES) {
      const slug = entry[p.slugKey];
      if (!slug) continue;
      try {
        const r = await p.fetch(slug);
        perSource.push({ name: p.name, url: p.url(slug), active: r.active, archive: r.archive });
        if (p.name === "RoCodes.gg") rocodesMeta = r.meta;
        else denMeta = r.meta;
      } catch {
        /* sumber ini tak punya game / gagal → lanjut */
      }
    }
    if (perSource.length === 0) return { id, ok: false };

    const { active, archive } = mergeCodes(perSource);
    if (active.length === 0 && archive.length === 0) return { id, ok: false };

    // Verifikasi identitas untuk token-match longgar (needsVerify): universeId yg
    // DILAPORKAN sumber harus == universeId API Roblox. Buang false-positive game
    // beda-mirip (mis. "Mansion Tycoon" → "sea-mansion-tycoon"). Match exact/
    // homepage/seed/prev tak lewat sini (identitasnya sudah pasti).
    if (entry.needsVerify) {
      let srcUid = Number(rocodesMeta?.universeId) || 0;
      if (!srcUid && denMeta?.placeId) srcUid = Number(await resolveUniverse(denMeta.placeId)) || 0;
      if (!srcUid || srcUid !== Number(entry.universeId)) return { id, ok: false };
    }

    const name = entry.seed ? entry.name : rocodesMeta?.name || denMeta?.name || entry.name;
    const slugRo = entry.rocodesSlug;
    const slugDen = entry.denSlug;

    // Cross-check editorial (5 situs) dg slug terbaik.
    // Cross-check editorial hanya utk game populer (bounded load); long-tail
    // tetap tampil kodenya (dari primer), badge Verified nyusul saat naik populer.
    let xset = new Set();
    let bySite = [];
    if (entry.seed || entry.featured || (entry.players ?? 0) >= CROSSCHECK_MIN) {
      ({ set: xset, bySite } = await crossCheckActive(slugRo || slugDen));
    }

    // universeId: RoCodes → placeId Den (resolve) → discovery. Normalisasi ke
    // Number (sumber kadang string) → dedup & fetchPlayers konsisten.
    let universeId = rocodesMeta?.universeId ?? entry.universeId ?? null;
    if (!universeId && denMeta?.placeId) universeId = await resolveUniverse(denMeta.placeId);
    universeId = universeId != null ? Number(universeId) || null : null;

    const fActive = [];
    let nVer = 0;
    for (const c of active) {
      const key = c.code.toLowerCase();
      const edConfirm = xset.has(key) ? 1 : 0;
      const verified = c.sources.length + edConfirm >= 2; // ≥2 sumber sepakat
      if (verified) nVer += 1;
      fActive.push({ game: id, gameName: name, source: c.sources[0], sources: c.sources, sourceUrls: c.sourceUrls, code: c.code, reward: c.reward, date: c.date, endsAt: c.endsAt, verified });
    }
    const roActive = new Set(active.map((c) => c.code.toLowerCase()));
    const edSrc = bySite.filter((s) => [...s.set].some((c) => roActive.has(c))).map((s) => s.name);
    // Atribusi cross-check = primer selain sumber utama + situs editorial pengonfirmasi.
    const primaryNames = [...new Set(active.flatMap((c) => c.sources))];
    const crossCheck = [...new Set([...primaryNames.slice(1), ...edSrc])];
    const fArchive = archive.map((c) => ({ game: id, gameName: name, source: c.sources[0], sources: c.sources, sourceUrls: c.sourceUrls, code: c.code, reward: c.reward, date: c.date, status: "expired" }));

    console.log(`  [${id}] ✓ ${active.length} aktif (${nVer} verified) + ${archive.length} arsip [${primaryNames.join("+")}]`);
    return {
      id,
      ok: true,
      fActive,
      fArchive,
      meta: {
        name,
        slug: robloxSlug(id),
        rocodesSlug: slugRo ?? null,
        denSlug: perSource.some((p) => p.name === "Roblox Den") ? slugDen : null,
        genres: entry.genres?.length ? entry.genres : inferGenres(name, slugRo || slugDen || ""),
        universeId,
        verified: rocodesMeta?.verified ?? false,
        crossCheck,
        // Cara redeem spesifik: RoCodes dulu, lalu Roblox Den (mis. MMV), lalu
        // situs pakai langkah standar bilingual bila keduanya kosong.
        howTo: rocodesMeta?.howTo?.length ? rocodesMeta.howTo : denMeta?.howTo ?? [],
      },
    };
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

  // Dedup game duplikat (universeId sama, slug beda spt rivals/roblox-rivals):
  // reassign kode FRESH ke id survivor SEBELUM merge. KRUSIAL — kalau dedup jalan
  // SETELAH merge, kode dari slug-loser (mis. roblox-fish-it) di-cocokkan pakai
  // codeKey `roblox-fish-it:X` yg tak pernah ada di data lama (`fish-it:X`) →
  // firstSeenAt reset ke `now` tiap run → kirim "kode baru" palsu tiap jam (bug
  // notif spam). Dedup dulu → codeKey konsisten → firstSeenAt awet.
  const { active: freshDD, archive: freshArchDD } = dedupByUniverse(games, freshActive, freshArchive);
  const { active, archive: fullArchive, newlyArchived } = mergeWithPrevious(freshDD, freshArchDD, prev, covered, now);
  const mergedGames = { ...(prev.games ?? {}), ...games };

  // Cap arsip per game (simpan ARCHIVE_CAP terbaru) → roblox-codes.json tak
  // membengkak tak terbatas seiring bertambahnya game & kode kedaluwarsa.
  const archByGame = new Map();
  for (const c of fullArchive) {
    const arr = archByGame.get(c.game);
    if (arr) arr.push(c);
    else archByGame.set(c.game, [c]);
  }
  const archive = [];
  for (const arr of archByGame.values()) {
    arr.sort((a, b) => (Date.parse(b.date ?? b.expiredAt ?? "") || 0) - (Date.parse(a.date ?? a.expiredAt ?? "") || 0));
    for (const c of arr.slice(0, ARCHIVE_CAP)) archive.push(c);
  }

  const uids = [...new Set(Object.values(mergedGames).map((g) => g.universeId).filter(Boolean))];
  const players = await fetchPlayers(uids);
  for (const g of Object.values(mergedGames)) {
    if (g.universeId && players[g.universeId] != null) g.players = players[g.universeId];
  }

  // Kode PROMO Roblox platform (bukan per-game) — ditukar di roblox.com.
  let promo = prev.promo ?? { active: [], archive: [] };
  try {
    const p = await fetchPromoCodes();
    if (p.active.length) promo = { updatedAt: now, active: p.active, archive: p.archive };
    console.log(`  promo: ${p.active.length} aktif + ${p.archive.length} arsip`);
  } catch (e) {
    console.log(`  promo gagal: ${e.message} (pertahankan lama)`);
  }

  const payload = {
    updatedAt: now,
    counts: { active: active.length, archived: archive.length, games: Object.keys(mergedGames).length },
    games: mergedGames,
    active,
    archive,
    promo,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 2));

  // Notif "kode baru" HANYA utk kode yg genuine baru di game yg SUDAH dipantau.
  // `!c.bulk` membuang import-pertama game baru di-discover (mis. sailor-piece 166
  // kode sekaligus) → cegah banjir notif tiap ada game baru.
  const newly = active.filter((c) => c.firstSeenAt === now && c.code && !c.bulk);
  // Game yang BARU masuk pantauan run ini (impor pertama). Kodenya bisa lama
  // semua (backfill) → dipakai make-videos utk video "semua kode aktif" pada game
  // besar. TAPI kalau sebuah kode punya tanggal rilis sumber dalam 48 jam, ia
  // benar-benar BARU (situs pun menandainya "New") → dicatat terpisah sbg `fresh`
  // supaya bisa dibuatkan video "KODE BARU" walau gamenya baru & tak sebesar 10K.
  const FRESH_MS = 48 * 3600 * 1000;
  const nowMs = Date.parse(now);
  const bulk = {};
  for (const c of active) {
    if (c.firstSeenAt !== now || !c.code || !c.bulk) continue;
    const b = (bulk[c.game] ??= { count: 0, fresh: [] });
    b.count++;
    const d = Date.parse(c.date ?? "");
    if (d > 0 && nowMs - d <= FRESH_MS && !c.perm) b.fresh.push({ code: c.code, reward: c.reward ?? "" });
  }
  const bulkGames = Object.entries(bulk).map(([game, b]) => ({ game, count: b.count, fresh: b.fresh }));
  await writeFile(resolve(dirname(OUT), "new-roblox-codes.json"), JSON.stringify({ generatedAt: now, codes: newly, bulkGames }, null, 2));

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
