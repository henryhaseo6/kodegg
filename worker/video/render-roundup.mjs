// Renderer video "New Roblox Codes Roundup" (landscape 1920x1080, 30fps) — data-driven.
// Port dari sample _roundup.mjs yang disetujui user (28 Jul 2026):
//   intro: judul + "N CODES · N GAMES" (ketik) + stamp tanggal SLAM (BANG) + shockwave
//   kartu per-game: judul(emoji Twemoji) + icon + badge "N NEW CODES"; baris kode =
//     reward(kiri)+badge NEW ala Shorts(kanan, sejajar) + kode ANIMASI KETIK; PEAK/AVG/
//     LOWEST + grafik 24 jam; transisi WHOOSH; outro logo+kodegg.com+SUBSCRIBE+lonceng.
//   SFX: stamp KA-CHUNK, whoosh tiap pindah game, chime+subup di outro. Musik synthMusic.
// Font di-load lazy (canvasLib) → aman CI Linux (Anton pengganti Impact, Twemoji emoji).
//
// renderRoundup({ games, dateLabel, outPath, sfx=true, music=true }) → { outPath, chapters }
//   games: [{ id, rawName, name, players, codes:[{code,reward}], iconPath }]
// renderRoundupThumb({ games, dateLabel, totalCodes, gamesCount, outPath, seed }) → outPath
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { synthMusic } from "./music.mjs";
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, "../../site/scripts/ogfonts");

export function ffmpegBin() { if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH; try { return require("@ffmpeg-installer/ffmpeg").path; } catch { return "ffmpeg"; } }
let _cv;
async function canvasLib() {
  if (!_cv) {
    _cv = await import("@napi-rs/canvas");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-700.ttf"), "Grotesk");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-400.ttf"), "GroteskR");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceMono-Bold.ttf"), "Mono");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Anton-Regular.ttf"), "Rank");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Twemoji.Mozilla.ttf"), "Emoji");
  }
  return _cv;
}

