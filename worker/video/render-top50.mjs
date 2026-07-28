// Renderer video "Top N Roblox" (landscape 1920x1080, 30fps) — data-driven.
// Port dari sample yang disetujui: intro hook+subtitle stamp, rank DROP SLAM
// (font Anton, pengganti Impact di CI Linux), kartu (judul tengah, PEAK/AVG/
// LOWEST, grafik 24 jam), transisi wipe, outro. Canvas → pipe RGBA ke ffmpeg.
// SFX disintesis dari timeline (opsional). Musik dimux terpisah nanti.
//
// renderTop50({ games, assetsDir, dateLabel, outPath, sfx=true, title }) → outPath
//   games: [{ rank, uid, name, peak, avg, low, series:[..], codes }] urut rank naik
//   assetsDir: folder berisi <uid>-icon.png dan <uid>-banner.png
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { synthMusic } from "./music.mjs";
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, "../../site/scripts/ogfonts");
const ROBLOX_PATH = readFileSync(resolve(HERE, "assets/brand/roblox-logo-path.txt"), "utf8").trim();

export function ffmpegBin() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { return require("@ffmpeg-installer/ffmpeg").path; } catch { return "ffmpeg"; }
}
let _cv;
async function canvasLib() {
  if (!_cv) {
    _cv = await import("@napi-rs/canvas");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-700.ttf"), "Grotesk");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-400.ttf"), "GroteskR");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceMono-Bold.ttf"), "Mono");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Anton-Regular.ttf"), "Rank"); // angka rank 3D
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Twemoji.Mozilla.ttf"), "Emoji"); // emoji Twemoji (gaya Roblox web)
  }
  return _cv;
}

