// Generator OG image — site (ID/EN) + per-game. Jalankan dari site/: node scripts/gen-og.mjs
//
// PENTING: librsvg (sharp) TIDAK memuat @font-face woff2 data-URI, jadi font
// Space Grotesk/Space Mono disediakan lewat FONTCONFIG (TTF di scripts/.ogfonts,
// di-download otomatis). FONTCONFIG_FILE di-set SEBELUM import sharp.
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTDIR = resolve(HERE, ".ogfonts");
const P = (p) => p.split("\\").join("/");
// PENTING: pakai TTF STATIS Bold (weight 700 sudah baked-in). Variable font
// SpaceGrotesk[wght].ttf render di weight DEFAULT (~400, tipis) karena FreeType
// di libvips tak meng-apply weight axis → wordmark beda dari header situs (700).
const TTF = {
  "SpaceGrotesk-Bold.ttf": "https://raw.githubusercontent.com/floriankarsten/space-grotesk/master/fonts/ttf/static/SpaceGrotesk-Bold.ttf",
  "SpaceMono-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/spacemono/SpaceMono-Bold.ttf",
};
await mkdir(FONTDIR, { recursive: true });
for (const [f, u] of Object.entries(TTF)) {
  try { await access(resolve(FONTDIR, f)); } catch {
    const b = Buffer.from(await (await fetch(u, { redirect: "follow" })).arrayBuffer());
    await writeFile(resolve(FONTDIR, f), b);
  }
}
await writeFile(resolve(FONTDIR, "fonts.conf"),
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${P(FONTDIR)}</dir><cachedir>${P(FONTDIR)}/.cache</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = resolve(FONTDIR, "fonts.conf");

const sharp = (await import("sharp")).default;
const { GAMES, iconUrl } = await import("../../worker/src/games.mjs");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SG = "Space Grotesk", SM = "Space Mono";
const BG = `<rect width="1200" height="630" fill="#090c12"/><defs><radialGradient id="glow" cx="12%" cy="18%" r="55%"><stop offset="0%" stop-color="#cbff46" stop-opacity="0.10"/><stop offset="100%" stop-color="#cbff46" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#glow)"/>`;
const wordmark = (x, y, s) => `<text x="${x + 104 * s}" y="${y + 60 * s}" font-family="${SG}" font-weight="700" font-size="${46 * s}" letter-spacing="-0.5"><tspan fill="#eef1f6">KODE</tspan><tspan fill="#cbff46">GG</tspan></text>`;
const eyebrow = (t) => { const w = t.length * 15 + 26; return `<g transform="translate(${1120 - w},86)"><circle cx="7" cy="-6" r="6" fill="#37e38b"/><text x="26" y="0" font-family="${SM}" font-weight="700" font-size="19" fill="#cbff46" letter-spacing="3">${esc(t)}</text></g>`; };
const svgBuf = (svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
const compose = (base, comps) => sharp(base).composite(comps).png({ compressionLevel: 9 }).toBuffer();
const favBig = await sharp("public/assets/favicon-512.png").resize(88, 88).png().toBuffer();
const favSm = await sharp("public/assets/favicon-512.png").resize(72, 72).png().toBuffer();
const mask = Buffer.from(`<svg width="200" height="200"><rect width="200" height="200" rx="28" fill="#fff"/></svg>`);
const site = {
  id: { eye: "OTOMATIS · TIAP JAM", a: "Kode redeem, event &", b: "berita ", c: "game online", sub: ["Semua info game online live-service dalam", "satu tempat — ditarik otomatis dari sumber", "resmi, diperbarui tiap jam."], chips: ["Genshin", "Star Rail", "Zenless", "+ lainnya"] },
  en: { eye: "AUTOMATED · HOURLY", a: "Redeem codes, events &", b: "news for ", c: "online games", sub: ["All your online live-service game info in", "one place — pulled automatically from", "official sources, refreshed hourly."], chips: ["Genshin", "Star Rail", "Zenless", "+ more"] },
};
function siteSvg(d) {
  let cx = 80; const chips = d.chips.map((c) => { const w = 40 + c.length * 12; const el = `<g transform="translate(${cx},522)"><rect width="${w}" height="52" rx="12" fill="#151b27" stroke="#263041"/><text x="${w / 2}" y="34" font-family="${SM}" font-weight="700" font-size="18" fill="#cbff46" text-anchor="middle">${esc(c)}</text></g>`; cx += w + 14; return el; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${BG}${wordmark(80, 56, 1)}${eyebrow(d.eye)}
    <text x="80" y="245" font-family="${SG}" font-weight="700" font-size="70" fill="#eef1f6" letter-spacing="-2">${esc(d.a)}</text>
    <text x="80" y="320" font-family="${SG}" font-weight="700" font-size="70" letter-spacing="-2" xml:space="preserve"><tspan fill="#eef1f6">${esc(d.b)}</tspan><tspan fill="#cbff46">${esc(d.c)}</tspan></text>
    ${d.sub.map((s, i) => `<text x="80" y="${398 + i * 38}" font-family="${SM}" font-weight="700" font-size="21" fill="#8892a3">${esc(s)}</text>`).join("")}${chips}</svg>`;
}
await writeFile("public/assets/og.png", await compose(await svgBuf(siteSvg(site.id)), [{ input: favBig, left: 80, top: 56 }]));
await writeFile("public/assets/og-en.png", await compose(await svgBuf(siteSvg(site.en)), [{ input: favBig, left: 80, top: 56 }]));
await mkdir("public/assets/og/games", { recursive: true });
for (const id of Object.keys(GAMES)) {
  const name = GAMES[id].name;
  const fs = name.length > 26 ? 46 : name.length > 18 ? 54 : 64;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${BG}${wordmark(80, 60, 0.82)}${eyebrow("REDEEM CODES")}
    <rect x="80" y="215" width="200" height="200" rx="28" fill="#151b27" stroke="#263041"/>
    <text x="320" y="330" font-family="${SG}" font-weight="700" font-size="${fs}" fill="#eef1f6" letter-spacing="-1.5">${esc(name)}</text>
    <text x="320" y="385" font-family="${SM}" font-weight="700" font-size="21" fill="#8892a3">Active codes + archive · updated hourly · kodegg.com</text></svg>`;
  const comps = [{ input: favSm, left: 80, top: 60 }];
  try { const ic = await sharp("public" + iconUrl(id)).resize(200, 200).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(); comps.push({ input: ic, left: 80, top: 215 }); } catch {}
  await writeFile(`public/assets/og/games/${id}.png`, await compose(await svgBuf(svg), comps));
}
console.log(`✓ OG regenerated: og.png, og-en.png + ${Object.keys(GAMES).length} game cards`);
