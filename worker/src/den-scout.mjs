// Pemantau ekor-panjang Roblox Den: game yang KODENYA baru diperbarui tapi belum
// kita pantau.
//
// Kenapa perlu: discovery utama berbasis chart Roblox (game yang sudah populer).
// Game yang sedang NAIK tak masuk chart, padahal justru di situ permintaan
// pencarian kode paling besar — terbukti 2 Agu 2026: Drag Drive Simulator dapat
// 2.695 view/hari (89,9% dari YouTube search) karena kodenya lagi aktif, sementara
// Tower of Hell yang pemainnya mirip cuma 27 view karena kodenya mati.
//
// Cara kerja: dari sitemap Den, ambil slug yang <lastmod>-nya segar TAPI belum
// kita pantau → tarik halamannya → resolve placeId ke jumlah pemain → yang di
// atas ambang dipantau mulai run berikutnya.
//
// Dibatasi ketat: MAX evaluasi per run, dan slug yang sudah dinilai DIINGAT
// (data/den-scout.json) supaya game kecil tak dicek berulang tiap jam. Nilai
// ulang setelah masa kedaluwarsa — game bisa tumbuh.
//
// Hasil sapuan awal (2 Agu 2026, 98 slug): 67 game <500 pemain, 20 tak bisa
// di-resolve (kemungkinan delisted), hanya 7 yang >=2.000. Jadi ambang ini
// memang menyaring hampir semuanya — itu tujuannya.
import { fetchRobloxDen } from "./sources/robloxden.mjs";

const AMBANG = Number(process.env.DEN_SCOUT_MIN_PLAYERS || 2000);
const MAX_EVAL = Number(process.env.DEN_SCOUT_MAX || 15); // evaluasi per run
const SEGAR_MS = 36 * 3600 * 1000; // lastmod dianggap "baru diperbarui"
const ULANG_MS = 30 * 24 * 3600 * 1000; // nilai ulang setelah sebulan

async function resolveUniverse(placeId) {
  try {
    const r = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { signal: AbortSignal.timeout(10000) });
    return r.ok ? (await r.json())?.universeId ?? null : null;
  } catch { return null; }
}

async function pemainDari(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    try {
      const r = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeIds.slice(i, i + 50).join(",")}`, { signal: AbortSignal.timeout(12000) });
      if (r.ok) for (const g of (await r.json()).data ?? []) out[g.id] = { playing: g.playing ?? 0, name: g.name || null };
    } catch { /* biarkan */ }
  }
  return out;
}

/**
 * @param {Map<string, number>} denIndex  slug → lastmod(ms) dari sitemap Den
 * @param {Set<string>} sudahDipantau     slug yang sudah ada di set game kita
 * @param {object} memo                   isi data/den-scout.json (slug → {at, players})
 * @returns {Promise<{tambah: object[], memoBaru: object}>}
 */
export async function scoutDen(denIndex, sudahDipantau, memo = {}) {
  const now = Date.now();
  const kandidat = [...denIndex]
    .filter(([slug, lm]) => lm > 0 && now - lm <= SEGAR_MS && !sudahDipantau.has(slug))
    .filter(([slug]) => { const m = memo[slug]; return !m || now - m.at > ULANG_MS; })
    .sort((a, b) => b[1] - a[1]) // yang paling baru diperbarui dinilai duluan
    .slice(0, MAX_EVAL)
    .map(([slug]) => slug);
  if (!kandidat.length) return { tambah: [], memoBaru: memo };

  const nilai = [];
  for (const slug of kandidat) {
    try {
      const r = await fetchRobloxDen(slug);
      const placeId = r.meta?.placeId ?? null;
      const universeId = placeId ? await resolveUniverse(placeId) : null;
      nilai.push({ slug, universeId, kode: (r.active ?? []).length, nama: r.meta?.name ?? null });
    } catch {
      nilai.push({ slug, universeId: null, kode: 0, nama: null });
    }
  }
  const pemain = await pemainDari(nilai.map((n) => n.universeId).filter(Boolean));

  const memoBaru = { ...memo };
  const tambah = [];
  for (const n of nilai) {
    const p = n.universeId ? pemain[n.universeId] : null;
    const jml = p?.playing ?? 0;
    memoBaru[n.slug] = { at: now, players: jml };
    // Butuh universeId: tanpa itu game tak bisa dipastikan identitasnya (dan
    // pipeline memakainya untuk dedup slug ganda).
    if (jml >= AMBANG && n.universeId && n.kode > 0) {
      tambah.push({ slug: n.slug, universeId: n.universeId, players: jml, name: p?.name || n.nama || n.slug });
    }
  }
  console.log(`[den-scout] menilai ${nilai.length} slug baru → ${tambah.length} lolos ambang ${AMBANG} pemain`);
  for (const t of tambah) console.log(`  + ${t.name} (${t.players} pemain, ${t.slug})`);
  return { tambah, memoBaru };
}
