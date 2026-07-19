// Pembaca cache roblox-codes.json (vertikal Roblox) untuk build SSG.
// Sumber data = worker/data/roblox-codes.json (dari RoCodes.gg). Bentuk mirror
// codes.mjs supaya bisa pakai pola kartu/sort yang sama.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CACHE = process.env.KODEGG_ROBLOX ?? resolve(process.cwd(), "../worker/data/roblox-codes.json");

const ICON_DIR = "/assets/roblox";
export const robloxIconUrl = (id) => `${ICON_DIR}/${id}.png`;

// Kode Roblox churn cepat → jendela "Baru" sedikit lebih longgar dari mobile.
const NEW_DAYS = 5;
const NOW_MS = Date.now();

function shape(item, games) {
  const g = games[item.game] || {};
  const dateMs = Date.parse(item.date ?? "") || 0;
  const firstSeenMs = Date.parse(item.firstSeenAt ?? "") || 0;
  // rankMs = kunci sort "Terbaru": tanggal rilis dulu; kalau tak ada & bukan
  // impor massal pertama, pakai firstSeen. (Lihat codes.mjs untuk alasan `bulk`.)
  const rankMs = dateMs || (item.bulk ? 0 : firstSeenMs);
  const rocodesUrl = g.rocodesSlug ? `https://rocodes.gg/codes/${g.rocodesSlug}` : null;
  return {
    ...item,
    name: g.name ?? item.gameName ?? "—",
    icon: robloxIconUrl(item.game),
    gameSlug: g.slug ?? item.game,
    rankMs,
    firstSeenMs,
    isNew: dateMs > 0 && NOW_MS - dateMs <= NEW_DAYS * 86400000,
    verified: item.verified === true, // diisi Fase 2 (cross-check editorial)
    // Atribusi (dipakai CodeCard): tiap item Roblox berasal dari RoCodes.
    source: "RoCodes.gg",
    sources: ["RoCodes.gg"],
    sourceUrls: rocodesUrl ? { "RoCodes.gg": rocodesUrl } : {},
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
  return {
    updatedAt: raw.updatedAt ?? null,
    counts: raw.counts ?? { active: active.length, archived: (raw.archive ?? []).length, games: Object.keys(games).length },
    top,
    gamesCount: Object.keys(games).length,
  };
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
    const ms = Date.parse(c.date ?? "") || Date.parse(c.firstSeenAt ?? "") || 0;
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
