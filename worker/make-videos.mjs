// Orkestrator auto-video YouTube: deteksi kode baru → pilih game terbaik (maks
// N/hari, prioritas populer, anti-dobel) → render + VO + musik → upload Unlisted.
// Jalan di GitHub Actions setelah fetch. Aman-dilewati bila YT belum di-set.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { renderShort, ffmpegBin } from "./video/render-short.mjs";
import { makeVO, muxAudio } from "./video/make-audio.mjs";
import { buildMetadata } from "./video/metadata.mjs";
import { uploadVideo, ytConfigured } from "./video/upload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const ASSETS_ROBLOX = resolve(HERE, "../site/public/assets/roblox");
const ASSETS_GAMES = resolve(HERE, "../site/public/assets/games");
const TMP = resolve(HERE, "../_video-tmp");
const STATE_PATH = resolve(DATA, "video-state.json");
const MAX_PER_DAY = Number(process.env.VIDEO_MAX_PER_DAY || 3);
const PRIVACY = process.env.YT_PRIVACY || "unlisted";
const DRY_RUN = process.env.DRY_RUN === "1"; // render + simpan lokal, TANPA upload
const REVIEW = resolve(HERE, "../_video-review");

const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const fmtPlayers = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
const ck = (game, code) => `${game}:${code}`;
// Total kode yg diklaim di video = gabungan unik aktif + baru (kode baru kadang
// belum ke-merge ke daftar aktif → jangan sampai angka "+N lagi" meleset).
const countAll = (active, newCodes) => new Set([...active.map((c) => c.code), ...newCodes.map((c) => c.code)]).size;

function thumb(videoPath, outPath) {
  return new Promise((res) => { const ff = spawn(ffmpegBin(), ["-y", "-ss", "8", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outPath], { stdio: "ignore" }); ff.on("close", res); });
}

