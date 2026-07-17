// Sumber: GamerPower (gift pack / loot in-game). ATRIBUSI WAJIB per lisensi.
//
// Memakai type=loot, BUKAN type=game:
//   type=game → giveaway game premium yang sedang gratis. Mayoritas offline/
//               single-player (mis. "Princess Farmer") → dilarang CLAUDE.md.
//   type=loot → item/gift pack DI DALAM game. Game yang punya loot pasti punya
//               konten berjalan → cocok dengan fokus live-service.
//
// Giveaway di sini diklaim lewat URL, bukan kode redeem — `code` sengaja null
// dan kartu menampilkan tombol klaim.

import { isOfflineTitle } from "../games.mjs";

const ENDPOINT = "https://www.gamerpower.com/api/giveaways?platform=android&type=loot";
const MAX_ITEMS = 40;

function toISO(value) {
  if (!value || value === "N/A") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function fetchGamerPower({ userAgent }) {
  try {
    const res = await fetch(ENDPOINT, { headers: { "User-Agent": userAgent } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();

    const items = (Array.isArray(rows) ? rows : [])
      .filter((g) => g.title && !isOfflineTitle(g.title))
      .slice(0, MAX_ITEMS)
      .map((g) => ({
        game: null, // tidak selalu memetakan ke game di registry kita
        gameName: g.title,
        code: null, // diklaim via URL
        reward: g.description?.trim() || null, // VERBATIM dari sumber
        status: "active",
        perm: false,
        endsAt: toISO(g.end_date),
        claimUrl: g.open_giveaway_url || g.gamerpower_url || null,
        source: "GamerPower", // atribusi wajib
        sourceUrl: g.gamerpower_url || null,
      }));

    return { items, failed: 0 };
  } catch (err) {
    console.error(`[gamerpower] ${err.message}`);
    return { items: [], failed: 1 };
  }
}
