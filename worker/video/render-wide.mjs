// Renderer video LANDSCAPE per-game, model ADEGAN ala roundup — 1920x1080, 30fps,
// maksimal 30 detik, maksimal 2 kode per adegan.
//
// Kenapa ada. Analytics 8 Agu 2026: penonton kita menonton video landscape
// PER-GAME milik kreator lain dengan 26–88 ribu view, semuanya tentang Drag Drive
// Simulator — game yang Shorts kita sendiri sudah menang di dalamnya (9.575).
// Video landscape KITA sudah ada tapi lemah (22 video, median 19 view) karena
// isinya AGREGAT: "New Roblox Codes — AUGUST 4, 100 Codes, 57 Games", judul yang
// tak seorang pun mencarinya. Jadi yang belum diuji bukan "landscape vs
// vertikal", melainkan landscape yang judulnya cocok dengan yang orang ketik.
//
// KENAPA MODEL ADEGAN, BUKAN SATU HALAMAN PANJANG (keputusan user):
//   - maksimal 2 kode per adegan → tiap kode dapat ruang besar dan waktu baca
//     sendiri, bukan enam baris kecil yang dipindai sekilas
//   - 30 detik, bukan 45 → retensi. Video pendek yang ditonton habis mengalahkan
//     video panjang yang ditinggal di tengah, dan itu sinyal yang dipakai YouTube
//   - transisi cross-fade + whoosh tiap pindah, sama seperti roundup, supaya
//     bahasa visual kanal tetap satu
//
// Audio: musik synthMusic + whoosh, sama dengan roundup. VO opsional dan memakai
// voScript yang SAMA dengan Shorts — yang penting, skrip itu TIDAK membacakan
// kodenya. Membacakan "DELAYXIXIORDERANDOUBLE" lewat TTS tak bisa dipahami dan
// justru mengganggu; tugas VO di sini membingkai ("ini semua kode X yang masih
// aktif, tinggal salin dari layar"), bukan mendiktekan.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, writeFileSync, unlinkSync, statSync } from "node:fs";
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
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Twemoji.Mozilla.ttf"), "Emoji");
  }
  return _cv;
}
const SEG = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const W = 1920, H = 1080, FPS = 30, SR = 44100;
const RAIL = 620;
const C = { bg: "#090C12", surf: "#151B27", surf2: "#1B2331", txt: "#EEF1F6", muted: "#98A2B3", faint: "#7C8798", acc: "#CBFF46", acc2: "#8B6BFF", ink: "#0B0E14" };

const clamp = (a, b, t) => Math.max(a, Math.min(b, t));
const inv = (a, b, t) => clamp(0, 1, (t - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function potong(ctx, teks, maxW) {
  if (ctx.measureText(teks).width <= maxW) return teks;
  const g = [...SEG.segment(teks)].map((s) => s.segment);
  let out = ""; for (const ch of g) { if (ctx.measureText(out + ch + "…").width > maxW) break; out += ch; }
  return out + "…";
}
/** Font TERBESAR yang masih memuat teks utuh. Kode TIDAK PERNAH dipotong —
 *  penonton datang untuk MENYALIN, dan "DELAYXIXIORDERANDOU…" tak bisa disalin. */
function fontMuat(ctx, teks, maxW, { berat = "700", min, maks, keluarga }) {
  for (let s = maks; s >= min; s -= 2) { ctx.font = `${berat} ${s}px ${keluarga}`; if (ctx.measureText(teks).width <= maxW) return s; }
  ctx.font = `${berat} ${min}px ${keluarga}`; return min;
}
function gambarIkon(ctx, img, x, y, size, r) { ctx.save(); rr(ctx, x, y, size, size, r); ctx.clip(); ctx.drawImage(img, x, y, size, size); ctx.restore(); }
function pil(ctx, x, y, teks, warna, bg, font = "700 26px Mono") {
  ctx.font = font; const w = ctx.measureText(teks).width + 34, h = 46;
  rr(ctx, x, y, w, h, 23); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = warna; ctx.textBaseline = "middle"; ctx.fillText(teks, x + 17, y + h / 2 + 1); ctx.textBaseline = "alphabetic";
  return w;
}
function logo(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  rr(ctx, 0, 0, 64, 64, 16); ctx.fillStyle = C.acc; ctx.fill();
  ctx.font = "800 36px Grotesk"; ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GG", 32, 34);
  ctx.textAlign = "left"; ctx.font = "800 40px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText("KODE", 80, 34);
  const wk = ctx.measureText("KODE").width; ctx.fillStyle = C.acc; ctx.fillText("GG", 80 + wk + 4, 34);
  ctx.textBaseline = "alphabetic"; ctx.restore();
}
function latar(ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(RAIL * 0.45, H * 0.36, 40, RAIL * 0.45, H * 0.36, 860);
  g.addColorStop(0, "rgba(139,107,255,0.17)"); g.addColorStop(1, "rgba(139,107,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, RAIL + 260, H);
}
function drawBell(ctx, cx, cy, s, warna, rot = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(s / 100, s / 100);
  ctx.strokeStyle = warna; ctx.lineWidth = 9; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-30, 22); ctx.quadraticCurveTo(-30, -26, 0, -32); ctx.quadraticCurveTo(30, -26, 30, 22); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-38, 26); ctx.lineTo(38, 26); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 36, 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function fmtWIB(d) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d).replace(/\./g, ":") + " WIB";
}
const fmtPemain = (n) => (n >= 1000 ? Math.round(n / 1000) + "K" : String(n));

