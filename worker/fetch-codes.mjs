// PatchDay — contoh worker penarik KODE REDEEM
// Menarik dari hoyo-codes (game HoYoverse) + GamerPower (giveaway lintas-platform),
// menormalisasi ke skema PatchDay, lalu menulis data/codes.json.
//
// Jalankan: `node fetch-codes.mjs` (Node >=18, fetch bawaan).
// Produksi: jalankan terjadwal (~tiap jam) via serverless cron / GitHub Actions.
//
// CATATAN:
// - Kode expired TIDAK dihapus — dipindah ke "archive" (jadi database).
// - Hanya game online/live-service. Tambah game baru di GAMES di bawah.
// - Verifikasi status kode dari sumber; jangan mengarang.
// - Untuk produksi: cache icon game ke storage sendiri, jangan hotlink permanen.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// game HoYoverse yang didukung hoyo-codes: game key -> meta situs
const GAMES = {
  genshin: { id: "gi", name: "Genshin Impact", redeem: "https://genshin.hoyoverse.com/en/gift" },
  hkrpg:   { id: "hsr", name: "Honkai: Star Rail", redeem: "https://hsr.hoyoverse.com/gift" },
  nap:     { id: "zzz", name: "Zenless Zone Zero", redeem: "https://zzz.hoyoverse.com/redemption" },
};

const HOYO_ENDPOINT = (game) => `https://hoyo-codes.seria.moe/codes?game=${game}`;
const GAMERPOWER_ENDPOINT = "https://www.gamerpower.com/api/giveaways?platform=android&type=game";

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": "PatchDayBot/0.1 (+https://patchday.example)" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// --- Tarik kode HoYoverse ---
async function fetchHoyo() {
  const out = [];
  for (const [game, meta] of Object.entries(GAMES)) {
    try {
      const data = await getJSON(HOYO_ENDPOINT(game));
      // hoyo-codes mengembalikan { active: [{code, rewards, ...}], ... }
      const active = data.active || data.codes || [];
      for (const c of active) {
        out.push({
          game: meta.id,
          gameName: meta.name,
          code: (c.code || "").trim(),
          reward: c.rewards || c.reward || "",     // VERBATIM dari sumber
          status: "active",
          source: "hoyo-codes",
          sourceUrl: meta.redeem,
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[hoyo] ${game}:`, err.message); // jangan gagalkan seluruh run
    }
  }
  return out;
}

// --- Tarik giveaway/loot Android (GamerPower) ---
async function fetchGamerPower() {
  try {
    const data = await getJSON(GAMERPOWER_ENDPOINT);
    return (data || []).slice(0, 40).map((g) => ({
      game: null,                       // GamerPower tak selalu punya game id kita
      gameName: g.title || "",
      code: null,                        // giveaway biasanya klaim via URL, bukan kode
      reward: g.description || "",
      status: "active",
      claimUrl: g.open_giveaway_url || g.gamerpower_url,
      source: "GamerPower",             // WAJIB atribusi
      sourceUrl: g.gamerpower_url,
      endsAt: g.end_date && g.end_date !== "N/A" ? new Date(g.end_date).toISOString() : null,
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error("[gamerpower]:", err.message);
    return [];
  }
}

// --- Gabung dengan arsip lama: kode yang hilang dari "active" → arsipkan ---
async function mergeArchive(freshActive, prevPath) {
  let prev = { active: [], archive: [] };
  try { prev = JSON.parse(await readFile(prevPath, "utf8")); } catch {}
  const freshKeys = new Set(freshActive.filter((c) => c.code).map((c) => c.game + ":" + c.code));
  const archive = [...(prev.archive || [])];
  const archKeys = new Set(archive.map((c) => c.game + ":" + c.code));
  // kode aktif sebelumnya yang kini hilang → expired → arsip
  for (const c of (prev.active || [])) {
    if (!c.code) continue;
    const key = c.game + ":" + c.code;
    if (!freshKeys.has(key) && !archKeys.has(key)) {
      archive.push({ ...c, status: "expired", expiredAt: new Date().toISOString() });
      archKeys.add(key);
    }
  }
  return { active: freshActive, archive };
}

async function main() {
  const [hoyo, gp] = await Promise.all([fetchHoyo(), fetchGamerPower()]);
  const freshActive = [...hoyo, ...gp];
  const outPath = "data/codes.json";
  const merged = await mergeArchive(freshActive, outPath);
  const payload = {
    updatedAt: new Date().toISOString(),
    counts: { active: merged.active.length, archived: merged.archive.length },
    ...merged,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2));
  console.log(`✓ ${outPath}: ${payload.counts.active} aktif, ${payload.counts.archived} arsip`);
}

main().catch((e) => { console.error(e); process.exit(1); });
