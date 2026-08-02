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
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ROBLOX_GAMES, robloxSlug, ROBLOX_NAME_OVERRIDE } from "./src/roblox-games.mjs";
import { fetchRoCodes } from "./src/sources/rocodes.mjs";
import { fetchRobloxDen, fetchRobloxDenIndex } from "./src/sources/robloxden.mjs";
import { scoutDen } from "./src/den-scout.mjs";
import { rekamProbe, ringkasProbe } from "./src/lastmod-probe.mjs";
import { fetchRoCodesIndex } from "./src/roblox-discover.mjs";
import { crossCheckActive } from "./src/sources/roblox-crosscheck.mjs";
import { fetchPromoCodes } from "./src/sources/roblox-promo.mjs";
import { discoverPopularWithCodes, inferGenres } from "./src/roblox-discover.mjs";
import { mergeWithPrevious } from "./src/archive.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/roblox-codes.json");
// Batas atas jumlah game. HARUS ≥ ukuran semesta "populer + punya kode" dari
// discoverPopularWithCodes (~367), kalau tidak prevGames (data run lalu) mengunci
// semua slot dan game HOT baru tak pernah bisa masuk (bug: game 9.9K pemain +
// featured RoCodes kejebak di luar karena cap 250 keburu penuh oleh prevGames).
// Game tanpa kode aktif tetap gugur → angka final natural di bawah cap ini.
const MAX_GAMES = 400;
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
      for (const g of (await res.json()).data ?? []) out[g.id] = { playing: g.playing ?? 0, name: g.name || null };
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
        // check (Roblox Den "CHECK"): ragu bila SEMUA sumber ragu; hilang begitu
        // ADA sumber yg daftarin TANPA check (confident) → confident/verified menang.
        if (c.check) it._check = true; else it._confident = true;
      }
    }
    for (const it of map.values()) { if (it._check && !it._confident) it.check = true; delete it._check; delete it._confident; }
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

  // ── Roblox Den: tarik HANYA yang halamannya berubah ───────────────────────
  // Cakupan Den melonjak (35 → ~300 game) sejak daftar slug pindah ke sitemap.
  // Menarik semuanya tiap jam = ~7.300 permintaan/hari ke situs kecil — tak
  // sopan & mubazir: sitemap mereka menunjukkan hanya ~119 dari 4.900 halaman
  // berubah per 24 jam. Jadi halaman Den ditarik bila `lastmod` sitemap lebih
  // baru dari terakhir kali kita menariknya (`denAt` per game).
  const denIndex = await fetchRobloxDenIndex();
  const prevGamesMap = prev.games ?? {};

  // Pemantau ekor-panjang: game yang kodenya baru diperbarui di Den tapi belum
  // kita pantau. Discovery utama berbasis chart Roblox → game yang sedang NAIK
  // tak masuk chart, padahal di situ permintaan pencarian kode paling besar.
  const SCOUT = resolve(dirname(OUT), "den-scout.json");
  let memo = {};
  try { memo = JSON.parse(await readFile(SCOUT, "utf8")); } catch { /* pertama kali */ }
  // TAMBAL denSlug yang tertinggal. buildGameSet menyusun: seed → game LAMA →
  // populer, dan entri yang sudah ada tak bisa ditimpa. Game lama membawa
  // `denSlug: null` apa adanya — nilai itu dihitung dulu terhadap indeks Den yang
  // cuma 109 slug (satu halaman daftar). Setelah indeks pindah ke sitemap (~4.400
  // slug), 267 game ternyata SLUG-nya ada di Den tapi tetap null selamanya karena
  // tak pernah dihitung ulang. Jadi sumber primer kedua yang sudah kita bangun
  // tak akan pernah menyentuh mereka.
  //
  // Pencocokan tetap PERSIS (bukan fuzzy) — dicoba apa adanya plus varian awalan
  // "roblox-", karena RoCodes kerap memberi awalan itu pada slug-nya sementara Den
  // tidak (mis. kita "roblox-smiles" vs Den "smiles").
  let ditambal = 0;
  for (const [id, e] of set) {
    if (e.denSlug) continue;
    const kandidat = new Set();
    for (const dasar of [id, e.rocodesSlug].filter(Boolean)) {
      kandidat.add(dasar);
      kandidat.add(dasar.replace(/^roblox-/, ""));
      kandidat.add(`roblox-${dasar}`);
    }
    const cocok = [...kandidat].find((c) => denIndex.has(c));
    if (cocok) { e.denSlug = cocok; ditambal++; }
  }
  if (ditambal) console.log(`denSlug ditambal utk ${ditambal} game (slug ada di sitemap Den tapi belum terhubung)`);

  const slugDipantau = new Set([...set.values()].map((e) => e.denSlug).filter(Boolean));
  const { tambah, memoBaru } = await scoutDen(denIndex, slugDipantau, memo);
  for (const t of tambah) {
    // denSlug = rocodesSlug: kalau slug-nya kebetulan juga ada di RoCodes, dua
    // primer langsung aktif; kalau tidak, RoCodes gagal dilewati mulus.
    set.set(t.slug, { rocodesSlug: t.slug, denSlug: t.slug, name: t.name, genres: [], universeId: t.universeId, players: t.players, needsVerify: false });
  }
  await writeFile(SCOUT, JSON.stringify(memoBaru, null, 1));

  const entries = [...set.entries()];

  // Kode Den yang SUDAH kita punya, per game — dipakai saat halamannya dilewati.
  // WAJIB: tanpa ini, kode yang hanya ada di Den lenyap dari hasil merge lalu
  // ikut diarsipkan otomatis (game-nya dianggap "covered"), padahal halamannya
  // tak berubah = kodenya masih terpampang di sana.
  const denPunya = {};
  for (const [kunci, arr] of [["active", prev.active ?? []], ["archive", prev.archive ?? []]]) {
    for (const c of arr) {
      const src = c.sources?.length ? c.sources : [c.source];
      if (!src.includes("Roblox Den")) continue;
      ((denPunya[c.game] ??= { active: [], archive: [] })[kunci]).push(c);
    }
  }
  // Backfill awal (game yang belum pernah ditarik dari Den) dibatasi per run
  // supaya rilis ini tak meledak jadi 300 permintaan sekaligus.
  const DEN_BACKFILL_MAX = Number(process.env.DEN_BACKFILL_MAX || 40);
  let backfillSisa = DEN_BACKFILL_MAX;
  // Game yang halaman Den-nya ditarik PERTAMA KALI run ini. Kode Den yang belum
  // pernah kita lihat pada game-game ini BUKAN kode baru — cuma kejar-tayang
  // sumber kedua (umurnya bisa berbulan-bulan). Lihat pemakaian di `newly`.
  const denBackfill = new Set();
  const perluDen = (id, slug) => {
    if (!slug) return false;
    const lm = denIndex.get(slug) ?? 0;
    const terakhir = Number(prevGamesMap[id]?.denAt ?? 0);
    if (!terakhir) { if (backfillSisa-- > 0) { denBackfill.add(id); return true; } return false; }
    return lm > terakhir; // hanya bila halamannya memang berubah
  };
  let denTarik = 0, denLewat = 0;

  console.log(`memproses ${entries.length} game (2 primer: RoCodes + Roblox Den; indeks Den ${denIndex.size} slug)…`);

  const results = await mapLimit(entries, CONCURRENCY, async ([id, entry]) => {
    // Tarik dari tiap primer yang punya slug untuk game ini.
    const perSource = [];
    let rocodesMeta = null;
    let denMeta = null;
    let denAt = Number(prevGamesMap[id]?.denAt ?? 0);
    let denDilewati = false;
    for (const p of PRIMARIES) {
      const slug = entry[p.slugKey];
      if (!slug) continue;
      // Den: lewati bila halamannya tak berubah — pakai kode yang sudah kita
      // simpan dari penarikan sebelumnya (halaman sama = isi sama).
      if (p.name === "Roblox Den" && !perluDen(id, slug)) {
        const punya = denPunya[id];
        if (punya) perSource.push({ name: p.name, url: p.url(slug), active: punya.active, archive: punya.archive });
        denLewat++;
        denDilewati = true; // pertahankan denSlug walau tak ditarik run ini
        continue;
      }
      try {
        const r = await p.fetch(slug);
        perSource.push({ name: p.name, url: p.url(slug), active: r.active, archive: r.archive });
        if (p.name === "RoCodes.gg") rocodesMeta = r.meta;
        else { denMeta = r.meta; denAt = Math.max(denIndex.get(slug) ?? 0, Date.now()); denTarik++; }
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

    // RoCodes kerap menambahkan awalan "Roblox " untuk SEO ("Roblox Knockout
    // Codes") padahal nama game aslinya bukan itu — situs kita memakai nama asli
    // (lihat kebijakan penamaan; "Roblox" hanya ditambahkan di judul video/SEO).
    // Awalan dibuang hanya bila ADA BUKTI, bukan asumsi:
    //   (a) Roblox Den menyebut nama tanpa awalan itu, ATAU
    //   (b) nama resmi dari API Roblox (rawName, tersimpan dari run sebelumnya)
    //       tak memuat kata "Roblox" sama sekali.
    // Game yang memang bernama "Roblox ..." tak tersentuh karena kedua bukti itu
    // akan gagal.
    const buangAwalanRoblox = (n) => {
      if (!n || !/^roblox\s+/i.test(n)) return n;
      const tanpa = n.replace(/^roblox\s+/i, "").trim();
      if (!tanpa) return n;
      if (denMeta?.name && denMeta.name.trim().toLowerCase() === tanpa.toLowerCase()) return tanpa;
      const resmi = prevGamesMap[id]?.rawName;
      if (resmi && !/roblox/i.test(resmi)) return tanpa;
      return n;
    };
    const name = ROBLOX_NAME_OVERRIDE[id] || (entry.seed ? entry.name : buangAwalanRoblox(rocodesMeta?.name) || denMeta?.name || entry.name);
    const slugRo = entry.rocodesSlug;
    const slugDen = entry.denSlug;

    // Cross-check editorial (5 situs) dg slug terbaik.
    // Cross-check editorial hanya utk game populer (bounded load); long-tail
    // tetap tampil kodenya (dari primer), badge Verified nyusul saat naik populer.
    let xset = new Set();
    let xExpired = new Set();
    let bySite = [];
    if (entry.seed || entry.featured || (entry.players ?? 0) >= CROSSCHECK_MIN) {
      ({ set: xset, bySite, expiredSet: xExpired } = await crossCheckActive(slugRo || slugDen));
    }

    // universeId: RoCodes → placeId Den (resolve) → discovery. Normalisasi ke
    // Number (sumber kadang string) → dedup & fetchPlayers konsisten.
    let universeId = rocodesMeta?.universeId ?? entry.universeId ?? null;
    if (!universeId && denMeta?.placeId) universeId = await resolveUniverse(denMeta.placeId);
    universeId = universeId != null ? Number(universeId) || null : null;

    // Keputusan EXPIRED (akurasi > kelengkapan; arsip non-destruktif jadi risiko
    // over-expire kecil). Kode aktif dipindah ke arsip bila:
    //  (a) endsAt sudah lewat → definitif, tanpa grace.
    //  (b) ≥1 PRIMER tandai expired, ATAU editorial tandai expired (& tak ada
    //      editorial lain bilang aktif) → arsip, KECUALI kode masih FRESH (≤48j):
    //      grace agar sumber yang telat update tak membunuh kode baru.
    const nowMs = Date.now();
    const GRACE_MS = 48 * 3600 * 1000;
    // Kode TUA (tgl rilis > ~6 bln) yg belum diverifikasi → tandai CHECK "cek
    // dulu" (BUKAN expire): kemungkinan basi walau sumber lambat (mis. RoCodes)
    // masih daftarin aktif. Non-destruktif; verified selalu menang.
    const AGE_CHECK_MS = 180 * 24 * 3600 * 1000;
    const primExpired = new Set(archive.map((c) => c.code.toLowerCase()));
    const mk = (c, extra) => ({ game: id, gameName: name, source: c.sources[0], sources: c.sources, sourceUrls: c.sourceUrls, code: c.code, reward: c.reward, date: c.date, ...extra });

    const fActive = [];
    const archFromActive = [];
    let nVer = 0;
    for (const c of active) {
      const key = c.code.toLowerCase();
      const endsMs = c.endsAt ? Date.parse(c.endsAt) : 0;
      const endsPassed = endsMs > 0 && endsMs < nowMs;
      const dateMs = c.date ? Date.parse(c.date) : 0;
      const isFresh = dateMs > 0 && nowMs - dateMs <= GRACE_MS;
      const olehPrimer = primExpired.has(key);
      const olehEditorial = xExpired.has(key) && !xset.has(key);
      const votedExpired = olehPrimer || olehEditorial;
      if (endsPassed || (votedExpired && !isFresh)) {
        // expiredBy = ALASAN kode ini diarsipkan. Tanpa jejak ini, kode yang
        // hilang dari daftar aktif tak bisa dipertanggungjawabkan: tak ada cara
        // membedakan kode yang memang habis waktunya dari kode yang dibunuh satu
        // situs editorial yang parsing-nya rusak. Penting terutama saat cakupan
        // sumber berubah (mis. gelombang arsip dari Roblox Den).
        const expiredBy = endsPassed ? "endsAt" : olehPrimer ? "primer" : "editorial";
        archFromActive.push(mk(c, { status: "expired", endsAt: c.endsAt, expiredBy }));
        continue;
      }
      const edConfirm = xset.has(key) ? 1 : 0;
      const verified = c.sources.length + edConfirm >= 2; // ≥2 sumber sepakat
      if (verified) nVer += 1;
      // Badge "CHECK" (cek dulu). Verified selalu menang. Dua pemicu:
      //  (a) sumber (Roblox Den) tandai CHECK — belum dikonfirmasi-ulang works;
      //  (b) kode TUA (rilis >6 bln) — mungkin basi walau sumber masih daftarin.
      const oldUnverified = dateMs > 0 && nowMs - dateMs > AGE_CHECK_MS;
      const check = !verified && (c.check === true || oldUnverified);
      fActive.push(mk(c, { endsAt: c.endsAt, verified, ...(check ? { check: true } : {}) }));
    }
    const roActive = new Set(fActive.map((c) => c.code.toLowerCase()));
    const edSrc = bySite.filter((s) => [...s.set].some((c) => roActive.has(c))).map((s) => s.name);
    // Atribusi cross-check = primer selain sumber utama + situs editorial pengonfirmasi.
    const primaryNames = [...new Set(active.flatMap((c) => c.sources))];
    const crossCheck = [...new Set([...primaryNames.slice(1), ...edSrc])];
    // Arsip = expired eksplisit primer + kode yg dipindah dari aktif (dedup by code).
    const archMap = new Map();
    for (const c of archive) archMap.set(c.code.toLowerCase(), mk(c, { status: "expired", expiredBy: "primer" }));
    for (const c of archFromActive) archMap.set(c.code.toLowerCase(), c);
    const fArchive = [...archMap.values()];

    const nExp = archFromActive.length;
    console.log(`  [${id}] ✓ ${fActive.length} aktif (${nVer} verified) + ${fArchive.length} arsip${nExp ? ` (${nExp} di-expire)` : ""} [${primaryNames.join("+")}]`);
    return {
      id,
      ok: true,
      fActive,
      fArchive,
      meta: {
        name,
        slug: robloxSlug(id),
        rocodesSlug: slugRo ?? null,
        // denDilewati: halaman tak berubah & sengaja tak ditarik — slug-nya TETAP
        // disimpan, kalau tidak game ini terlihat "belum pernah kena Den" lagi dan
        // antrean backfill tak pernah maju.
        denSlug: denDilewati || perSource.some((p) => p.name === "Roblox Den") ? slugDen : null,
        // Kapan halaman Den game ini terakhir DITARIK — dibandingkan dg <lastmod>
        // sitemap Den di run berikutnya supaya halaman yang tak berubah dilewati.
        ...(denAt ? { denAt } : {}),
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
  console.log(`Roblox Den: ${denTarik} halaman ditarik (berubah), ${denLewat} dilewati (tak berubah / pakai simpanan)`);
  const { active, archive: fullArchive, newlyArchived } = mergeWithPrevious(freshDD, freshArchDD, prev, covered, now);
  const mergedGames = { ...(prev.games ?? {}), ...games };
  // PURGE game DUPLIKAT yg nyangkut di prev.games (universeId sama, slug beda
  // spt fish-it/roblox-fish-it): buang yg KALAH (kode aktif lebih sedikit; seri →
  // slug lebih panjang) dari games map → hapus halaman & arsip "hantu" di situs.
  // Aman: game "Roblox X" yg universeId-nya UNIK tak tersentuh (ids.length<2).
  {
    const ytpl = (() => { try { return JSON.parse(readFileSync(resolve(HERE, "data/yt-playlists.json"), "utf8")); } catch { return {}; } })();
    const hasPl = (id) => (ytpl[id] ? 1 : 0), nAct = (id) => active.filter((c) => c.game === id).length;
    const byUni = new Map();
    for (const [id, g] of Object.entries(mergedGames)) { if (!g.universeId) continue; const a = byUni.get(g.universeId) ?? []; a.push(id); byUni.set(g.universeId, a); }
    for (const [, ids] of byUni) {
      if (ids.length < 2) continue;
      // survivor: yg PUNYA playlist dulu (jaga video yg udah ada) → kode aktif
      // terbanyak → slug terpendek (kanonik). Cegah orphan playlist.
      ids.sort((a, b) => hasPl(b) - hasPl(a) || nAct(b) - nAct(a) || a.length - b.length);
      const keep = ids[0];
      for (const drop of ids.slice(1)) {
        // REMAP kode drop → survivor (kode dari sumber lain, mis. Roblox Den,
        // tak hilang — cuma selisih 1 kode) lalu hapus game-nya.
        for (const c of active) if (c.game === drop) c.game = keep;
        for (const c of fullArchive) if (c.game === drop) c.game = keep;
        delete mergedGames[drop];
      }
    }
    // dedup active by game+code setelah remap (idempotent utk data normal → aman)
    const seenA = new Set();
    for (let i = 0; i < active.length; i++) { const k = active[i].game + "::" + active[i].code; if (seenA.has(k)) { active.splice(i, 1); i--; } else seenA.add(k); }
  }

  // Cap arsip per game (simpan ARCHIVE_CAP terbaru) → roblox-codes.json tak
  // membengkak tak terbatas seiring bertambahnya game & kode kedaluwarsa.
  const archByGame = new Map(), seenArch = new Set();
  for (const c of fullArchive) {
    if (!mergedGames[c.game]) continue; // arsip milik game yg udah di-purge → buang (no halaman hantu)
    const ak = c.game + "::" + c.code; if (seenArch.has(ak)) continue; seenArch.add(ak); // dedup arsip setelah remap
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
    const pd = g.universeId ? players[g.universeId] : null;
    if (pd) { if (pd.playing != null) g.players = pd.playing; if (pd.name) g.rawName = pd.name; } // rawName = nama asli Roblox (+emoji/tag) utk visual video
  }

  // Kode PROMO Roblox platform (bukan per-game) — ditukar di roblox.com.
  let promo = prev.promo ?? { active: [], archive: [] };
  try {
    const p = await fetchPromoCodes();
    if (p.active.length) {
      // firstSeenAt dipertahankan lintas-run (utk deteksi kode promo baru di
      // auto-video). Yang belum pernah terlihat → firstSeenAt = now.
      const seen = new Map((prev.promo?.active ?? []).map((c) => [c.code, c.firstSeenAt]));
      const active = p.active.map((c) => ({ ...c, firstSeenAt: seen.get(c.code) ?? now }));
      promo = { updatedAt: now, active, archive: p.archive };
    }
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
  // `!denBackfill.has(c.game)`: saat halaman Den sebuah game ditarik PERTAMA
  // KALI, kode Den yang tak dimiliki RoCodes ikut masuk & firstSeenAt-nya = now
  // — padahal itu kode LAMA yang baru kita lihat, bukan kode yang baru rilis.
  // Tanpa saringan ini, backfill Den (304 game) mengirim notif "kode baru" massal
  // DAN memicu video "KODE BARU" utk puluhan game berisi kode berbulan-bulan.
  // Kode yang memang baru rilis tetap tertangkap: make-videos punya jalur "fresh"
  // (tanggal rilis ≤48 jam) yang menyapu semua game tiap run, lepas dari daftar ini.
  // Saringan dipersempit ke KODE-nya, bukan seluruh game: yang ditahan hanya
  // kode yang HANYA dimiliki Den. Kode yang juga muncul di RoCodes berarti baru
  // di sumber yang memang sudah kita baca tiap jam → itu genuine baru, tetap
  // memicu notif & video walau game-nya kebetulan sedang backfill run ini.
  const denSaja = (c) => {
    const src = c.sources?.length ? c.sources : [c.source];
    return src.length === 1 && src[0] === "Roblox Den";
  };
  const newly = active.filter((c) => c.firstSeenAt === now && c.code && !c.bulk && !(denBackfill.has(c.game) && denSaja(c)));

  // Probe keandalan <lastmod> kedua sumber — MENCATAT SAJA, tak mengubah alur.
  // Hasilnya menentukan dua keputusan yang belum bisa diambil: (a) apakah gerbang
  // lastmod pada Den memperlambat deteksi, (b) apakah RoCodes boleh ikut
  // digerbangi (memangkas 8.400 permintaan/hari). Lihat src/lastmod-probe.mjs.
  if (newly.length) {
    const PROBE = resolve(dirname(OUT), "lastmod-probe.json");
    let lama = [];
    try { lama = JSON.parse(await readFile(PROBE, "utf8")); } catch { /* pertama kali */ }
    try {
      const roIndex = await fetchRoCodesIndex();
      const sampel = rekamProbe(newly, roIndex, denIndex, mergedGames, lama);
      await writeFile(PROBE, JSON.stringify(sampel, null, 1));
      console.log(ringkasProbe(sampel));
    } catch (e) { console.log("probe lastmod gagal (abaikan):", e.message); }
  }
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
