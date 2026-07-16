# PatchDay — Handoff ke Produksi

Portal info **game online / live-service** (Android + lintas platform) dengan konten auto-update: kode redeem, event & banner, tier list, guide, berita, database game.

Front-end sudah jadi (folder root, file `*.dc.html`). Yang tersisa: bangun **worker penarik data + cache** dan **deploy**. Dokumen ini + `Cetak Biru Pipeline.dc.html` + `Riset Sumber Data.dc.html` adalah acuan utama.

---

## 1. Isi repo saat ini

**Halaman UI (Design Components — HTML, buka langsung di browser):**
- `Beranda v2.dc.html` — homepage (hero, trending, redeem, event, tier, berita)
- `Kode Redeem.dc.html` — semua kode: search+autocomplete, filter, sort, arsip expired
- `Event.dc.html` — event & banner semua game, countdown realtime
- `Tier List.dc.html` — tier list multi-game + modal detail karakter
- `Berita.dc.html` — berita (featured + grid, filter)
- `Artikel.dc.html` — halaman artikel berita (single)
- `Jelajah Game.dc.html` — database game (search + filter genre multi + sort)
- `Game Genshin.dc.html` — TEMPLATE halaman per-game (tab Kode/Event/Tier + arsip)
- `Tentang.dc.html`, `Kontak.dc.html`
- `support.js` — runtime Design Component (JANGAN diubah)
- `image-slot.js` — komponen slot gambar
- `_ds/…` — design system (token warna/font) untuk `Riset Sumber Data.dc.html`

**Dokumen acuan:**
- `Cetak Biru Pipeline.dc.html` — arsitektur, cadence cron, tech stack, SEO
- `Riset Sumber Data.dc.html` — daftar sumber, endpoint, lisensi, atribusi

**Starter backend (folder `worker/`):**
- `worker/fetch-codes.mjs` — contoh penarik kode redeem (hoyo-codes + GamerPower) → JSON
- `worker/schema.md` — skema data JSON semua fitur
- `worker/package.json`
- `worker/data/*.example.json` — contoh output

---

## 2. Arsitektur singkat

```
[Sumber: API/RSS/wiki]  →  [Worker cron: tarik+normalisasi]  →  [Cache: JSON/DB + aset di CDN sendiri]  →  [Situs statis baca cache]
```

Situs TIDAK memanggil API pihak ketiga langsung (hindari rate-limit, CORS, kunci bocor). Semua lewat cache.

Cadence (lihat cetak biru): kode ~1 jam · event ~3 jam · berita ~30 mnt · tier/katalog harian · data karakter per patch.

---

## 3. Cara front-end membaca data (yang perlu disambung)

Saat ini tiap halaman berisi **sample hard-coded** di markup. Untuk produksi, ganti sumbernya jadi baca JSON cache. Dua opsi:

**A. Static Site Generation (disarankan, ramah SEO)** — script build baca JSON cache, render halaman per-bahasa (`/id/…`, `/en/…`), tulis HTML statis. Rebuild dipicu tiap cache berubah (webhook/cron).

**B. Client fetch** — halaman `fetch('/data/codes.json')` saat load lalu render. Lebih simpel, tapi SEO lemah (butuh SSR/prerender untuk crawler).

Titik integrasi di markup sudah ditandai lewat atribut data (`data-code-card`, `data-game-card`, `data-deadline`, `data-genre`, dll) — lihat `worker/schema.md` untuk pemetaannya.

---

## 4. Aturan WAJIB (dari CLAUDE.md project)

- **Fokus game ONLINE / live-service saja.** Worker filter & skip game offline/single-player.
- **Bersih dari judol** — tidak ada judi uang asli/slot/afiliasi taruhan.
- **Data faktual VERBATIM dari sumber** (skill, stat, reward, nama/durasi event) — jangan diparafrase.
- **Jargon teknis game jangan diterjemahkan sendiri** kalau tak ada terjemahan resmi.
- **Kode expired diarsipkan, tidak dihapus** (jadi database).
- **Atribusi lisensi**: RAWG/GamerPower/FreeToGame wajib kredit; Riot "not endorsed by Riot Games". Mirror aset (icon/gambar) ke server sendiri.

---

## 5. Urutan build (fase)

1. Worker kode redeem (hoyo-codes + GamerPower) → `data/codes.json` → sambung ke `Kode Redeem` + `Beranda`.
2. Katalog game (RAWG + FreeToGame) → `data/games.json` → `Jelajah Game`.
3. Berita (RSS) → `data/news.json` → `Berita` + `Artikel`.
4. Event (HoYoLAB/Paimon) → `data/events.json` → `Event` + per-game.
5. Data karakter/tier (StarRailRes/Enka/Data Dragon) → `data/tier.json` → `Tier List`.
6. Auto-generate halaman game baru dari template + `sitemap.xml` + i18n per-bahasa.
7. Deploy: hosting statis + CDN, worker cron, domain + SSL.

Mulai dari langkah 1 — sudah ada contohnya di `worker/fetch-codes.mjs`.
