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

/** Teks bilingual: baris ID (utama) + baris EN (kecil, redup) di bawahnya.
 *  Dipakai utk semua teks TETAP (UI) — bukan utk data kode/reward, yg tetap apa adanya dari sumber. */
function bi(ctx, id, en, y, { idFont, enFont, idColor = C.txt, enColor = C.faint, gap, x = W / 2 } = {}) {
  // Jarak baris default diskalakan dari ukuran font (descender ID + ascender EN + napas),
  // biar baris EN tak nabrak ekor huruf 'g/p/y' di baris ID pada teks besar.
  const px = (f) => Number(/(\d+)px/.exec(f)?.[1] || 32);
  const dy = gap ?? Math.round(0.35 * px(idFont) + 0.95 * px(enFont));
  ctx.font = idFont; ctx.fillStyle = idColor; ctx.fillText(id, x, y);
  ctx.font = enFont; ctx.fillStyle = enColor; ctx.fillText(en, x, y + dy);
}

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

// Waktu tarik data dlm WIB (CI jalan di UTC) → "20 JUL 2026 · 19:31 WIB".
function fmtWIB(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month.toUpperCase()} ${p.year} · ${p.hour}:${p.minute} WIB`;
}

/** Render Short bisu. game={name,platform,players?}, codes=[{code,reward,isNew}] (maks 4 kartu),
 *  moreCount=sisa kode di situs → teaser "+N lagi", fetchedAt=waktu data ditarik (Date/ISO). */
export async function renderShort({ game, codes, iconPath, activeCount, moreCount = 0, fetchedAt, allMode = false, outPath }) {
  const stamp = fmtWIB(fetchedAt ? new Date(fetchedAt) : new Date());
  const iconImg = existsSync(iconPath) ? await loadImage(iconPath) : null;
  const MAX_CARDS = 4;
  const CODES = codes.slice(0, MAX_CARDS);
  const nActive = activeCount ?? codes.length;
  const isRoblox = game.platform === "ROBLOX";
  const accentPlat = isRoblox ? C.acc2 : C.acc;
  const platBg = isRoblox ? "rgba(139,107,255,0.12)" : "rgba(203,255,70,0.10)";
  const DUR = 21, N = DUR * FPS;

  function frame(ctx, t) {
    drawBG(ctx);
    logo(ctx, 60, 70, 0.62);
    // Transisi SEKUENSIAL (bukan crossfade): adegan lama fade-out sampai habis,
    // jeda sebentar, baru adegan berikutnya fade-in. Crossfade bikin dua lapis
    // teks kelihatan barengan (kartu kode tertimpa teks outro).
    const mainOut = inv(14.2, 14.7, t), outroIn = inv(14.9, 15.4, t);
    const outroOut = inv(17.0, 17.4, t), subIn = inv(17.55, 18.05, t);
    const mainA = 1 - mainOut, outro = outroIn * (1 - outroOut), subA = subIn;

    if (mainA > 0.01) {
      ctx.globalAlpha = mainA;
      // Stempel waktu tarik data (kanan atas) — bukti kode benar-benar fresh.
      ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
      ctx.font = "700 19px Mono"; ctx.fillStyle = C.faint; ctx.fillText("DITARIK · FETCHED", W - 60, 84);
      ctx.font = "700 24px Mono"; ctx.fillStyle = C.acc; ctx.fillText(stamp, W - 60, 116);
      ctx.textAlign = "center";
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

      const ha = inv(1.1, 1.9, t), hy = 600 + (1 - easeOut(ha)) * 30; // naik dikit: blok judul kini 2 bahasa
      ctx.globalAlpha = mainA * ha;
      ctx.font = "800 96px Grotesk"; ctx.fillStyle = C.acc; ctx.textAlign = "center";
      // allMode = game baru masuk pantauan: kodenya belum tentu baru, jadi
      // judulnya "SEMUA KODE" — jangan mengklaim baru kalau tak tahu umurnya.
      ctx.shadowColor = "rgba(203,255,70,0.3)"; ctx.shadowBlur = 30; ctx.fillText(allMode ? "SEMUA KODE" : "KODE BARU!", W / 2, hy); ctx.shadowBlur = 0;
      ctx.font = "700 38px Grotesk"; ctx.fillStyle = "rgba(203,255,70,0.6)"; ctx.fillText(allMode ? "ALL ACTIVE CODES" : "NEW CODES!", W / 2, hy + 68);
      ctx.globalAlpha = mainA * inv(1.3, 2.0, t);
      ctx.font = "700 52px Grotesk"; ctx.fillStyle = C.txt;
      let gname = game.name; while (ctx.measureText(gname).width > W - 120 && gname.length > 8) gname = gname.slice(0, -2);
      ctx.fillText(gname === game.name ? gname : gname + "…", W / 2, hy + 130);
      ctx.globalAlpha = mainA * inv(1.8, 2.5, t);
      bi(ctx, `${nActive} kode aktif · terverifikasi`, `${nActive} active code${nActive === 1 ? "" : "s"} · verified`, hy + 177,
        { idFont: "400 30px GroteskR", enFont: "400 27px GroteskR", idColor: C.muted, enColor: "#6E7788" });
      ctx.globalAlpha = mainA;

      // Layout adaptif: 1-3 kode → kartu besar; 4 kode → lebih rapat + reveal cepat.
      // Blok kartu sengaja diakhiri di ~1600 supaya baris teaser di bawahnya tetap
      // di atas ZONA OVERLAY player Shorts (handle @channel + judul menutupi
      // sekitar 200px paling bawah — dulu teaser "+N kode lagi" ketutup di situ).
      const nCards = CODES.length;
      const cardH = nCards >= 4 ? 168 : 200, gapC = nCards >= 4 ? 18 : 26, startY = nCards >= 4 ? 874 : 940;
      const cardSpacing = nCards >= 4 ? 2.0 : 2.4;
      CODES.forEach((c, i) => {
        const appear = 2.7 + i * cardSpacing, a = inv(appear, appear + 0.7, t); if (a <= 0) return;
        const y = startY + i * (cardH + gapC) + (1 - easeOut(a)) * 40, x = 70, w = W - 140;
        ctx.globalAlpha = mainA * a;
        rr(ctx, x, y, w, cardH, 26); ctx.fillStyle = C.surf; ctx.fill();
        // Kartu kode BARU (yg memicu video ini) ditonjolkan; kode lama lebih redup.
        ctx.lineWidth = c.isNew ? 3 : 2; ctx.strokeStyle = c.isNew ? "rgba(203,255,70,0.8)" : "rgba(203,255,70,0.22)";
        if (c.isNew) { ctx.shadowColor = "rgba(203,255,70,0.28)"; ctx.shadowBlur = 22; }
        ctx.stroke(); ctx.shadowBlur = 0;
        let badgeW = 0;
        if (c.isNew) { ctx.font = "700 24px Mono"; badgeW = ctx.measureText("BARU · NEW").width + 40; pill(ctx, x + w - badgeW - 24, y + 16, "BARU · NEW", C.acc, "rgba(203,255,70,0.12)"); ctx.textBaseline = "alphabetic"; }
        ctx.font = "800 26px Mono"; ctx.fillStyle = C.faint; ctx.textAlign = "left"; ctx.fillText(String(i + 1).padStart(2, "0"), x + 30, y + 44);
        ctx.font = "700 30px Grotesk"; ctx.fillStyle = C.muted;
        // Sumber kadang tak menyertakan reward → label generik (jangan mengarang isi hadiah).
        const rwFull = c.reward || "Reward in-game";
        const rwMax = w - 130 - (badgeW ? badgeW + 30 : 0);
        let rw = rwFull; while (ctx.measureText(rw).width > rwMax && rw.length > 6) rw = rw.slice(0, -2);
        ctx.fillText(rw === rwFull ? rw : rw + "…", x + 82, y + 44);
        const by = y + (nCards >= 4 ? 68 : 74), bh = nCards >= 4 ? 84 : 92;
        rr(ctx, x + 30, by, w - 60, bh, 16); ctx.fillStyle = "#0B0E14"; ctx.fill();
        ctx.setLineDash([9, 8]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(203,255,70,0.4)"; ctx.stroke(); ctx.setLineDash([]);
        let fs = 46; ctx.font = `700 ${fs}px Mono`; while (ctx.measureText(c.code).width > w - 90 && fs > 24) { fs -= 2; ctx.font = `700 ${fs}px Mono`; }
        // Baseline dihitung dari bounding box asli glyph → kode pas di tengah box (bukan faktor tebakan).
        const mc = ctx.measureText(c.code);
        const cy = by + bh / 2 + (mc.actualBoundingBoxAscent - mc.actualBoundingBoxDescent) / 2;
        ctx.fillStyle = C.acc; ctx.textAlign = "center"; ctx.fillText(c.code, W / 2, cy);
        ctx.globalAlpha = mainA;
      });

      if (inv(11.5, 12.2, t) > 0) {
        ctx.globalAlpha = mainA * inv(11.5, 12.2, t); ctx.textAlign = "center";
        if (moreCount > 0) {
          ctx.shadowColor = "rgba(203,255,70,0.3)"; ctx.shadowBlur = 20;
          bi(ctx, `+${moreCount} kode lagi di kodegg.com`, `+${moreCount} more code${moreCount === 1 ? "" : "s"} on kodegg.com`, 1650,
            { idFont: "700 38px Grotesk", enFont: "700 30px Grotesk", idColor: C.acc, enColor: "rgba(203,255,70,0.55)" });
          ctx.shadowBlur = 0;
        } else {
          bi(ctx, "Redeem cepat — sebagian cuma aktif beberapa hari", "Redeem fast — some expire within days", 1650,
            { idFont: "700 34px Grotesk", enFont: "700 28px Grotesk", idColor: C.warn, enColor: "rgba(255,177,60,0.6)" });
        }
      }
      ctx.globalAlpha = 1;
    }

    if (outro > 0.01) {
      const e = easeInOut(outroIn); ctx.globalAlpha = outro;
      logo(ctx, W / 2 - 150, 620, 1.5); ctx.textAlign = "center";
      bi(ctx, "Daftar lengkap + cara redeem", "Full list + how to redeem", 876 + (1 - e) * 20,
        { idFont: "800 72px Grotesk", enFont: "700 38px Grotesk", idColor: C.txt, enColor: C.faint });
      ctx.font = "800 92px Grotesk"; ctx.fillStyle = C.acc; ctx.shadowColor = "rgba(203,255,70,0.35)"; ctx.shadowBlur = 34; ctx.fillText("kodegg.com", W / 2, 1058); ctx.shadowBlur = 0;
      bi(ctx, "200+ game · terverifikasi · update tiap jam", "200+ games · verified · updated hourly", 1146,
        { idFont: "400 34px GroteskR", enFont: "400 30px GroteskR", idColor: C.muted, enColor: "#6E7788" });
      const t1 = "MOBILE", t2 = "ROBLOX"; ctx.font = "700 26px Mono";
      const w1 = ctx.measureText(t1).width + 44, w2 = ctx.measureText(t2).width + 44, g = 16, tw = w1 + g + w2, sx = W / 2 - tw / 2;
      ctx.textAlign = "left"; pill(ctx, sx, 1240, t1, C.acc, "rgba(203,255,70,0.10)"); pill(ctx, sx + w1 + g, 1240, t2, C.acc2, "rgba(139,107,255,0.12)");
      ctx.globalAlpha = 1;
    }

    if (subA > 0.01) {
      const e = easeOut(subA); ctx.globalAlpha = subA; ctx.textAlign = "center";
      logo(ctx, W / 2 - 100, 560, 1.1);
      bi(ctx, "Biar gak ketinggalan kode baru:", "Never miss a new code:", 776 + (1 - e) * 18,
        { idFont: "700 42px Grotesk", enFont: "700 32px Grotesk", idColor: C.txt, enColor: C.faint });
      const btnW = 430, btnH = 120, gapb = 46, bellS = 96, pairW = btnW + gapb + bellS, startX = W / 2 - pairW / 2, btnY = 900;
      rr(ctx, startX, btnY, btnW, btnH, 22); ctx.fillStyle = "#FF0033"; ctx.shadowColor = "rgba(255,0,51,0.45)"; ctx.shadowBlur = 34; ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = "800 54px Grotesk"; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText("SUBSCRIBE", startX + btnW / 2, btnY + btnH / 2 + 2); ctx.textBaseline = "alphabetic";
      const ring = t > 18.05 ? Math.sin((t - 18.05) * 26) * Math.exp(-(t - 18.05) * 2.6) * 0.42 : 0;
      drawBell(ctx, startX + btnW + gapb + bellS / 2, btnY + btnH / 2, bellS, C.acc, ring);
      bi(ctx, "Subscribe & nyalain loncengnya", "Subscribe & turn on the bell", 1110,
        { idFont: "400 36px GroteskR", enFont: "400 31px GroteskR", idColor: C.muted, enColor: "#6E7788" });
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
