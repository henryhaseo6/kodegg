// Orchestrator "New Roblox Codes Roundup" harian (video long landscape).
// Alur: tentukan tanggal H-1 (WIB) → ambil kode BARU hari itu (firstSeenAt, non-bulk)
// dari roblox-codes.json → group per game (dedup) → top N by jumlah pemain → resolve
// icon (lokal site/public/assets/roblox, fallback fetch by universeId) → render video
// + thumbnail (worker/video/render-roundup.mjs) → metadata → (opsional) upload YouTube.
//
// Roblox-ONLY, global/English. CTA update per-jam → Shorts. Reuse infra Top 50.
// ENV: YT_CLIENT_ID/SECRET/REFRESH_TOKEN (upload) · YT_PRIVACY
// ARG: --date=YYYY-MM-DD  --limit=N(15)  --no-upload  --sfx=0
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRoundup, renderRoundupThumb } from "./video/render-roundup.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? "1"] : [a, "1"]; }));
const LIMIT = Math.max(1, Number(ARG.limit) || 999); // default: SEMUA game yg dapet kode baru H-1
const OUT_DIR = resolve(HERE, "../_video-out");
const ASSETS = resolve(HERE, "../site/public/assets/roblox");
const CACHE = resolve(HERE, "video/assets/roundup-cache");
const SFX = ARG.sfx !== "0";

