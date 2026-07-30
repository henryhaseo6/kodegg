// Registry game ROBLOX — vertikal terpisah dari GAMES (game mobile).
// Sumber kode: RoCodes.gg (lihat sources/rocodes.mjs). Menambah game = 1 entri
// { slug (path /codes/<slug> di RoCodes), name, genres }. universeId/placeId,
// howTo, dan status verified ditarik OTOMATIS dari payload RoCodes saat fetch,
// jadi tak perlu ditulis manual di sini.
//
// Aturan CLAUDE.md: game online/live-service. Roblox experience = online.

export const ROBLOX_GAMES = {
  bloxfruits: { slug: "blox-fruits", name: "Blox Fruits", genres: ["rpg", "adventure", "anime"] },
  bluelock: { slug: "blue-lock-rivals", name: "Blue Lock Rivals", genres: ["sports", "anime", "fighting"] },
  typesoul: { slug: "type-soul", name: "Type Soul", genres: ["rpg", "anime", "fighting"] },
  animevanguards: { slug: "anime-vanguards", name: "Anime Vanguards", genres: ["td", "anime", "rpg"] },
  growagarden: { slug: "grow-a-garden", name: "Grow a Garden", genres: ["simulator", "casual"] },
  nights99: { slug: "99-nights-in-the-forest", name: "99 Nights in the Forest", genres: ["survival", "adventure"] },
  fisch: { slug: "fisch", name: "Fisch", genres: ["simulator", "adventure"] },
  bladeball: { slug: "blade-ball", name: "Blade Ball", genres: ["fighting", "sports"] },
  animeadventures: { slug: "anime-adventures", name: "Anime Adventures", genres: ["td", "anime", "rpg"] },
  kinglegacy: { slug: "king-legacy", name: "King Legacy", genres: ["rpg", "adventure", "anime"] },
  basketballzero: { slug: "basketball-zero", name: "Basketball Zero", genres: ["sports", "anime"] },
  volleyballlegends: { slug: "volleyball-legends", name: "Volleyball Legends", genres: ["sports", "anime"] },
  dresstoimpress: { slug: "dress-to-impress", name: "Dress to Impress", genres: ["casual", "roleplay"] },
  petsim99: { slug: "pet-simulator-99", name: "Pet Simulator 99", genres: ["simulator", "casual"] },
  adoptme: { slug: "adopt-me", name: "Adopt Me!", genres: ["roleplay", "casual"] },
};

// Override NAMA saja (slug/URL TAK berubah) — utk game auto-discover yg nama
// sumbernya kurang tepat / nyesatin. Mis. RoCodes judulin "The Strongest
// Battlegrounds Music" padahal kode-nya Kill Sound Effect (bukan lagu) → pakai
// "Sound" biar visitor gak ngerasa ketipu. Keyed by game id.
export const ROBLOX_NAME_OVERRIDE = {
  "the-strongest-battlegrounds": "The Strongest Battlegrounds Sound",
};

// Slug URL keyword dari NAMA (mis. "Blox Fruits" -> "blox-fruits") untuk /roblox/<slug>.
const slugify = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const ROBLOX_SLUG = Object.fromEntries(Object.keys(ROBLOX_GAMES).map((id) => [id, slugify(ROBLOX_GAMES[id].name)]));
export const robloxSlug = (id) => ROBLOX_SLUG[id] ?? id;
export const robloxIdFromSlug = (slug) => Object.keys(ROBLOX_SLUG).find((id) => ROBLOX_SLUG[id] === slug) ?? null;
