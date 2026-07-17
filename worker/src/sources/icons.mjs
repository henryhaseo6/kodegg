// Sumber ICON game — RANTAI banyak penyedia.
//
// Tiap adapter memulangkan Buffer PNG kotak (≥512px) atau melempar error.
// firstOk mencoba berurutan sampai satu berhasil:
//   1. apple   iTunes Lookup API   — JSON resmi, artworkUrl512 → PNG
//   2. play    Play Store details  — og:image (play-lh…), dis-resize =s512
//
// Keduanya resmi (icon publisher), tak diblokir dari Node, kotak, versi terkini.
// Fandom sengaja TIDAK dipakai: kini diblokir Cloudflare dari Node.

import { firstOk } from "../chain.mjs";

const isPng = (b) => b.length > 2048 && b[0] === 0x89 && b[1] === 0x50;

async function fetchBytes(url, ua) {
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// --- Adapter 1: App Store (iTunes Lookup) ---
async function appleIcon(meta, ua) {
  if (!meta.appleId) throw new Error("tanpa appleId");
  const res = await fetch(
    `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(meta.appleId)}`,
    { headers: { "User-Agent": ua } },
  );
  if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
  const app = (await res.json()).results?.[0];
  if (!app) throw new Error("bundleId tak ditemukan");

  const art = app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60;
  if (!art) throw new Error("artworkUrl kosong");
  // .../100x100bb.jpg → PNG 512px (mendukung transparansi, tanpa artefak JPEG)
  const png = art.replace(/\/\d+x\d+[a-z]*\.(jpg|png|webp)$/i, "/512x512bb.png");

  const bytes = await fetchBytes(png, ua);
  if (!isPng(bytes)) throw new Error("bukan PNG");
  return bytes;
}

// --- Adapter 2: Play Store (og:image) ---
async function playIcon(meta, ua) {
  if (!meta.androidId) throw new Error("tanpa androidId");
  const browserUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  const res = await fetch(
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(meta.androidId)}&hl=en`,
    { headers: { "User-Agent": browserUA } },
  );
  if (!res.ok) throw new Error(`page HTTP ${res.status}`);
  const html = await res.text();

  const m = html.match(/https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_-]+/);
  if (!m) throw new Error("icon tak ditemukan di halaman");

  const bytes = await fetchBytes(`${m[0]}=s512`, browserUA);
  if (!isPng(bytes)) throw new Error("bukan PNG");
  return bytes;
}

const PROVIDERS = [
  { name: "apple", run: appleIcon },
  { name: "play", run: playIcon },
];

/**
 * @returns {Promise<{ bytes: Buffer|null, source: string|null }>}
 */
export async function fetchIcon(meta, { userAgent, log = () => {} }) {
  const { value, source } = await firstOk(
    PROVIDERS.map((p) => ({ name: p.name, run: () => p.run(meta, userAgent) })),
    { accept: (b) => b instanceof Buffer && isPng(b), log },
  );
  return { bytes: value, source };
}
