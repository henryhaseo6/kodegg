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
import { gameSlug } from "./src/games.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const ASSETS_ROBLOX = resolve(HERE, "../site/public/assets/roblox");
const ASSETS_GAMES = resolve(HERE, "../site/public/assets/games");
const TMP = resolve(HERE, "../_video-tmp");
const STATE_PATH = resolve(DATA, "video-state.json");
// Batas UPLOAD otomatis/hari. Dinaikkan ke 30 (21 Jul 2026) untuk MENGUJI batas
// sebenarnya: Google memberi jatah "Video Uploads per day = 100" & 10.000 unit,
// sementara dokumentasi menyebut videos.insert = 1.600 unit (≈6 upload). Angka
// pemakaian nyata jauh lebih kecil dari itu, jadi dokumentasinya perlu dibuktikan.
// Turunkan lagi kalau ternyata mentok. Bisa dioverride lewat Variable repo.
const MAX_PER_DAY = Number(process.env.VIDEO_MAX_PER_DAY || 30);
const RENDER_MAX = Number(process.env.VIDEO_RENDER_MAX || 8); // batas RENDER/run (jaga durasi CI)
const BULK_MIN_PLAYERS = Number(process.env.VIDEO_BULK_MIN_PLAYERS || 10000); // game baru: min pemain utk dapat video "semua kode"
// Default PUBLIC: channel sudah live & ratusan video publik, fase "review dulu"
// lewat. Menyetel YT_PRIVACY sbg Variable terus kelupaan → video diam-diam
// unlisted (kejadian berhari-hari). Set YT_PRIVACY=unlisted hanya bila memang
// mau menahan (mis. saat menguji).
const PRIVACY = process.env.YT_PRIVACY || "public";
const DRY_RUN = process.env.DRY_RUN === "1"; // render + simpan lokal, TANPA upload
const REVIEW = resolve(HERE, "../_video-review");
const OUTDIR = resolve(HERE, "../_video-out"); // video utk upload manual (di-artifact-kan CI)

const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const fmtPlayers = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
const ck = (game, code) => `${game}:${code}`;
// Total kode yg diklaim di video = gabungan unik aktif + baru (kode baru kadang
// belum ke-merge ke daftar aktif → jangan sampai angka "+N lagi" meleset).
const countAll = (active, newCodes) => new Set([...active.map((c) => c.code), ...newCodes.map((c) => c.code)]).size;