const W = 1920, H = 1080, FPS = 30, STAMP_HIT = 1.61; // stamp impact global (intro st0 1.25 + 0.6*0.6)
const C = { bg: "#090C12", lime: "#CBFF46", limeSoft: "#e7ffb0", purple: "#8B6BFF", purpleSoft: "#c3b6ff", low: "#5EC8FF", lowSoft: "#bce6ff", txt: "#fff", muted: "#9aa4b8", ink: "#0B0E14", red: "#F0322C" };
const nf = (v) => { v = Math.round(v); return v >= 1000 ? (v / 1000).toFixed(1) + "K" : String(v); };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const outBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const eio = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clean = (s) => (s || "").split("|")[0].replace(/\[\s+/g, "[").replace(/\s+\]/g, "]").replace(/\s+/g, " ").trim();
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, t, mw, base, min, fam = "Grotesk, Emoji") { let f = base; while (f > min) { ctx.font = `700 ${f}px ${fam}`; if (ctx.measureText(t).width <= mw) break; f -= 3; } return f; }
function fitR(ctx, t, mw, base, min) { let f = base; while (f > min) { ctx.font = `${f}px Rank`; if (ctx.measureText(t).width <= mw) break; f -= 3; } return f; }
function pop(ctx, t, x, y, fill, sw = 8) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 15; ctx.shadowOffsetY = 6; ctx.lineWidth = sw; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(9,12,18,0.92)"; ctx.strokeText(t, x, y); ctx.shadowColor = "transparent"; ctx.fillStyle = fill; ctx.fillText(t, x, y); ctx.restore(); }
function ring(ctx, cx, cy, r, w, color, a) { if (a <= 0.01 || r <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, w); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.restore(); }
function kodeggLogo(ctx, cx, cy, sc, a = 1) { // gaya Short/situs: badge GG (kiri) + "KODEGG"
  ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(sc, sc);
  const B = 104, fs = 58, gap = 22; ctx.font = `800 ${fs}px Grotesk`;
  const kw = ctx.measureText("KODE").width, gw = ctx.measureText("GG").width, tot = B + gap + kw + gw; let x = -tot / 2;
  rr(ctx, x, -B / 2, B, B, B * 0.26); ctx.fillStyle = "#0E121B"; ctx.fill();
  ctx.lineWidth = B * 0.06; ctx.strokeStyle = C.lime; ctx.shadowColor = "rgba(203,255,70,0.5)"; ctx.shadowBlur = 26; ctx.stroke(); ctx.shadowColor = "transparent";
  ctx.fillStyle = C.lime; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GG", x + B / 2, 2);
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.fillText("KODE", x + B + gap, 2); ctx.fillStyle = C.lime; ctx.fillText("GG", x + B + gap + kw, 2);
  ctx.textBaseline = "alphabetic"; ctx.restore();
}
function synthSeries(peak, seed) { let a = seed >>> 0; const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; const n = 144, o = []; for (let i = 0; i < n; i++) { const t = i / (n - 1), s = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos((t - 0.83) * 2 * Math.PI)); o.push(s * (1 + (r() - 0.5) * 0.06)); } const mx = Math.max(...o); return o.map((v) => Math.round(v / mx * Math.max(peak, 100))); }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function bell(ctx, x, y, s, col, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.32);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.12, -s * 0.3, -s * 0.34); ctx.quadraticCurveTo(-s * 0.28, -s * 0.52, 0, -s * 0.56);
  ctx.quadraticCurveTo(s * 0.28, -s * 0.52, s * 0.3, -s * 0.34); ctx.quadraticCurveTo(s * 0.5, -s * 0.12, s * 0.5, s * 0.32); ctx.closePath(); ctx.fill();
  rr(ctx, -s * 0.6, s * 0.32, s * 1.2, s * 0.13, s * 0.06); ctx.fill(); ctx.beginPath(); ctx.arc(0, s * 0.58, s * 0.13, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -s * 0.62, s * 0.1, 0, 7); ctx.fill(); ctx.restore();
}
function subscribeCTA(ctx, cx, cy, appear, wiggle) {
  if (appear <= 0.01) return; ctx.save(); ctx.globalAlpha = appear; const sc = 0.85 + 0.15 * appear; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  ctx.font = "700 46px Grotesk"; const label = "SUBSCRIBE", tw = ctx.measureText(label).width, pillW = tw + 90, pillH = 92, bellS = 76, gap = 46, total = pillW + gap + bellS, sx = cx - total / 2;
  rr(ctx, sx, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.fillStyle = "#FF3B44"; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, sx + pillW / 2, cy + 3);
  bell(ctx, sx + pillW + gap + bellS / 2, cy, bellS, C.lime, wiggle); ctx.textBaseline = "alphabetic"; ctx.restore();
}
function burst(ctx, cx, cy, R, spikes, col) { ctx.beginPath(); for (let i = 0; i < spikes * 2; i++) { const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? R * 0.8 : R; const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
function stampBox(ctx, cx, cy, txt, px, rot = -0.03) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.font = `${px}px Rank`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 12; const dw = ctx.measureText(txt).width, bw = dw + px * 0.7, bh = px * 1.42; ctx.lineWidth = px * 0.11; ctx.strokeStyle = C.red; rr(ctx, -bw / 2, -bh / 2, bw, bh, px * 0.15); ctx.stroke(); ctx.shadowColor = "transparent"; ctx.fillStyle = C.red; ctx.fillText(txt, 0, px * 0.06); ctx.restore(); }
// ——— SFX synth (mono Float32) dari timeline event ———
function sfxSamples(events, durSec, SR) {
  const buf = new Float32Array(Math.ceil(durSec * SR));
  const tone = (t, freq, dur, amp, decay, type = "sine", f2 = null) => { const start = Math.floor(t * SR), n = Math.floor(dur * SR); for (let i = 0; i < n; i++) { const k = start + i; if (k < 0 || k >= buf.length) continue; const ph = i / SR, f = f2 == null ? freq : freq + (f2 - freq) * (i / n); let s = Math.sin(2 * Math.PI * f * ph); if (type === "tri") s = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * ph)); buf[k] += s * amp * Math.exp(-ph * decay); } };
  const noise = (t, dur, amp, shape = "hump") => { const start = Math.floor(t * SR), n = Math.floor(dur * SR); let prev = 0; for (let i = 0; i < n; i++) { const k = start + i; if (k < 0 || k >= buf.length) continue; const x = i / n, env = shape === "hump" ? Math.sin(Math.PI * x) : Math.exp(-x * 6); prev = prev * 0.6 + (Math.random() * 2 - 1) * 0.4; buf[k] += prev * amp * env; } };
  const SFX = {
    stamp: (t) => { tone(t - 0.05, 800, 0.03, 0.26, 45, "tri"); tone(t, 165, 0.32, 0.98, 13, "sine", 44); noise(t, 0.05, 0.36, "decay"); tone(t, 2200, 0.08, 0.12, 20, "tri"); },
    whoosh: (t) => { noise(t, 0.42, 0.16, "hump"); tone(t, 300, 0.32, 0.05, 5, "sine", 900); },
    chime: (t) => { tone(t, 784, 0.5, 0.2, 5); tone(t, 1046.5, 0.5, 0.15, 5.5); tone(t, 1568, 0.4, 0.08, 7); },
    subup: (t) => { tone(t, 660, 0.12, 0.2, 10); tone(t + 0.12, 880, 0.18, 0.2, 8); },
  };
  for (const e of events) (SFX[e.k] || (() => {}))(e.t);
  return buf;
}
function wavMono(mix, SR) {
  let peak = 0; for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i])); const gg = peak > 0.95 ? 0.95 / peak : 1;
  const N = mix.length, b = Buffer.alloc(44 + N * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + N * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) b.writeInt16LE(Math.round(clamp(mix[i] * gg, -1, 1) * 32767), 44 + i * 2);
  return b;
}