const W = 1920, H = 1080, FPS = 30;
const C = { bg: "#090C12", lime: "#CBFF46", limeSoft: "#e7ffb0", purple: "#8B6BFF", purpleSoft: "#c3b2ff", low: "#5EC8FF", lowSoft: "#bfe6ff", txt: "#ffffff", muted: "#9aa4b8", gold: "#FFD23F", goldSoft: "#ffe9a3", ok: "#37E38B", danger: "#FF5C77" };
const nfmt = (n) => Math.round(n).toLocaleString("en-US");
const kfmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
// Nama LENGKAP: pertahankan [tag] + EMOJI (di-render via font "Emoji"); buang
// "| subjudul" & rapikan spasi. (Dulu emoji di-strip → "[]" kosong.)
const clean = (s) => (s || "").split("|")[0].replace(/\[\s+/g, "[").replace(/\s+\]/g, "]").replace(/\s+/g, " ").trim();
const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (s) => [...seg.segment(s)].map((x) => x.segment); // split aman utk emoji (surrogate/ZWJ/VS)
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const outBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const win = (ts, s, e) => outCubic(clamp((ts - s) / (e - s)));
const bump = (x) => (x > 0 && x < 0.45 ? Math.sin((x / 0.45) * Math.PI) : 0);
const eio = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const mixLime = (t) => `rgb(${Math.round(255 - 52 * t)},255,${Math.round(255 - 185 * t)})`;

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fitFont(ctx, text, maxW, base, min) { let f = base; while (f > min) { ctx.font = `700 ${f}px Grotesk`; if (ctx.measureText(text).width <= maxW) break; f -= 4; } return f; }
function popText(ctx, text, x, y, fill, sw = 9) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 7;
  ctx.lineWidth = sw; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(9,12,18,0.92)"; ctx.strokeText(text, x, y);
  ctx.shadowColor = "transparent"; ctx.fillStyle = fill; ctx.fillText(text, x, y); ctx.restore();
}
function num3d(ctx, text, size) {
  ctx.save(); ctx.font = `${size}px Rank`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const depth = Math.round(size * 0.05); ctx.translate(-depth * 0.42, 0);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 16; ctx.fillStyle = "#000"; ctx.fillText(text, 0, 0); ctx.restore();
  for (let i = depth; i >= 1; i--) { ctx.fillStyle = "#141821"; ctx.fillText(text, i * 0.85, i * 0.85); }
  ctx.lineWidth = Math.max(8, size * 0.05); ctx.strokeStyle = "#05070b"; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "#fff"; ctx.fillText(text, 0, 0);
  ctx.globalAlpha = 0.16; ctx.fillStyle = "#fff"; ctx.fillText(text, -2, -3); ctx.restore();
}
function shockwave(ctx, cx, cy, age) { if (age < 0 || age > 0.6) return; const r = age * 600 + 24, al = clamp(1 - age / 0.5) * 0.34; ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = "#fff"; ctx.lineWidth = 6 * (1 - age / 0.6); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.restore(); }
function floorShadow(ctx, cx, y, w, a) { ctx.save(); ctx.globalAlpha = a * 0.42; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(cx, y, w, w * 0.16, 0, 0, 7); ctx.fill(); ctx.restore(); }
// Chip perubahan peringkat vs kemarin: ▲+N (hijau) / ▼N (merah) / = (abu) / NEW (lime).
function changeTag(ctx, cx, y, change, appear) {
  if (!change || change.dir === "hide" || appear <= 0.01) return;
  let col, txt, tri = null;
  if (change.dir === "up") { col = C.ok; txt = "+" + change.delta; tri = "up"; }
  else if (change.dir === "down") { col = C.danger; txt = String(change.delta); tri = "down"; }
  else if (change.dir === "new") { col = C.lime; txt = "NEW"; }
  else { col = C.txt; txt = "-"; } // tetap: strip putih
  ctx.save(); ctx.globalAlpha = clamp(appear); const pop = 0.7 + 0.3 * outBack(clamp(appear));
  ctx.translate(cx, y); ctx.scale(pop, pop);
  ctx.font = "700 44px Grotesk"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const tw = ctx.measureText(txt).width, triW = tri ? 34 : 0, gap = tri ? 12 : 0, inner = triW + gap + tw, padX = 24, chipW = inner + padX * 2, chipH = 64;
  rr(ctx, -chipW / 2, -chipH / 2, chipW, chipH, chipH / 2); ctx.fillStyle = "rgba(9,12,18,0.75)"; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
  let tx = -inner / 2;
  if (tri) { const s = 30; ctx.beginPath(); if (tri === "up") { ctx.moveTo(tx, s * 0.34); ctx.lineTo(tx + s, s * 0.34); ctx.lineTo(tx + s / 2, -s * 0.42); } else { ctx.moveTo(tx, -s * 0.34); ctx.lineTo(tx + s, -s * 0.34); ctx.lineTo(tx + s / 2, s * 0.42); } ctx.closePath(); ctx.fillStyle = col; ctx.fill(); tx += triW + gap; }
  ctx.fillStyle = col; ctx.fillText(txt, tx, 2); ctx.restore();
}
let ROBLOX_P2D;
function robloxMark(ctx, Path2D, cx, cy, s, appear) {
  if (!ROBLOX_P2D) ROBLOX_P2D = new Path2D(ROBLOX_PATH);
  ctx.save(); ctx.globalAlpha = clamp(appear); const pop = 0.72 + 0.28 * outBack(clamp(appear));
  ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8; ctx.fillStyle = "#fff";
  const sc = s / 24; ctx.scale(sc, sc); ctx.translate(-12, -12); ctx.fill(ROBLOX_P2D); ctx.restore();
}
function bell(ctx, x, y, s, col, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.32);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.12, -s * 0.3, -s * 0.34); ctx.quadraticCurveTo(-s * 0.28, -s * 0.52, 0, -s * 0.56);
  ctx.quadraticCurveTo(s * 0.28, -s * 0.52, s * 0.3, -s * 0.34); ctx.quadraticCurveTo(s * 0.5, -s * 0.12, s * 0.5, s * 0.32); ctx.closePath(); ctx.fill();
  rr(ctx, -s * 0.6, s * 0.32, s * 1.2, s * 0.13, s * 0.06); ctx.fill(); ctx.beginPath(); ctx.arc(0, s * 0.58, s * 0.13, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -s * 0.62, s * 0.1, 0, 7); ctx.fill(); ctx.restore();
}
function subscribeCTA(ctx, cx, cy, appear, wiggle) {
  ctx.save(); ctx.globalAlpha = appear; const sc = 0.85 + 0.15 * appear; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  ctx.font = "700 46px Grotesk"; const label = "SUBSCRIBE", tw = ctx.measureText(label).width, pillW = tw + 90, pillH = 92, bellS = 76, gap = 46, total = pillW + gap + bellS, sx = cx - total / 2;
  rr(ctx, sx, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.fillStyle = "#FF3B44"; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, sx + pillW / 2, cy + 3);
  bell(ctx, sx + pillW + gap + bellS / 2, cy, bellS, C.lime, wiggle); ctx.textBaseline = "alphabetic"; ctx.restore();
}
function kodeggLogo(ctx, cx, cy, scale, appear) { // gaya Short/situs/roundup: badge GG (kiri) + "KODEGG"
  ctx.save(); ctx.globalAlpha = appear; ctx.translate(cx, cy); ctx.scale(scale, scale);
  const B = 104, fs = 58, gap = 22; ctx.font = `800 ${fs}px Grotesk`;
  const kw = ctx.measureText("KODE").width, gw = ctx.measureText("GG").width, tot = B + gap + kw + gw; let x = -tot / 2;
  rr(ctx, x, -B / 2, B, B, B * 0.26); ctx.fillStyle = "#0E121B"; ctx.fill();
  ctx.lineWidth = B * 0.06; ctx.strokeStyle = C.lime; ctx.shadowColor = "rgba(203,255,70,0.5)"; ctx.shadowBlur = 26; ctx.stroke(); ctx.shadowColor = "transparent";
  ctx.fillStyle = C.lime; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GG", x + B / 2, 2);
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.fillText("KODE", x + B + gap, 2); ctx.fillStyle = C.lime; ctx.fillText("GG", x + B + gap + kw, 2);
  ctx.textBaseline = "alphabetic"; ctx.restore();
}

