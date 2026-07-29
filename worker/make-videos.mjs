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
import { uploadVideo, ytConfigured, attachToPlaylist, ytProjectCount } from "./video/upload.mjs";
import { gameSlug } from "./src/games.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const ASSETS_ROBLOX = resolve(HERE, "../site/public/assets/roblox");
const ASSETS_GAMES = resolve(HERE, "../site/public/assets/games");
const TMP = resolve(HERE, "../_video-tmp");
const STATE_PATH = resolve(DATA, "video-state.json");
const PENDING_PL = resolve(DATA, "pending-playlists.json"); // playlist gagal (rate-limit) → retry run berikutnya
const PENDING_VID = resolve(DATA, "pending-videos.json"); // kandidat yg tak muat RENDER_MAX → antri run berikutnya
// Batas UPLOAD otomatis/hari. Pemakaian nyata TERUKUR (23 Jul): ~188 unit/video
// (bukan 1.600 spt dokumentasi), jadi kuota 10.000/hari muat ~50 video. Diset 45
// → ~8.500 unit, sisa buffer aman; batas "Video Uploads per day" (100) tak kena.
// Kalau lonjakan kode makin ramai & mentok, sisanya jatuh ke jalur manual (aman).
// Bisa dioverride lewat Variable repo VIDEO_MAX_PER_DAY.
const MAX_PER_DAY = Number(process.env.VIDEO_MAX_PER_DAY || 50);
// Batas RENDER/run: sisanya antre ke run berikutnya. Dulu 8 utk hemat menit
// Actions (repo private); kini repo PUBLIC → menit unlimited, jadi dinaikkan ke
// 15 agar kode baru lebih cepat jadi video (catch-up lebih gesit). Total upload
// harian tetap dibatasi MAX_PER_DAY (kuota YouTube). Aman utk memori runner.
const RENDER_MAX = Number(process.env.VIDEO_RENDER_MAX || 15);
const BULK_MIN_PLAYERS = Number(process.env.VIDEO_BULK_MIN_PLAYERS || 10000); // game baru TANPA kode fresh: min pemain utk video "semua kode"
const FRESH_MIN_PLAYERS = Number(process.env.VIDEO_FRESH_MIN_PLAYERS || 2000); // game baru DENGAN kode fresh: ambang lebih rendah (kodenya layak)
// Default PUBLIC: channel sudah live & ratusan video publik, fase "review dulu"
// lewat. Menyetel YT_PRIVACY sbg Variable terus kelupaan → video diam-diam
// unlisted (kejadian berhari-hari). Set YT_PRIVACY=unlisted hanya bila memang
// mau menahan (mis. saat menguji).
const PRIVACY = process.env.YT_PRIVACY || "public";
const DRY_RUN = process.env.DRY_RUN === "1"; // render + simpan lokal, TANPA upload
const CHECK = process.argv.includes("--check"); // cek ADA kerja video? exit 0=ada, 1=tidak (tanpa deps berat)
const REVIEW = resolve(HERE, "../_video-review");
const OUTDIR = resolve(HERE, "../_video-out"); // video utk upload manual (di-artifact-kan CI)

