// Generate redirect slug Roblox LAMA → slug sekarang, ditambahkan ke public/_redirects
// (dijalankan di prebuild). Tanpa ini, saat slug game berubah (sumber ganti nama /
// buang prefix "Roblox"), URL lama 404 & link di video YouTube lama mati.
//
// Sumber: worker/data/roblox-codes.json. Dibuat utk SEMUA game Roblox (redirect
// tak-terpakai = tak ada efek; mapping playlist bisa hilang saat migrasi, jadi
// jangan andalkan yt-playlists). Dua pola di-cover:
//   1. roblox-{slug} → {slug}  → migrasi buang prefix "Roblox" (mis. roblox-dog-race → dog-race)
//   2. {id} → {slug}           → id lama dipakai sebagai slug (mis. basketballzero → basketball-zero)
// Aman kalau redirect tak pernah dipakai (URL lama gak pernah ada) — tak ada efek.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MARKER = "# === AUTO: redirect slug Roblox lama → sekarang (gen-redirects.mjs) ===";
const CWD = process.cwd(); // = site/
const rd = (p, d) => { try { return JSON.parse(readFileSync(resolve(CWD, p), "utf8")); } catch { return d; } };
const rc = rd(process.env.KODEGG_ROBLOX || "../worker/data/roblox-codes.json", { games: {} });
const redirectsPath = resolve(CWD, "public/_redirects");

// Ambil bagian STATIK (manual, di atas MARKER); regenerate bagian AUTO tiap build.
const base = readFileSync(redirectsPath, "utf8").split(MARKER)[0].trimEnd();

const lines = [];
const seen = new Set();
const emit = (oldSlug, slug) => {
  if (!oldSlug || oldSlug === slug || seen.has(oldSlug)) return;
  seen.add(oldSlug);
  for (const lang of ["id", "en"]) {
    // trailingSlash:always → cover versi tanpa- & dengan-slash, target ber-slash (1 hop).
    lines.push(`/${lang}/roblox/${oldSlug}   /${lang}/roblox/${slug}/  301`);
    lines.push(`/${lang}/roblox/${oldSlug}/  /${lang}/roblox/${slug}/  301`);
  }
};

// Batasi ledakan baris (limit CF ~2000): prefix-migration tak ninggalin jejak di
// data, jadi pola-1 di-emit hanya utk game "notable" (≥2000 pemain = ambang yg
// bisa dapat video → link lama tersebar & perlu redirect). Pola-2 presisi (id
// beda slug = jejak rename nyata) → emit semua. Fix akar (universeId + slug-
// history → hanya slug yg BENER-BENER berubah) menyusul di refactor 1 Agt.
const NOTABLE = 2000;
for (const [id, g] of Object.entries(rc.games)) {
  const slug = g.slug || id;
  if (!slug.startsWith("roblox-") && (g.players || 0) >= NOTABLE) emit(`roblox-${slug}`, slug); // pola 1
  if (id !== slug) emit(id, slug); // pola 2 (presisi)
}

const out = `${base}\n\n${MARKER}\n${lines.join("\n")}\n`;
writeFileSync(redirectsPath, out);
console.log(`gen-redirects: ${seen.size} slug-lama → redirect (${lines.length} baris) utk ${Object.keys(rc.games).length} game Roblox`);
