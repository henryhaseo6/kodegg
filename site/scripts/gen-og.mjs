// Generator OG image — site (ID/EN) + per-game. Jalankan dari site/: node scripts/gen-og.mjs
//
// FONT (kritis, sejarah panjang): sharp/librsvg TIDAK bisa dipakai untuk teks OG —
//  (1) di Windows mengabaikan fontconfig/@font-face → render font fallback sistem,
//      bukan Space Grotesk (terbukti: "Space Grotesk" == nama font palsu byte-identik);
//  (2) render <text>→<path> (opentype) pun buggy: path panjang kepotong diam-diam &
//      glyph berulang jadi blob.
// Solusi: render SEMUANYA di @napi-rs/canvas (rasterizer native, register TTF,
// fillText andal) → Space Grotesk PERSIS cut Google yang dipakai situs.
//
// TTF di scripts/ogfonts/ (di-commit; instance dari variable Google, lihat README).
import { writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTDIR = resolve(HERE, "ogfonts");
GlobalFonts.registerFromPath(resolve(FONTDIR, "SpaceGrotesk-700.ttf"), "SG7"); // wordmark, heading, nama game
GlobalFonts.registerFromPath(resolve(FONTDIR, "SpaceGrotesk-400.ttf"), "SG4"); // subtitle (proporsional, ringan)
GlobalFonts.registerFromPath(resolve(FONTDIR, "SpaceMono-Bold.ttf"), "SM"); // eyebrow, chip, meta (label/mono)

const { GAMES, iconUrl } = await import("../../worker/src/games.mjs");
const C = { bg: "#090c12", white: "#eef1f6", lime: "#cbff46", faint: "#8892a3", surface: "#151b27", stroke: "#263041", ok: "#37e38b" };

// Latar: base gelap + glow lime lembut kiri-atas (sesuai token situs).
function drawBg(ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, 1200, 630);
  const g = ctx.createRadialGradient(144, 113, 0, 144, 113, 660);
  g.addColorStop(0, "rgba(203,255,70,0.10)");
  g.addColorStop(1, "rgba(203,255,70,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 630);
  const p = ctx.createRadialGradient(1030, -60, 0, 1030, -60, 720);
  p.addColorStop(0, "rgba(139,107,255,0.12)");
  p.addColorStop(1, "rgba(139,107,255,0)");
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, 1200, 630);
}

const font = (family, size) => `${size}px "${family}"`;
// Tulis teks; kembalikan lebar (buat penempatan lanjutan). ls = letter-spacing px.
function text(ctx, s, x, y, { family = "SG7", size = 46, fill = C.white, ls = 0, align = "left" } = {}) {
  ctx.font = font(family, size);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = `${ls}px`;
  const w = ctx.measureText(s).width;
  ctx.textAlign = align;
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
  return w;
}
const widthOf = (ctx, s, family, size, ls = 0) => {
  ctx.font = font(family, size);
  ctx.letterSpacing = `${ls}px`;
  const w = ctx.measureText(s).width;
  ctx.letterSpacing = "0px";
  return w;
};

// Wordmark "KODEGG" dua-warna. s = skala. Kotak GG (favicon) digambar terpisah.
function wordmark(ctx, x, y, s, favImg) {
  ctx.drawImage(favImg, x, y, 88 * s, 88 * s);
  const bx = x + 104 * s, by = y + 60 * s, sz = 46 * s, ls = -0.5 * s;
  const w = text(ctx, "KODE", bx, by, { family: "SG7", size: sz, fill: C.white, ls });
  text(ctx, "GG", bx + w, by, { family: "SG7", size: sz, fill: C.lime, ls });
}

// Eyebrow: titik hijau + label mono lime, rata-kanan ke x≈1120, tengah vertikal ~80.
function eyebrow(ctx, t) {
  const size = 19, ls = 3;
  const tw = widthOf(ctx, t, "SM", size, ls);
  const rightText = 1120;
  ctx.beginPath();
  ctx.arc(rightText - tw - 19, 80, 6, 0, Math.PI * 2);
  ctx.fillStyle = C.ok;
  ctx.fill();
  text(ctx, t, rightText, 87, { family: "SM", size, fill: C.lime, ls, align: "right" });
}

