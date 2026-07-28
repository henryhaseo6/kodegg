# Planning — Video Long "New Codes Roundup" (rekap kode baru harian)

> Status: **PLAN / IDE** (belum dibangun). Jadwal: pertimbangkan **pasca reset CF Pages 1 Agt 2026**
> (reuse infra Top 50 — lihat [[top50-video]] / `worker/video/render-top50.mjs`).
>
> Ide dari user (28 Jul 2026): video long harian yang me-rekap SEMUA kode NEW hari sebelumnya.

## Konsep
Setiap ganti hari (mis. 00:30 WIB, bareng/mirip Top 50), auto-generate **1 video LONG landscape**
berisi **semua kode NEW** yang terdeteksi hari sebelumnya (H-1). Format: kartu per-kode (icon game
+ kode + reward + nama game), musik + brand KodeGG — reuse gaya renderer Top 50.

**Pillar konten ke-3:** Shorts (discovery per-game) + Top 50 (ranking/evergreen) + **New Codes
Roundup** (utility/SEO). Channel 3 kaki.

## Prospek — penilaian
**Pros:**
- Long-form = **watch time + monetisasi** jauh lebih baik dari Shorts (RPM Shorts kecil).
- **SEO**: target search "roblox codes today" / "new roblox codes [tanggal]".
- **Repurpose**: kode + aset + data sudah ada dari pipeline → effort marginal kecil; renderer Top 50 reusable.
- Konsistensi upload harian → disukai algoritma.

**Cons / nuansa:**
- **Telat sehari** (rekap H-1). TIDAK fatal: kode redeem biasanya aktif berhari-hari → rekap
  kemarin masih works. Jujur di judul: "New codes added [tanggal]".
- Redundan dgn Shorts — tapi beda audiens (long-form vs scroller). OK.
- **Panjang variabel**: hari rame banyak kode, hari sepi 1-2 (risiko video "tipis").
- **Kuota YT**: +1 upload/hari → total ~95% (Shorts 50 + Top 50 + ini). Perlu dipantau; mungkin
  turunkan cap Shorts sedikit atau minta quota increase.

## Keputusan desain (rekomendasi)
- **BASIS = deteksi kode-baru pipeline** (`worker/data/new-roblox-codes.json` + `new-codes.json`),
  BUKAN "game yang dibuat Short" (itu arbitrer/ikut produksi). Lebih lengkap & independen.
- **Format**: "New Roblox Codes — [tanggal]" landscape 1920×1080. Kartu per-kode: icon game,
  kode (mono), reward, nama game (emoji Twemoji), badge NEW. Intro + outro + musik + SFX (reuse Top 50).
- **Deskripsi**: list semua kode + cara redeem + link kodegg.com per game (traffic ke situs).
  Timeline klik-able per game (seperti Top 50).
- **Hari sepi**: jika kode baru < N (mis. <3), SKIP hari itu ATAU akumulasi → fallback mingguan.

## Alternatif: MINGGUAN
"New Roblox Codes This Week" (1×/minggu) daripada harian:
- Lebih padat/substansial, tak ada risiko hari-tipis, hemat kuota, framing "this week" santai soal freshness.
- Tapi upload kurang sering (algoritma kurang "makan"). Trade-off frekuensi vs substansi.
- **Bisa hybrid**: harian kalau kode cukup, jatuh ke mingguan kalau sepi.

## Implementasi (reuse infra Top 50)
- **Renderer**: varian dari `worker/video/render-top50.mjs` — ganti "kartu ranking game" jadi
  "kartu kode" (bisa multi-kode per game atau 1 kartu per kode). Intro/outro/musik/SFX/emoji reuse.
- **Orchestrator**: `worker/make-codes-roundup.mjs` — baca new-codes data H-1, kelompokkan per game,
  resolve icon (cache), render, metadata (judul "New Roblox Codes — [tanggal]", deskripsi + link),
  upload YouTube + playlist "New Roblox Codes (Daily)".
- **Workflow**: `.github/workflows/codes-roundup.yml` — jadwal harian (mis. 00:40 WIB, setelah Top 50),
  `YT_PRIVACY: public`.
- **Naming game**: ikut [[roblox-naming-policy]] (nama asli + "Roblox" di judul SEO).

## Catatan
- Kuota: total upload/hari = Shorts (≤50) + Top 50 (1) + roundup (1). Cek jangan tembus 10rb unit
  YT (~95%). Opsi: turunkan cap Shorts atau apply quota increase.
- Reuse maksimal komponen Top 50 (render-top50.mjs, music.mjs, thumbnail collage konsep, ffmpegBin,
  font Anton/Twemoji) → build lebih ringan dari nol.
