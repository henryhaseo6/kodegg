// Pembaca cache roblox-codes.json (vertikal Roblox) untuk build SSG.
// Sumber data = worker/data/roblox-codes.json (dari RoCodes.gg). Bentuk mirror
// codes.mjs supaya bisa pakai pola kartu/sort yang sama.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CACHE = process.env.KODEGG_ROBLOX ?? resolve(process.cwd(), "../worker/data/roblox-codes.json");

const ICON_DIR = "/assets/roblox";
export const robloxIconUrl = (id) => `${ICON_DIR}/${id}.png`;

// Aturan badge sama dengan mobile (lihat codes.mjs): baru ditarik ATAU baru
// dirilis dalam 24 jam, asal bukan impor pertama sebuah game (`bulk`).
const NEW_MS = 24 * 3600 * 1000;
const NOW_MS = Date.now();

function shape(item, games) {
  const g = games[item.game] || {};
  const dateMs = Date.parse(item.date ?? "") || 0;
  const firstSeenMs = Date.parse(item.firstSeenAt ?? "") || 0;
  // rankMs = kunci sort "Terbaru": tanggal rilis dulu; kalau tak ada & bukan
  // impor massal pertama, pakai firstSeen. (Lihat codes.mjs untuk alasan `bulk`.)
  const rankMs = dateMs || (item.bulk ? 0 : firstSeenMs);
  const newMs = item.bulk ? dateMs : Math.max(dateMs, firstSeenMs);
  return {
    ...item, // termasuk source/sources/sourceUrls dari worker (RoCodes &/atau Roblox Den)
    name: g.name ?? item.gameName ?? "—",
    icon: robloxIconUrl(item.game),
    gameSlug: g.slug ?? item.game,
    rankMs,
    firstSeenMs,
    isNew: newMs > 0 && NOW_MS - newMs <= NEW_MS,
    verified: item.verified === true,
    search: `${g.name ?? ""} ${item.code ?? ""} ${item.reward ?? ""}`.toLowerCase(),
  };
}

async function read() {
  try {
    return JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return { updatedAt: null, active: [], archive: [], games: {} };
  }
}

const bySort = (a, b) => b.rankMs - a.rankMs || b.firstSeenMs - a.firstSeenMs;

/** Homepage: N kode Roblox terbaru lintas game + hitungan. Diversifikasi: maks
 * 2 kode per game supaya satu game yang baru drop banyak kode tak memborong
 * section (showcase lebih banyak game). */
export async function loadRobloxHome(limit = 8) {
  const raw = await read();
  const games = raw.games ?? {};
  const active = (raw.active ?? []).map((c) => shape(c, games)).sort(bySort);
  const perGame = {};
  const top = [];
  for (const c of active) {
    if (limit && top.length >= limit) break;
    const n = (perGame[c.game] = (perGame[c.game] ?? 0) + 1);
    if (n <= 2) top.push(c);
  }
  // TRENDING Roblox: game teramai (pemain konkuren realtime, di-refresh tiap jam
  // di worker). Dinamis — urutan otomatis berubah saat popularitas bergeser.
  const activeByGame = {};
  for (const c of raw.active ?? []) activeByGame[c.game] = (activeByGame[c.game] ?? 0) + 1;
  const trending = Object.entries(games)
    .map(([gid, g]) => ({
      id: gid,
      name: g.name,
      slug: g.slug ?? gid,
      icon: robloxIconUrl(gid),
      players: g.players ?? 0,
      genre: rbxGenreLabel(g.genres?.[0]),
      verified: g.verified === true,
      codeCount: activeByGame[gid] ?? 0,
    }))
    .sort((a, b) => b.players - a.players)
    .slice(0, 7);

  return {
    updatedAt: raw.updatedAt ?? null,
    counts: raw.counts ?? { active: active.length, archived: (raw.archive ?? []).length, games: Object.keys(games).length },
    top,
    trending,
    gamesCount: Object.keys(games).length,
  };
}