// SFX minimal — hanya whoosh (pindah adegan) dan chime/subup (outro), sama
// palet dengan roundup supaya kanal terdengar konsisten.
function sfxSamples(events, durSec) {
  const buf = new Float32Array(Math.ceil(durSec * SR));
  const tone = (t, f1, dur, amp, decay, f2 = null) => {
    const s0 = Math.floor(t * SR), n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) { const k = s0 + i; if (k < 0 || k >= buf.length) continue; const ph = i / SR, f = f2 == null ? f1 : f1 + (f2 - f1) * (i / n); buf[k] += Math.sin(2 * Math.PI * f * ph) * amp * Math.exp(-ph * decay); }
  };
  const noise = (t, dur, amp) => {
    const s0 = Math.floor(t * SR), n = Math.floor(dur * SR); let prev = 0;
    for (let i = 0; i < n; i++) { const k = s0 + i; if (k < 0 || k >= buf.length) continue; prev = prev * 0.6 + (Math.random() * 2 - 1) * 0.4; buf[k] += prev * amp * Math.sin(Math.PI * (i / n)); }
  };
  const SFX = {
    whoosh: (t) => { noise(t, 0.4, 0.15); tone(t, 300, 0.3, 0.05, 5, 900); },
    chime: (t) => { tone(t, 784, 0.5, 0.2, 5); tone(t, 1046.5, 0.5, 0.14, 5.5); tone(t, 1568, 0.4, 0.07, 7); },
    subup: (t) => { tone(t, 660, 0.12, 0.19, 10); tone(t + 0.12, 880, 0.18, 0.19, 8); },
  };
  for (const e of events) (SFX[e.k] || (() => {}))(e.t);
  return buf;
}
function wavMono(mix) {
  let peak = 0; for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const gg = peak > 0.95 ? 0.95 / peak : 1, N = mix.length, b = Buffer.alloc(44 + N * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + N * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) b.writeInt16LE(Math.round(clamp(-1, 1, mix[i] * gg) * 32767), 44 + i * 2);
  return b;
}

/**
 * @param {{name, platform, players}} game
 * @param {{code, reward, isNew}[]} codes
 * @param {string} voPath  MP3 voiceover (opsional) — dicampur di atas musik
 */
