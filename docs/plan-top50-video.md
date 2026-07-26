# Planning — Video Long "Top 50 Game Roblox Harian"

> Status: **PLAN** (belum dibangun). Data siap 27 Juli 2026 (butuh 1 hari penuh di R2).
> Sumber data: R2 `ROBLOX_DB` → `/roblox-db?date=<H-1>` (lihat [[roblox-player-db]]).

## Keputusan final (di-lock)
| Aspek | Pilihan |
|---|---|
| **Metrik** | **Peak CCU** (angka utama) + **Avg CCU** (info kecil) — dari `series` R2 |
| **Format** | **16:9 landscape** (1920×1080) |
| **Audio** | **Musik latar** royalty-free + teks di layar (tanpa VO) |
| **Cakupan** | **Full Top 50**, target ~3.5–5 menit |
| **Label** | jujur: "Puncak/Rata-rata pemain online — <tanggal>" (bukan "total pemain") |
| **Bahasa** | minim-bahasa/universal (angka+icon) + metadata English utk discovery global |

## Struktur & timing
```
[Intro ~3s]   "TOP 50 GAME ROBLOX — <tanggal WIB>" + logo KodeGG
[#50 → #11]   ~3.5 dtk/kartu  (40 × 3.5 = 140s)
[#10 → #1]    ~5 dtk/kartu    (10 × 5 = 50s)  — klimaks, kartu lebih gede
[Outro ~5s]   CTA subscribe + kodegg.com
```
Total ≈ **~3.3 menit** (+ musik).

## Layout kartu game (1920×1080)
- Rangking gede (mis. "#42") — kiri
- Icon game (square ~420px)
- Nama game
- **Peak** pemain (angka besar) + **Avg** (kecil, di bawah)
- Watermark KodeGG
- Token warna brand: bg #090C12, surface #151B27, lime #CBFF46, mono 'Space Mono' utk angka

## Pipeline render (MVP = slideshow-kartu)
1. **Fetch** `/roblox-db?date=<H-1>` → parse `series` → hitung **peak (max)** & **avg (mean non-null)** per uid → urut peak desc → **top 50**
2. **Resolve icon:** cek `site/public/assets/roblox/<id>.png`; kalau tak ada → thumbnails API
   `https://thumbnails.roblox.com/v1/games/icons?universeIds=<uid>&size=512x512&format=Png`
   → download + cache
3. **Render 52 PNG** via `@napi-rs/canvas` (intro + 50 + outro), 1920×1080
4. **ffmpeg:** rangkai PNG (durasi per-kartu) + crossfade + **musik latar** → mp4
5. **Metadata + upload** (YouTube API; awalnya manual utk review, lalu auto)

## Otomasi
- Workflow **terpisah** `top50-video.yml`, jadwal harian **~01:00 WIB (18:00 UTC)** — setelah data H-1 dipadetin ke R2 (compaction jalan tiap ganti hari WIB)
- Baca R2 via worker (`/roblox-db`, butuh `TRIGGER_KEY` + URL worker sbg secret)
- 1 video/hari; tak ganggu pipeline kode hourly

## Kebutuhan baru (belum ada)
- [ ] File **musik latar** royalty-free (bundel di `worker/assets/`)
- [ ] Resolver **icon game non-kode** (thumbnails API + cache)
- [ ] Helper **peak/avg dari series** (di `worker/src/roblox-charts.mjs` atau modul render baru)
- [ ] **Renderer kartu 16:9** (beda dari render-short.mjs yang 9:16)
- [ ] **ffmpeg concat + musik** (image-seq → mp4)
- [ ] Workflow `top50-video.yml` + secret worker URL

## Fase
| Fase | Isi | Prasyarat |
|---|---|---|
| **1 — MVP** | slideshow statis, peak+avg, musik, auto-daily | data 1 hari (27 Jul) |
| **2 — Polish** | panah ▲▼ vs peringkat kemarin, count-up angka, transisi halus, VO intro opsional, auto-thumbnail | data 2 hari |
| **3 — Varian** | grafik bergerak (frame-by-frame animasi CCU), per-genre top 10, recap mingguan | — |

## Catatan
- Menit render (berat utk long video) **gratis** — repo public → Actions unlimited. Jaga 6 jam/job & disk (stream frame kalau nanti frame-by-frame di Fase 3).
- Grafik bergerak (yang user mau) = **Fase 3**, video type terpisah; datanya (`series` 10-menit) sudah dilog sejak awal.