// Label genre Roblox (istilah game, sama ID/EN) untuk kartu.
const RBX_GENRE = { anime: "Anime", rpg: "RPG", sports: "Sports", fighting: "Fighting", td: "Tower Defense", simulator: "Simulator", adventure: "Adventure", survival: "Survival", casual: "Casual", roleplay: "Roleplay", moba: "MOBA", horror: "Horror" };
function rbxGenreLabel(key) {
  if (!key) return "";
  return RBX_GENRE[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Kartu game Roblox untuk halaman Favorit (bentuk selaras loadCatalog): dipakai
 * agar game Roblox yang difavoritkan ikut tampil di /saved. platform:"roblox"
 * menandai URL /roblox/<slug>. */
export async function loadRobloxSavedCards() {
  const raw = await read();
  return Object.entries(raw.games ?? {}).map(([gid, g]) => ({
    id: gid,
    name: g.name,
    slug: g.slug ?? gid,
    cover: robloxIconUrl(gid),
    genreLabels: (g.genres ?? []).map(rbxGenreLabel).filter(Boolean),
    hasCodes: true,
    platform: "roblox",
  }));
}

/** Katalog game Roblox (getStaticPaths per-game + hub). Default urut KODE TERBARU
 * (tanggal kode terbaru tiap game) → game yang jarang update kode turun ke bawah. */
export async function loadRobloxCatalog() {
  const raw = await read();
  const games = raw.games ?? {};
  const activeByGame = {};
  const newestByGame = {};
  for (const c of raw.active ?? []) {
    activeByGame[c.game] = (activeByGame[c.game] ?? 0) + 1;
    // SAMA dg rankMs homepage: tanggal rilis dulu; kalau tak ada & BUKAN impor
    // massal pertama, baru firstSeen. Tanpa ini, game yg baru di-discover (kode
    // lama tapi `bulk`) salah naik ke puncak "kode terbaru" krn firstSeen=hari ini.
    const ms = Date.parse(c.date ?? "") || (c.bulk ? 0 : Date.parse(c.firstSeenAt ?? "")) || 0;
    if (ms > (newestByGame[c.game] ?? 0)) newestByGame[c.game] = ms;
  }
  return Object.entries(games)
    .map(([id, g]) => ({
      id,
      name: g.name,
      slug: g.slug ?? id,
      icon: robloxIconUrl(id),
      genres: g.genres ?? [],
      verified: g.verified === true,
      activeCount: activeByGame[id] ?? 0,
      newestMs: newestByGame[id] ?? 0, // tanggal kode terbaru → sort "terbaru"
      players: g.players ?? 0, // pemain konkuren realtime → sort "terpopuler"
    }))
    .sort((a, b) => b.newestMs - a.newestMs || b.activeCount - a.activeCount || a.name.localeCompare(b.name));
}

/** Daftar ringkas game Roblox (id + nama) untuk picker notifikasi. `id` = kunci
 * filter push-notify (cocok dg field `game` pada kode), bukan slug. */
export async function loadRobloxGameList() {
  const raw = await read();
  return Object.entries(raw.games ?? {})
    .map(([id, g]) => ({ id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Kode PROMO Roblox platform (halaman /roblox/promo-codes). */
export async function loadRobloxPromo() {
  const raw = await read();
  const p = raw.promo ?? { active: [], archive: [] };
  const shape = (c) => ({ ...c, verified: c.verified === true });
  return {
    updatedAt: p.updatedAt ?? raw.updatedAt ?? null,
    active: (p.active ?? []).map(shape),
    archive: (p.archive ?? []).map(shape),
  };
}

/** Per-game (halaman /roblox/<slug>): meta + kode aktif + arsip. */
export async function loadRobloxGame(slug) {
  const raw = await read();
  const games = raw.games ?? {};
  const entry = Object.entries(games).find(([, g]) => (g.slug ?? "") === slug);
  if (!entry) return null;
  const [id, g] = entry;
  const active = (raw.active ?? []).filter((c) => c.game === id).map((c) => shape(c, games)).sort(bySort);
  const archive = (raw.archive ?? []).filter((c) => c.game === id).map((c) => shape(c, games)).sort(bySort);
  return {
    id,
    slug,
    name: g.name,
    icon: robloxIconUrl(id),
    genres: g.genres ?? [],
    universeId: g.universeId ?? null,
    placeId: g.placeId ?? null,
    players: g.players ?? 0, // pemain konkuren (realtime, refresh hourly)
    crossCheck: Array.isArray(g.crossCheck) ? g.crossCheck : [], // situs editorial pengonfirmasi
    verifiedCount: active.filter((c) => c.verified).length,
    howTo: Array.isArray(g.howTo) ? g.howTo : [],
    updatedAt: raw.updatedAt ?? null,
    active,
    archive,
  };
}
