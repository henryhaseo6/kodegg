# Pengajuan Kenaikan Kuota YouTube Data API

Catatan siap-pakai untuk mengisi **YouTube API Services – Audit and Quota Extension Form**.
Angka di sini diambil dari data repo per **4 Agustus 2026** — perbarui sebelum mengirim.

## Alur resmi

1. Kuota default tiap Google Cloud project = **10.000 unit/hari**.
2. Untuk menambah, **wajib lolos API Compliance Audit dulu** — bukan sekadar minta.
   Sumber: <https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits>
3. Isi **YouTube API Services – Audit and Quota Extension Form** (tautannya ada di
   halaman itu). Tim API Services YouTube yang menghubungi balik.
4. Kalau sudah pernah diaudit dalam 12 bulan terakhir, permintaan tambahan berikutnya
   cukup kirim formulir yang sama tanpa audit penuh.
5. Waktu tunggu tak dijanjikan — siapkan diri untuk hitungan pekan, dan
   kemungkinan diminta klarifikasi/demo.

## Data proyek

| | |
|---|---|
| Aplikasi | KodeGG — portal kode redeem game online & Roblox (kodegg.com) |
| Cara pakai API | Mengunggah video Shorts ke **channel milik sendiri**, membuat playlist per game, memasang thumbnail, memposting satu komentar informasi |
| Endpoint dipakai | `videos.insert`, `thumbnails.set`, `playlists.insert`, `playlistItems.insert`, `commentThreads.insert`, `playlists.list` |
| Bukan | Tidak mengambil data pengguna lain, tidak mengunggah ke channel pihak ketiga, tidak menyalin konten orang lain |

## Angka pemakaian (per 4 Agu 2026)

| Metrik | Nilai |
|---|---|
| Rentang data | 23 Jul – 3 Agu 2026 (12 hari) |
| Total video terunggah | 277 |
| Upload/hari | rata-rata **23**, median 23, puncak **45** |
| Tren | 15 → 30 video/hari (naik ~100% dalam 2 pekan) |
| Pemakaian terukur | **9.810 unit untuk 47 upload** (Cloud console, 3 Agu) → **~209 unit/video** |
| Batas efektif sekarang | ~47 video/hari sebelum kuota habis |
| Playlist dikelola | 204 |
| Game dipantau | 427 |
| Kode aktif dilacak | 7.324 |

**Kebutuhan yang diminta:** ~25.000 unit/hari (ruang untuk ~90–100 video/hari,
sejalan dengan tren pertumbuhan 2 pekan terakhir).

## Yang perlu disiapkan sebelum mengisi

- **Project number** Google Cloud (bukan nama project).
- **Tautan channel** YouTube tujuan.
- Penjelasan singkat: kenapa upload otomatis — kode redeem game berumur pendek
  (sebagian mati dalam hitungan jam), jadi publikasi manual tak memungkinkan.
- Tautan situs (kodegg.com) sebagai konteks: video adalah turunan dari data yang
  sudah dikurasi di situs, bukan konten massal tanpa isi.

## Risiko yang harus diakui jujur

- Auditnya menilai **kepatuhan**, bukan cuma kebutuhan teknis. Model kita —
  unggah otomatis bervolume tinggi dengan template seragam — adalah pola yang
  memang mereka teliti terkait kebijakan spam/konten berulang. Siapkan argumen
  bahwa tiap video berisi data berbeda (kode, game, tanggal) dan bernilai bagi
  penonton yang mencarinya (~90% tayangan datang dari YouTube Search).
- **Jangan** mengakali dengan menambah Google Cloud project untuk melipatgandakan
  kuota satu channel. Kode kita mendukungnya (`YT_CLIENT_ID_2`..`_9`, rotasi
  otomatis) tapi itu umumnya dianggap mengakali batas kuota, dan taruhannya
  channel yang sudah jalan.
- Batas jumlah upload per channel per hari (~100) **tetap berlaku** walau kuota
  API naik. Kenaikan kuota memperbesar ruang API, bukan hak unggah.

## Kapan sebaiknya diajukan

Belum mendesak. Dari 12 hari data, hanya 2 hari yang mentok cap — dan salah
satunya (3 Agu) tercemar 9 video kembar akibat bug run-dibatalkan yang sudah
diperbaiki. Sinyal sungguhan bahwa kuota kurang adalah **antrean
`pending-videos.json` yang menumpuk lintas hari**, bukan sekadar sekali mentok.
