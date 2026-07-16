# Skema Data JSON — PatchDay

Semua worker menulis JSON ke `data/`. Situs (SSG build atau client fetch) membaca file ini
dan me-render ke markup yang sudah ada. Di bawah: bentuk tiap file + pemetaan ke atribut
data di halaman `.dc.html`.

Semua teks konten disimpan bilingual bila memungkinkan: `{ "id": "...", "en": "..." }`.
Jargon teknis tanpa terjemahan resmi → biarkan satu string (bahasa asli).

---

## data/codes.json  → `Kode Redeem.dc.html`, `Beranda v2.dc.html`, per-game
```jsonc
{
  "updatedAt": "2026-07-16T09:00:00Z",
  "counts": { "active": 1240, "archived": 3600 },
  "active": [
    {
      "game": "hsr",                       // -> data-game / data-genre key
      "gameName": "Honkai: Star Rail",
      "code": "WAK84U29VLYP",              // -> <code> + tombol Salin (data-code)
      "reward": "100 Stellar Jade · 50.000 Credit", // VERBATIM
      "status": "active",                  // active | expired
      "perm": false,                        // true = "Tanpa batas"
      "endsAt": "2026-07-18T15:00:00Z",    // -> data-deadline (countdown realtime)
      "source": "hoyo-codes",
      "sourceUrl": "https://hsr.hoyoverse.com/gift"
    }
  ],
  "archive": [ /* bentuk sama, status:"expired", ada expiredAt. JANGAN dihapus */ ]
}
```
Kartu: `data-code-card data-game data-name data-search data-added data-expiry`.

## data/games.json  → `Jelajah Game.dc.html`, kartu game
```jsonc
{
  "updatedAt": "…",
  "games": [
    {
      "id": "gi",
      "name": "Genshin Impact",
      "genres": ["rpg", "gacha"],          // -> data-genre (multi, dipisah spasi)
      "rating": 4.6,                        // -> sort "rating"
      "pop": 4,                             // rank popularitas (0=teratas) -> sort "pop"
      "releasedAt": "2020-09-28",          // -> sort "new"
      "isNew": false,
      "cover": "/assets/games/gi.jpg",     // aset di-mirror sendiri
      "online": true,                       // WAJIB true; offline di-skip
      "pageUrl": "Game Genshin.dc.html"    // null jika halaman belum di-generate
    }
  ]
}
```

## data/events.json  → `Event.dc.html`, per-game
```jsonc
{
  "events": [
    {
      "game": "gi", "type": "banner",       // banner | event
      "title": { "id": "…", "en": "…" },
      "sub": "v6.6 fase 1",
      "desc": { "id": "…", "en": "…" },
      "rewards": ["…"],                     // chip; nama item VERBATIM
      "startsAt": "…", "endsAt": "…",       // -> data-deadline
      "characters": [{ "name": "Neuvillette", "icon": "…", "splash": "…" }],
      "source": "HoYoLAB", "sourceUrl": "…"
    }
  ]
}
```

## data/news.json  → `Berita.dc.html`, `Artikel.dc.html`
```jsonc
{
  "articles": [
    {
      "slug": "hsr-4-4-special-program",
      "game": "hsr",                        // atau "esports"
      "title": { "id": "…", "en": "…" },
      "excerpt": { "id": "…", "en": "…" },
      "image": "/assets/news/…jpg",
      "source": "HoYoLAB", "sourceUrl": "…",  // tampilkan cuplikan + link, JANGAN salin penuh
      "publishedAt": "…",
      "featured": true
    }
  ]
}
```

## data/tier.json  → `Tier List.dc.html`
```jsonc
{
  "games": {
    "hsr": {
      "version": "4.4",
      "tiers": {
        "S": [
          {
            "name": "Kafka",
            "icon": "…", "splash": "…",       // dari StarRailRes/Enka/Data Dragon
            "badges": ["Lightning", "Nihility", "★5"],
            "bio": { "id": "…", "en": "…" },  // editorial boleh sendiri
            "skills": [                        // VERBATIM dari sumber resmi
              { "name": "…", "desc": { "id": "…", "en": "…" } }
            ]
          }
        ],
        "A": [ … ], "B": [ … ]
      },
      "reference": ["Prydwen", "Game8"]        // kredit
    }
  }
}
```

---

## Catatan integrasi
- **Countdown**: elemen dengan `data-deadline="ISO"` dihitung realtime di klien (sudah ada di JS tiap halaman). Worker cukup isi ISO-nya.
- **i18n**: elemen chrome pakai `data-id`/`data-en`. Untuk SEO, render dua halaman statis per-bahasa + `hreflang`, jangan andalkan toggle klien.
- **Aset**: field `icon`/`cover`/`splash`/`image` idealnya URL di storage/CDN sendiri hasil mirror, bukan hotlink pihak ketiga.
- **Game baru**: tambahkan ke `games.json`, generate halaman dari `Game Genshin.dc.html`, daftarkan ke nav + `sitemap.xml` + mapping cross-link.