const site = {
  id: { eye: "OTOMATIS · TIAP JAM", a: "Kode redeem, event &", b: "berita ", c: "game online", sub: ["Semua info game online live-service dalam", "satu tempat — ditarik otomatis dari sumber", "resmi, diperbarui tiap jam."], chips: ["Genshin", "Star Rail", "Zenless", "+ lainnya"] },
  en: { eye: "AUTOMATED · HOURLY", a: "Redeem codes, events &", b: "news for ", c: "online games", sub: ["All your online live-service game info in", "one place — pulled automatically from", "official sources, refreshed hourly."], chips: ["Genshin", "Star Rail", "Zenless", "+ more"] },
};

async function siteCard(d, favImg) {
  const cv = createCanvas(1200, 630);
  const ctx = cv.getContext("2d");
  drawBg(ctx);
  wordmark(ctx, 80, 56, 1, favImg);
  eyebrow(ctx, d.eye);
  text(ctx, d.a, 80, 245, { family: "SG7", size: 70, fill: C.white, ls: -2 });
  const bw = text(ctx, d.b, 80, 320, { family: "SG7", size: 70, fill: C.white, ls: -2 });
  text(ctx, d.c, 80 + bw, 320, { family: "SG7", size: 70, fill: C.lime, ls: -2 });
  d.sub.forEach((s, i) => text(ctx, s, 80, 398 + i * 38, { family: "SG4", size: 22, fill: C.faint }));
  let cx = 80;
  for (const c of d.chips) {
    const w = Math.round(widthOf(ctx, c, "SM", 18)) + 44;
    ctx.beginPath();
    ctx.roundRect(cx, 522, w, 52, 12);
    ctx.fillStyle = C.surface;
    ctx.fill();
    ctx.strokeStyle = C.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, c, cx + w / 2, 556, { family: "SM", size: 18, fill: C.lime, align: "center" });
    cx += w + 14;
  }
  return cv.toBuffer("image/png");
}

async function gameCard(id, favImg) {
  const name = GAMES[id].name;
  const cv = createCanvas(1200, 630);
  const ctx = cv.getContext("2d");
  drawBg(ctx);
  wordmark(ctx, 80, 60, 0.82, favImg);
  eyebrow(ctx, "REDEEM CODES");
  // Kotak ikon game (fallback: kotak surface bila ikon gagal dimuat).
  ctx.beginPath();
  ctx.roundRect(80, 215, 200, 200, 28);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  try {
    const ic = await loadImage(resolve("public" + iconUrl(id)));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(80, 215, 200, 200, 28);
    ctx.clip();
    ctx.drawImage(ic, 80, 215, 200, 200);
    ctx.restore();
  } catch {}
  let fs = name.length > 26 ? 46 : name.length > 18 ? 54 : 64;
  while (fs > 30 && widthOf(ctx, name, "SG7", fs, -1.5) > 858) fs -= 2;
  text(ctx, name, 320, 330, { family: "SG7", size: fs, fill: C.white, ls: -1.5 });
  text(ctx, "Active codes + archive · updated hourly · kodegg.com", 320, 385, { family: "SM", size: 21, fill: C.faint });
  return cv.toBuffer("image/png");
}

const favImg = await loadImage(resolve("public/assets/favicon-512.png"));
await writeFile("public/assets/og.png", await siteCard(site.id, favImg));
await writeFile("public/assets/og-en.png", await siteCard(site.en, favImg));
mkdirSync("public/assets/og/games", { recursive: true });
for (const id of Object.keys(GAMES)) {
  await writeFile(`public/assets/og/games/${id}.png`, await gameCard(id, favImg));
}
console.log(`✓ OG regenerated: og.png, og-en.png + ${Object.keys(GAMES).length} game cards`);