const wibYMD = (off = 0) => { const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const label = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
const DATE = ARG.date || wibYMD(-1);
const ts = (t) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const decode = (s) => (s || "").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const seedFromDate = (ymd) => { let h = 0; for (const ch of ymd) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

// ——— data: kode yg BENER-BENER BARU hari DATE, group per game ———
// Kriteria "kode baru beneran" (konsisten dg badge NEW situs & Shorts). Patokan
// utama = TANGGAL RILIS (c.date), BUKAN bulk-flag. Alasan: game yg baru ke-discover
// borongan (mis. Lineage Piece 50 kode) — SEMUA kodenya masuk `bulk`, TAPI sebagian
// rilisnya emang hari itu (c.date=DATE) → itu kode baru asli, jangan dibuang cuma
// gara-gara bulk. (Dulu pakai `!bulk && firstSeen==DATE && discovered!=DATE` →
// Lineage Piece dkk kebuang bulat-bulat, roundup cuma 4 game.) Kriteria (union):
//   BIG = player ≥2000 DAN c.date ∈ [DATE-1, DATE]  → game gede rilis kode baru
//   EST = !bulk DAN firstSeenAt = DATE              → game established nambah kode
// Archive-dump kecil (mis. One Fruit 126 kode umur lama, <2000p) gugur di dua-duanya:
// c.date lawas (bukan BIG) + bulk (bukan EST). Cocok sama filter Shorts (≥2000 + c.date).
function loadGames() {
  const db = JSON.parse(readFileSync(resolve(HERE, "data/roblox-codes.json"), "utf8"));
  const G = db.games || {}; // slug → { universeId, players, rawName, name }
  const MINP = 2000, DATEms = Date.parse(DATE + "T00:00:00Z");
  const winDate = (c) => { const d = Date.parse(c.date || "") || 0; return d > 0 && d >= DATEms - 864e5 && d <= DATEms + 864e5; };
  const byGame = {};
  for (const c of (db.active || [])) { // hanya kode AKTIF (redeemable) — bukan arsip expired
    if (!c.game || !c.code) continue;
    const big = (G[c.game]?.players || 0) >= MINP && winDate(c);
    const est = !c.bulk && c.firstSeenAt && c.firstSeenAt.slice(0, 10) === DATE;
    if (!big && !est) continue;
    (byGame[c.game] = byGame[c.game] || []).push({ code: c.code, reward: decode(c.reward || "") });
  }
  const list = Object.entries(byGame).map(([slug, codes]) => {
    const meta = G[slug] || {};
    const seen = new Set(), uniq = codes.filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
    return { id: slug, name: decode(meta.name || slug), rawName: decode(meta.rawName || meta.name || slug), players: meta.players || 0, universeId: meta.universeId || null, codes: uniq };
  });
  list.sort((a, b) => b.players - a.players);
  return { list, totalGames: list.length, totalCodes: list.reduce((a, g) => a + g.codes.length, 0) };
}

async function resolveIcons(games) {
  mkdirSync(CACHE, { recursive: true });
  const need = [];
  for (const g of games) { const local = resolve(ASSETS, g.id + ".png"); if (existsSync(local)) g.iconPath = local; else { g.iconPath = null; if (g.universeId) need.push(g); } }
  if (need.length) {
    const ids = need.map((g) => g.universeId), iconUrl = {};
    for (let i = 0; i < ids.length; i += 50) { const batch = ids.slice(i, i + 50).join(","); try { const r = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${batch}&size=512x512&format=Png&returnPolicy=PlaceHolder`); const j = await r.json(); for (const d of j.data || []) if (d.imageUrl) iconUrl[d.targetId] = d.imageUrl; } catch {} }
    for (const g of need) { const cp = resolve(CACHE, g.universeId + ".png"); if (!existsSync(cp) && iconUrl[g.universeId]) { try { const r = await fetch(iconUrl[g.universeId]); writeFileSync(cp, Buffer.from(await r.arrayBuffer())); } catch {} } if (existsSync(cp)) g.iconPath = cp; }
  }
}

function metadata(games, dateLbl, totalCodes, totalGames, chapters) {
  const n = games.length;
  const title = `New Roblox Codes — ${dateLbl} (${totalCodes} Codes, ${n} Games)`;
  const timeline = chapters.map((c) => (c.n === 0 ? `${ts(c.t)} Intro` : `${ts(c.t)} ${c.name} — ${c.n} code${c.n > 1 ? "s" : ""}`)).join("\n");
  const head = `All the NEW Roblox codes added on ${dateLbl}, grouped by game — copy & redeem before they expire.\n⚡ Want codes the moment they drop? New codes EVERY HOUR on our Shorts.`;
  const foot = `🎮 All codes + how to redeem (updated hourly) → https://kodegg.com\n\n#Roblox #RobloxCodes #RobloxCodesToday`;
  // Prioritas: head + timeline (semua game) + foot. Daftar KODE diisi sebanyak yg
  // muat di sisa budget 5000 char YT, dipotong di batas GAME (rapi) + tautan situs.
  const essential = `${head}\n\n⏱️ TIMELINE (tap to jump):\n${timeline}\n\n${foot}`;
  const budget = 4900 - essential.length - 60;
  let codeList = "", truncated = false;
  for (const g of games) {
    const block = `▶ ${g.disp} — ${g.codes.length} new\n${g.codes.map((c) => `  • ${c.code}${c.reward ? ` — ${c.reward}` : ""}`).join("\n")}\n\n`;
    if (codeList.length + block.length > budget) { truncated = true; break; }
    codeList += block;
  }
  const codeSection = codeList ? `\n\n🎁 ALL CODES:\n${codeList.trimEnd()}${truncated ? "\n\n… + more — full code list at https://kodegg.com" : ""}` : "";
  let description = `${head}\n\n⏱️ TIMELINE (tap to jump):\n${timeline}${codeSection}\n\n${foot}`;
  if (description.length > 4950) description = description.slice(0, 4947) + "…";
  const tags = ["roblox codes", "new roblox codes", "roblox codes today", "roblox redeem codes", "roblox promo codes", "free roblox codes", `roblox codes ${dateLbl.toLowerCase()}`, "kodegg", ...games.slice(0, 8).map((g) => `${g.disp} codes`)];
  return { title, description, tags };
}

(async () => {
  console.log(`[roundup] tanggal=${DATE} limit=${LIMIT} sfx=${SFX}`);
  const { list, totalGames, totalCodes: totalCodesAll } = loadGames();
  if (!list.length) { console.log(`[roundup] tidak ada kode baru non-bulk di ${DATE} — skip.`); return; }
  const games = list.slice(0, LIMIT);
  const totalCodes = games.reduce((a, g) => a + g.codes.length, 0);
  console.log(`[roundup] ${totalGames} game punya kode baru (${totalCodesAll} kode). Tampil top ${games.length} by pemain: ${games.slice(0, 5).map((g) => g.name).join(", ")}…`);

  console.log("[roundup] resolve icon…"); await resolveIcons(games);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = ARG.out || resolve(OUT_DIR, `roundup-roblox-${DATE}.mp4`);
  console.log("[roundup] render video…");
  const { chapters } = await renderRoundup({ games, dateLabel: label(DATE), outPath, sfx: SFX });
  console.log("[roundup] video ✓ →", outPath);

  const meta = metadata(games, label(DATE), totalCodes, totalGames, chapters);
  writeFileSync(outPath.replace(/\.mp4$/, ".txt"), `${meta.title}\n\n${meta.description}\n\nTAGS: ${meta.tags.join(", ")}\n`);

  const thumbPath = outPath.replace(/\.mp4$/, ".png");
  try { await renderRoundupThumb({ games, dateLabel: label(DATE), totalCodes, gamesCount: games.length, outPath: thumbPath, seed: seedFromDate(DATE) }); console.log("[roundup] thumbnail ✓ →", thumbPath); }
  catch (e) { console.log("[roundup] thumbnail gagal:", e.message); }

  if (ARG["no-upload"] === "1") { console.log("[roundup] --no-upload → tidak upload."); return; }
  const { ytConfigured, uploadVideo } = await import("./video/upload.mjs");
  if (!ytConfigured()) { console.log("[roundup] YT belum di-set → skip upload (video tersimpan lokal)."); return; }
  const privacy = process.env.YT_PRIVACY || "private";
  const playlistTitle = "New Roblox Codes — Daily Roundup";
  const playlistDescription = "New Roblox codes drop every day — here's the daily roundup. All the new Roblox codes added each day, grouped by game, with rewards. Copy & redeem before they expire!\n\n⚡ Want codes the moment they drop? New codes every hour on our Shorts.\n🎮 All codes + how to redeem (updated hourly) → https://kodegg.com";
  console.log(`[roundup] upload YouTube (privacy=${privacy})…`);
  try {
    const r = await uploadVideo({ videoPath: outPath, title: meta.title, description: meta.description, tags: meta.tags, privacy, thumbnailPath: existsSync(thumbPath) ? thumbPath : undefined, playlistTitle, playlistDescription });
    console.log(`[roundup] uploaded ✓ ${r.url} (privacy=${privacy})`);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🎁 New Roblox Codes Roundup — ${label(DATE)}\n- ${r.url} (privacy=${privacy})\n- ${totalCodes} kode / ${games.length} game (dari ${totalGames} game total)\n`, { flag: "a" });
  } catch (e) { console.log("[roundup] upload gagal:", e.message); }
})();
