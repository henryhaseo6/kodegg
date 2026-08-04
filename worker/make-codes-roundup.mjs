// Orchestrator "New Roblox Codes Roundup" harian (video long landscape).
// Alur: tentukan tanggal H-1 (WIB) → ambil kode BARU hari itu (firstSeenAt, non-bulk)
// dari roblox-codes.json → group per game (dedup) → top N by jumlah pemain → resolve
// icon (lokal site/public/assets/roblox, fallback fetch by universeId) → render video
// + thumbnail (worker/video/render-roundup.mjs) → metadata → (opsional) upload YouTube.
//
// Roblox-ONLY, global/English. CTA update per-jam → Shorts. Reuse infra Top 50.
// ENV: YT_CLIENT_ID/SECRET/REFRESH_TOKEN (upload) · YT_PRIVACY
// ARG: --date=YYYY-MM-DD  --limit=N(15)  --no-upload  --sfx=0
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRoundup, renderRoundupThumb } from "./video/render-roundup.mjs";
import { localisasiID } from "./video/meta-long.mjs";
import { simpanPending, buangPending, ambilPending } from "./video/pending-thumbs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? "1"] : [a, "1"]; }));
// Default: SEMUA game yg dapet kode baru H-1, TAPI dipagari MAX_GAMES. Tanpa
// pagar, satu hari banjir bisa merender video 10 menit dan runner-nya keburu
// mati — kejadian 2 Agu 2026: 156 game/1.074 kode → 18.682 frame, job dibunuh di
// frame 9.300 setelah 47 menit, video hari itu tak pernah jadi. Yang kepotong
// SELALU dicatat di log (jangan diam-diam), dan urutannya by pemain jadi yang
// terbuang adalah game terkecil.
// Dikalibrasi dari run nyata: 30 game/58 kode = 3.752 frame, job 8 menit. Jadi
// ~125 frame per game → 60 game ≈ 7.500 frame (~16 menit), masih sehat; yang
// membunuh runner kemarin 18.682 frame (~90 menit). Angka 30 sempat memotong 12
// game yang sebenarnya muat (2 Agu: 42 game), jadi pagarnya dilonggarkan —
// tujuannya menahan banjir ratusan game, bukan merapikan hari yang cuma ramai.
const MAX_GAMES = Math.max(1, Number(process.env.ROUNDUP_MAX_GAMES || 60));
const LIMIT = Math.max(1, Number(ARG.limit) || MAX_GAMES);
const OUT_DIR = resolve(HERE, "../_video-out");
const THUMB_DIR = resolve(HERE, "data/pending-thumbs"); // bertahan antar-run (di-commit workflow)
const ASSETS = resolve(HERE, "../site/public/assets/roblox");
const CACHE = resolve(HERE, "video/assets/roundup-cache");
const SFX = ARG.sfx !== "0";