const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const fmtPlayers = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
const ck = (game, code) => `${game}:${code}`;
// Total kode yg diklaim di video = gabungan unik aktif + baru (kode baru kadang
// belum ke-merge ke daftar aktif → jangan sampai angka "+N lagi" meleset).
const countAll = (active, newCodes) => new Set([...active.map((c) => c.code), ...newCodes.map((c) => c.code)]).size;
// Path ikon dari deskriptor kandidat (di-recompute saat rekonstruksi antrian).
const iconFor = (d) => (d.isPromo ? resolve(ASSETS_ROBLOX, "roblox-promo.png") : resolve(d.platform === "ROBLOX" ? ASSETS_ROBLOX : ASSETS_GAMES, `${d.id}.png`));

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
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: (g.players ?? 0),
      newCodes: nc, activeCount: countAll(active, nc), fetchedAt: rbNewFile.generatedAt,
      displayCodes: pickDisplay(nc, active),
    });
  }
  // ROBLOX — KODE FRESH (window-based, dicek TIAP run, bukan sekali saat impor).
  // Game mana pun dg kode ber-tanggal ≤48 jam & pemain ≥ FRESH_MIN → video "KODE
  // BARU". Tahan thd (a) fluktuasi jumlah pemain real-time (game di ambang 2K bisa
  // turun saat jam tidur → dulu one-shot bikin ketinggalan permanen), dan (b) drop
  // RENDER_MAX. Dedup: game yg sudah punya playlist (= sudah ada video) dilewati —
  // sinyal andal, mencakup upload manual yg tak tercatat di state.
  const FRESH_MS = 48 * 3600 * 1000;
  const nowMs = Date.parse(rbNewFile.generatedAt) || Date.now();
  const ytpl = readJSON(resolve(DATA, "yt-playlists.json"), {});
  for (const [id, g] of Object.entries(rb.games)) {
    if (rbNewByGame[id]) continue; // sudah lewat jalur kode-baru run ini
    // CATATAN: dulu juga skip `ytpl[id]` (game yg sudah punya playlist), TAPI itu bikin
    // kode baru yg upload-nya GAGAL (mis. token mati) tak pernah di-retry — kodenya
    // hilang dari new-roblox-codes.json (per-run) & game-nya punya playlist → mandek.
    // Sekarang game-punya-playlist TETAP disurvei; yg semua kodenya sudah divideokan
    // di-buang oleh filter posted (baris ~302), jadi tak ada video dobel.
    if ((g.players ?? 0) < FRESH_MIN_PLAYERS) continue;
    const active = rb.active.filter((c) => c.game === id);
    // "fresh" = baru RILIS dlm 48j (c.date = tgl rilis dari sumber). JANGAN pakai
    // firstSeenAt: game archive-dump (mis. project-baki-3 194 kode, one-fruit 126)
    // ke-discover sekaligus → firstSeenAt semua baru walau kodenya lama; kalau
    // pakai max(date,firstSeenAt) SEMUA keitung "fresh" → spam video 100+ kode.
    // c.date bedain kode genuine-baru (tgl rilis baru) vs archive (tgl rilis lama).
    const fresh = active.filter((c) => { const d = Date.parse(c.date ?? "") || 0; return d > 0 && nowMs - d <= FRESH_MS && !c.perm; });
    if (fresh.length === 0) continue;
    const freshCodes = fresh.map((c) => ({ code: c.code, reward: c.reward ?? "" }));
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: g.players ?? 0,
      newCodes: freshCodes, activeCount: countAll(active, freshCodes), fetchedAt: rbNewFile.generatedAt,
      displayCodes: pickDisplay(freshCodes, active),
    });
  }
  // ROBLOX — game BARU masuk pantauan TANPA kode fresh (semua backfill lama) →
  // video "SEMUA KODE" hanya bila besar (≥ BULK_MIN); isinya kode lama, kurang
  // layak diumbar utk game sepi. One-shot (bulkGames); drop-nya ditangkap antrian.
  for (const { game: id } of rbNewFile.bulkGames ?? []) {
    const g = rb.games[id]; if (!g) continue;
    if (rbNewByGame[id] || ytpl[id] || out.some((c) => c.id === id)) continue;
    if ((g.players ?? 0) < BULK_MIN_PLAYERS) continue;
    const active = rb.active.filter((c) => c.game === id);
    if (active.length === 0) continue;
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: g.players ?? 0,
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
  // MOBILE — KODE FRESH (fallback, dicek TIAP run) — sejajar jalur fresh Roblox.
  // Game mobile dg kode ber-firstSeen/date ≤48j & un-posted yg TAK ada di
  // new-codes.json (mis. kode barunya gagal upload → hilang dari file per-run).
  // Tanpa ini, game mobile ber-playlist yg kode barunya gagal tak pernah ke-retry
  // (mis. Sword x Staff). Yg sudah divideokan ke-filter posted (baris ~302).
  const nowMsM = Date.parse(mNewFile.generatedAt) || Date.now();
  for (const id of [...new Set(mc.active.map((c) => c.game))]) {
    if (mNewByGame[id] || out.some((c) => c.id === id)) continue;
    const active = mc.active.filter((c) => c.game === id);
    const fresh = active.filter((c) => { const d = Date.parse(c.date ?? "") || 0; return d > 0 && nowMsM - d <= FRESH_MS && !c.perm; });
    if (!fresh.length) continue;
    const meta = catById[id], freshCodes = fresh.map((c) => ({ code: c.code, reward: c.reward ?? "" }));
    out.push({
      platform: "MOBILE", id, name: meta?.name ?? active[0]?.gameName ?? id, slug: gameSlug(id), players: 0,
      iconPath: resolve(ASSETS_GAMES, `${id}.png`), rank: 1e9,
      newCodes: freshCodes, activeCount: countAll(active, freshCodes), fetchedAt: mNewFile.generatedAt,
      displayCodes: pickDisplay(freshCodes, active),
    });
  }
  // Dedup by universeId: buang kandidat ROBLOX yg universeId-nya SUDAH punya
  // video/playlist di id LAIN (kasus flip-flop nama → id baru, mis. dog-race vs
  // roblox-dog-race). Cegah Short & playlist DOBEL — 1 game = 1 seri video.
  const uniWithVideo = new Set();
  for (const plid of Object.keys(ytpl)) { const gg = rb.games[plid]; if (gg?.universeId) uniWithVideo.add(gg.universeId); }
  const deduped = out.filter((c) => {
    if (c.platform !== "ROBLOX") return true;
    const uni = rb.games[c.id]?.universeId;
    if (uni && !ytpl[c.id] && uniWithVideo.has(uni)) { console.log(`  ⏭ skip ${c.id}: universeId ${uni} sudah punya video di id lain (anti-dup)`); return false; }
    return true;
  });
  // Tempel SEMUA kode aktif tiap game ke kandidat (allCodes). Pas video jadi,
  // seluruh kode aktif game itu di-mark posted — bukan cuma subset new-codes-file.
  // Cegah jalur fresh-codes nge-surface ULANG game yg baru divideokan (dobel);
  // hanya kode yg benar2 baru (muncul setelahnya) yg memicu video berikutnya.
  const rbByGame = {}, mcByGame = {};
  for (const c of rb.active) (rbByGame[c.game] ??= []).push(c.code);
  for (const c of mc.active) (mcByGame[c.game] ??= []).push(c.code);
  for (const c of deduped) c.allCodes = (c.platform === "ROBLOX" ? rbByGame[c.id] : mcByGame[c.id]) ?? c.newCodes.map((n) => n.code);
  return deduped.sort((a, b) => b.rank - a.rank);
}

