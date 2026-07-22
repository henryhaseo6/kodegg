// Ambil daftar playlist YouTube channel → petakan ke game → tulis
// data/yt-playlists.json { <gameId>: <playlistId> }. Situs membacanya untuk
// menautkan tiap halaman game ke playlist kode-nya di YouTube.
//
// Kenapa file di-commit (bukan situs fetch langsung): build Cloudflare TAK punya
// kredensial YouTube. Jadi worker (punya kredensial di CI) yang menariknya dan
// meng-commit; situs cukup baca file. Aman-dilewati bila YT belum di-set.
//
// Judul playlist yg dibuat metadata.mjs: "<Nama Game> Codes — Kode Redeem"
// (sebagian lama tanpa "Codes"). Nama game diekstrak dari judul lalu dicocokkan
// ke registry mobile (games.mjs) & Roblox (roblox-codes.json).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, gameSlug } from "./src/games.mjs";
import { ytConfigured } from "./video/upload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/yt-playlists.json");

// "Gakuran Codes — Kode Redeem" / "Reverse: 1999 — Kode Redeem" → "gakuran" / "reverse 1999"
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function gameNameFromTitle(title) {
  return title.replace(/\s*—\s*Kode Redeem\s*$/i, "").replace(/\s+Codes$/i, "").trim();
}

async function listPlaylists() {
  const { google } = await import("googleapis");
  const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
  o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });
  const yt = google.youtube({ version: "v3", auth: o });
  const out = [];
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
    for (const p of r.data.items ?? []) out.push({ id: p.id, title: p.snippet?.title ?? "" });
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return out;
}

async function main() {
  if (!ytConfigured()) { console.log("YT belum di-set — lewati sync playlist."); return; }

  // Peta nama-ternormalisasi → gameId. Mobile dari registry, Roblox dari data.
  const byName = new Map();
  for (const [id, m] of Object.entries(GAMES)) byName.set(normalize(m.name), id);
  const rb = JSON.parse(readFileSync(resolve(HERE, "data/roblox-codes.json"), "utf8"));
  for (const [id, g] of Object.entries(rb.games ?? {})) if (g?.name) byName.set(normalize(g.name), id);
  const playlists = await listPlaylists();
  const map = {};
  let cocok = 0;
  for (const p of playlists) {
    // Vertikal promo (bukan game) → key khusus dibaca halaman promo-codes.
    // Dicek terpisah: gameNameFromTitle membuang "Codes" jadi tak cocok registry.
    if (/roblox promo/i.test(p.title)) { map["roblox-promo"] = p.id; cocok++; continue; }
    const id = byName.get(normalize(gameNameFromTitle(p.title)));
    if (id) { map[id] = p.id; cocok++; }
  }
  // urutkan key biar diff commit stabil
  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`✓ data/yt-playlists.json — ${cocok}/${playlists.length} playlist tercocokkan ke game.`);
  const takCocok = playlists.filter((p) => !/roblox promo/i.test(p.title) && !byName.has(normalize(gameNameFromTitle(p.title))));
  if (takCocok.length) console.log(`  (tak tercocokkan: ${takCocok.map((p) => p.title).join(", ")})`);
}

main().catch((e) => { console.error("fetch-yt-playlists gagal:", e.message); process.exit(0); });
