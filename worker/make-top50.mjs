// Orchestrator video "Top 50 Roblox harian".
// Alur: tentukan tanggal H-1 (WIB) → ambil data (R2 `/roblox-db`, fallback live
// charts) → hitung peak/avg/lowest + series 24 jam per game → top N → unduh
// icon+banner (thumbnails API, cache) → render (worker/video/render-top50.mjs)
// → simpan ke _video-out/ + (opsional) upload YouTube PRIVATE (draft).
//
// ENV: WORKER_URL, TRIGGER_KEY (baca R2) · YT_CLIENT_ID/SECRET/REFRESH_TOKEN (upload)
// ARG: --date=YYYY-MM-DD  --limit=N(50)  --source=r2|live  --no-upload  --sfx=0
//
// Data 26 Jul PARSIAL (mulai ~08:00) & belum di-compact sampai ganti hari →
// jalankan otomatis 00:30 WIB utk H-1 yang sudah lengkap. Test lokal: fallback live.
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchChartsGames } from "./src/roblox-charts.mjs";
import { renderTop50, renderThumb } from "./video/render-top50.mjs";
import { localisasiID } from "./video/meta-long.mjs";
import { simpanPending, buangPending } from "./video/pending-thumbs.mjs";
import { sudahDibuat, catatDibuat } from "./src/video-harian.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? "1"] : [a, "1"]; }));
const LIMIT = Math.max(1, Math.min(50, Number(ARG.limit) || 50));
const OUT_DIR = resolve(HERE, "../_video-out");
const THUMB_DIR = resolve(HERE, "data/pending-thumbs"); // bertahan antar-run (di-commit workflow)
const CACHE = resolve(HERE, "video/assets/top50-cache");
const SFX = ARG.sfx !== "0";

const wibYMD = (off = 0) => { const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const label = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
const DATE = ARG.date || wibYMD(-1);

// synth series realistik (evening-peak) buat fallback live / game tanpa series
function synthSeries(peak, seed) {
  let a = seed >>> 0; const rnd = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const n = 144, out = []; for (let i = 0; i < n; i++) { const t = i / (n - 1), shape = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos((t - 0.83) * 2 * Math.PI)); out.push(shape * (1 + (rnd() - 0.5) * 0.06)); }
  const mx = Math.max(...out); return out.map((v) => Math.round(v / mx * peak));
}

async function fromR2(date) {
  const base = process.env.WORKER_URL, key = process.env.TRIGGER_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/roblox-db?date=${date}&key=${encodeURIComponent(key)}`, { headers: { accept: "application/json" } });
    if (!res.ok) { console.log(`R2 /roblox-db ${res.status} — fallback live`); return null; }
    const j = await res.json();
    const series = j.series || {}, names = j.names || {};
    const rows = [];
    for (const [uid, arr] of Object.entries(series)) {
      const vals = arr.filter((v) => typeof v === "number");
      if (vals.length < 1) continue;
      rows.push({ uid, name: names[uid] || `Game ${uid}`, peak: Math.max(...vals), avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), low: Math.min(...vals), series: arr.map((v) => (typeof v === "number" ? v : null)).filter((v) => v != null) });
    }
    if (!rows.length) return null;
    rows.sort((a, b) => b.peak - a.peak);
    return rows;
  } catch (e) { console.log("R2 fetch error:", e.message, "— fallback live"); return null; }
}
async function fromLive() {
  const games = await fetchChartsGames();
  return games.map((g) => { const peak = g.playerCount, seed = String(g.universeId).split("").reduce((a, c) => a + c.charCodeAt(0), 0); const series = synthSeries(peak, seed); return { uid: String(g.universeId), name: g.name, peak, avg: Math.round(series.reduce((a, b) => a + b, 0) / series.length), low: Math.min(...series), series }; });
}

async function dl(url, path) { const r = await fetch(url); if (!r.ok) throw new Error("dl " + r.status); writeFileSync(path, Buffer.from(await r.arrayBuffer())); }
async function resolveAssets(games) {
  mkdirSync(CACHE, { recursive: true });
  const ids = games.map((g) => g.uid);
  // ICONS (batch 50)
  const iconUrl = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    try { const r = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${batch}&size=512x512&format=Png&returnPolicy=PlaceHolder`); const j = await r.json(); for (const d of j.data || []) if (d.imageUrl) iconUrl[d.targetId] = d.imageUrl; } catch {}
  }
  // BANNERS (screenshot, multiget)
  const banUrl = {};
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30).join(",");
    try { const r = await fetch(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${batch}&countPerUniverse=1&size=768x432&format=Png&returnPolicy=PlaceHolder`); const j = await r.json(); for (const d of j.data || []) { const u = d.thumbnails?.[0]?.imageUrl; if (u) banUrl[d.universeId] = u; } } catch {}
  }
  for (const g of games) {
    const ip = resolve(CACHE, `${g.uid}-icon.png`), bp = resolve(CACHE, `${g.uid}-banner.png`);
    if (!existsSync(ip) && iconUrl[g.uid]) { try { await dl(iconUrl[g.uid], ip); } catch {} }
    if (!existsSync(bp)) { const u = banUrl[g.uid] || iconUrl[g.uid]; if (u) { try { await dl(u, bp); } catch {} } }
  }
}

const tstamp = (t) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function metadata(games, dateLbl, chapters = []) {
  const n = games.length;
  const title = `Top ${n} Most Played Roblox Games — ${dateLbl} (Daily Player Count)`;
  // TIMELINE + RANKING (50→1) — timestamp di awal baris → YouTube bikin jadi
  // link klik-able (loncat ke game). Nama pakai emoji apa adanya.
  const timeline = (chapters || []).map((c) =>
    c.rank === 0 ? `${tstamp(c.t)} Intro`
      : `${tstamp(c.t)} #${c.rank} ${c.name}${c.peak ? ` — ${c.peak.toLocaleString("en-US")}` : ""}`
  ).join("\n");
  const head = `The ${n} most played Roblox games on ${dateLbl}, ranked by peak concurrent players (CCU).\nPeak, average & lowest player counts + 24-hour player graph for each game.`;
  const foot = `🎮 Free Roblox & game redeem codes, updated hourly → https://kodegg.com\n\nData: Roblox charts (logged every 10 minutes). #Roblox #RobloxGames`;
  let description = `${head}\n\n⏱️ RANKING & TIMELINE (tap to jump):\n${timeline}\n\n${foot}`;
  if (description.length > 4950) description = description.slice(0, 4947) + "…"; // batas deskripsi YT 5000
  const tags = ["roblox", "roblox games", "most played roblox games", "top roblox games", "roblox player count", "roblox ccu", "roblox top games", "roblox ranking", "kodegg"];
  return { title, description, tags };
}

