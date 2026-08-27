# Alur Game Baru: RoCodes → Roblox Den → Roblox

Peta cara sebuah game Roblox masuk ke KodeGG, dan bagaimana identitasnya
dipastikan. Ditulis 4 Agu 2026 setelah dua kelas bug identitas ditemukan
(universeId salah, slug tak tercocokkan). **Masalah intinya: slug game berbeda di
tiap situs, dan nama bukan identitas.** Satu-satunya identitas sejati adalah
`universeId` Roblox.

```
                    ┌──────────────── SUMBER DAFTAR GAME ────────────────┐
                    │                                                     │
  (a) seed manual   (b) prevGames        (c) discovery         (d) den-scout
  ROBLOX_GAMES      (run sebelumnya)     explore-api Roblox    sitemap Den
  slug tetap        TANPA batas          7 sort, ~366 game     ekor panjang
                                         + unggulan RoCodes    >=2000 pemain
                    │                     dibatasi MAX_GAMES    maks 15/run
                    └──────────────────────┬──────────────────┘
                                           v
                        ┌─────── PENAMBALAN SLUG ───────┐
                        │ rocodesSlug: cari di sitemap   │
                        │   RoCodes (slug, id, ±roblox-) │
                        │ denSlug:    cari di sitemap    │
                        │   Den (id, rocodesSlug, ±pfx)  │
                        │ 404 dicatat → slug-404.json    │
                        └───────────────┬────────────────┘
                                        v
                        ┌──────── PENARIKAN ────────┐
                        │ RoCodes: digerbangi roAt   │
                        │ Den: digerbangi denAt,     │
                        │   KECUALI >=5000 pemain    │
                        │   atau pemain 0            │
                        │ dilewati → pakai simpanan  │
                        └───────────────┬────────────┘
                                        v
                    ┌────────── VERIFIKASI IDENTITAS ──────────┐
                    │ 1. needsVerify (token-match longgar):     │
                    │    universeId sumber HARUS == API Roblox  │
                    │    tak cocok → game DIBUANG               │
                    │ 2. universeId: RoCodes → placeId Den      │
                    │ 3. koreksi: pemain 0 + placeId Den beda   │
                    │    → pakai uid Den                        │
                    │ 4. dedupByUniverse: 2 slug 1 uid → gabung │
                    └───────────────────┬───────────────────────┘
                                        v
                                  data/roblox-codes.json
```

## Kenapa tiap langkah ada

**(a) seed manual** — game yang wajib ada, slug-nya dikunci tangan.

**(b) prevGames tanpa batas** — sekali masuk, game tak boleh terlempar keluar
hanya karena discovery run itu tak memuatnya. Konsekuensinya: cap `MAX_GAMES`
hanya membatasi jalur (c), dan makin penuh daftar makin sempit jatah game baru
(lihat catatan MAX_GAMES di src/roblox-games.mjs).

**(c) discovery** — dua jalur: slug persis dari homepage RoCodes (identitas
pasti), dan explore-api Roblox. Untuk yang kedua, nama game dicocokkan ke slug;
kalau tak exact, dipakai token-match longgar yang **wajib** diverifikasi
`universeId` — kalau gagal, game dibuang. Ini yang mencegah "Mansion Tycoon"
nyasar ke "sea-mansion-tycoon".

**(d) den-scout** — game yang sedang NAIK tak masuk chart Roblox, padahal di
situlah permintaan pencarian kode paling besar.

## Aturan identitas (yang mahal dipelajari)

1. **Nama bukan identitas.** `brainrot` ≠ `to-be-brainrot`, `fighting-simulator`
   ≠ `weapon-fighting-simulator`, `Dig` ≠ `Dig & Clean`. Pencocokan longgar
   berbasis nama HARUS lewat verifikasi universeId.
2. **universeId yang ADA pun bisa salah.** Anime Astral Simulator tersimpan
   sebagai kloning Portugis yang mati; gejalanya cuma "0 pemain" — dan efek
   nyatanya game 22 ribu pemain dengan 132 kode tak pernah dibuatkan video.
3. **placeId Den lebih dipercaya daripada universeId RoCodes** ketika keduanya
   berbeda dan uid lama menunjukkan 0 pemain: placeId adalah identitas halaman
   yang kodenya benar-benar kita pakai.
4. **Slug 404 bukan berarti game hilang.** 50 game slug RoCodes-nya mati tapi
   semuanya masih tertutup Den. Yang hilang cuma sumber kedua.

## Titik yang MASIH bisa meleset (per 4 Agu 2026)

| # | Celah | Dampak | Status |
|---|---|---|---|
| 1 | Penambal `denSlug` tak mencoba slug dari NAMA game | 1 game (`chainsaw-man-devils-heart`) tak terhubung ke Den | Sengaja dibiarkan — melonggarkan pencocokan pernah bikin salah kait |
| 2 | universeId salah yang menunjuk game LAIN yang RAMAI | Tak terdeteksi: koreksi otomatis hanya jalan bila pemain 0 | **Belum tertutup** |
| 3 | 50 slug RoCodes 404 | Game jalan dengan satu sumber, tak ada cross-check primer | Dicatat di `slug-404.json`, perlu tinjauan manual |
| 4 | `MAX_GAMES` membatasi hanya jalur discovery | Makin penuh daftar, makin sempit jatah game baru | Dinaikkan bertahap 400→600→800→900 (27 Agu 2026); perlu dipantau |
| 5 | Game Den-only tak pernah punya `rocodesSlug` | Tak ada sumber pembanding untuk kode | Diterima — Den sudah primer penuh |

Celah **#2** yang paling berbahaya karena benar-benar diam: kalau uid salah
menunjuk game lain yang ramai, jumlah pemainnya wajar, tak ada yang mencurigakan,
dan game itu bisa dibuatkan video dengan data pemain milik game lain. Satu-satunya
cara menutupnya adalah membandingkan `universeId` tersimpan dengan hasil resolve
`placeId` Den secara berkala — bukan hanya saat pemain 0.
