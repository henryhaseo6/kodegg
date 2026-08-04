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
  const daftarkan = (kunci, id) => { const k = normalize(kunci || ""); if (k && !byName.has(k)) byName.set(k, id); };
  for (const [id, m] of Object.entries(GAMES)) daftarkan(m.name, id);
  const rb = JSON.parse(readFileSync(resolve(HERE, "data/roblox-codes.json"), "utf8"));
  for (const [id, g] of Object.entries(rb.games ?? {})) {
    if (!g) continue;
    daftarkan(g.name, id);
    // Alias tambahan. Nama game BERUBAH di sumber (RoCodes menambahkan
    // "(Shinobi Life 2)" ke Shindo Life, 4 Agu 2026) → judul playlist lama tak
    // lagi cocok → entri hilang → tombol "Video di YouTube" lenyap dari halaman
    // game padahal videonya ada. Alias ini membuat perubahan nama semacam itu
    // tak langsung memutus pemetaan.
    daftarkan(String(g.name || "").replace(/\s*\([^)]*\)\s*/g, " "), id); // nama tanpa tanda kurung
    daftarkan(g.slug, id);
    daftarkan(id, id);
  }
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
  // CARRY-FORWARD: pemetaan yang sudah benar TIDAK boleh hilang hanya karena
  // judul tak lagi cocok. Berkas ini dibangun ulang dari nol tiap run, jadi
  // tanpa ini satu perubahan nama di sumber langsung menghapus entri yang sah.
  // Dipertahankan hanya bila playlist-nya MASIH ADA di channel dan game-nya
  // masih kita pantau — kalau playlist dihapus, entrinya memang harus gugur.
  try {
    const lama = JSON.parse(readFileSync(OUT, "utf8"));
    const idAda = new Set(playlists.map((p) => p.id));
    const gameAda = (id) => id === "roblox-promo" || !!rb.games?.[id] || !!GAMES[id];
    let dipertahankan = 0;
    for (const [gid, plid] of Object.entries(lama)) {
      if (!map[gid] && idAda.has(plid) && gameAda(gid)) { map[gid] = plid; dipertahankan++; }
    }
    if (dipertahankan) console.log(`  ${dipertahankan} pemetaan dipertahankan dari run sebelumnya (judul tak lagi cocok, playlist masih ada)`);
  } catch { /* pertama kali / berkas belum ada */ }

  // urutkan key biar diff commit stabil
  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`✓ data/yt-playlists.json — ${cocok}/${playlists.length} playlist tercocokkan ke game.`);
  const takCocok = playlists.filter((p) => !/roblox promo/i.test(p.title) && !byName.has(normalize(gameNameFromTitle(p.title))));
  if (takCocok.length) console.log(`  (tak tercocokkan: ${takCocok.map((p) => p.title).join(", ")})`);
}

main().catch((e) => { console.error("fetch-yt-playlists gagal:", e.message); process.exit(0); });
