// Ambil daftar game teratas Roblox + CCU (playerCount) dari Charts explore-api.
// SATU call get-sorts sudah membawa game inline (universeId, name, playerCount)
// dari SEMUA sort (Top Playing Now, Trending, Up-and-Coming, dst) — game ber-kode
// maupun tidak. Dipakai baik di CF Worker (logging tiap 10 mnt) maupun Node.
//
// Endpoint: https://apis.roblox.com/explore-api/v1/get-sorts
//   ?sessionId=<uuid>&device=computer&country=all
// Portabel: pakai global fetch (ada di Node 18+ & Workers). sessionId acak per
// panggilan (crypto.randomUUID) supaya tak tersangkut cache sesi.

const SORTS_URL = "https://apis.roblox.com/explore-api/v1/get-sorts";

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `kodegg-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);

/**
 * @returns {Promise<Array<{universeId:number, name:string, playerCount:number, rootPlaceId:number}>>}
 *   game unik lintas-sort, urut CCU menurun. Lempar Error bila API gagal.
 */
export async function fetchChartsGames() {
  const url = `${SORTS_URL}?sessionId=${uuid()}&device=computer&country=all`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`get-sorts ${res.status}`);
  const j = await res.json();
  const uni = new Map();
  for (const srt of j.sorts ?? []) {
    if (srt.contentType !== "Games") continue;
    for (const g of srt.games ?? []) {
      if (!g.universeId || typeof g.playerCount !== "number") continue;
      const prev = uni.get(g.universeId);
      // game bisa muncul di banyak sort — simpan CCU tertinggi (harusnya sama)
      if (!prev || g.playerCount > prev.playerCount) {
        uni.set(g.universeId, {
          universeId: g.universeId,
          name: g.name,
          playerCount: g.playerCount,
          rootPlaceId: g.rootPlaceId ?? null,
        });
      }
    }
  }
  return [...uni.values()].sort((a, b) => b.playerCount - a.playerCount);
}

/**
 * CCU untuk universeId yang TAK ada di chart (mis. game lama yang jatuh) via
 * games API resmi, batch 50. Aman-dilewati bila kosong.
 * @param {number[]} universeIds
 * @returns {Promise<Record<number, number>>} {universeId: playerCount}
 */
export async function fetchPlayersByIds(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50).join(",");
    try {
      const res = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${batch}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) continue;
      for (const g of (await res.json()).data ?? []) {
        if (typeof g.playing === "number") out[g.id] = g.playing;
      }
    } catch {
      /* lewati batch gagal — tick berikutnya coba lagi */
    }
  }
  return out;
}

/**
 * Rollup harian: dari kumpulan snapshot 1 hari → statistik per game.
 * @param {Array<Record<number, number>>} snapshots  tiap elemen = {uid: ccu}
 * @param {Record<number, {name:string}>} registry   uid → {name}
 * @returns {Array<{universeId, name, avg, peak, samples}>}  urut peak menurun
 */
export function rollupDay(snapshots, registry = {}) {
  const acc = new Map(); // uid → {sum, peak, n}
  for (const snap of snapshots) {
    for (const [uid, ccu] of Object.entries(snap)) {
      if (typeof ccu !== "number") continue;
      const a = acc.get(uid) ?? { sum: 0, peak: 0, n: 0 };
      a.sum += ccu;
      if (ccu > a.peak) a.peak = ccu;
      a.n += 1;
      acc.set(uid, a);
    }
  }
  const out = [];
  for (const [uid, a] of acc) {
    out.push({
      universeId: Number(uid),
      name: registry[uid]?.name ?? null,
      avg: Math.round(a.sum / a.n),
      peak: a.peak,
      samples: a.n,
    });
  }
  return out.sort((x, y) => y.peak - x.peak);
}