const ICON_SZ = 430, ICON_X = 745, ICON_Y = 300, ICON_CX = ICON_X + ICON_SZ / 2, ICON_CY = ICON_Y + ICON_SZ / 2;
const RANK_CX = 372, RANK_CY = ICON_CY, SX = 1575, GX = 110, GY = 880, GW = 1700, GH = 152;
const rankSize = (rank) => (rank <= 1 ? 460 : rank <= 10 ? 360 : 320);

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function genScatter(icons, seed, n = 18) {
  const r = mulberry32(seed >>> 0), arr = [];
  for (let i = 0; i < n; i++) { const ang = r() * 6.28, spd = 16 + r() * 48; arr.push({ img: icons[Math.floor(r() * icons.length)], x0: r() * (W + 600) - 300, y0: r() * (H + 400) - 200, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, sz: 90 + Math.floor(r() * 190), a: 0.07 + r() * 0.10, ph: r() * 6.28, sp: (r() - 0.5) * 0.6 }); }
  return arr;
}
function drawScatter(ctx, list, ts) {
  for (const s of list) {
    if (!s.img) continue;
    const x = ((s.x0 + s.vx * ts) % (W + 600) + (W + 600)) % (W + 600) - 300 + Math.sin(ts * 0.6 + s.ph) * 22;
    const y = ((s.y0 + s.vy * ts) % (H + 400) + (H + 400)) % (H + 400) - 200 + Math.cos(ts * 0.5 + s.ph) * 18;
    ctx.save(); ctx.globalAlpha = s.a; ctx.translate(x + s.sz / 2, y + s.sz / 2); ctx.rotate(Math.sin(ts * 0.35 + s.ph) * s.sp);
    rr(ctx, -s.sz / 2, -s.sz / 2, s.sz, s.sz, s.sz * 0.22); ctx.clip(); ctx.drawImage(s.img, -s.sz / 2, -s.sz / 2, s.sz, s.sz); ctx.restore();
  }
}
function bg(ctx, banner, zoom, ts, scatter) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  if (banner) { try { ctx.save(); ctx.filter = "blur(6px)"; const s = Math.max(W / banner.width, H / banner.height) * zoom, bw = banner.width * s, bh = banner.height * s; ctx.drawImage(banner, (W - bw) / 2, (H - bh) / 2, bw, bh); ctx.restore(); } catch {} }
  ctx.fillStyle = "rgba(9,12,18,0.34)"; ctx.fillRect(0, 0, W, H);
  drawScatter(ctx, scatter, ts);
  let g = ctx.createLinearGradient(0, 0, 620, 0); g.addColorStop(0, "rgba(9,12,18,0.9)"); g.addColorStop(1, "rgba(9,12,18,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 620, H);
  g = ctx.createLinearGradient(W, 0, 1230, 0); g.addColorStop(0, "rgba(9,12,18,0.82)"); g.addColorStop(1, "rgba(9,12,18,0)"); ctx.fillStyle = g; ctx.fillRect(1230, 0, W - 1230, H);
  g = ctx.createLinearGradient(0, 0, 0, 250); g.addColorStop(0, "rgba(9,12,18,0.86)"); g.addColorStop(1, "rgba(9,12,18,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 250);
  g = ctx.createLinearGradient(0, H - 300, 0, H); g.addColorStop(0, "rgba(9,12,18,0)"); g.addColorStop(1, "rgba(9,12,18,0.78)"); ctx.fillStyle = g; ctx.fillRect(0, H - 300, W, 300);
}

export async function renderTop50({ games, assetsDir, dateLabel, outPath, sfx = true, music = true, musicGain = 0.5, title }) {
  const cv = await canvasLib();
  const { createCanvas, loadImage, Path2D } = cv;
  const TITLE = title || `TOP ${games.length} ROBLOX GAMES`;
  const SUBT = `TOP ${games.length} MOST PLAYED ROBLOX GAMES`;
  const DATE = dateLabel;

  // muat aset
  const tryLoad = async (p) => (existsSync(p) ? await loadImage(p).catch(() => null) : null);
  for (const g of games) {
    g.name = clean(g.name);
    g.graphemes = graphemes(g.name);
    g.icon = await tryLoad(resolve(assetsDir, `${g.uid}-icon.png`));
    g.banner = (await tryLoad(resolve(assetsDir, `${g.uid}-banner.png`))) || g.icon;
    g.series = Array.isArray(g.series) && g.series.length > 1 ? g.series : [g.avg || g.peak, g.peak];
    g.low = g.low ?? Math.min(...g.series);
  }
  const ICONS = games.map((g) => g.icon).filter(Boolean);
  games.forEach((g) => { g.scatter = genScatter(ICONS, (g.rank * 7919 + 13) >>> 0); });

  function chrome(ctx) {
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "700 28px Mono"; ctx.fillStyle = C.muted; ctx.fillText(TITLE, 90, 70);
    const w = ctx.measureText(TITLE).width; ctx.fillStyle = C.lime; ctx.fillText("  ·  " + DATE, 90 + w, 70);
    ctx.textAlign = "right"; ctx.font = "700 28px Grotesk"; const full = "GG · kodegg.com";
    ctx.fillStyle = "#fff"; ctx.fillText("KODE", W - 90 - ctx.measureText(full).width, 70); ctx.fillStyle = C.lime; ctx.fillText(full, W - 90, 70);
  }
  function statBlock(ctx, cx, yLabel, yNum, label, labelCol, value, numCol, numPx, appear, emph = 1) {
    ctx.textAlign = "center"; ctx.save(); ctx.globalAlpha = appear;
    ctx.font = "700 44px GroteskR"; popText(ctx, label, cx, yLabel, labelCol, 5);
    ctx.save(); ctx.translate(cx, yNum); ctx.scale(emph, emph); ctx.font = `700 ${numPx}px Mono`; popText(ctx, nfmt(value), 0, 0, numCol, 9); ctx.restore(); ctx.restore();
  }
  function drawGraph(ctx, s, prog, acc, appear) {
    if (appear <= 0.01) return; ctx.save(); ctx.globalAlpha = appear;
    rr(ctx, GX, GY, GW, GH, 18); ctx.fillStyle = "rgba(9,12,18,0.5)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 2; ctx.stroke();
    const pad = 20, topPad = 40, gx = GX + pad, gy = GY + topPad, gw = GW - pad * 2, gh = GH - topPad - 30;
    const n = s.length, mn = Math.min(...s), mx = Math.max(...s), rng = mx - mn || 1;
    const px = (i) => gx + (i / (n - 1)) * gw, py = (v) => gy + gh - ((v - mn) / rng) * gh;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "700 24px Grotesk"; ctx.fillStyle = C.muted; ctx.fillText("PLAYERS  ·  LAST 24 HOURS", gx, GY + 28);
    ctx.font = "700 18px Mono"; ctx.fillStyle = "rgba(154,164,184,0.55)"; ctx.textAlign = "center";
    ["00:00", "06:00", "12:00", "18:00", "24:00"].forEach((t, k) => ctx.fillText(t, gx + (k / 4) * gw, GY + GH - 8));
    const upto = Math.max(1, Math.floor(prog * (n - 1)));
    ctx.beginPath(); ctx.moveTo(px(0), gy + gh); for (let i = 0; i <= upto; i++) ctx.lineTo(px(i), py(s[i])); ctx.lineTo(px(upto), gy + gh); ctx.closePath();
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh); grad.addColorStop(0, hexA(acc, 0.34)); grad.addColorStop(1, hexA(acc, 0.02)); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= upto; i++) { const X = px(i), Y = py(s[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.strokeStyle = acc; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.stroke();
    const hx = px(upto), hy = py(s[upto]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, gy); ctx.lineTo(hx, gy + gh); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
  function drawRank(ctx, rank, sz, ts) {
    const dur = 0.4, p = clamp(ts / dur), landed = ts >= dur, age = ts - dur, yy = -120 + (RANK_CY + 120) * (p * p);
    let sx = 1, sy = 1; if (landed) { const o = 0.2 * Math.exp(-age * 8) * Math.cos(age * 26); sx = 1 + o; sy = 1 - o; }
    const impact = landed ? Math.exp(-age * 9) * 18 * Math.sin(age * 62) : 0;
    const idleX = landed ? Math.sin(ts * 5.5) * 3 : 0, idleY = landed ? Math.sin(ts * 4.6) * 2.5 : 0, idleRot = landed ? Math.sin(ts * 3.2) * 0.014 : 0, idleSc = landed ? 1 + 0.012 * Math.sin(ts * 4.2) : 1;
    floorShadow(ctx, RANK_CX, RANK_CY + sz * 0.52, sz * 0.32 * (landed ? 1 + 0.3 * Math.exp(-age * 8) : Math.max(0.2, p)), landed ? 1 : p);
    if (landed) shockwave(ctx, RANK_CX, RANK_CY + sz * 0.42, age);
    ctx.save(); ctx.globalAlpha = clamp(p * 3); ctx.translate(RANK_CX + impact + idleX, landed ? RANK_CY + idleY : yy); ctx.rotate(idleRot); ctx.scale(sx * idleSc, sy * idleSc); num3d(ctx, String(rank), sz); ctx.restore();
  }
  function gameFrame(ctx, g, ts, D) {
    const rank = g.rank, gold = rank === 1, ACC = gold ? C.gold : C.lime, ACCsoft = gold ? C.goldSoft : C.limeSoft;
    bg(ctx, g.banner, 1.1 + 0.05 * (ts / D), ts, g.scatter); chrome(ctx);
    const fs = fitFont(ctx, g.name, W - 300, 78, 46); const TF = `700 ${fs}px Grotesk, Emoji`; ctx.font = TF;
    const fullW = ctx.measureText(g.name).width, left = W / 2 - fullW / 2;
    const gr = g.graphemes, titleEnd = D - 2.5, tp = clamp((ts - 0.2) / (titleEnd - 0.2)), shown = Math.round(tp * gr.length), sub = gr.slice(0, shown).join("");
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = TF; popText(ctx, sub, left, 195, C.txt, 8); ctx.textBaseline = "alphabetic";
    if (tp < 1 && Math.floor(ts * 3) % 2 === 0) { ctx.font = TF; const cx = left + ctx.measureText(sub).width + 8; ctx.fillStyle = ACC; ctx.fillRect(cx, 195 - fs * 0.4, 6, fs * 0.72); }
    const floatY = Math.sin(ts * 1.9) * 8, iconY = ICON_Y + floatY, iconCY = ICON_CY + floatY;
    if (gold) { const gg = ctx.createRadialGradient(ICON_CX, iconCY, 80, ICON_CX, iconCY, 420); gg.addColorStop(0, `rgba(255,210,63,${0.28 + 0.07 * Math.sin(ts * 4)})`); gg.addColorStop(1, "rgba(255,210,63,0)"); ctx.fillStyle = gg; ctx.fillRect(ICON_CX - 440, iconCY - 440, 880, 880); }
    drawRank(ctx, rank, rankSize(rank), ts);
    changeTag(ctx, RANK_CX, RANK_CY + rankSize(rank) * 0.5 + 50, g.change, clamp((ts - 0.6) / 0.4));
    const ip = clamp((ts - 0.05) / 1.0), iScale = outBack(ip);
    ctx.save(); ctx.globalAlpha = clamp(ip * 2.2); ctx.translate(ICON_CX, iconCY); ctx.scale(iScale, iScale); ctx.translate(-ICON_CX, -iconCY);
    if (g.icon) { ctx.save(); rr(ctx, ICON_X, iconY, ICON_SZ, ICON_SZ, 52); ctx.clip(); ctx.drawImage(g.icon, ICON_X, iconY, ICON_SZ, ICON_SZ); ctx.restore(); }
    else { rr(ctx, ICON_X, iconY, ICON_SZ, ICON_SZ, 52); ctx.fillStyle = "#1b2230"; ctx.fill(); }
    ctx.strokeStyle = ACC; ctx.lineWidth = gold ? 8 : 6; rr(ctx, ICON_X, iconY, ICON_SZ, ICON_SZ, 52); ctx.stroke(); ctx.restore();
    const peakEnd = D - 1.5, avgEnd = D - 1.3, lowEnd = D - 1.1;
    statBlock(ctx, SX, 358, 458, "PEAK PLAYERS", ACCsoft, g.peak * win(ts, 0.5, peakEnd), ACC, 122, clamp((ts - 0.35) / 0.45), 1 + 0.2 * bump(ts - peakEnd));
    statBlock(ctx, SX, 566, 662, "AVERAGE PLAYERS", C.purpleSoft, g.avg * win(ts, 0.9, avgEnd), C.purple, 104, clamp((ts - 0.85) / 0.45), 1 + 0.15 * bump(ts - avgEnd));
    statBlock(ctx, SX, 760, 850, "LOWEST PLAYERS", C.lowSoft, g.low * win(ts, 1.2, lowEnd), C.low, 90, clamp((ts - 1.15) / 0.45), 1 + 0.12 * bump(ts - lowEnd));
    drawGraph(ctx, g.series, clamp((ts - 0.4) / (D - 1.1)), ACC, clamp((ts - 0.3) / 0.5));
  }
  function typeLine(ctx, text, cx, cy, fpx, color, prog, sw) {
    ctx.font = `700 ${fpx}px Grotesk`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const left = cx - ctx.measureText(text).width / 2, n = Math.round(clamp(prog) * text.length), s = text.slice(0, n);
    popText(ctx, s, left, cy, color, sw);
    if (prog < 1 && Math.floor(prog * 40) % 2 === 0) { ctx.fillStyle = color; ctx.fillRect(left + ctx.measureText(s).width + 8, cy - fpx * 0.4, 7, fpx * 0.7); }
    ctx.textBaseline = "alphabetic";
  }
  function subtitleStamp(ctx, tw, y) {
    const FSS = 62, GAPS = 18; ctx.font = `700 ${FSS}px Grotesk`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const words = SUBT.split(" "), sp = ctx.measureText(" ").width + GAPS, ws = words.map((w) => ctx.measureText(w).width), totalW = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1); let x = W / 2 - totalW / 2;
    for (let i = 0; i < words.length; i++) { const st = i * 0.13, p = clamp((tw - st) / 0.3);
      if (p > 0) { const scale = 1 + 0.7 * (1 - outCubic(p)), mix = p < 0.5 ? 1 : clamp((1 - p) * 2); ctx.save(); ctx.globalAlpha *= clamp(p * 2.2); ctx.translate(x + ws[i] / 2, y); ctx.scale(scale, scale); ctx.font = `700 ${FSS}px Grotesk`; popText(ctx, words[i], 0, 0, mixLime(mix), 8); ctx.restore(); }
      x += ws[i] + sp; }
    ctx.textBaseline = "alphabetic";
  }
  const introBanners = games.slice(0, 6).map((g) => g.banner).filter(Boolean);
  function introFrame(ctx, ts) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (introBanners.length) { const CUT = 0.5, idx = Math.floor(ts / CUT) % introBanners.length, lc = (ts % CUT) / CUT, b = introBanners[idx];
      try { ctx.save(); ctx.filter = "blur(5px)"; const s = Math.max(W / b.width, H / b.height) * (1.12 + 0.06 * lc), bw = b.width * s, bh = b.height * s; ctx.drawImage(b, (W - bw) / 2, (H - bh) / 2, bw, bh); ctx.restore(); } catch {}
      ctx.fillStyle = "rgba(9,12,18,0.52)"; ctx.fillRect(0, 0, W, H);
      const cf = clamp(1 - (ts % 0.5) / 0.5 / 0.12); if (cf > 0) { ctx.globalAlpha = 0.14 * cf; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    }
    robloxMark(ctx, Path2D, W / 2, 172 + Math.sin(ts * 3) * 4, 120, clamp(ts / 0.35));
    typeLine(ctx, "CAN YOU GUESS", W / 2, H / 2 - 130, 106, C.txt, clamp(ts / 0.65), 11);
    const t2 = ts - 0.7;
    if (t2 > 0) { const done = t2 > 0.55, pulse = done ? 1 + 0.045 * Math.sin((t2 - 0.55) * 7) : 1; ctx.save(); ctx.translate(W / 2, H / 2 + 20); ctx.scale(pulse, pulse); typeLine(ctx, "TODAY'S #1?", 0, 0, 168, C.lime, clamp(t2 / 0.55), 16); ctx.restore(); }
    const sa = clamp((ts - 2.0) / 0.5); if (sa > 0) {
      ctx.save(); ctx.globalAlpha = sa; ctx.translate(0, 22 * (1 - outCubic(sa))); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = hexA("#CBFF46", 0.55); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W / 2 - 190, H / 2 + 178); ctx.lineTo(W / 2 + 190, H / 2 + 178); ctx.stroke();
      subtitleStamp(ctx, ts - 2.0, H / 2 + 250);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "700 50px Mono"; popText(ctx, DATE, W / 2, H / 2 + 328, C.limeSoft, 7); ctx.textBaseline = "alphabetic"; ctx.restore();
    }
    if (ts < 0.25) { ctx.globalAlpha = 1 - ts / 0.25; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  function outroFrame(ctx, ts) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 950); g.addColorStop(0, `rgba(139,107,255,${0.13 + 0.03 * Math.sin(ts * 3)})`); g.addColorStop(1, "rgba(9,12,18,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
    kodeggLogo(ctx, W / 2, H / 2 - 190, 0.6 + 0.4 * outBack(clamp(ts / 0.4)), clamp(ts / 0.3));
    const ka = clamp((ts - 0.2) / 0.35); ctx.save(); ctx.globalAlpha = ka; ctx.translate(W / 2, H / 2 + 30); ctx.scale(0.8 + 0.2 * outBack(ka), 0.8 + 0.2 * outBack(ka)); ctx.font = "700 140px Grotesk"; ctx.fillStyle = C.lime; ctx.fillText("kodegg.com", 0, 0); ctx.restore();
    const ta = clamp((ts - 0.35) / 0.35); ctx.save(); ctx.globalAlpha = ta; ctx.font = "700 38px GroteskR"; ctx.fillStyle = C.muted; ctx.fillText("Free game & Roblox redeem codes — updated hourly", W / 2, H / 2 + 140); ctx.restore();
    const ca = clamp((ts - 0.55) / 0.35), wig = Math.sin(ts * 9) * 0.16 * clamp((ts - 0.85) / 0.3); subscribeCTA(ctx, W / 2, H / 2 + 285, outBack(ca), wig);
  }
  function composite(o, A, B, p) { o.globalAlpha = 1; o.drawImage(A, 0, 0); o.save(); o.beginPath(); o.rect(0, 0, eio(p) * W, H); o.clip(); o.drawImage(B, 0, 0); o.restore(); }

  // durasi per kartu: #1 = 6s, top10 = 4.2s, sisanya 3.2s
  const dur = (rank) => (rank <= 1 ? 6.0 : rank <= 10 ? 4.2 : 3.2);
  // COUNTDOWN: rank tertinggi (angka besar) dulu → #1 terakhir (klimaks)
  const ordered = [...games].sort((a, b) => b.rank - a.rank);
  const SEC = [{ kind: "intro", D: 4.5 }, ...ordered.map((g) => ({ kind: "game", g, D: dur(g.rank) })), { kind: "outro", D: 3.0 }];
  const TRT = 0.5;
  const St = [0]; for (let i = 0; i < SEC.length - 1; i++) St.push(St[i] + SEC[i].D - TRT);
  const total = St[SEC.length - 1] + SEC[SEC.length - 1].D;
  // timeline utk deskripsi YouTube (waktu mulai tiap game, urutan countdown)
  const chapters = [{ t: 0, rank: 0, name: "Intro" }];
  for (let i = 0; i < ordered.length; i++) chapters.push({ t: St[i + 1], rank: ordered[i].rank, name: ordered[i].name, peak: ordered[i].peak });
  const drawSec = (ctx, i, lt) => { const s = SEC[i]; if (s.kind === "intro") introFrame(ctx, lt); else if (s.kind === "outro") outroFrame(ctx, lt); else gameFrame(ctx, s.g, lt, s.D); };

  // events SFX
  const ev = [];
  ev.push({ t: 0.12, k: "boop" });
  [2.0, 2.13, 2.26, 2.39, 2.52].forEach((t) => ev.push({ t, k: "pop" }));
  for (let i = 1; i < SEC.length; i++) ev.push({ t: St[i], k: "whoosh" });
  for (let i = 1; i < SEC.length - 1; i++) { const s = SEC[i]; ev.push({ t: St[i] + 0.4, k: "thud" }); ev.push({ t: St[i] + (s.D - 1.5), k: "ding" }); }
  const outroStart = St[SEC.length - 1]; ev.push({ t: outroStart + 0.05, k: "chime" }); ev.push({ t: outroStart + 0.7, k: "subup" });

  // render silent
  const silentPath = (sfx || music) ? outPath.replace(/\.mp4$/, ".silent.mp4") : outPath;
  const ff = spawn(ffmpegBin(), ["-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", "60", "-keyint_min", "60", "-movflags", "+faststart", silentPath, "-loglevel", "error"], { stdio: ["pipe", "ignore", "inherit"] });
  const mctx = createCanvas(W, H).getContext("2d"), actx = createCanvas(W, H).getContext("2d"), bctx = createCanvas(W, H).getContext("2d");
  const N = Math.round(total * FPS);
  for (let f = 0; f < N; f++) {
    const gt = f / FPS; let inTr = -1;
    for (let b = 1; b < SEC.length; b++) { const s = St[b]; if (gt >= s && gt < s + TRT) { inTr = b; break; } }
    if (inTr >= 0) { const s = St[inTr], p = (gt - s) / TRT; drawSec(actx, inTr - 1, gt - St[inTr - 1]); drawSec(bctx, inTr, gt - St[inTr]); composite(mctx, actx.canvas, bctx.canvas, p); }
    else { let i = 0; for (let k = 0; k < SEC.length; k++) if (St[k] <= gt) i = k; drawSec(mctx, i, gt - St[i]); }
    const blk = Math.max(1 - clamp(gt / 0.4), clamp((gt - (total - 0.4)) / 0.4));
    if (blk > 0) { mctx.globalAlpha = blk; mctx.fillStyle = "#000"; mctx.fillRect(0, 0, W, H); mctx.globalAlpha = 1; }
    const buf = Buffer.from(mctx.getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end(); await new Promise((res) => ff.on("close", res));
  if (!sfx && !music) return { outPath, chapters };

  // audio = musik latar (musicGain) + SFX (0.85), di-mix di sample-level → 1 WAV → mux
  const SR = 44100, adur = total + 0.5, N2 = Math.ceil(adur * SR), wav = outPath.replace(/\.mp4$/, ".audio.wav");
  const sfxBuf = sfx ? sfxSamples(ev, adur, SR) : null;
  const musBuf = music ? synthMusic(adur, SR) : null;
  const mix = new Float32Array(N2);
  for (let i = 0; i < N2; i++) mix[i] = (musBuf ? musBuf[i] * musicGain : 0) + (sfxBuf ? sfxBuf[i] * 0.85 : 0);
  writeFileSync(wav, wavMono(mix, SR));
  const mux = spawn(ffmpegBin(), ["-y", "-i", silentPath, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0", "-shortest", outPath, "-loglevel", "error"], { stdio: "inherit" });
  await new Promise((res) => mux.on("close", res));
  try { unlinkSync(silentPath); unlinkSync(wav); } catch {}
  return { outPath, chapters };
}

// ——— Thumbnail clickbait: collage 50 icon acak (unik tiap hari) + judul depan ———
export async function renderThumb({ games, assetsDir, dateLabel, outPath }) {
  const cv = await canvasLib();
  const { createCanvas, loadImage } = cv;
  const TW = 1280, TH = 720;
  const load = async (u) => { const p = resolve(assetsDir, `${u}-icon.png`); return existsSync(p) ? await loadImage(p).catch(() => null) : null; };
  const icons = (await Promise.all(games.map((g) => load(g.uid)))).filter(Boolean);
  const canvas = createCanvas(TW, TH), ctx = canvas.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, TW, TH);
  // seed unik per hari (dari tanggal + #1) → tiap thumbnail beda, tapi deterministik
  let h = 2166136261; const sstr = dateLabel + "|" + (games[0]?.uid || "");
  for (let i = 0; i < sstr.length; i++) { h ^= sstr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = mulberry32(h >>> 0);
  // sebar icon pakai GRID + jitter → coverage PENUH (tanpa celah) tapi tetap acak
  // & numpuk. Urutan icon di-acak (seed) → tiap hari beda.
  const cols = 10, rows = 5, cw = TW / cols, ch = TH / rows;
  const order = [...icons.keys()]; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const img = icons[order[k % icons.length]]; k++;
    const sz = Math.max(cw, ch) * (1.2 + rnd() * 0.5); // > sel → numpuk & nutup celah
    const x = (c + 0.5) * cw + (rnd() - 0.5) * cw * 0.55, y = (r + 0.5) * ch + (rnd() - 0.5) * ch * 0.55;
    const rot = (rnd() - 0.5) * 0.44, a = 0.85 + rnd() * 0.15;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot);
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
    rr(ctx, -sz / 2, -sz / 2, sz, sz, sz * 0.16); ctx.save(); ctx.clip(); ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    ctx.shadowColor = "transparent"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.22)"; rr(ctx, -sz / 2, -sz / 2, sz, sz, sz * 0.16); ctx.stroke();
    ctx.restore();
  }
  // overlay gelap + vignette tengah → judul kebaca
  ctx.fillStyle = "rgba(9,12,18,0.5)"; ctx.fillRect(0, 0, TW, TH);
  let g = ctx.createRadialGradient(TW / 2, TH / 2, 120, TW / 2, TH / 2, 780); g.addColorStop(0, "rgba(9,12,18,0.74)"); g.addColorStop(1, "rgba(9,12,18,0.12)"); ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
  // ——— judul clickbait (depan) ———
  // judul gaya channel-besar: SEMUA font condensed Anton + highlight dua-warna
  const line = (segs, y, px, sw) => {
    ctx.font = `${px}px Rank`; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    const w = segs.map((s) => ctx.measureText(s.t).width), tot = w.reduce((a, b) => a + b, 0);
    let x = TW / 2 - tot / 2;
    segs.forEach((s, i) => { popText(ctx, s.t, x, y, s.col, sw); x += w[i]; });
  };
  line([{ t: "TOP 50", col: C.lime }], 198, 188, 16);
  line([{ t: "MOST PLAYED ", col: C.txt }, { t: "ROBLOX", col: C.lime }, { t: " GAMES", col: C.txt }], 282, 76, 9);
  line([{ t: "WHO'S ", col: C.txt }, { t: "#1", col: C.lime }, { t: " TODAY?", col: C.txt }], 430, 122, 13);
  // tanggal ala STAMP merah GEDE (font Anton — tinggi & padat, gak lebar)
  ctx.save(); ctx.translate(TW / 2, 548); ctx.rotate(-0.12);
  ctx.font = "78px Rank"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const RED = "#F0322C", dw = ctx.measureText(dateLabel).width, bw = dw + 92, bh = 124;
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  ctx.lineWidth = 10; ctx.strokeStyle = RED; rr(ctx, -bw / 2, -bh / 2, bw, bh, 16); ctx.stroke();
  ctx.shadowColor = "transparent"; ctx.lineWidth = 4; rr(ctx, -bw / 2 + 12, -bh / 2 + 12, bw - 24, bh - 24, 10); ctx.stroke();
  ctx.fillStyle = RED; ctx.fillText(dateLabel, 0, 6); ctx.restore();
  kodeggLogo(ctx, TW - 132, 52, 0.4, 1);
  writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

// ——— SFX synth → sample buffer (mono) ———
function sfxSamples(events, durSec, SR) {
  const buf = new Float32Array(Math.ceil(durSec * SR));
  const tone = (t, freq, dur, amp, decay, type = "sine", f2 = null) => { const start = Math.floor(t * SR), n = Math.floor(dur * SR); for (let i = 0; i < n; i++) { const k = start + i; if (k < 0 || k >= buf.length) continue; const ph = i / SR, f = f2 == null ? freq : freq + (f2 - freq) * (i / n); let s = Math.sin(2 * Math.PI * f * ph); if (type === "tri") s = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * ph)); buf[k] += s * amp * Math.exp(-ph * decay); } };
  const noise = (t, dur, amp, shape = "hump") => { const start = Math.floor(t * SR), n = Math.floor(dur * SR); let prev = 0; for (let i = 0; i < n; i++) { const k = start + i; if (k < 0 || k >= buf.length) continue; const x = i / n, env = shape === "hump" ? Math.sin(Math.PI * x) : Math.exp(-x * 6); prev = prev * 0.6 + (Math.random() * 2 - 1) * 0.4; buf[k] += prev * amp * env; } };
  const SFX = {
    boop: (t) => { tone(t, 420, 0.14, 0.18, 15); tone(t, 640, 0.14, 0.1, 15); },
    pop: (t) => tone(t, 720, 0.09, 0.16, 34, "tri"),
    whoosh: (t) => { noise(t, 0.42, 0.16, "hump"); tone(t, 300, 0.32, 0.05, 5, "sine", 900); },
    thud: (t) => { tone(t, 150, 0.32, 0.72, 11, "sine", 46); noise(t, 0.05, 0.22, "decay"); },
    ding: (t) => { tone(t, 1318.5, 0.55, 0.24, 6); tone(t, 1975.5, 0.48, 0.13, 7.5); tone(t, 2637, 0.3, 0.06, 10); },
    chime: (t) => { tone(t, 784, 0.5, 0.2, 5); tone(t, 1046.5, 0.5, 0.15, 5.5); tone(t, 1568, 0.4, 0.08, 7); },
    subup: (t) => { tone(t, 660, 0.12, 0.2, 10); tone(t + 0.12, 880, 0.18, 0.2, 8); },
  };
  for (const e of events) (SFX[e.k] || (() => {}))(e.t);
  return buf;
}

// ——— Float32 mono → WAV 16-bit (soft-limit) ———
function wavMono(buf, SR) {
  let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1;
  const bytes = Buffer.alloc(44 + buf.length * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + buf.length * 2, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) { let v = Math.max(-1, Math.min(1, buf[i] * g)); bytes.writeInt16LE(Math.round(v * 32767), 44 + i * 2); }
  return bytes;
}
