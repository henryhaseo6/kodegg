// Pembaca cache games.json untuk halaman Jelajah Game (SSG).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CACHE = process.env.KODEGG_GAMES ?? resolve(process.cwd(), "../worker/data/games.json");
const CODES = process.env.KODEGG_CODES ?? resolve(process.cwd(), "../worker/data/codes.json");

/** Set id game yang PUNYA kode aktif SAAT INI (bukan sekadar terdaftar). */
async function gamesWithActiveCodes() {
  try {
    const d = JSON.parse(await readFile(CODES, "utf8"));
    return new Set((d.active ?? []).map((c) => c.game).filter(Boolean));
  } catch {
    return new Set();
  }
}

// Label genre (istilah game — sama di ID/EN; jargon tak diterjemahkan sendiri).
export const GENRE_LABEL = {
  rpg: "RPG",
  gacha: "Gacha",
  action: "Action",
  moba: "MOBA",
  br: "Battle Royale",
  shooter: "Shooter",
  strategy: "Strategy",
  idle: "Idle",
  otome: "Otome",
  mmorpg: "MMORPG",
};

// Urutan preferensi chip filter. Yang BENAR-BENAR ditampilkan dihitung dinamis
// di loadCatalog() — hanya genre yang ada gamenya (biar tak ada chip kosong).
const GENRE_ORDER = ["rpg", "gacha", "action", "moba", "br", "shooter", "strategy", "survival", "idle", "mmorpg", "adventure", "otome"];

export async function loadCatalog() {
  let raw;
  try {
    raw = JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return { updatedAt: null, games: [] };
  }

  const active = await gamesWithActiveCodes();

  const games = (raw.games ?? []).map((g) => ({
    ...g,
    genreLabels: g.genres.map((k) => GENRE_LABEL[k] ?? k),
    search: `${g.name} ${g.genres.map((k) => GENRE_LABEL[k] ?? k).join(" ")}`.toLowerCase(),
    releasedMs: g.releasedAt ? Date.parse(g.releasedAt) : 0,
    // hasCodes = game terdaftar sbg game-berkode (punya halaman per-game).
    // hasActiveCodes = benar-benar ada kode aktif SEKARANG (untuk badge).
    hasActiveCodes: active.has(g.id),
  }));

  // Chip genre = hanya genre yang benar-benar ada gamenya, urut sesuai preferensi.
  const present = new Set(games.flatMap((g) => g.genres));
  const genreFilters = GENRE_ORDER.filter((k) => present.has(k));

  return { updatedAt: raw.updatedAt ?? null, games, genreFilters };
}