// Terjemahan ID judul+deskripsi (localizations.id). YouTube TAK menerjemahkan
// video berbahasa Inggris secara otomatis ("This video cannot be automatically
// translated"), jadi tanpa ini penonton Indonesia tak pernah melihat judul
// berbahasa Indonesia untuk video harian ini.
const locID = (m) => { const id = localisasiID(m); return id ? { id } : undefined; };

(async () => {
  console.log(`[top50] tanggal=${DATE} limit=${LIMIT} source=${ARG.source || "auto"} sfx=${SFX}`);
  // SATU TANGGAL, SATU VIDEO. Diperiksa SEBELUM render karena rendernya ~15
  // menit — menolak setelah itu berarti membakar seluruh waktunya percuma.
  // Lihat src/video-harian.mjs untuk kejadian yang melahirkannya (7 Agu 2026:
  // cron telat 8,3 jam menyusul dispatch manual, roundup terunggah dua kali).
  if (ARG["thumb-only"] !== undefined) { /* jalur pasang-ulang thumbnail: bukan pembuatan video */ }
  else if (!ARG.force) {
    const ada = sudahDibuat("top50", DATE);
    if (ada) { console.log(`[top50] SUDAH ADA untuk ${DATE} → ${ada.url} (${ada.at.slice(0, 16)}). Pakai --force bila memang ingin dibuat ulang.`); return; }
  }
  let rows = null;
  if (ARG.source !== "live") rows = await fromR2(DATE);
  if (!rows) { console.log("[top50] pakai LIVE charts (data R2 belum ada / --source=live)"); rows = await fromLive(); }
  const games = rows.slice(0, LIMIT).map((g, i) => ({ ...g, rank: i + 1 }));
  console.log(`[top50] ${games.length} game. #1 = ${games[0]?.name} (${games[0]?.peak?.toLocaleString()})`);

  // Perubahan peringkat vs KEMARIN (H-2): panah ▲/▼/=/NEW. Kalau data kemarin
  // belum ada (hari pertama / mode live) → panah disembunyikan.
  // Panah HANYA aktif kalau hari pembanding (H-2) >= hari data-full pertama.
  // Data mulai 26 Juli (parsial jam 8 pagi) → 27 Juli = hari full pertama = BASE
  // (video pertama tanpa panah). Panah mulai video ke-2 (data 28 vs 27).
  const FIRST_FULL_DAY = process.env.TOP50_ARROWS_SINCE || "2026-07-27";
  const prevDate = (() => { const d = new Date(DATE + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const arrowsOn = ARG.source !== "live" && prevDate >= FIRST_FULL_DAY;
  const prevRows = arrowsOn ? await fromR2(prevDate) : null;
  const prevRank = prevRows ? Object.fromEntries(prevRows.map((g, i) => [g.uid, i + 1])) : null;
  for (const g of games) {
    if (!prevRank) { g.change = { dir: "hide" }; continue; }
    const pv = prevRank[g.uid];
    if (pv == null) g.change = { dir: "new" };
    else { const d = pv - g.rank; g.change = d > 0 ? { dir: "up", delta: d } : d < 0 ? { dir: "down", delta: -d } : { dir: "same" }; }
  }
  console.log(`[top50] rank-change vs ${prevDate}: ${prevRank ? "ON" : arrowsOn ? "OFF (data H-2 belum ada)" : `OFF (base: H-2 < ${FIRST_FULL_DAY})`}`);

  console.log("[top50] unduh icon+banner…");
  await resolveAssets(games);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = ARG.out || resolve(OUT_DIR, `top50-roblox-${DATE}.mp4`);
  console.log("[top50] render…");
  // MODE THUMBNAIL SAJA — HARUS sebelum render video (render top50 makan menit).
  //   --thumb-only=<videoId>  pasang ke video yg sudah tayang
  //   --thumb-out=<path>      cuma simpan berkasnya
  if (ARG["thumb-only"] || ARG["thumb-out"]) {
    const tPath = ARG["thumb-out"] || outPath.replace(/\.mp4$/, ".png");
    await renderThumb({ games, assetsDir: CACHE, dateLabel: label(DATE), outPath: tPath });
    console.log("[top50] thumbnail ✓ →", tPath);
    if (!ARG["thumb-only"]) return;
    const { ytConfigured: ok, setThumbnail } = await import("./video/upload.mjs");
    if (!ok()) { console.log("[top50] YT belum di-set → tak bisa pasang."); return; }
    try {
      await setThumbnail(ARG["thumb-only"], tPath);
      console.log(`[top50] thumbnail dipasang ke https://youtu.be/${ARG["thumb-only"]}`);
      buangPending(ARG["thumb-only"]);
    } catch (e) { console.log("[top50] pasang thumbnail gagal:", e.message); process.exitCode = 1; }
    return;
  }

  const { chapters } = await renderTop50({ games, assetsDir: CACHE, dateLabel: label(DATE), outPath, sfx: SFX });
  console.log("[top50] video ✓ →", outPath);

  const meta = metadata(games, label(DATE), chapters);
  writeFileSync(outPath.replace(/\.mp4$/, ".txt"), `${meta.title}\n\n${meta.description}\n\nTAGS: ${meta.tags.join(", ")}\n`);

  // thumbnail clickbait
  const thumbPath = outPath.replace(/\.mp4$/, ".png");
  try { await renderThumb({ games, assetsDir: CACHE, dateLabel: label(DATE), outPath: thumbPath }); console.log("[top50] thumbnail ✓ →", thumbPath); }
  catch (e) { console.log("[top50] thumbnail gagal:", e.message); }

  if (ARG["no-upload"] === "1") { console.log("[top50] --no-upload → tidak upload."); return; }
  const { ytConfigured, uploadVideo } = await import("./video/upload.mjs");
  if (!ytConfigured()) { console.log("[top50] YT belum di-set → skip upload (video tersimpan lokal)."); return; }
  const privacy = process.env.YT_PRIVACY || "private"; // draft
  const playlistTitle = "Roblox Top 50 — Daily Player Count Rankings";
  const playlistDescription = "Daily Top 50 most played Roblox games ranked by peak concurrent players (CCU). Peak, average & lowest player counts + a 24-hour player graph for each game. Updated every day.\n\n🎮 Free Roblox & game redeem codes, updated hourly → https://kodegg.com";
  console.log(`[top50] upload YouTube (privacy=${privacy})…`);
  try {
    const r = await uploadVideo({ videoPath: outPath, title: meta.title, description: meta.description, tags: meta.tags, privacy, thumbnailPath: existsSync(thumbPath) ? thumbPath : undefined, playlistTitle, playlistDescription, lang: "en", localizations: locID(meta) });
    console.log(`[top50] uploaded ✓ ${r.url} (privacy=${privacy})`);
    // Dicatat SESUDAH unggahan berhasil — bukan sebelum render, supaya render
    // yang gagal di tengah tak meninggalkan catatan palsu yang memblokir
    // percobaan berikutnya.
    try { catatDibuat("top50", DATE, { id: r.id, url: r.url }); } catch (e) { console.log(`[top50] catat gagal: ${e.message}`); }
    if (r.thumbPending) {
      // BERKASNYA ikut disimpan, bukan cuma tanggalnya. Alasannya soal WAKTU:
      // workflow ini hanya jalan sekali sehari ~21:45 UTC — persis saat kuota
      // sudah habis lagi oleh Shorts, jadi pengurasan di sini besar kemungkinan
      // gagal dengan sebab yang sama. Dengan berkasnya tersimpan, run per-jam
      // (make-videos) bisa memasangnya begitu kuota pulih 07:00 UTC, tanpa
      // render sama sekali. Jalur render-ulang dari tanggal tetap ada sebagai
      // cadangan bila berkasnya hilang.
      try {
        mkdirSync(THUMB_DIR, { recursive: true });
        copyFileSync(thumbPath, resolve(THUMB_DIR, `${r.thumbPending}.png`));
        simpanPending({ videoId: r.thumbPending, kind: "top50", date: DATE, file: `${r.thumbPending}.png` });
      } catch { simpanPending({ videoId: r.thumbPending, kind: "top50", date: DATE }); }
      console.log(`[top50] ! thumbnail diantrikan — run berikutnya akan memasangnya`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🎬 Top ${games.length} Roblox — ${label(DATE)}\n- ${r.url} (privacy=${privacy})\n- #1: ${games[0].name} (${games[0].peak.toLocaleString()} peak)\n`, { flag: "a" });
  } catch (e) { console.log("[top50] upload gagal:", e.message); }
})();