const wibYMD = (off = 0) => { const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const label = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
const DATE = ARG.date || wibYMD(-1);
const ts = (t) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const decode = (s) => (s || "").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const seedFromDate = (ymd) => { let h = 0; for (const ch of ymd) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

// ——— data: kode yg BENER-BENER BARU hari DATE (WIB), group per game ———
// JANGKAR anti-double: `firstSeenAt` (hari pertama KITA detect, DIHITUNG DI WIB)
// HARUS == DATE → tiap kode masuk TEPAT 1 hari, roundup harian TAK PERNAH overlap
// antar tgl. (WIB penting: kode jam 00–07 WIB = tgl sebelumnya di UTC — kalau
// slice UTC, ke-geser ke hari kemarin.) Di dalam hari itu, saring "beneran baru"
// (konsisten dg badge NEW situs & Shorts):
//   BIG = player ≥2000 DAN c.date ∈ [DATE-1, DATE+1]  → game gede rilis kode baru.
//         Pakai c.date (tgl RILIS) BUKAN bulk-flag: game baru ke-discover borongan
//         (Lineage Piece 50 kode) semua kodenya `bulk`, tp sebagian rilisnya emang
//         hari itu = baru asli. Window c.date nyaring backfill lama game yg sama.
//   EST = !bulk  → game established (udah dilacak) nambah kode non-bulk.
// Archive-dump kecil (One Fruit 126 kode umur lama, <2000p) gugur: c.date lawas
// (bukan BIG) + bulk (bukan EST). Sama threshold Shorts (≥2000p + c.date ≤48j).
function loadGames() {
  const db = JSON.parse(readFileSync(resolve(HERE, "data/roblox-codes.json"), "utf8"));
  const G = db.games || {}; // slug → { universeId, players, rawName, name }
  const MINP = 2000, DATEms = Date.parse(DATE + "T00:00:00+07:00"); // batas hari WIB
  const wibDay = (iso) => { const t = Date.parse(iso || ""); return t ? new Date(t + 7 * 36e5).toISOString().slice(0, 10) : ""; };
  const winDate = (c) => { const d = Date.parse(c.date || "") || 0; return d > 0 && d >= DATEms - 864e5 && d <= DATEms + 864e5; };
  // Kode tanpa tanggal rilis (praktis semua kode Roblox Den) — dinilai dari kapan
  // SUMBER memasang penanda "NEW CODE"-nya, bukan kapan kita menemukannya.
  const winNew = (c) => { const s = Number(c.srcNewAt) || 0; return c.srcNew === true && s > 0 && s >= DATEms - 864e5 && s <= DATEms + 864e5; };
  const byGame = {};
  for (const c of (db.active || [])) { // hanya kode AKTIF (redeemable) — bukan arsip expired
    if (!c.game || !c.code || c.check) continue; // c.check = badge "CEK DULU" → jangan masuk video
    if (wibDay(c.firstSeenAt) !== DATE) continue; // JANGKAR: hari pertama ke-detect (WIB) == DATE
    const big = (G[c.game]?.players || 0) >= MINP && winDate(c);
    // EST dulu cuma `!c.bulk`, dengan asumsi: kode non-bulk yang baru kita lihat
    // di game yang SUDAH dilacak = kode yang memang baru rilis. Asumsi itu runtuh
    // 2 Agu 2026 saat Roblox Den dipasang jadi primer KEDUA: ratusan kode lama
    // masuk ke game lama (jadi bukan `bulk`) dan semuanya keitung "baru".
    // Sekarang kode non-bulk masih harus membuktikan usianya — lewat tanggal
    // rilis, atau lewat penanda "NEW CODE" sumber yang dipasang di jendela yang
    // sama (srcNewAt; lihat fetch-roblox.mjs). Tanpa keduanya, umurnya tak
    // diketahui dan tak boleh masuk video berjudul "New Roblox Codes".
    // Diukur pada data nyata: 2 Agu 81 game/595 kode → 16/32; 1 Agu tak berubah
    // (15/19); 31 Jul 59→26 kode, dan 33 yang gugur SEMUANYA bertanggal lama
    // (28 Jun–15 Jul) — memang tak layak disebut kode 31 Juli.
    const est = !c.bulk && (winDate(c) || winNew(c));
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
  // Nama game utk tag: buang [UPD]/emoji/":" — SEO gak nyari "[UPD] X codes",
  // sekalian hemat budget. dayTag tanpa koma (koma bikin YT split 1 tag jadi 2).
  const cleanName = (s) => (s || "").split("|")[0].replace(/\[[^\]]*\]/g, " ").replace(/[\p{Extended_Pictographic}️]/gu, " ").replace(/:/g, " ").replace(/\s+/g, " ").trim();
  const dayTag = dateLbl.toLowerCase().replace(/,.*/, ""); // "july 28"
  const base = ["roblox codes", "new roblox codes", "roblox codes today", "roblox redeem codes", "roblox promo codes", "free roblox codes", `roblox codes ${dayTag}`, "kodegg"];
  const gameTags = [...new Set(games.map((g) => cleanName(g.rawName || g.name)).filter(Boolean))].map((nm) => `${nm} codes`);
  // Cap total 500 char YT (pakai 460 biar aman quote/koma) → tag TAK PERNAH ditolak/kosong.
  const tags = []; let tlen = 0;
  for (const t of [...base, ...gameTags]) { if (tlen + t.length + 2 > 460) break; tags.push(t); tlen += t.length + 2; }
  return { title, description, tags };
}

// Terjemahan ID judul+deskripsi (localizations.id). YouTube TAK menerjemahkan
// video berbahasa Inggris secara otomatis ("This video cannot be automatically
// translated"), jadi tanpa ini penonton Indonesia tak pernah melihat judul
// berbahasa Indonesia untuk video harian ini.
const locID = (m) => { const id = localisasiID(m); return id ? { id } : undefined; };

(async () => {
  console.log(`[roundup] tanggal=${DATE} limit=${LIMIT} sfx=${SFX}`);
  const { list, totalGames, totalCodes: totalCodesAll } = loadGames();
  if (!list.length) { console.log(`[roundup] tidak ada kode baru non-bulk di ${DATE} — skip.`); return; }
  const games = list.slice(0, LIMIT);
  const totalCodes = games.reduce((a, g) => a + g.codes.length, 0);
  console.log(`[roundup] ${totalGames} game punya kode baru (${totalCodesAll} kode). Tampil top ${games.length} by pemain: ${games.slice(0, 5).map((g) => g.name).join(", ")}…`);
  if (totalGames > games.length) {
    const sisa = list.slice(LIMIT);
    console.log(`[roundup] ! ${sisa.length} game TIDAK masuk video (pagar ${LIMIT}): ${sisa.map((g) => `${g.name}(${g.codes.length})`).join(", ")}`);
  }

  console.log("[roundup] resolve icon…"); await resolveIcons(games);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = ARG.out || resolve(OUT_DIR, `roundup-roblox-${DATE}.mp4`);

  // MODE THUMBNAIL SAJA — HARUS sebelum render video. Render video roundup makan
  // ~16 menit; memasang satu thumbnail tak boleh sampai membayar ongkos itu.
  //   --thumb-only=<videoId>  pasang ke video yg sudah tayang
  //   --thumb-out=<path>      cuma simpan berkasnya (dipakai menyiapkan antrean)
  if (ARG["thumb-only"] || ARG["thumb-out"]) {
    const tPath = ARG["thumb-out"] || outPath.replace(/\.mp4$/, ".png");
    await renderRoundupThumb({ games, dateLabel: label(DATE), totalCodes, gamesCount: games.length, outPath: tPath, seed: seedFromDate(DATE) });
    console.log("[roundup] thumbnail ✓ →", tPath);
    if (!ARG["thumb-only"]) return;
    const { ytConfigured: ok, setThumbnail } = await import("./video/upload.mjs");
    if (!ok()) { console.log("[roundup] YT belum di-set → tak bisa pasang."); return; }
    try {
      await setThumbnail(ARG["thumb-only"], tPath);
      console.log(`[roundup] thumbnail dipasang ke https://youtu.be/${ARG["thumb-only"]}`);
      buangPending(ARG["thumb-only"]);
    } catch (e) { console.log("[roundup] pasang thumbnail gagal:", e.message); process.exitCode = 1; }
    return;
  }

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
    const r = await uploadVideo({ videoPath: outPath, title: meta.title, description: meta.description, tags: meta.tags, privacy, thumbnailPath: existsSync(thumbPath) ? thumbPath : undefined, playlistTitle, playlistDescription, lang: "en", localizations: locID(meta) });
    console.log(`[roundup] uploaded ✓ ${r.url} (privacy=${privacy})`);
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
        simpanPending({ videoId: r.thumbPending, kind: "roundup", date: DATE, file: `${r.thumbPending}.png` });
      } catch { simpanPending({ videoId: r.thumbPending, kind: "roundup", date: DATE }); }
      console.log(`[roundup] ! thumbnail diantrikan — run berikutnya akan memasangnya`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🎁 New Roblox Codes Roundup — ${label(DATE)}\n- ${r.url} (privacy=${privacy})\n- ${totalCodes} kode / ${games.length} game (dari ${totalGames} game total)\n`, { flag: "a" });
  } catch (e) { console.log("[roundup] upload gagal:", e.message); }
})();