export async function renderRoundup({ games, dateLabel, outPath, sfx = true, music = true }) {
  const { createCanvas, loadImage } = await canvasLib();
  const DATE = dateLabel;
  for (const g of games) {
    g.icon = g.iconPath ? await loadImage(g.iconPath).catch(() => null) : null;
    g.disp = clean(g.rawName || g.name);
    g.series = synthSeries(g.players || 100, String(g.id).split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  }
  const ICONS = games.map((g) => g.icon).filter(Boolean);
  const totalCodes = games.reduce((a, g) => a + g.codes.length, 0);

  function scatter(ctx, ts, seed) { if (!ICONS.length) return; const r = mulberry32(seed); for (let i = 0; i < 16; i++) { const img = ICONS[Math.floor(r() * ICONS.length)]; if (!img) continue; const sz = 100 + r() * 170, x0 = r() * (W + 400) - 200, y0 = r() * (H + 400) - 200, vx = (r() - 0.5) * 40, vy = (r() - 0.5) * 40, a = 0.06 + r() * 0.08, ph = r() * 6.28; const x = ((x0 + vx * ts) % (W + 400) + (W + 400)) % (W + 400) - 200 + Math.sin(ts * 0.5 + ph) * 18, y = ((y0 + vy * ts) % (H + 400) + (H + 400)) % (H + 400) - 200; ctx.save(); ctx.globalAlpha = a; rr(ctx, x, y, sz, sz, sz * 0.2); ctx.clip(); ctx.drawImage(img, x, y, sz, sz); ctx.restore(); } }
  function baseBg(ctx, ts) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); const g = ctx.createRadialGradient(W / 2, 300, 60, W / 2, 300, 900); g.addColorStop(0, "rgba(203,255,70,0.06)"); g.addColorStop(1, "rgba(9,12,18,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); scatter(ctx, ts, 99); ctx.fillStyle = "rgba(9,12,18,0.55)"; ctx.fillRect(0, 0, W, H); }
  function header(ctx) { ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "700 28px Mono"; ctx.fillStyle = C.muted; ctx.fillText("NEW ROBLOX CODES", 90, 70); const w = ctx.measureText("NEW ROBLOX CODES").width; ctx.fillStyle = C.lime; ctx.fillText("  ·  " + DATE, 90 + w, 70); ctx.textAlign = "right"; ctx.font = "700 28px Grotesk"; const full = "GG · kodegg.com"; ctx.fillStyle = "#fff"; ctx.fillText("KODE", W - 90 - ctx.measureText(full).width, 70); ctx.fillStyle = C.lime; ctx.fillText(full, W - 90, 70); }
  function drawGraph(ctx, s, prog, appear) {
    if (appear <= 0.01) return; ctx.save(); ctx.globalAlpha = appear;
    const GX = 110, GY = 892, GW = 1700, GH = 150;
    rr(ctx, GX, GY, GW, GH, 18); ctx.fillStyle = "rgba(9,12,18,0.5)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 2; ctx.stroke();
    const pad = 20, topPad = 40, gx = GX + pad, gy = GY + topPad, gw = GW - pad * 2, gh = GH - topPad - 30;
    const n = s.length, mn = Math.min(...s), mx = Math.max(...s), rng = mx - mn || 1, px = (i) => gx + (i / (n - 1)) * gw, py = (v) => gy + gh - ((v - mn) / rng) * gh;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "700 24px Grotesk"; ctx.fillStyle = C.muted; ctx.fillText("PLAYERS  ·  LAST 24 HOURS", gx, GY + 28);
    ctx.font = "700 18px Mono"; ctx.fillStyle = "rgba(154,164,184,0.55)"; ctx.textAlign = "center"; ["00:00", "06:00", "12:00", "18:00", "24:00"].forEach((t, k) => ctx.fillText(t, gx + (k / 4) * gw, GY + GH - 8));
    const upto = Math.max(1, Math.floor(prog * (n - 1)));
    ctx.beginPath(); ctx.moveTo(px(0), gy + gh); for (let i = 0; i <= upto; i++) ctx.lineTo(px(i), py(s[i])); ctx.lineTo(px(upto), gy + gh); ctx.closePath();
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh); grad.addColorStop(0, "rgba(203,255,70,0.34)"); grad.addColorStop(1, "rgba(203,255,70,0.02)"); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= upto; i++) { const X = px(i), Y = py(s[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.strokeStyle = C.lime; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.stroke();
    const hx = px(upto), hy = py(s[upto]); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.fill(); ctx.strokeStyle = C.lime; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
  function statStrip(ctx, s, ts) {
    const appear = clamp((ts - 0.45) / 0.5); if (appear <= 0.01) return;
    const rev = outCubic(clamp((ts - 0.55) / 0.55));
    const peak = Math.max(...s), low = Math.min(...s), avg = s.reduce((a, b) => a + b, 0) / s.length;
    const cells = [{ lbl: "PEAK PLAYERS", val: peak, col: C.lime, soft: C.limeSoft }, { lbl: "AVERAGE PLAYERS", val: avg, col: C.purple, soft: C.purpleSoft }, { lbl: "LOWEST PLAYERS", val: low, col: C.low, soft: C.lowSoft }];
    const SX0 = 110, SW = 1700, cw = SW / 3, yLbl = 812, yNum = 864;
    ctx.save(); ctx.globalAlpha = appear;
    cells.forEach((c, i) => {
      const cx = SX0 + cw * i + cw / 2; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = "700 23px GroteskR"; ctx.fillStyle = c.soft; ctx.fillText(c.lbl, cx, yLbl);
      ctx.font = "700 52px Mono"; pop(ctx, nf(c.val * rev), cx, yNum, c.col, 7);
      if (i < 2) { ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(SX0 + cw * (i + 1), yLbl - 26); ctx.lineTo(SX0 + cw * (i + 1), yNum - 4); ctx.stroke(); }
    });
    ctx.restore();
  }
  function gameCard(ctx, g, ts, D) {
    baseBg(ctx, ts); header(ctx);
    const fs = fit(ctx, g.disp, W - 240, 72, 40); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `700 ${fs}px Grotesk, Emoji`;
    ctx.save(); ctx.globalAlpha = clamp(ts / 0.3); ctx.translate(W / 2, 158); ctx.scale(0.9 + 0.1 * outBack(clamp(ts / 0.4)), 0.9 + 0.1 * outBack(clamp(ts / 0.4))); pop(ctx, g.disp, 0, 0, C.txt, 9); ctx.restore();
    const IX = 150, IY = 280, IS = 360, ip = clamp((ts - 0.05) / 0.5), isc = outBack(ip);
    ctx.save(); ctx.globalAlpha = clamp(ip * 2); ctx.translate(IX + IS / 2, IY + IS / 2); ctx.scale(isc, isc); ctx.translate(-(IX + IS / 2), -(IY + IS / 2));
    ctx.save(); ctx.shadowColor = "rgba(203,255,70,0.3)"; ctx.shadowBlur = 40; rr(ctx, IX, IY, IS, IS, 50); ctx.clip(); if (g.icon) ctx.drawImage(g.icon, IX, IY, IS, IS); else { ctx.fillStyle = "#1b2230"; ctx.fillRect(IX, IY, IS, IS); } ctx.restore();
    ctx.lineWidth = 7; ctx.strokeStyle = C.lime; rr(ctx, IX, IY, IS, IS, 50); ctx.stroke(); ctx.restore();
    const bp = clamp((ts - 0.4) / 0.4); if (bp > 0) { ctx.save(); ctx.globalAlpha = bp; ctx.font = "700 38px Grotesk"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; const lbl = `${g.codes.length} NEW CODE${g.codes.length > 1 ? "S" : ""}`, bw = ctx.measureText(lbl).width + 68; rr(ctx, IX + IS / 2 - bw / 2, IY + IS + 26, bw, 70, 35); ctx.fillStyle = C.lime; ctx.fill(); ctx.fillStyle = C.ink; ctx.fillText(lbl, IX + IS / 2, IY + IS + 62); ctx.restore(); }
    const RX = 660, RW = W - RX - 90, show = g.codes.slice(0, 4);
    const rowH = show.length <= 2 ? 175 : show.length === 3 ? 140 : 112, gap = show.length <= 2 ? 30 : 22;
    const blockH = show.length * rowH + (show.length - 1) * gap, region = [222, 786], y0 = region[0] + (region[1] - region[0] - blockH) / 2;
    show.forEach((c, i) => {
      const appear = 0.5 + i * 0.2, ap = clamp((ts - appear) / 0.35); if (ap <= 0) return;
      const y = y0 + i * (rowH + gap) + (1 - outCubic(ap)) * 36;
      ctx.save(); ctx.globalAlpha = clamp(ap * 1.6);
      rr(ctx, RX, y, RW, rowH, 22); ctx.fillStyle = "rgba(21,27,39,0.94)"; ctx.fill();
      ctx.save(); ctx.shadowColor = "rgba(203,255,70,0.25)"; ctx.shadowBlur = 16; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(203,255,70,0.75)"; rr(ctx, RX, y, RW, rowH, 22); ctx.stroke(); ctx.restore();
      const rewY = y + rowH * 0.3;
      ctx.font = "700 20px Grotesk"; const nbw = ctx.measureText("NEW").width + 26, nbh = 36, nx = RX + RW - nbw - 24;
      const nbTop = Math.max(y + 12, rewY - 9 - nbh / 2), nbMid = nbTop + nbh / 2;
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "700 28px GroteskR, Emoji"; ctx.fillStyle = C.muted;
      const rw = c.reward || "In-game reward", availW = nx - (RX + 30) - 16; let rwt = rw; while (ctx.measureText(rwt).width > availW && rwt.length > 6) rwt = rwt.slice(0, -2); ctx.fillText(rwt === rw ? rwt : rwt + "…", RX + 30, rewY);
      ctx.save(); ctx.font = "700 20px Grotesk"; ctx.shadowColor = "rgba(203,255,70,0.4)"; ctx.shadowBlur = 10; rr(ctx, nx, nbTop, nbw, nbh, 10); ctx.fillStyle = "rgba(203,255,70,0.14)"; ctx.fill(); ctx.shadowColor = "transparent"; ctx.lineWidth = 2.2; ctx.strokeStyle = C.lime; ctx.stroke(); ctx.fillStyle = C.lime; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("NEW", nx + nbw / 2, nbMid + 1); ctx.restore();
      const by = y + rowH * 0.44, bh = rowH * 0.44;
      rr(ctx, RX + 26, by, RW - 52, bh, 14); ctx.fillStyle = C.ink; ctx.fill(); ctx.setLineDash([9, 8]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(203,255,70,0.5)"; ctx.stroke(); ctx.setLineDash([]);
      let cf = 44; ctx.font = `700 ${cf}px Mono`; while (ctx.measureText(c.code).width > RW - 120 && cf > 22) { cf -= 2; ctx.font = `700 ${cf}px Mono`; }
      const tp = clamp((ts - appear - 0.15) / 0.45), nn = Math.round(tp * c.code.length), sub = c.code.slice(0, nn);
      const fullW = ctx.measureText(c.code).width, left = RX + 26 + (RW - 52) / 2 - fullW / 2, cy = by + bh / 2 + 2;
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = C.lime; ctx.fillText(sub, left, cy);
      if (tp < 1 && Math.floor(ts * 3) % 2 === 0) { ctx.fillStyle = C.lime; ctx.fillRect(left + ctx.measureText(sub).width + 4, cy - cf * 0.42, 5, cf * 0.8); }
      ctx.restore();
    });
    statStrip(ctx, g.series, ts);
    drawGraph(ctx, g.series, clamp((ts - 0.6) / (D - 1.2)), clamp((ts - 0.4) / 0.5));
  }
  function intro(ctx, ts) {
    baseBg(ctx, ts); header(ctx); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const a = outBack(clamp(ts / 0.4)), tf = fitR(ctx, "NEW ROBLOX CODES", W - 130, 215, 150);
    ctx.save(); ctx.globalAlpha = clamp(ts / 0.25); ctx.translate(W / 2, H / 2 - 105); ctx.scale(0.85 + 0.15 * a, 0.85 + 0.15 * a); ctx.font = `${tf}px Rank`; pop(ctx, "NEW ROBLOX CODES", 0, 0, C.lime, 17); ctx.restore();
    const s1 = clamp((ts - 0.55) / 0.55); if (s1 > 0) {
      const txt = `${totalCodes} CODES  ·  ${games.length} GAMES`;
      ctx.save(); ctx.font = "700 70px Grotesk"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const fw = ctx.measureText(txt).width, left = W / 2 - fw / 2, yy = H / 2 + 58, nn = Math.round(clamp(s1) * txt.length), sub = txt.slice(0, nn);
      pop(ctx, sub, left, yy, C.txt, 9);
      if (s1 < 1 && Math.floor(ts * 3) % 2 === 0) { ctx.fillStyle = C.lime; ctx.fillRect(left + ctx.measureText(sub).width + 6, yy - 34, 6, 60); }
      ctx.restore();
    }
    const st0 = 1.25, stp = clamp((ts - st0) / 0.6); if (stp > 0) {
      const impactAt = 0.6, cx = W / 2, cy = H / 2 + 300; let sc, alpha, rot, shX = 0, shY = 0; const land = stp >= impactAt;
      if (!land) { const q = stp / impactAt; sc = 3.6 - 2.6 * (q * q); alpha = clamp(q * 1.9); rot = -0.38 + 0.30 * q; }
      else { const q = (stp - impactAt) / (1 - impactAt); const o = 0.16 * Math.exp(-q * 6) * Math.cos(q * 24); sc = 1 + o; alpha = 1; rot = -0.08 + 0.06 * Math.exp(-q * 5) * Math.sin(q * 22); const sh = Math.exp(-q * 9) * 10; shX = sh * Math.sin(q * 55); shY = sh * Math.cos(q * 48); }
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx + shX, cy + shY); ctx.rotate(rot); ctx.scale(sc, sc);
      ctx.font = "116px Rank"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const dw = ctx.measureText(DATE).width, bw = dw + 104, bh = 168;
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 14; ctx.lineWidth = 12; ctx.strokeStyle = C.red; rr(ctx, -bw / 2, -bh / 2, bw, bh, 18); ctx.stroke(); ctx.shadowColor = "transparent"; ctx.fillStyle = C.red; ctx.fillText(DATE, 0, 6); ctx.restore();
      if (land) { const q = (stp - impactAt) / (1 - impactAt); ring(ctx, cx, cy, 60 + q * 560, 12 * clamp(1 - q), C.red, clamp(1 - q) * 0.55); ring(ctx, cx, cy, 30 + q * 360, 6 * clamp(1 - q), "#fff", clamp(1 - q) * 0.3); }
    }
    if (ts < 0.25) { ctx.globalAlpha = 1 - ts / 0.25; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  function outro(ctx, ts) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 950); g.addColorStop(0, `rgba(139,107,255,${0.13 + 0.03 * Math.sin(ts * 3)})`); g.addColorStop(1, "rgba(9,12,18,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
    kodeggLogo(ctx, W / 2, H / 2 - 205, 0.6 + 0.4 * outBack(clamp(ts / 0.4)), clamp(ts / 0.3));
    const ka = clamp((ts - 0.2) / 0.35); ctx.save(); ctx.globalAlpha = ka; ctx.translate(W / 2, H / 2 - 25); ctx.scale(0.8 + 0.2 * outBack(ka), 0.8 + 0.2 * outBack(ka)); ctx.font = "700 130px Grotesk"; ctx.fillStyle = C.lime; ctx.fillText("kodegg.com", 0, 0); ctx.restore();
    const ta = clamp((ts - 0.4) / 0.35); ctx.save(); ctx.globalAlpha = ta; ctx.font = "700 38px GroteskR"; ctx.fillStyle = C.muted; ctx.fillText("All codes + how to redeem — updated hourly", W / 2, H / 2 + 78); ctx.restore();
    const ca = clamp((ts - 0.55) / 0.35), wig = Math.sin(ts * 9) * 0.16 * clamp((ts - 0.85) / 0.3); subscribeCTA(ctx, W / 2, H / 2 + 235, outBack(ca), wig);
  }

  const SEC = [{ d: intro, D: 4.0 }, ...games.map((g) => ({ d: (c, t) => gameCard(c, g, t, 4.4), D: 4.4 })), { d: outro, D: 3.0 }];
  const TRT = 0.45, St = [0]; for (let i = 0; i < SEC.length - 1; i++) St.push(St[i] + SEC[i].D - TRT);
  const total = St[SEC.length - 1] + SEC[SEC.length - 1].D;
  const composite = (o, A, B, p) => { o.globalAlpha = 1; o.drawImage(A, 0, 0); o.globalAlpha = eio(p); o.drawImage(B, 0, 0); o.globalAlpha = 1; };
  const chapters = [{ t: 0, name: "Intro", n: 0 }];
  for (let i = 0; i < games.length; i++) chapters.push({ t: St[i + 1], name: games[i].disp, n: games[i].codes.length, players: games[i].players });

  const FF = ffmpegBin();
  const silent = outPath.replace(/\.mp4$/, ".silent.mp4");
  const ff = spawn(FF, ["-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", "60", "-movflags", "+faststart", silent, "-loglevel", "error"], { stdio: ["pipe", "ignore", "inherit"] });
  const mc = createCanvas(W, H).getContext("2d"), ac = createCanvas(W, H).getContext("2d"), bc = createCanvas(W, H).getContext("2d");
  const N = Math.round(total * FPS), wp = (s, b) => new Promise((r) => { if (!s.write(b)) s.once("drain", r); else r(); });
  for (let f = 0; f < N; f++) {
    const gt = f / FPS; let tr = -1; for (let b = 1; b < SEC.length; b++) { const s = St[b]; if (gt >= s && gt < s + TRT) { tr = b; break; } }
    if (tr >= 0) { const s = St[tr], p = (gt - s) / TRT; SEC[tr - 1].d(ac, gt - St[tr - 1]); SEC[tr].d(bc, gt - St[tr]); composite(mc, ac.canvas, bc.canvas, p); }
    else { let i = 0; for (let k = 0; k < SEC.length; k++) if (St[k] <= gt) i = k; SEC[i].d(mc, gt - St[i]); }
    const blk = Math.max(1 - clamp(gt / 0.4), clamp((gt - (total - 0.4)) / 0.4)); if (blk > 0) { mc.globalAlpha = blk; mc.fillStyle = "#000"; mc.fillRect(0, 0, W, H); mc.globalAlpha = 1; }
    await wp(ff.stdin, Buffer.from(mc.getImageData(0, 0, W, H).data.buffer));
    if (f % 300 === 0) console.log(`  frame ${f}/${N}`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));

  const ev = [{ t: STAMP_HIT, k: "stamp" }];
  for (let b = 1; b < SEC.length; b++) ev.push({ t: St[b], k: "whoosh" });
  const outroStart = St[SEC.length - 1]; ev.push({ t: outroStart + 0.05, k: "chime" }); ev.push({ t: outroStart + 0.7, k: "subup" });
  const SR = 44100, adur = total + 0.4, N2 = Math.ceil(adur * SR);
  const mus = music ? synthMusic(adur, SR) : null, sx = sfx ? sfxSamples(ev, adur, SR) : null, mix = new Float32Array(N2);
  for (let i = 0; i < N2; i++) mix[i] = (mus ? mus[i] || 0 : 0) * 0.5 + (sx ? sx[i] || 0 : 0) * 0.9;
  const wav = outPath.replace(/\.mp4$/, ".audio.wav"); writeFileSync(wav, wavMono(mix, SR));
  const mux = spawn(FF, ["-y", "-i", silent, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0", "-shortest", outPath, "-loglevel", "error"], { stdio: "inherit" });
  await new Promise((r) => mux.on("close", r)); try { unlinkSync(silent); unlinkSync(wav); } catch {}
  return { outPath, chapters };
}

// ——— Thumbnail (1280x720) konsep "T3+": collage seeded + judul center + stamp gede +
// badge STARBURST simetris (15 GAMES / N NEW CODES) + CTA "…ON SHORTS" ———
export async function renderRoundupThumb({ games, dateLabel, totalCodes, gamesCount, outPath, seed = 3 }) {
  const { createCanvas, loadImage } = await canvasLib();
  const TW = 1280, TH = 720;
  for (const g of games) if (!g.icon) g.icon = g.iconPath ? await loadImage(g.iconPath).catch(() => null) : null;
  const ICONS = [...games].filter((g) => g.icon).sort((a, b) => (b.players || 0) - (a.players || 0)).map((g) => g.icon);
  const cv = createCanvas(TW, TH), ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, TW, TH);
  // collage seeded
  (function () { let a = seed >>> 0; const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; const cols = 6, rows = 4, cw = TW / cols, ch = TH / rows; let k = 0; for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) { const img = ICONS[k % (ICONS.length || 1)]; k++; if (!img) continue; const s = Math.min(cw, ch) * (1.05 + r() * 0.15), x = cx * cw + (cw - s) / 2 + (r() - 0.5) * 26, y = ry * ch + (ch - s) / 2 + (r() - 0.5) * 26; ctx.save(); ctx.globalAlpha = 0.5; rr(ctx, x, y, s, s, s * 0.22); ctx.clip(); ctx.drawImage(img, x, y, s, s); ctx.restore(); } })();
  const gr = ctx.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, "rgba(9,12,18,0.4)"); gr.addColorStop(0.5, "rgba(9,12,18,0.74)"); gr.addColorStop(1, "rgba(9,12,18,0.92)"); ctx.fillStyle = gr; ctx.fillRect(0, 0, TW, TH);
  kodeggLogo(ctx, 180, 64, 0.52);
  ctx.textAlign = "center"; ctx.font = "150px Rank";
  pop(ctx, "NEW ROBLOX", TW / 2, 228, C.txt, 14); pop(ctx, "CODES", TW / 2, 371, C.lime, 14);
  stampBox(ctx, TW / 2, 522, dateLabel, 84, -0.03);
  const badge = (bx, by, R, num, lbl) => {
    ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.1); ctx.translate(-bx, -by);
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; burst(ctx, bx, by, R, 15, C.lime); ctx.shadowColor = "transparent";
    burst(ctx, bx, by, R * 0.87, 15, C.bg); burst(ctx, bx, by, R * 0.81, 15, C.lime);
    ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${R * 0.92}px Rank`; ctx.fillText(num, bx, by - R * 0.17);
    ctx.font = `700 ${R * 0.22}px Grotesk`; ctx.fillText(lbl, bx, by + R * 0.5);
    ctx.restore();
  };
  badge(185, 522, 132, String(gamesCount), "GAMES");
  badge(1095, 522, 132, String(totalCodes), "NEW CODES");
  ctx.textBaseline = "middle"; ctx.font = "700 34px Grotesk";
  const a1 = "NEW CODES EVERY HOUR ON ", b1 = "SHORTS", wa = ctx.measureText(a1).width, wb = ctx.measureText(b1).width, lx = TW / 2 - (wa + wb) / 2;
  ctx.textAlign = "left"; ctx.fillStyle = C.muted; ctx.fillText(a1, lx, 688); ctx.fillStyle = C.lime; ctx.fillText(b1, lx + wa, 688);
  writeFileSync(outPath, cv.toBuffer("image/png"));
  return outPath;
}
