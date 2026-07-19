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
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTDIR = resolve(HERE, "ogfonts");
GlobalFonts.registerFromPath(resolve(FONTDIR, "SpaceGrotesk-700.ttf"), "SG7"); // wordmark, heading, nama game
GlobalFonts.registerFromPath(resolve(FONTDIR, "SpaceGrotesk-400.ttf"), "SG4"); // subtitle (proporsional, ringan)
GlobalFonts.registerFromPath(resolve(FONTDIR, "SpaceMono-Bold.ttf"), "SM"); // eyebrow, chip, meta (label/mono)

const { GAMES, iconUrl } = await import("../../worker/src/games.mjs");
const robloxGames = JSON.parse(readFileSync(resolve("../worker/data/roblox-codes.json"), "utf8")).games ?? {};
const C = { bg: "#090c12", white: "#eef1f6", lime: "#cbff46", faint: "#8892a3", surface: "#151b27", stroke: "#263041", ok: "#37e38b", acc2: "#8b6bff" };
const fmtPlayers = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));

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

// Eyebrow: titik + label mono, rata-kanan ke x≈1120, tengah vertikal ~80.
// accent = warna teks (default lime); dot = warna titik (default hijau).
function eyebrow(ctx, t, { accent = C.lime, dot = C.ok } = {}) {
  const size = 19, ls = 3;
  const tw = widthOf(ctx, t, "SM", size, ls);
  const rightText = 1120;
  ctx.beginPath();
  ctx.arc(rightText - tw - 19, 80, 6, 0, Math.PI * 2);
  ctx.fillStyle = dot;
  ctx.fill();
  text(ctx, t, rightText, 87, { family: "SM", size, fill: accent, ls, align: "right" });
}

const site = {
  id: { eye: "OTOMATIS · TIAP JAM", a: "Kode redeem, event &", b: "berita ", c: "game online", sub: ["Semua info kode game online & Roblox dalam", "satu tempat — ditarik otomatis dari sumber", "resmi, diperbarui tiap jam."], chips: ["Genshin", "Star Rail", "Roblox", "+ lainnya"] },
  en: { eye: "AUTOMATED · HOURLY", a: "Redeem codes, events &", b: "news for ", c: "online games", sub: ["Online game & Roblox codes info, all in one", "place — pulled automatically from official", "sources, refreshed hourly."], chips: ["Genshin", "Star Rail", "Roblox", "+ more"] },
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

// --- Kartu ROBLOX (aksen UNGU, ikon /assets/roblox/<id>.png) ---
async function robloxCard(id, name, players, favImg) {
  const cv = createCanvas(1200, 630);
  const ctx = cv.getContext("2d");
  drawBg(ctx);
  wordmark(ctx, 80, 60, 0.82, favImg);
  eyebrow(ctx, "ROBLOX · CODES", { accent: C.acc2, dot: C.acc2 });
  ctx.beginPath();
  ctx.roundRect(80, 215, 200, 200, 28);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  try {
    const ic = await loadImage(resolve(`public/assets/roblox/${id}.png`));
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
  // Subtitle STATIS (bukan player count) → kartu deterministik, aman di-commit &
  // di-cache crawler (player count berubah tiap jam).
  text(ctx, "Roblox codes + archive · updated hourly · kodegg.com", 320, 385, { family: "SM", size: 21, fill: C.faint });
  return cv.toBuffer("image/png");
}

// Kartu hub/landing Roblox (heading dua-warna ungu, chips game populer).
async function robloxLandingCard(heading, accentWord, sub, chips, favImg) {
  const cv = createCanvas(1200, 630);
  const ctx = cv.getContext("2d");
  drawBg(ctx);
  wordmark(ctx, 80, 56, 1, favImg);
  eyebrow(ctx, "ROBLOX · CODES", { accent: C.acc2, dot: C.acc2 });
  const hw = text(ctx, heading, 80, 262, { family: "SG7", size: 74, fill: C.white, ls: -2 });
  if (accentWord) text(ctx, accentWord, 80 + hw, 262, { family: "SG7", size: 74, fill: C.acc2, ls: -2 });
  sub.forEach((s, i) => text(ctx, s, 80, 342 + i * 38, { family: "SG4", size: 22, fill: C.faint }));
  let cx = 80;
  for (const c of chips) {
    const w = Math.round(widthOf(ctx, c, "SM", 18)) + 44;
    ctx.beginPath();
    ctx.roundRect(cx, 522, w, 52, 12);
    ctx.fillStyle = C.surface;
    ctx.fill();
    ctx.strokeStyle = "rgba(139,107,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, c, cx + w / 2, 556, { family: "SM", size: 18, fill: C.acc2, align: "center" });
    cx += w + 14;
  }
  return cv.toBuffer("image/png");
}

const favImg = await loadImage(resolve("public/assets/favicon-512.png"));
await writeFile("public/assets/og.png", await siteCard(site.id, favImg));
await writeFile("public/assets/og-en.png", await siteCard(site.en, favImg));
mkdirSync("public/assets/og/games", { recursive: true });
for (const id of Object.keys(GAMES)) {
  await writeFile(`public/assets/og/games/${id}.png`, await gameCard(id, favImg));
}

// Roblox: per-game + hub + promo.
mkdirSync("public/assets/og/roblox", { recursive: true });
for (const [id, g] of Object.entries(robloxGames)) {
  await writeFile(`public/assets/og/roblox/${id}.png`, await robloxCard(id, g.name, g.players ?? 0, favImg));
}
await writeFile(
  "public/assets/og/roblox-hub.png",
  await robloxLandingCard("Roblox ", "codes", ["Active codes for popular Roblox games —", "auto-updated & cross-checked. Blox Fruits,", "Blue Lock Rivals, Type Soul, and more."], ["Blox Fruits", "Blue Lock", "Type Soul", "+ more"], favImg),
);
await writeFile(
  "public/assets/og/roblox-promo.png",
  await robloxLandingCard("Roblox promo ", "codes", ["Free avatar item codes redeemed on", "roblox.com — verified from RoCodes &", "Roblox Den, updated hourly."], ["Free items", "roblox.com", "Verified"], favImg),
);

const nRoblox = Object.keys(robloxGames).length;
console.log(`✓ OG regenerated: og.png, og-en.png + ${Object.keys(GAMES).length} game + ${nRoblox} Roblox + hub/promo`);