export async function renderWide({ game, codes, activeCount, fetchedAt, iconPath, outPath, voPath = null, music = true, sfx = true }) {
  const { createCanvas, loadImage } = await canvasLib();
  const ikon = iconPath && existsSync(iconPath) ? await loadImage(iconPath) : null;
  const nAktif = activeCount ?? (codes ?? []).length;
  const stamp = fmtWIB(fetchedAt ? new Date(fetchedAt) : new Date());

  // 2 kode per adegan (keputusan user). Jumlah adegan dibatasi supaya total
  // TIDAK melewati 30 detik — batas itu yang menjaga retensi, jadi ia menang
  // atas keinginan memajang lebih banyak kode. Sisanya diarahkan ke situs.
  const PER = 2, INTRO = 3.4, ADEGAN = 4.4, OUTRO = 3.0, TRT = 0.4, MAKS_DETIK = 30;
  const maksAdegan = Math.max(1, Math.floor((MAKS_DETIK - INTRO - OUTRO + 2 * TRT) / (ADEGAN - TRT)));
  const halaman = [];
  for (let i = 0; i < (codes ?? []).length && halaman.length < maksAdegan; i += PER) halaman.push(codes.slice(i, i + PER));
  const ditampilkan = halaman.reduce((a, h) => a + h.length, 0);
  const sisa = Math.max(0, nAktif - ditampilkan);

  // ── rel kiri: jangkar identitas, digambar di SEMUA adegan ────────────────
  function relKiri(ctx, masuk) {
    const a = easeOut(masuk), x = 74, geser = (1 - a) * 22;
    ctx.globalAlpha = a;
    logo(ctx, x, 70 - geser, 0.86);
    const S = 190;
    if (ikon) gambarIkon(ctx, ikon, x, 196 - geser, S, 34);
    else { rr(ctx, x, 196 - geser, S, S, 34); ctx.fillStyle = C.surf; ctx.fill(); }
    ctx.textAlign = "left"; ctx.fillStyle = C.txt;
    fontMuat(ctx, game.name, RAIL - 120, { berat: "800", min: 32, maks: 56, keluarga: "Grotesk" });
    ctx.fillText(game.name, x, 462 - geser);
    ctx.font = "700 31px Grotesk"; ctx.fillStyle = C.acc; ctx.fillText("KODE REDEEM", x, 510 - geser);
    const wp = pil(ctx, x, 552 - geser, game.platform === "ROBLOX" ? "ROBLOX" : "GAME", C.acc2, "rgba(139,107,255,0.14)");
    if (game.players) pil(ctx, x + wp + 12, 552 - geser, fmtPemain(game.players) + " pemain", C.muted, "rgba(255,255,255,0.06)");
    ctx.font = "800 96px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText(String(nAktif), x, 726 - geser);
    const wn = ctx.measureText(String(nAktif)).width;
    ctx.font = "700 33px Grotesk"; ctx.fillStyle = C.muted; ctx.fillText("kode aktif", x + wn + 16, 726 - geser);
    ctx.font = "400 25px GroteskR"; ctx.fillStyle = C.faint; ctx.fillText("Update " + stamp, x, 776 - geser);
    ctx.font = "700 29px Mono"; ctx.fillStyle = C.acc; ctx.fillText("kodegg.com", x, 962 - geser);
    ctx.globalAlpha = 1;
  }

  function intro(ctx, t) {
    latar(ctx); relKiri(ctx, inv(0.1, 0.9, t));
    const x0 = RAIL + 90, a = easeOut(inv(0.5, 1.3, t));
    ctx.globalAlpha = a; ctx.textAlign = "left";
    ctx.font = "800 74px Grotesk"; ctx.fillStyle = C.txt;
    ctx.fillText("Semua kode yang", x0, 420 + (1 - a) * 20);
    ctx.fillStyle = C.acc; ctx.fillText("masih jalan", x0, 512 + (1 - a) * 20);
    ctx.globalAlpha = 1;
    const b = easeOut(inv(1.5, 2.2, t));
    if (b > 0.01) {
      ctx.globalAlpha = b; ctx.font = "400 34px GroteskR"; ctx.fillStyle = C.muted;
      ctx.fillText("Dicek ulang tiap jam · salin PERSIS, kode case-sensitive", x0, 596);
      ctx.globalAlpha = 1;
    }
  }

  // ── adegan kode: maksimal 2, masing-masing besar ─────────────────────────
  function kartuKode(ctx, list, t, idxHal) {
    latar(ctx); relKiri(ctx, 1);
    const x0 = RAIL + 90, lebar = W - x0 - 80;
    ctx.textAlign = "left";
    ctx.globalAlpha = easeOut(inv(0.05, 0.5, t));
    ctx.font = "700 28px Mono"; ctx.fillStyle = C.faint;
    const dari = Math.min(idxHal * PER + list.length, nAktif);
    ctx.fillText(`KODE ${idxHal * PER + 1}–${dari} DARI ${nAktif}`, x0, 150);
    ctx.globalAlpha = 1;

    const TB = 244, GAP = 34, y0 = 210;
    list.forEach((c, i) => {
      const a = easeOut(inv(0.25 + i * 0.3, 0.95 + i * 0.3, t));
      if (a <= 0.01) return;
      const y = y0 + i * (TB + GAP), geser = (1 - a) * 46;
      ctx.globalAlpha = a;
      rr(ctx, x0 + geser, y, lebar, TB, 26); ctx.fillStyle = C.surf; ctx.fill();
      ctx.strokeStyle = c.isNew ? "rgba(203,255,70,0.45)" : "rgba(255,255,255,0.07)"; ctx.lineWidth = 2; ctx.stroke();
      rr(ctx, x0 + geser + 1, y + 1, 8, TB - 2, 5); ctx.fillStyle = c.isNew ? C.acc : C.acc2; ctx.fill();

      if (c.isNew) {
        ctx.font = "800 26px Grotesk";
        const tw = ctx.measureText("BARU").width + 34;
        rr(ctx, x0 + geser + lebar - tw - 30, y + 28, tw, 46, 23);
        ctx.fillStyle = "rgba(203,255,70,0.16)"; ctx.fill();
        ctx.fillStyle = C.acc; ctx.textBaseline = "middle"; ctx.fillText("BARU", x0 + geser + lebar - tw - 13, y + 52); ctx.textBaseline = "alphabetic";
      }
      // Kode dapat ruang paling besar di seluruh video — inilah alasan orang
      // membuka videonya. Mengecil sampai muat, tak pernah dipotong.
      const ruangBadge = c.isNew ? 150 : 40;
      ctx.fillStyle = C.txt;
      fontMuat(ctx, c.code, lebar - 56 - ruangBadge, { berat: "700", min: 34, maks: 78, keluarga: "Mono" });
      ctx.fillText(c.code, x0 + geser + 44, y + (c.reward ? 128 : 148));
      if (c.reward) {
        ctx.font = "400 32px GroteskR"; ctx.fillStyle = C.muted;
        ctx.fillText(potong(ctx, c.reward, lebar - 96), x0 + geser + 44, y + 182);
      }
      ctx.globalAlpha = 1;
    });
  }

  function outro(ctx, t) {
    latar(ctx); relKiri(ctx, 1);
    const x0 = RAIL + 90, a = easeOut(inv(0.1, 0.7, t));
    ctx.globalAlpha = a; ctx.textAlign = "left";
    if (sisa > 0) {
      ctx.font = "800 60px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText("+ " + sisa + " kode lagi", x0, 330);
      ctx.font = "400 34px GroteskR"; ctx.fillStyle = C.muted; ctx.fillText("Daftar lengkapnya di kodegg.com", x0, 392);
    } else {
      ctx.font = "800 60px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText("Itu semuanya!", x0, 330);
      ctx.font = "400 34px GroteskR"; ctx.fillStyle = C.muted; ctx.fillText("Update tiap jam di kodegg.com", x0, 392);
    }
    const btnW = 400, btnH = 104, bell = 84, bx = x0, by = 484;
    rr(ctx, bx, by, btnW, btnH, 20); ctx.fillStyle = "#FF0033";
    ctx.shadowColor = "rgba(255,0,51,0.4)"; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = "800 46px Grotesk"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("SUBSCRIBE", bx + btnW / 2, by + btnH / 2 + 2); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const ring = t > 0.7 ? Math.sin((t - 0.7) * 26) * Math.exp(-(t - 0.7) * 2.6) * 0.4 : 0;
    drawBell(ctx, bx + btnW + 60, by + btnH / 2, bell, C.acc, ring);
    ctx.font = "400 30px GroteskR"; ctx.fillStyle = C.faint;
    ctx.fillText("Nyalain loncengnya biar gak ketinggalan kode baru", x0, 646);
    ctx.globalAlpha = 1;
  }

  // ── susunan adegan ala roundup (cross-fade antar-adegan) ─────────────────
  const SEC = [
    { d: intro, D: INTRO },
    ...halaman.map((h, i) => ({ d: (c, t) => kartuKode(c, h, t, i), D: ADEGAN })),
    { d: outro, D: OUTRO },
  ];
  const St = [0]; for (let i = 0; i < SEC.length - 1; i++) St.push(St[i] + SEC[i].D - TRT);
  const total = St[SEC.length - 1] + SEC[SEC.length - 1].D;

  const silent = outPath.replace(/\.mp4$/, ".silent.mp4");
  const FF = ffmpegBin();
  const ff = spawn(FF, ["-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", "60", "-movflags", "+faststart", silent, "-loglevel", "error"], { stdio: ["pipe", "ignore", "inherit"] });
  const mk = () => { const cv = createCanvas(W, H); return cv.getContext("2d"); };
  const mc = mk(), ac = mk(), bc = mk();
  const N = Math.round(total * FPS);
  for (let f = 0; f < N; f++) {
    const gt = f / FPS;
    let tr = -1;
    for (let b = 1; b < SEC.length; b++) { const s = St[b]; if (gt >= s && gt < s + TRT) { tr = b; break; } }
    if (tr >= 0) {
      SEC[tr - 1].d(ac, gt - St[tr - 1]); SEC[tr].d(bc, gt - St[tr]);
      const p = easeIO((gt - St[tr]) / TRT);
      mc.globalAlpha = 1; mc.drawImage(ac.canvas, 0, 0);
      mc.globalAlpha = p; mc.drawImage(bc.canvas, 0, 0); mc.globalAlpha = 1;
    } else {
      let i = 0; for (let k = 0; k < SEC.length; k++) if (St[k] <= gt) i = k;
      SEC[i].d(mc, gt - St[i]);
    }
    const buf = Buffer.from(mc.getImageData(0, 0, W, H).data);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));

  // ── audio: musik + whoosh, VO dicampur bila ada ──────────────────────────
  const ev = [];
  for (let b = 1; b < SEC.length; b++) ev.push({ t: St[b], k: "whoosh" });
  const outroT = St[SEC.length - 1];
  ev.push({ t: outroT + 0.05, k: "chime" }); ev.push({ t: outroT + 0.6, k: "subup" });
  const n2 = Math.ceil(total * SR);
  const mus = music ? synthMusic(total, SR) : null, sx = sfx ? sfxSamples(ev, total) : null;
  const mix = new Float32Array(n2);
  // Musik ditekan ke 0,5 bila ada VO (dan 0,85 bila tidak) supaya narasi tetap
  // terdengar jelas — sama pendekatan dengan jalur Shorts.
  const volMus = voPath ? 0.5 : 0.85;
  for (let i = 0; i < n2; i++) mix[i] = (mus ? mus[i] * volMus : 0) + (sx ? sx[i] * 0.9 : 0);
  const wav = outPath.replace(/\.mp4$/, ".mix.wav");
  writeFileSync(wav, wavMono(mix));

  const args = ["-y", "-i", silent, "-i", wav];
  if (voPath && existsSync(voPath)) args.push("-i", voPath);
  args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-map", "0:v:0");
  if (voPath && existsSync(voPath)) args.push("-filter_complex", "[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=0[a]", "-map", "[a]");
  else args.push("-map", "1:a:0");
  args.push("-shortest", outPath, "-loglevel", "error");
  const mux = spawn(FF, args, { stdio: "inherit" });
  await new Promise((r) => mux.on("close", r));
  try { unlinkSync(silent); unlinkSync(wav); } catch {}
  return { outPath, durasi: total, adegan: halaman.length, ditampilkan, sisa, ukuran: statSync(outPath).size };
}
