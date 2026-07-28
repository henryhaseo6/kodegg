# Planning — Refactor Identitas & Naming Game Roblox

> Status: **PLAN** (belum dieksekusi). Jadwal: **pasca reset Cloudflare Pages (1 Agt 2026)** —
> karena mengubah slug/URL → butuh build + tes, tidak dilakukan saat freeze build.
>
> Keputusan naming (user, 28 Jul 2026): **nama asli di situs + "Roblox" di judul SEO** (Policy 1).

## 0. Prinsip inti: 1 game = 1 universeId
Sekarang identitas game = **slug dari NAMA sumber** → nama sumber ganti = id baru = duplikat
(dog-race vs roblox-dog-race, fish-it vs roblox-fish-it). Ke depan: identitas **di-anchor ke
`universeId`** (angka unik Roblox, tak pernah berubah). Sumber mau menyebut apa saja, patokan tetap universeId.

**Akar 3 gejala** yang sekarang ada: (1) nama salah ("Roblox SMILES/Knockout/Dog Race"),
(2) entry duplikat saat sumber ganti nama, (3) kode baru "nyasar" ke id lain → status baru
kepakai → tak jadi video. Semua akarnya sama = identitas ikut nama, bukan universeId.

## 1. Jantung: `worker/fetch-roblox.mjs`
| Langkah | Sekarang | Sesudah |
|---|---|---|
| ID game | slug dari nama sumber (RoCodes "Roblox SMILES" → `roblox-smiles`) | resolve universeId dulu; jika universeId sudah ada → **pakai id lama** (merge), tak bikin baru. ID di-set SEKALI, stabil |
| Nama kanonik | nama sumber (RoCodes) | dari **`rawName`** (nama asli Roblox) di-clean → "SMILES", "Dog Race" |
| Slug | dari nama sumber | dari nama asli → `smiles`, `dog-race` |

Efek: duplikat hilang di akar (dog-race + roblox-dog-race → 1 entry); kode baru tak nyasar.

## 2. Di SITUS
| Elemen | Sebelum | Sesudah |
|---|---|---|
| Nama heading/breadcrumb/search | "Roblox SMILES" | **"SMILES"** (asli) |
| URL | `/id/roblox/roblox-smiles/` | `/id/roblox/smiles/` |
| Tombol "Video di YouTube" | dari `yt-playlists.json` | tak berubah (jalan per game id) |
| URL yang BERUBAH | — | **hanya game yg kadung ke-prefix** (SMILES, Knockout, Dog Race + mendatang). Game yg sudah nama asli (Blox Fruits, MM2, Fish It) **tak berubah** |

### ⚠️ URL berubah → REDIRECT (agar link lama tak 404)
Video/deskripsi lama nge-link ke `/roblox-smiles/`. Simpan `oldSlug` per game → generate
redirect `/roblox-smiles/` → `/smiles/` (via `_redirects` Cloudflare Pages / Astro redirect).

## 3. Di YOUTUBE — `worker/video/metadata.mjs`
| Elemen | Sebelum | Sesudah |
|---|---|---|
| Judul video | `${name} Codes...` (tak konsisten: "Blox Fruits Codes" vs "Roblox SMILES Codes") | **`Roblox ${name} Codes...`** — template prepend "Roblox" utk platform ROBLOX (jika belum). Konsisten + SEO |
| Deskripsi | "Kode redeem {name}..." | "Kode redeem **Roblox** {name}..." (SEO) |
| Tags | ada "roblox codes" | + "roblox {name}", "roblox {name} codes" |
| Playlist title | "{name} Codes — Kode Redeem" | "**Roblox** {name} Codes — Kode Redeem" |
| Visual video | — | sudah pakai nama asli + emoji ✓ (tak berubah) |

### ⚠️ Playlist → cegah dobel saat transisi
Game lama (Blox Fruits) playlist-nya "Blox Fruits Codes — Kode Redeem", format baru
"Roblox Blox Fruits...". Solusi: **`plKey` strip prefix "roblox "** → dua format dianggap sama
→ playlist lama di-reuse, tak bikin baru. (`plKey` ada di `worker/video/upload.mjs`.)

Video existing di YT: yg sudah "Roblox X Codes" cocok policy → biarkan. Yg "Blox Fruits Codes"
(tanpa Roblox) → video lama biarkan, hanya video BARU dapat prefix.

## 4. Deteksi kode baru (ke-fix otomatis)
Karena 1 id per game, kode baru dari sumber manapun masuk ke id yang SAMA → terdeteksi benar
sebagai kode baru → auto-video jalan. Tak ada lagi kode nyasar & hilang status baru.

## 5. Migrasi one-time
1. **Redirect map** `oldSlug → newSlug` (game yg slug berubah) → link/video lama tak 404.
2. **plKey strip "roblox "** → playlist lama match, tak dobel.
3. Dampak terbatas: ~3 game existing (SMILES/Knockout/Dog Race) slug/nama berubah; sisanya aman.
4. Guard `[skip ci]` yg sudah live (purge+remap+dedup by universeId di fetch-roblox; skip video
   dup by universeId di make-videos) tetap dipakai — meng-handle transisi mulus.

## 6. Rollout (pasca 1 Agt)
1. Kerjakan di **branch** (bukan langsung main).
2. Tes lokal: run fetch-roblox → cek nama asli, id stabil, tak dup, redirect ter-generate.
3. Preview build situs lokal → cek URL + redirect + tombol YT.
4. Merge → deploy → verify production (1 build).
5. Pantau 1-2 run: judul video baru "Roblox X", playlist tak dobel, redirect jalan.

## Catatan
- Visual video sudah pakai nama asli + emoji (Twemoji) — scope B, SUDAH live.
- File terkait: `worker/fetch-roblox.mjs`, `worker/src/roblox-games.mjs` (slugify/registry),
  `worker/video/metadata.mjs` (judul/desc/tags/playlist), `worker/video/upload.mjs` (plKey),
  `worker/make-videos.mjs` (kandidat), situs Astro (page per-slug + `_redirects`).
