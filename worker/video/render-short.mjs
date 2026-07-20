// Renderer YouTube Short KodeGG — data-driven (dari prototipe _short-gen).
// renderShort({game, codes, iconPath, outPath}) → MP4 vertikal BISU (audio dimux
// terpisah). 1080x1920, 30fps, ~21s. Canvas → pipe RGBA ke ffmpeg.
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, "../../site/scripts/ogfonts");
GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-700.ttf"), "Grotesk");
GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-400.ttf"), "GroteskR");
GlobalFonts.registerFromPath(resolve(FONTS, "SpaceMono-Bold.ttf"), "Mono");

// Resolusi path ffmpeg: env → @ffmpeg-installer → 'ffmpeg' sistem (CI ubuntu).
export function ffmpegBin() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return require("@ffmpeg-installer/ffmpeg").path;
  } catch {
    return "ffmpeg";
  }
}

const W = 1080, H = 1920, FPS = 30;
const C = { bg: "#090C12", surf: "#151B27", txt: "#EEF1F6", muted: "#98A2B3", faint: "#8892A3", acc: "#CBFF46", acc2: "#8B6BFF", ok: "#37E38B", warn: "#FFB13C", ink: "#0B0E14" };

const clamp = (a, b, t) => Math.max(a, Math.min(b, t));
const inv = (a, b, t) => clamp(0, 1, (t - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const saw = (f, t) => { const p = (t * f) % 1; return 2 * p - 1; };

function drawBG(ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.32, 360, 0, W * 0.32, 360, 760);
  g1.addColorStop(0, "rgba(203,255,70,0.14)"); g1.addColorStop(1, "rgba(203,255,70,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.7, 1500, 0, W * 0.7, 1500, 820);
  g2.addColorStop(0, "rgba(139,107,255,0.16)"); g2.addColorStop(1, "rgba(139,107,255,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 80; y < H; y += 54) for (let x = 40; x < W; x += 54) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
}
function logo(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  rr(ctx, 0, 0, 64, 64, 16); ctx.fillStyle = "#0E121B"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.acc; ctx.shadowColor = "rgba(203,255,70,0.5)"; ctx.shadowBlur = 22; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.font = "800 34px Grotesk"; ctx.fillStyle = C.acc; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GG", 32, 35);
  ctx.textAlign = "left"; ctx.fillStyle = C.txt; ctx.fillText("KODE", 80, 35);
  const w = ctx.measureText("KODE").width; ctx.fillStyle = C.acc; ctx.fillText("GG", 80 + w, 35);
  ctx.restore();
}
function pill(ctx, x, y, text, color, bg) {
  ctx.font = "700 24px Mono"; const w = ctx.measureText(text).width + 40;
  rr(ctx, x, y, w, 46, 12); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 20, y + 24);
  return w;
}
function roundedImage(ctx, img, x, y, size, r) {
  ctx.save(); rr(ctx, x, y, size, size, r); ctx.clip(); ctx.drawImage(img, x, y, size, size); ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.18)"; rr(ctx, x, y, size, size, r); ctx.stroke();
}
function drawBell(ctx, cx, cy, s, color, rot = 0) {
  ctx.save(); ctx.translate(cx, cy - s * 0.46); ctx.rotate(rot); ctx.translate(0, s * 0.46); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.28); ctx.quadraticCurveTo(-s * 0.45, -s * 0.34, 0, -s * 0.44); ctx.quadraticCurveTo(s * 0.45, -s * 0.34, s * 0.45, s * 0.28); ctx.closePath(); ctx.fill();
  rr(ctx, -s * 0.54, s * 0.26, s * 1.08, s * 0.11, s * 0.055); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.1, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(0, s * 0.5, s * 0.12, 0, 7); ctx.fill();
  ctx.restore();
}