function buildCandidates() {
  const out = [];
  // ROBLOX
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {}, active: [] });
  const rbNewFile = readJSON(resolve(DATA, "new-roblox-codes.json"), { codes: [] });
  const rbNew = rbNewFile.codes;
  const rbNewByGame = {};
  for (const c of rbNew) (rbNewByGame[c.game] = rbNewByGame[c.game] || []).push(c);
  for (const [id, nc] of Object.entries(rbNewByGame)) {
    const g = rb.games[id]; if (!g) continue;
    const active = rb.active.filter((c) => c.game === id);
    out.push({
      platform: "ROBLOX", id, name: g.name, slug: g.slug ?? id, players: g.players ?? 0,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: (g.players ?? 0),
      newCodes: nc, activeCount: countAll(active, nc), fetchedAt: rbNewFile.generatedAt,
      displayCodes: pickDisplay(nc, active),
    });
  }
  // MOBILE
  const mc = readJSON(resolve(DATA, "codes.json"), { active: [] });
  const cat = readJSON(resolve(DATA, "games.json"), { games: [] });
  const catById = Object.fromEntries((cat.games ?? []).map((g) => [g.id, g]));
  const mNewFile = readJSON(resolve(DATA, "new-codes.json"), { codes: [] });
  const mNew = mNewFile.codes;
  const mNewByGame = {};
  for (const c of mNew) (mNewByGame[c.game] = mNewByGame[c.game] || []).push(c);
  for (const [id, nc] of Object.entries(mNewByGame)) {
    const meta = catById[id];
    const active = mc.active.filter((c) => c.game === id);
    out.push({
      platform: "MOBILE", id, name: meta?.name ?? nc[0]?.gameName ?? id, slug: meta?.slug ?? id, players: 0,
      iconPath: resolve(ASSETS_GAMES, `${id}.png`), rank: 1e9, // mobile prioritas (game besar, jarang)
      newCodes: nc, activeCount: countAll(active, nc), fetchedAt: mNewFile.generatedAt,
      displayCodes: pickDisplay(nc, active),
    });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

// Kartu tampil di video: kode BARU dulu (maks MAX_DISPLAY), pad dg kode aktif lain
// yg ada reward. Sisanya (bila game punya banyak kode) → teaser "+N lagi" di video.
const MAX_DISPLAY = 4; // Short harus tetap kebaca; jangan jejalin semua kode.
function pickDisplay(newCodes, active) {
  const seen = new Set();
  const disp = [];
  for (const c of newCodes) { if (disp.length >= MAX_DISPLAY) break; if (seen.has(c.code)) continue; seen.add(c.code); disp.push({ code: c.code, reward: c.reward || "", isNew: true }); }
  for (const c of active) { if (disp.length >= MAX_DISPLAY) break; if (seen.has(c.code) || !c.reward) continue; seen.add(c.code); disp.push({ code: c.code, reward: c.reward, isNew: false }); }
  return disp;
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const state = readJSON(STATE_PATH, { date: today, todayCount: 0, posted: {}, log: [] });
  if (state.date !== today) { state.date = today; state.todayCount = 0; }

  let candidates = buildCandidates();
  // buang yg SEMUA kode barunya sudah pernah dibikin video
  candidates = candidates.filter((c) => c.newCodes.some((nc) => !state.posted[ck(c.id, nc.code)]));
  const remaining = MAX_PER_DAY - state.todayCount;
  console.log(`kandidat: ${candidates.length} game punya kode baru | slot hari ini: ${remaining}/${MAX_PER_DAY}`);
  if (candidates.length === 0) { console.log("tak ada kode baru → tak ada video."); return; }
  if (remaining <= 0) { console.log("kuota harian habis."); return; }
  if (!ytConfigured() && !DRY_RUN) { console.log("YT belum di-set (YT_CLIENT_ID/SECRET/REFRESH_TOKEN) — lewati upload. Set dulu (lihat DEPLOY-YOUTUBE.md), atau DRY_RUN=1 utk preview lokal."); return; }

  const picks = candidates.slice(0, remaining);
  mkdirSync(TMP, { recursive: true });
  if (DRY_RUN) mkdirSync(REVIEW, { recursive: true });
  for (const c of picks) {
    try {
      console.log(`\n▶ ${c.name} (${c.platform}) — ${c.newCodes.length} kode baru`);
      const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
      const moreCount = Math.max(0, c.activeCount - c.displayCodes.length); // sisa kode di situs → teaser "+N lagi"
      await renderShort({ game: { name: c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, iconPath: c.iconPath, outPath: base });
      await makeVO({ name: c.name, activeCount: c.activeCount, outPath: vo });
      await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
      await thumb(fin, th);
      const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.displayCodes, activeCount: c.activeCount, now });
      if (DRY_RUN) {
        const dst = resolve(REVIEW, `${c.id}.mp4`); copyFileSync(fin, dst);
        console.log(`  ✓ [DRY] ${dst}\n    judul: ${meta.title}`);
        continue; // dry run: tak upload, tak update state
      }
      const { id, url } = await uploadVideo({ videoPath: fin, ...meta, privacy: PRIVACY, thumbnailPath: th });
      console.log(`  ✓ upload (${PRIVACY}): ${url} — "${meta.title}"`);
      for (const nc of c.newCodes) state.posted[ck(c.id, nc.code)] = true;
      state.todayCount += 1;
      state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, videoId: id, title: meta.title });
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); // simpan tiap upload → aman bila run dibatalkan
    } catch (e) {
      console.log(`  ✗ gagal ${c.name}: ${e.message}`);
    }
  }
  if (!DRY_RUN) {
    // prune state biar tak membengkak
    const keys = Object.keys(state.posted); if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete state.posted[k];
    state.log = state.log.slice(0, 300);
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  }
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(`\nselesai — ${state.todayCount}/${MAX_PER_DAY} video hari ini.`);
}

main().catch((e) => { console.error("make-videos error:", e.message); process.exit(0); });