// Kartu tampil di video: kode BARU dulu (maks MAX_DISPLAY), pad dg kode aktif lain
// yg ada reward. Sisanya (bila game punya banyak kode) → teaser "+N lagi" di video.
const MAX_DISPLAY = 4; // Short harus tetap kebaca; jangan jejalin semua kode.
function pickDisplay(newCodes, active) {
  const seen = new Set();
  const disp = [];
  for (const c of newCodes) { if (disp.length >= MAX_DISPLAY) break; if (seen.has(c.code)) continue; seen.add(c.code); disp.push({ code: c.code, reward: c.reward || "", isNew: true }); }
  // Pad dg kode aktif BER-REWARD dulu (kartu lebih informatif).
  for (const c of active) { if (disp.length >= MAX_DISPLAY) break; if (seen.has(c.code) || !c.reward) continue; seen.add(c.code); disp.push({ code: c.code, reward: c.reward, isNew: false }); }
  // Masih ada slot & pilihan ber-reward habis → ikutkan kode TANPA reward
  // (render isi "Reward in-game"). Cegah video/deskripsi tanpa kode sama sekali
  // saat semua kode game tak punya reward (mis. +1 Speed Keyboard Escape).
  for (const c of active) { if (disp.length >= MAX_DISPLAY) break; if (seen.has(c.code)) continue; seen.add(c.code); disp.push({ code: c.code, reward: c.reward || "", isNew: false }); }
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
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0,
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

// Antrian playlist tertunda (gagal krn rate-limit YouTube). Ditulis ke file →
// bertahan antar-run → dikuras saat limit playlist sudah reset.
function enqueuePending(item) {
  const q = readJSON(PENDING_PL, []);
  if (!q.some((x) => x.videoId === item.videoId)) { q.push(item); writeFileSync(PENDING_PL, JSON.stringify(q, null, 2)); }
}
async function drainPending() {
  let q = readJSON(PENDING_PL, []);
  if (q.length === 0) return;
  console.log(`playlist tertunda: ${q.length} → coba pasang…`);
  const sisa = [];
  for (const item of q) {
    const ok = await attachToPlaylist(null, item.videoId, item.playlistTitle, item.playlistDescription);
    if (!ok) { sisa.push(item); break; } // kena rate-limit lagi → sisanya biar run berikutnya (jangan hantam)
  }
  // item setelah yg gagal juga dikembalikan ke antrian
  const idxGagal = q.indexOf(sisa[0]);
  const tertahan = idxGagal >= 0 ? q.slice(idxGagal) : [];
  writeFileSync(PENDING_PL, JSON.stringify(tertahan, null, 2));
  console.log(`  ${q.length - tertahan.length} terpasang, ${tertahan.length} masih tertunda.`);
}

// PROMO Roblox: kode platform (ditukar di roblox.com/promocodes), bukan per-game.
// Video dibuat bila (a) ada kode promo BARU run ini, atau (b) awal bulan baru
// (rekap bulanan) — sesuai permintaan user. `promoActive` disimpan utk penandaan.
function buildPromoCandidate(state, now) {
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { promo: {} });
  const promo = rb.promo ?? {};
  const active = promo.active ?? [];
  if (active.length === 0) return null;
  const baru = active.filter((c) => c.firstSeenAt === promo.updatedAt && !state.posted[`promo:${c.code}`]);
  // Bulan WIB (bukan UTC) → batas bulan sejalan dg stempel tanggal di video;
  // rekap Agustus muncul tepat 1 Agustus 00:00 WIB, bukan jam 07:00.
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(now);
  const bulanIni = p.slice(0, 7); // "2026-08"
  const perluRekap = state.promoMonth !== bulanIni;
  if (baru.length === 0 && !perluRekap) return null; // tak ada kode baru & rekap bulan ini sudah
  const allMode = baru.length === 0; // rekap = "semua kode aktif"; ada baru = "kode baru"
  return {
    platform: "ROBLOX", id: "roblox-promo", name: "Roblox Promo Codes", slug: "promo-codes",
    players: 0, isPromo: true, promoActive: active, rank: 5e8, // prioritas tinggi (di bawah mobile)
    iconPath: resolve(ASSETS_ROBLOX, "roblox-promo.png"),
    newCodes: baru, activeCount: active.length, fetchedAt: promo.updatedAt, allMode,
    displayCodes: pickDisplay(baru, active),
  };
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const state = readJSON(STATE_PATH, { date: today, todayCount: 0, posted: {}, log: [] });
  if (state.date !== today) { state.date = today; state.todayCount = 0; }

  // Mode --check: tentukan ADA kerja video/playlist tanpa render/upload/deps berat.
  // Dipakai CI utk melewati install deps video (canvas/ffmpeg/edge-tts) & render
  // pada run tanpa video (hemat menit Actions). Exit 0=ada kerja, 1=tidak.
  if (CHECK) {
    const cands = buildCandidates().filter((c) => c.newCodes.some((nc) => !state.posted[ck(c.id, nc.code)]));
    const promoC = buildPromoCandidate(state, now);
    const pv = readJSON(PENDING_VID, []).length, pp = readJSON(PENDING_PL, []).length;
    const kerja = cands.length + (promoC ? 1 : 0) + pv + pp;
    console.log(`cek video: ${kerja} unit (fresh ${cands.length}, promo ${promoC ? 1 : 0}, antri-vid ${pv}, antri-pl ${pp})`);
    process.exit(kerja > 0 ? 0 : 1);
  }

  // Kuras antrian playlist tertunda lebih dulu (limit playlist mungkin sudah reset).
  if (ytConfigured() && !DRY_RUN) await drainPending();

  const onDemandId = process.argv.find((a) => a.startsWith("--game="))?.slice(7);
  if (onDemandId) {
    const c = buildOnDemand(onDemandId);
    if (!c) { console.log(`game "${onDemandId}" tak ditemukan / tak punya kode aktif.`); return; }
    mkdirSync(TMP, { recursive: true }); mkdirSync(OUTDIR, { recursive: true });
    console.log(`▶ [atas permintaan] ${c.name} (${c.platform}) — ${c.activeCount} kode aktif`);
    const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
    const moreCount = Math.max(0, c.activeCount - c.displayCodes.length);
    await renderShort({ game: { name: c.displayName || c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, allMode: true, iconPath: c.iconPath, outPath: base });
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

  const fresh = buildCandidates();
  // Vertikal PROMO Roblox: video tiap bulan (rekap) ATAU saat ada kode promo baru.
  const promoC = buildPromoCandidate(state, now);
  if (promoC) fresh.unshift(promoC);
  // ANTRIAN VIDEO: kandidat yg run lalu tak muat RENDER_MAX. Sinyal "kode baru"
  // sekali-jalan (bulkGames & new-codes cuma ada di run impor) → yg ke-drop hilang
  // permanen kalau tak diantrikan. Diproses DULUAN biar tak keburu basi.
  const pending = readJSON(PENDING_VID, []).map((d) => ({ ...d, iconPath: iconFor(d) }));
  const seen = new Set();
  let candidates = [...pending, ...fresh].filter((c) => {
    if (seen.has(c.id)) return false; // dedup: antrian menang atas fresh (lebih lama)
    seen.add(c.id);
    return c.isPromo || c.newCodes.some((nc) => !state.posted[ck(c.id, nc.code)]); // buang yg semua kodenya sudah divideokan
  });
  // PRIORITAS slot upload (kuota API ~45/hari): game player TERBESAR duluan → game
  // gede (mis. RIVALS 241K) tak kebuang ke manual saat hari rame. Promo tetap depan.
  candidates.sort((a, b) => (b.isPromo ? 1 : 0) - (a.isPromo ? 1 : 0) || (b.rank ?? b.players ?? 0) - (a.rank ?? a.players ?? 0)); // rank: mobile=1e9 (prioritas), roblox=players
  let remaining = MAX_PER_DAY - state.todayCount;
  console.log(`kandidat: ${candidates.length} (antrian ${pending.length} + baru ${fresh.length}) | slot upload hari ini: ${Math.max(0, remaining)}/${MAX_PER_DAY}`);
  if (candidates.length === 0) { console.log("tak ada kode baru → tak ada video."); writeFileSync(PENDING_VID, "[]\n"); return; }
  const canUpload = ytConfigured() && !DRY_RUN;
  if (!canUpload && !DRY_RUN) console.log("YT belum di-set (YT_CLIENT_ID/SECRET/REFRESH_TOKEN) — semua video dirender utk upload manual. Lihat DEPLOY-YOUTUBE.md.");
  if (canUpload && ytProjectCount() > 1) console.log(`  ↻ multi-project YT aktif: ${ytProjectCount()} project (auto-rotasi saat kuota habis)`);

  // Render SEMUA kandidat (dibatasi RENDER_MAX biar CI tak kelamaan): yang muat
  // kuota harian diupload otomatis, sisanya disimpan di _video-out/ + file
  // metadata utk diupload manual. Tanpa ini, kode ke-4 dst hari itu tak pernah
  // dapat video sama sekali.
  const picks = candidates.slice(0, RENDER_MAX);
  // Sisa yg tak muat → SIMPAN sbg antrian run berikutnya (bukan di-drop). Promo &
  // on-demand tak diantrikan (punya cadence sendiri). Cap 40 biar tak membengkak.
  const overflow = candidates.slice(RENDER_MAX).filter((c) => !c.isPromo).slice(0, 40);
  writeFileSync(PENDING_VID, JSON.stringify(overflow.map(({ iconPath, ...d }) => d), null, 2) + "\n"); // iconPath di-recompute saat rekonstruksi
  if (overflow.length) console.log(`(dibatasi ${RENDER_MAX}/run — ${overflow.length} game diantrikan utk run berikutnya)`);
  mkdirSync(TMP, { recursive: true });
  if (DRY_RUN) mkdirSync(REVIEW, { recursive: true }); else mkdirSync(OUTDIR, { recursive: true });
  const requeue = []; // kuota upload habis → antri retry run berikut (JANGAN mark posted)
  for (const c of picks) {
    if (canUpload && remaining <= 0) { requeue.push(c); continue; } // kuota habis → jgn render, antri retry
    let quotaManual = false;
    try {
      console.log(`\n▶ ${c.name} (${c.platform}) — ${c.newCodes.length} kode baru`);
      const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
      const moreCount = Math.max(0, c.activeCount - c.displayCodes.length); // sisa kode di situs → teaser "+N lagi"
      await renderShort({ game: { name: c.displayName || c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, allMode: c.allMode, iconPath: c.iconPath, outPath: base });
      await makeVO({ name: c.name, activeCount: c.activeCount, allMode: c.allMode, isPromo: c.isPromo, outPath: vo });
      await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
      await thumb(fin, th);
      const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.displayCodes, activeCount: c.activeCount, allMode: c.allMode, isPromo: c.isPromo, now });
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
          const { id, url, playlistPending } = await uploadVideo({ videoPath: fin, ...meta, privacy: PRIVACY, thumbnailPath: th });
          console.log(`  ✓ upload (${PRIVACY}): ${url} — "${meta.title}"`);
          state.todayCount += 1; remaining -= 1;
          state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, videoId: id, title: meta.title, mode: "upload" });
          if (playlistPending) enqueuePending(playlistPending); // rate-limit playlist → coba lagi run berikutnya
        } catch (e) {
          // Error upload HAMPIR SELALU account-wide (kuota / token `invalid_grant` /
          // rate limit) → STOP upload run ini + ANTRI RETRY (JANGAN mark posted) biar
          // auto-upload begitu beres (mis. token di-refresh). Queue di-cap 40, aman.
          console.log(`  ✗ upload gagal: ${e.message}`);
          remaining = 0; requeue.push(c); quotaManual = true;
          simpanManual("upload gagal");
        }
      } else {
        simpanManual("YT belum di-set");
      }
      // Mark posted KECUALI ke-antri retry gara2 kuota (biar diulang run berikut).
      if (!quotaManual) for (const code of c.allCodes ?? c.newCodes.map((n) => n.code)) state.posted[ck(c.id, code)] = true;
      if (!quotaManual && c.isPromo) {
        // Rekap bulan ini beres + semua kode promo saat ini ditandai (jangan
        // ulang bulan ini kecuali muncul kode promo yg benar-benar baru).
        state.promoMonth = now.toISOString().slice(0, 7);
        for (const pc of c.promoActive ?? []) state.posted[`promo:${pc.code}`] = true;
      }
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); // simpan tiap video → aman bila run dibatalkan
    } catch (e) {
      console.log(`  ✗ gagal ${c.name}: ${e.message}`);
    }
  }
  // Antrian retry (kuota habis) + overflow render → PENDING_VID (dedup by id), diproses run berikut.
  if (!DRY_RUN) {
    const seenP = new Set(), merged = [...requeue, ...overflow].filter((c) => !seenP.has(c.id) && seenP.add(c.id));
    writeFileSync(PENDING_VID, JSON.stringify(merged.map(({ iconPath, ...d }) => d), null, 2) + "\n");
    if (requeue.length) console.log(`(${requeue.length} game diantrikan retry — kuota upload habis run ini)`);
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