// Thumbnail diambil detik 12.5: semua kartu kode sudah ke-reveal (kartu ke-4
// muncul ~8.7s) DAN baris teaser "+N kode lagi" sudah tampil (11.5s), sebelum
// transisi outro (14.4s). Detik 8 dulu cuma dapat 3 kartu.
function thumb(videoPath, outPath) {
  return new Promise((res) => { const ff = spawn(ffmpegBin(), ["-y", "-ss", "12.5", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outPath], { stdio: "ignore" }); ff.on("close", res); });
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
  // ROBLOX — game yang BARU masuk pantauan (impor pertama). Kodenya belum tentu
  // baru, jadi videonya bermode "semua kode aktif" (bukan "KODE BARU"). Hanya
  // game besar: game kecil tak sepadan dengan kuota upload & waktu render.
  for (const { game: id } of rbNewFile.bulkGames ?? []) {
    const g = rb.games[id]; if (!g) continue;
    if ((g.players ?? 0) < BULK_MIN_PLAYERS) continue;
    if (rbNewByGame[id]) continue; // sudah jadi kandidat lewat jalur kode baru
    const active = rb.active.filter((c) => c.game === id);
    if (active.length === 0) continue;
    out.push({
      platform: "ROBLOX", id, name: g.name, slug: g.slug ?? id, players: g.players ?? 0,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: (g.players ?? 0),
      newCodes: active, activeCount: active.length, fetchedAt: rbNewFile.generatedAt, allMode: true,
      displayCodes: pickDisplay([], active),
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
      // slug HARUS dari games.mjs (sumber kebenaran URL situs). games.json tak
      // punya field slug → dulu jatuh ke id mentah & link deskripsi jadi 404
      // (mis. /id/game/r1999/ padahal halamannya /id/game/reverse-1999/).
      platform: "MOBILE", id, name: meta?.name ?? nc[0]?.gameName ?? id, slug: gameSlug(id), players: 0,
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

/**
 * Kandidat ATAS PERMINTAAN: `node worker/make-videos.mjs --game=driving-empire`.
 * Untuk game yang tak lolos jalur otomatis (kodenya tak baru / impor pertamanya
 * sudah lewat) tapi layak dibuatkan video — mode "semua kode aktif", hasilnya ke
 * _video-out/ untuk diupload manual. Tak menyentuh video-state.json.
 */
function buildOnDemand(id) {
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {}, active: [] });
  const g = rb.games[id];
  if (g) {
    const active = rb.active.filter((c) => c.game === id);
    if (active.length === 0) return null;
    return {
      platform: "ROBLOX", id, name: g.name, slug: g.slug ?? id, players: g.players ?? 0,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: 0, newCodes: [], activeCount: active.length,
      fetchedAt: new Date().toISOString(), allMode: true, displayCodes: pickDisplay([], active),
    };
  }
  const mc = readJSON(resolve(DATA, "codes.json"), { active: [] });
  const active = mc.active.filter((c) => c.game === id);
  if (active.length === 0) return null;
  const cat = readJSON(resolve(DATA, "games.json"), { games: [] });
  const meta = (cat.games ?? []).find((x) => x.id === id);
  return {
    platform: "MOBILE", id, name: meta?.name ?? active[0]?.gameName ?? id, slug: gameSlug(id), players: 0,
    iconPath: resolve(ASSETS_GAMES, `${id}.png`), rank: 0, newCodes: [], activeCount: active.length,
    fetchedAt: new Date().toISOString(), allMode: true, displayCodes: pickDisplay([], active),
  };
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const state = readJSON(STATE_PATH, { date: today, todayCount: 0, posted: {}, log: [] });
  if (state.date !== today) { state.date = today; state.todayCount = 0; }

  const onDemandId = process.argv.find((a) => a.startsWith("--game="))?.slice(7);
  if (onDemandId) {
    const c = buildOnDemand(onDemandId);
    if (!c) { console.log(`game "${onDemandId}" tak ditemukan / tak punya kode aktif.`); return; }
    mkdirSync(TMP, { recursive: true }); mkdirSync(OUTDIR, { recursive: true });
    console.log(`▶ [atas permintaan] ${c.name} (${c.platform}) — ${c.activeCount} kode aktif`);
    const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
    const moreCount = Math.max(0, c.activeCount - c.displayCodes.length);
    await renderShort({ game: { name: c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, allMode: true, iconPath: c.iconPath, outPath: base });
    await makeVO({ name: c.name, activeCount: c.activeCount, allMode: true, outPath: vo });
    await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
    await thumb(fin, th);
    const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.displayCodes, activeCount: c.activeCount, allMode: true, now });
    const stem = `${today}-${c.id}`;
    copyFileSync(fin, resolve(OUTDIR, `${stem}.mp4`));
    copyFileSync(th, resolve(OUTDIR, `${stem}.jpg`));
    writeFileSync(resolve(OUTDIR, `${stem}.txt`), `JUDUL:\n${meta.title}\n\nDESKRIPSI:\n${meta.description}\n\nTAG:\n${(meta.tags ?? []).join(", ")}\n\nPLAYLIST:\n${meta.playlistTitle}\n`);
    try { rmSync(TMP, { recursive: true, force: true }); } catch {}
    console.log(`  ✓ _video-out/${stem}.mp4 (+ .jpg thumbnail, .txt metadata)\n    judul: ${meta.title}`);
    return;
  }

  let candidates = buildCandidates();
  // buang yg SEMUA kode barunya sudah pernah dibikin video
  candidates = candidates.filter((c) => c.newCodes.some((nc) => !state.posted[ck(c.id, nc.code)]));
  let remaining = MAX_PER_DAY - state.todayCount;
  console.log(`kandidat: ${candidates.length} game punya kode baru | slot upload hari ini: ${Math.max(0, remaining)}/${MAX_PER_DAY}`);
  if (candidates.length === 0) { console.log("tak ada kode baru → tak ada video."); return; }
  const canUpload = ytConfigured() && !DRY_RUN;
  if (!canUpload && !DRY_RUN) console.log("YT belum di-set (YT_CLIENT_ID/SECRET/REFRESH_TOKEN) — semua video dirender utk upload manual. Lihat DEPLOY-YOUTUBE.md.");

  // Render SEMUA kandidat (dibatasi RENDER_MAX biar CI tak kelamaan): yang muat
  // kuota harian diupload otomatis, sisanya disimpan di _video-out/ + file
  // metadata utk diupload manual. Tanpa ini, kode ke-4 dst hari itu tak pernah
  // dapat video sama sekali.
  const picks = candidates.slice(0, RENDER_MAX);
  if (candidates.length > RENDER_MAX) console.log(`(dibatasi ${RENDER_MAX} video/run — ${candidates.length - RENDER_MAX} game sisanya nunggu run berikutnya)`);
  mkdirSync(TMP, { recursive: true });
  if (DRY_RUN) mkdirSync(REVIEW, { recursive: true }); else mkdirSync(OUTDIR, { recursive: true });
  for (const c of picks) {
    try {
      console.log(`\n▶ ${c.name} (${c.platform}) — ${c.newCodes.length} kode baru`);
      const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
      const moreCount = Math.max(0, c.activeCount - c.displayCodes.length); // sisa kode di situs → teaser "+N lagi"
      await renderShort({ game: { name: c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, allMode: c.allMode, iconPath: c.iconPath, outPath: base });
      await makeVO({ name: c.name, activeCount: c.activeCount, allMode: c.allMode, outPath: vo });
      await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
      await thumb(fin, th);
      const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.displayCodes, activeCount: c.activeCount, allMode: c.allMode, now });
      if (DRY_RUN) {
        const dst = resolve(REVIEW, `${c.id}.mp4`); copyFileSync(fin, dst);
        console.log(`  ✓ [DRY] ${dst}\n    judul: ${meta.title}`);
        continue; // dry run: tak upload, tak update state
      }
      // Simpan utk upload manual: dipakai saat kuota habis, YT belum di-set,
      // ATAU upload gagal. Video yang sudah jadi jangan sampai hilang.
      const simpanManual = (alasan) => {
        const stem = `${today}-${c.id}`;
        copyFileSync(fin, resolve(OUTDIR, `${stem}.mp4`));
        copyFileSync(th, resolve(OUTDIR, `${stem}.jpg`));
        writeFileSync(resolve(OUTDIR, `${stem}.txt`), `JUDUL:\n${meta.title}\n\nDESKRIPSI:\n${meta.description}\n\nTAG:\n${(meta.tags ?? []).join(", ")}\n\nPLAYLIST:\n${meta.playlistTitle}\n`);
        console.log(`  ✓ manual (${alasan}): _video-out/${stem}.mp4 — "${meta.title}"`);
        state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, title: meta.title, mode: "manual", alasan, file: `${stem}.mp4` });
      };

      if (canUpload && remaining > 0) {
        try {
          const { id, url } = await uploadVideo({ videoPath: fin, ...meta, privacy: PRIVACY, thumbnailPath: th });
          console.log(`  ✓ upload (${PRIVACY}): ${url} — "${meta.title}"`);
          state.todayCount += 1; remaining -= 1;
          state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, videoId: id, title: meta.title, mode: "upload" });
        } catch (e) {
          // Paling sering: kuota API habis. Dulu video-nya hilang begitu saja —
          // sekarang jatuh ke jalur manual supaya tetap bisa diupload belakangan.
          console.log(`  ✗ upload gagal: ${e.message}`);
          if (/quota/i.test(e.message)) remaining = 0; // jangan hantam kuota berkali-kali
          simpanManual("upload gagal");
        }
      } else {
        simpanManual(canUpload ? "kuota harian" : "YT belum di-set");
      }
      // Tandai terpakai baik yg diupload maupun yg manual → tak dirender ulang
      // tiap jam. Yang manual tinggal ambil dari artifact run ini.
      for (const nc of c.newCodes) state.posted[ck(c.id, nc.code)] = true;
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); // simpan tiap video → aman bila run dibatalkan
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
  const manual = state.log.filter((l) => l.mode === "manual" && l.at?.slice(0, 10) === today).length;
  console.log(`\nselesai — ${state.todayCount}/${MAX_PER_DAY} upload otomatis hari ini${manual ? `, ${manual} video nunggu upload manual (_video-out/)` : ""}.`);
}

main().catch((e) => { console.error("make-videos error:", e.message); process.exit(0); });