/** Render Short bisu. game={name,platform:'ROBLOX'|'MOBILE',players?}, codes=[{code,reward}] (maks 3 dipakai). */
export async function renderShort({ game, codes, iconPath, activeCount, outPath }) {
  const iconImg = existsSync(iconPath) ? await loadImage(iconPath) : null;
  const CODES = codes.slice(0, 3);
  const nActive = activeCount ?? codes.length;
  const isRoblox = game.platform === "ROBLOX";
  const accentPlat = isRoblox ? C.acc2 : C.acc;
  const platBg = isRoblox ? "rgba(139,107,255,0.12)" : "rgba(203,255,70,0.10)";
  const DUR = 21, N = DUR * FPS;

  function frame(ctx, t) {
    drawBG(ctx);
    logo(ctx, 60, 70, 0.62);
    const outroIn = inv(14.4, 15.0, t), outroOut = inv(17.0, 17.4, t), subIn = inv(17.55, 18.05, t);
    const mainA = 1 - outroIn, outro = outroIn * (1 - outroOut), subA = subIn;

    if (mainA > 0.01) {
      ctx.globalAlpha = mainA;
      const ia = inv(0.4, 1.4, t), is = 0.7 + 0.3 * easeOut(ia);
      const isz = 200, ix = W / 2 - isz / 2, iy = 250;
      if (iconImg) { ctx.save(); ctx.globalAlpha = mainA * ia; ctx.translate(W / 2, iy + isz / 2); ctx.scale(is, is); ctx.translate(-W / 2, -(iy + isz / 2)); ctx.shadowColor = "rgba(203,255,70,0.35)"; ctx.shadowBlur = 40; roundedImage(ctx, iconImg, ix, iy, isz, 44); ctx.shadowBlur = 0; ctx.restore(); }

      const pa = inv(0.9, 1.6, t);
      ctx.globalAlpha = mainA * pa;
      ctx.font = "700 24px Mono";
      const pw1 = ctx.measureText(game.platform).width + 40;
      const showPlayers = !!game.players;
      const pw2 = showPlayers ? ctx.measureText(game.players + " PLAYERS").width + 40 : 0;
      const gap = 14, totalW = pw1 + (showPlayers ? gap + pw2 : 0), px = W / 2 - totalW / 2, py = iy + isz + 26;
      pill(ctx, px, py, game.platform, accentPlat, platBg);
      if (showPlayers) pill(ctx, px + pw1 + gap, py, game.players + " PLAYERS", C.ok, "rgba(55,227,139,0.10)");
      ctx.globalAlpha = mainA;

      const ha = inv(1.1, 1.9, t), hy = 620 + (1 - easeOut(ha)) * 30;
      ctx.globalAlpha = mainA * ha;
      ctx.font = "800 96px Grotesk"; ctx.fillStyle = C.acc; ctx.textAlign = "center";
      ctx.shadowColor = "rgba(203,255,70,0.3)"; ctx.shadowBlur = 30; ctx.fillText("KODE BARU!", W / 2, hy); ctx.shadowBlur = 0;
      ctx.globalAlpha = mainA * inv(1.3, 2.0, t);
      ctx.font = "700 52px Grotesk"; ctx.fillStyle = C.txt;
      let gname = game.name; while (ctx.measureText(gname).width > W - 120 && gname.length > 8) gname = gname.slice(0, -2);
      ctx.fillText(gname === game.name ? gname : gname + "…", W / 2, hy + 76);
      ctx.globalAlpha = mainA * inv(1.8, 2.5, t);
      ctx.font = "400 30px GroteskR"; ctx.fillStyle = C.muted;
      ctx.fillText(`${nActive} kode aktif · terverifikasi`, W / 2, hy + 138);
      ctx.globalAlpha = mainA;

      const startY = 940, cardH = 200, gapC = 26;
      CODES.forEach((c, i) => {
        const appear = 2.7 + i * 2.4, a = inv(appear, appear + 0.7, t); if (a <= 0) return;
        const y = startY + i * (cardH + gapC) + (1 - easeOut(a)) * 40, x = 70, w = W - 140;
        ctx.globalAlpha = mainA * a;
        rr(ctx, x, y, w, cardH, 26); ctx.fillStyle = C.surf; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(203,255,70,0.35)"; ctx.stroke();
        ctx.font = "800 26px Mono"; ctx.fillStyle = C.faint; ctx.textAlign = "left"; ctx.fillText(String(i + 1).padStart(2, "0"), x + 30, y + 44);
        ctx.font = "700 30px Grotesk"; ctx.fillStyle = C.muted;
        let rw = c.reward || "Reward"; while (ctx.measureText(rw).width > w - 130 && rw.length > 6) rw = rw.slice(0, -2);
        ctx.fillText(rw === (c.reward || "Reward") ? rw : rw + "…", x + 82, y + 44);
        const by = y + 74, bh = 92;
        rr(ctx, x + 30, by, w - 60, bh, 16); ctx.fillStyle = "#0B0E14"; ctx.fill();
        ctx.setLineDash([9, 8]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(203,255,70,0.4)"; ctx.stroke(); ctx.setLineDash([]);
        let fs = 46; ctx.font = `700 ${fs}px Mono`; while (ctx.measureText(c.code).width > w - 90 && fs > 24) { fs -= 2; ctx.font = `700 ${fs}px Mono`; }
        ctx.fillStyle = C.acc; ctx.textAlign = "center"; ctx.fillText(c.code, W / 2, by + bh / 2 + fs * 0.34);
        ctx.globalAlpha = mainA;
      });

      if (inv(11.5, 12.2, t) > 0) {
        ctx.globalAlpha = mainA * inv(11.5, 12.2, t);
        ctx.font = "700 34px Grotesk"; ctx.fillStyle = C.warn; ctx.textAlign = "center";
        ctx.fillText("Redeem cepat — sebagian cuma aktif beberapa hari", W / 2, 1770);
      }
      ctx.globalAlpha = 1;
    }

    if (outro > 0.01) {
      const e = easeInOut(outroIn); ctx.globalAlpha = outro;
      logo(ctx, W / 2 - 150, 620, 1.5); ctx.textAlign = "center";
      ctx.font = "800 78px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText("Full list + cara redeem", W / 2, 900 + (1 - e) * 20);
      ctx.font = "800 92px Grotesk"; ctx.fillStyle = C.acc; ctx.shadowColor = "rgba(203,255,70,0.35)"; ctx.shadowBlur = 34; ctx.fillText("kodegg.com", W / 2, 1030); ctx.shadowBlur = 0;
      ctx.font = "400 36px GroteskR"; ctx.fillStyle = C.muted; ctx.fillText("200+ game · terverifikasi · update tiap jam", W / 2, 1130);
      const t1 = "MOBILE", t2 = "ROBLOX"; ctx.font = "700 26px Mono";
      const w1 = ctx.measureText(t1).width + 44, w2 = ctx.measureText(t2).width + 44, g = 16, tw = w1 + g + w2, sx = W / 2 - tw / 2;
      ctx.textAlign = "left"; pill(ctx, sx, 1210, t1, C.acc, "rgba(203,255,70,0.10)"); pill(ctx, sx + w1 + g, 1210, t2, C.acc2, "rgba(139,107,255,0.12)");
      ctx.globalAlpha = 1;
    }

    if (subA > 0.01) {
      const e = easeOut(subA); ctx.globalAlpha = subA; ctx.textAlign = "center";
      logo(ctx, W / 2 - 100, 560, 1.1);
      ctx.font = "700 42px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText("Biar gak ketinggalan kode baru:", W / 2, 800 + (1 - e) * 18);
      const btnW = 430, btnH = 120, gapb = 46, bellS = 96, pairW = btnW + gapb + bellS, startX = W / 2 - pairW / 2, btnY = 900;
      rr(ctx, startX, btnY, btnW, btnH, 22); ctx.fillStyle = "#FF0033"; ctx.shadowColor = "rgba(255,0,51,0.45)"; ctx.shadowBlur = 34; ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = "800 54px Grotesk"; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText("SUBSCRIBE", startX + btnW / 2, btnY + btnH / 2 + 2); ctx.textBaseline = "alphabetic";
      const ring = t > 18.05 ? Math.sin((t - 18.05) * 26) * Math.exp(-(t - 18.05) * 2.6) * 0.42 : 0;
      drawBell(ctx, startX + btnW + gapb + bellS / 2, btnY + btnH / 2, bellS, C.acc, ring);
      ctx.font = "400 36px GroteskR"; ctx.fillStyle = C.muted; ctx.fillText("Subscribe & nyalain loncengnya", W / 2, 1110);
      ctx.globalAlpha = 1;
    }
  }

  const ff = spawn(ffmpegBin(), ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath], { stdio: ["pipe", "ignore", "ignore"] });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  for (let f = 0; f < N; f++) {
    frame(ctx, f / FPS);
    const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  return outPath;
}
