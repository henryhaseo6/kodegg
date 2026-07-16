# Project: KodeGG — Portal Info Game Online (Otomatis)

> Brand: **KodeGG** · domain: **kodegg.com** (logo: KODE putih + GG lime).

Situs portal informasi game **online / live-service** untuk Android (dan lintas platform), dengan konten yang dirancang untuk **auto-update** lewat pipeline/worker terjadwal.

## Arah & Ruang Lingkup (WAJIB dipatuhi)
- **FOKUS: game ONLINE / live-service saja.** Yang punya siklus konten berkelanjutan: event berkala, banner gacha, patch, dan kode redeem.
  - Genre yang dicakup: gacha/RPG (Genshin, Honkai: Star Rail, ZZZ, Wuthering Waves, NIKKE, Reverse:1999, Blue Archive), MOBA (Mobile Legends, Wild Rift, Honor of Kings, AoV), battle royale (Free Fire, PUBG Mobile, COD Mobile), idle/strategy online (AFK Journey, Whiteout Survival, Last War), MMORPG.
- **JANGAN bahas game offline / single-player.** Tidak ada kode redeem atau event berjalan → tidak cocok dengan model konten auto-update. Worker harus memfilter & melewati game offline.
- **JANGAN masukkan judi uang asli / slot / "gacor" / afiliasi taruhan.** Situs harus bersih dari judol. Sajikan info gacha secukupnya, jangan mendorong belanja berlebihan.

## Fitur inti
Kode redeem (prioritas utama), event & banner (dengan countdown real-time), tier list, guide/build, berita, database game, kalender/countdown event.

## Bahasa
Bilingual ID/EN (toggle di header, default ID). Teks pakai atribut `data-id` + `data-en`.

## Sistem visual
- Gaya gelap ala games.gg. Token warna di-set sebagai CSS vars pada wrapper tiap halaman: `--bg #090C12`, `--surface #151B27`, `--acc #CBFF46` (lime), `--acc2 #8B6BFF` (ungu), status `--ok #37E38B` / `--warn #FFB13C` / `--danger #FF5C77`.
- Font: 'Space Grotesk' (display/heading), 'Satoshi' (body), 'Space Mono' (mono/label/kode).
- Icon game = **gambar official** (bukan monogram tulisan). Sumber sementara: Fandom wikia CDN. Countdown = real-time (`data-deadline` + setInterval).
- JANGAN pakai emoji sebagai icon (mis. 💎🎁) — terlihat "AI". 

## Sifat data
Isi saat ini = **sample realistis**, belum live. Saat pipeline jalan, data ditarik real dari sumber (lihat "Riset Sumber Data.dc.html"): hoyo-codes, GamerPower, RAWG, FreeToGame, HoYoLAB, Enka.Network, StarRailRes, Riot Data Dragon, PandaScore, RSS. Tiap item sebaiknya punya link ke sumber aslinya. Untuk produksi, cache aset (icon/gambar) di server sendiri, jangan bergantung pihak ketiga.

## Fidelitas konten (WAJIB)
- **Data spesifik/faktual = VERBATIM dari sumber, jangan diparafrase.** Termasuk: deskripsi skill karakter, stat, efek, angka reward, nama & durasi event. Ambil apa adanya dari sumber resmi (mis. skill dari StarRailRes/Enka/HoYoWiki/Data Dragon).
- **Terjemahan hanya jika sumber tak punya versi Indonesia.** Kalau sumber sudah ada ID, pakai ID resmi. Kalau cuma EN/JP/CN, baru terjemahkan ke ID (tandai sebagai terjemahan) tanpa mengubah makna teknis.
- **Jargon/istilah khas game JANGAN diterjemahkan sendiri kalau tak ada terjemahan resmi.** Nama skill, mekanik, item, mode, elemen, status (mis. "Stellar Jade", "Bond of Life", "Pure Fiction", "Break Effect", "Trailblaze Power") dibiarkan dalam bahasa aslinya. Menerjemahkan sendiri berisiko salah makna. Terjemahkan hanya kalimat penghubung/penjelas, bukan istilah teknisnya.
- Teks editorial (ringkasan/bio pengantar, sudut pandang) boleh ditulis sendiri; data mekanik tidak.

## Halaman (Design Components)
- `Beranda v2.dc.html` — homepage (hero, trending, redeem, event & banner, tier list, berita). Urutan section: Redeem → Event → Tier → News.
- `Kode Redeem.dc.html` — semua kode: search+autocomplete, filter game, sort, muat-lebih-banyak, arsip kode expired (tidak dihapus).
- `Game Genshin.dc.html` — template halaman per-game (tab Kode/Event/Tier + arsip). Pola untuk game lain.
- `Tier List.dc.html` — tier list multi-game (portrait auto dari sumber).
- `Berita.dc.html` — berita (featured + grid, filter, muat-lebih-banyak).
- `Jelajah Game.dc.html` — database/browse game (search + filter genre + pagination).
- `Riset Sumber Data.dc.html` — dokumen referensi sumber data.

## Prinsip
Kode expired **diarsipkan, tidak dihapus** (jadi database). Situs dirancang siap-skala (search jadi pintu utama saat game makin banyak; tiap game punya halaman + arsip sendiri; worker auto-generate halaman game baru).
