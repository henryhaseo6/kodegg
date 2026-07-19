// Discovery game Roblox TERPOPULER (Fase 3 auto-expand).
//
// Ambil daftar "Top Playing Now" dari explore-api RESMI Roblox → game diurut
// pemain KONKUREN terbanyak, lengkap dengan universeId + playerCount + nama.
// Dipakai fetch-roblox untuk MENUMBUHKAN daftar game otomatis, dimulai dari yang
// paling ramai (yang punya halaman kode di RoCodes).

import { fetchRobloxDenSlugs } from "./sources/robloxden.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Slug game (mis. "Blue Lock Rivals" → "blue-lock-rivals") — pola sama dg slug
// RoCodes, jadi dipakai untuk menebak path /codes/<slug>.
export function slugify(s) {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Semua sort game explore-api Roblox. Gabungan → ~366 game populer unik (jauh
// lebih banyak dari satu sort yg cuma ~95). Roblox tak expose lebih dari ini.
const SORTS = ["top-playing-now", "top-trending", "up-and-coming", "fun-with-friends", "top-revisited", "top-earning", "top-rated"];

/**
 * Game Roblox terpopuler saat ini dari SEMUA sort (urut pemain terbanyak, unik).
 * @returns {Promise<{name:string, universeId:number, players:number}[]>}
 */
export async function discoverTopGames() {
  const sid = globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";
  const games = new Map(); // universeId → {name, universeId, players} (pemain tertinggi menang)
  await Promise.all(
    SORTS.map(async (s) => {
      try {
        const res = await fetch(`https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sid}&sortId=${s}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return;
        for (const g of (await res.json()).games ?? []) {
          const uid = g.universeId;
          if (!uid || !g.name) continue;
          const players = g.playerCount ?? 0;
          const cur = games.get(uid);
          if (!cur || players > cur.players) games.set(uid, { name: g.name, universeId: uid, players });
        }
      } catch {
        /* satu sort gagal → lanjut */
      }
    }),
  );
  return [...games.values()].sort((a, b) => b.players - a.players);
}

// Slug game UNGGULAN dari HOMEPAGE RoCodes (widget "Top Games" + baru diupdate).
// Ini ranking RoCodes SENDIRI (game teramai yg punya kode) → slug-nya PERSIS,
// bukan tebakan dari nama. Menutup celah fuzzy-match: game spt "+1 Speed Keyboard
// Escape", "Escape Tsunami For Brainrots", "Roblox Knockout" yg nama Roblox-nya
// tak memetakan bersih ke slug RoCodes → dulu kelewat walau paling ramai.
export async function fetchRoCodesFeatured() {
  try {
    const res = await fetch("https://rocodes.gg/", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const html = await res.text();
    return [...new Set([...html.matchAll(/\/codes\/([a-z0-9-]+)/g)].map((m) => m[1]))];
  } catch {
    return [];
  }
}

// Slug "escape-tsunami-for-brainrots" → "Escape Tsunami For Brainrots" (placeholder;
// nama asli di-override dari <title> halaman RoCodes saat fetch).
function titleFromSlug(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Semua slug game yang PUNYA halaman kode di RoCodes (dari sitemap) — dipakai
// untuk memvalidasi/mencocokkan nama game Roblox ke slug RoCodes yang benar.
export async function fetchRoCodesSlugs() {
  try {
    const res = await fetch("https://rocodes.gg/sitemap-codes.xml", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return new Set();
    const xml = await res.text();
    return new Set([...xml.matchAll(/\/codes\/([a-z0-9-]+)/g)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}

// Nama Roblox penuh dekorasi ([UPD], (New), emoji, "RP", "Release"). Hasilkan
// beberapa kandidat slug bersih untuk dicocokkan ke set RoCodes.
const NOISE = new Set(["upd", "update", "new", "release", "released", "codes", "code", "register", "now", "out", "beta", "free", "the", "a", "2025", "2026"]);
function candidateSlugs(name) {
  const n = name
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\x00-\x7f]/g, " ") // buang emoji/non-ASCII
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const w = n.split(/\s+/).filter(Boolean);
  const core = w.filter((x) => !NOISE.has(x));
  const c = new Set();
  for (const arr of [w, core]) {
    if (!arr.length) continue;
    c.add(arr.join("-"));
    if (arr.length > 1) {
      c.add(arr.slice(0, -1).join("-"));
      c.add(arr.slice(1).join("-"));
    }
  }
  return [...c].filter(Boolean);
}
export function matchSlug(name, roset) {
  for (const s of candidateSlugs(name)) if (roset.has(s)) return s;
  return null;
}

// Tebak genre dari nama/slug (heuristik ringan) supaya game hasil discovery tetap
// punya genre untuk filter hub. Konservatif — hanya kategori yang jelas.
export function inferGenres(name, slug = "") {
  const s = `${name} ${slug}`.toLowerCase();
  const g = [];
  const has = (re) => re.test(s);
  if (has(/anime|vanguard|jujutsu|bleach|naruto|demon|slayer|dragon.?ball|shinobi|ninja|solo.?level|z.?battlegrounds|blox.?fruit|one.?piece|soul/)) g.push("anime");
  if (has(/simulator|tycoon|clicker|merge|idle|pet.?sim|incremental/)) g.push("simulator");
  if (has(/fruit|piece|legacy|rpg|adventure|rogue|dungeon|quest|saga|isekai/)) g.push("rpg");
  if (has(/soccer|basketball|volleyball|football|sport|rivals|blue.?lock|hoops|kick/)) g.push("sports");
  if (has(/tower.?defense|-td-|defense|vanguard|adventures/)) g.push("td");
  if (has(/dress|impress|fashion|makeover|design|life.?together|roleplay|-rp\b|salon/)) g.push("roleplay");
  if (has(/battlegrounds|fight|combat|strongest|blade|arena|brawl/)) g.push("fighting");
  if (has(/survival|forest|nights|sea|island|raft|hospital|escape/)) g.push("survival");
  return [...new Set(g)];
}

/**
 * Game populer yang punya halaman kode di RoCodes ATAU Roblox Den, urut pemain
 * terbanyak. Tiap game bawa slug untuk masing-masing sumber yang punya (bisa
 * salah satu / keduanya) → dua primary saling melengkapi coverage.
 * @returns {Promise<{rocodesSlug:string|null, denSlug:string|null, name:string, universeId:number, players:number}[]>}
 */
export async function discoverPopularWithCodes() {
  const [top, roset, denset, featured] = await Promise.all([discoverTopGames(), fetchRoCodesSlugs(), fetchRobloxDenSlugs(), fetchRoCodesFeatured()]);
  const out = [];
  const seen = new Set();
  // 1) UNGGULAN RoCodes DULU (slug persis dari homepage) → jaminan game teramai
  //    ketarik walau nama Roblox-nya tak match fuzzy. players/universeId nyusul
  //    saat fetch; ditandai `featured` agar tetap ikut cross-check editorial.
  for (const slug of featured) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ rocodesSlug: slug, denSlug: denset.has(slug) ? slug : null, name: titleFromSlug(slug), universeId: null, players: 0, featured: true });
  }
  // 2) DISCOVERY explore-api Roblox (fuzzy-match nama → slug) untuk long-tail.
  for (const g of top) {
    const cands = candidateSlugs(g.name);
    const rocodesSlug = cands.find((s) => roset.has(s)) ?? null;
    const denSlug = cands.find((s) => denset.has(s)) ?? null;
    if (!rocodesSlug && !denSlug) continue;
    const key = rocodesSlug ?? denSlug;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ rocodesSlug, denSlug, name: g.name, universeId: g.universeId, players: g.players });
  }
  return out;
}
