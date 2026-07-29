// Kamus ID/EN untuk teks chrome (label UI), BUKAN untuk data game.
//
// Data faktual (reward, nama item) tidak pernah lewat sini — CLAUDE.md melarang
// menerjemahkan jargon game sendiri. "Stellar Jade", "Primogem", "Polychrome"
// tetap apa adanya dari sumber.
//
// Tiap bahasa dirender jadi halaman statis terpisah (/id/…, /en/…) + hreflang.
// Toggle bahasa di klien tidak cukup: crawler hanya melihat satu versi.

export const LANGS = ["id", "en"];
export const DEFAULT_LANG = "id";

const DICT = {
  id: {
    "nav.discover": "Jelajah",
    "nav.saved": "Favorit",
    "nav.codes": "Kode",
    "nav.news": "Berita & Event",

    "page.live": "LIVE · DIPERBARUI TIAP JAM",
    "page.title": "Semua kode redeem",
    "page.desc":
      "Kode aktif ditarik langsung dari sumber resmi tiap jam. Kode kadaluarsa tidak dihapus — diarsipkan jadi database lengkap.",
    "page.metaTitle": "Kode Redeem Game Online Terbaru — KodeGG",
    "page.metaDesc":
      "Kumpulan kode redeem aktif Genshin Impact, Honkai: Star Rail, Zenless Zone Zero, dan Honkai Impact 3rd. Diperbarui otomatis tiap jam, lengkap dengan arsip kode kadaluarsa.",

    "stat.active": "kode aktif",
    "stat.games": "game",
    "stat.archived": "kode diarsip",

    "ctl.search": "Cari game, reward, atau kode…",
    "ctl.allGames": "Semua game",
    "ctl.sortNew": "Terbaru",
    "ctl.sortAZ": "Nama A–Z",
    "ctl.shown": "kode aktif ditampilkan",
    "ctl.empty": "Tidak ada kode yang cocok. Coba kata kunci atau game lain.",
    "ctl.more": "Muat lebih banyak",

    "card.active": "AKTIF",
    "card.check": "CEK DULU",
    "card.checkHint": "Sumber belum konfirmasi ulang kode ini masih works — coba dulu di game, jangan terlalu berharap.",
    "card.new": "BARU",
    "card.expired": "KADALUARSA",
    "card.copy": "Salin",
    "card.copied": "Tersalin ✓",
    "card.claim": "Klaim",
    "card.seen": "Terpantau",
    "card.noReward": "Rincian reward tidak disediakan sumber",
    "card.rewardNote": "Reward apa adanya dari sumber",
    "card.stale": "Sumber sedang tidak dapat dihubungi — data terakhir yang diketahui",

    "arch.title": "Arsip kode kadaluarsa",
    "arch.desc":
      "Kode yang sudah tidak berlaku. Tidak dihapus supaya tetap bisa ditelusuri.",
    "arch.count": "kode diarsipkan",
    "arch.expiredOn": "Kadaluarsa",
    "arch.noMatch": "Tidak ada kode arsip yang cocok dengan filter ini.",
    "arch.emptyTitle": "Arsip masih kosong",
    "arch.emptyDesc":
      "Kode akan pindah ke sini otomatis begitu hilang dari sumber resminya.",

    "how.title": "Cara pakai kode redeem",
    "how.step1": "Salin kode di atas.",
    "how.step2":
      "Buka menu redeem — lewat situs resmi game (mis. HoYoverse) atau langsung di dalam game (Pengaturan → Redeem/Exchange Code), tergantung gamenya.",
    "how.step3": "Login, tempel kode, lalu klaim. Reward masuk lewat in-game mail.",
    "how.note":
      "Kode punya batas wilayah dan level akun. Kalau ditolak, kemungkinan kode sudah habis kuota atau tidak berlaku di server kamu.",

    "cat.metaTitle": "Jelajah Game Online — Database Game | KodeGG",
    "cat.metaDesc":
      "Jelajahi game online & live-service populer: gacha/RPG, MOBA, battle royale, strategi. Cari, filter genre, dan lihat kode redeem tiap game di KodeGG.",
    "cat.title": "Jelajah game online",
    "cat.desc":
      "Database game online & live-service. Cari, saring per genre, dan buka kode redeem tiap game.",
    "cat.search": "Cari nama game…",
    "cat.all": "Semua",
    "cat.sortPop": "Populer",
    "cat.sortNew": "Terbaru",
    "cat.sortRating": "Rating",
    "cat.sortAZ": "A–Z",
    "cat.sortBy": "Urutkan",
    "cat.shown": "game ditampilkan",
    "cat.hasCodes": "Ada kode",
    "cat.viewCodes": "Lihat kode",
    "cat.browseOnly": "Segera hadir",
    "cat.empty": "Tidak ada game yang cocok. Coba kata kunci atau genre lain.",
    "cat.more": "Muat lebih banyak",

    "feed.live": "LIVE · DIPERBARUI TIAP JAM",
    "feed.title": "Berita & event terbaru",
    "feed.desc": "Semua update dari game yang kamu ikuti dalam satu aliran — event berlangsung (dengan hitung mundur) dan berita, diurut dari yang terbaru. Klik untuk detail & buka sumbernya.",
    "feed.metaTitle": "Berita & Event Game Online Terbaru — KodeGG",
    "feed.metaDesc": "Berita dan event terbaru game online: Genshin, Honkai: Star Rail, Zenless Zone Zero, Honkai Impact 3rd, Tears of Themis. Dari sumber resmi HoYoLAB, diperbarui otomatis.",
    "feed.all": "Semua",
    "feed.events": "Event",
    "feed.news": "Berita",
    "feed.archive": "Arsip",
    "feed.open": "Buka",
    "feed.shown": "item ditampilkan",
    "feed.empty": "Belum ada yang cocok dengan pilihan ini.",

    "news.metaTitle": "Berita Game Online Terbaru — KodeGG",
    "news.metaDesc":
      "Berita & update terbaru game online: Genshin, Honkai, Zenless, Wuthering Waves, Mobile Legends, Free Fire, dan lainnya. Dikurasi dari sumber tepercaya.",
    "news.title": "Berita game online",
    "news.desc": "Update terbaru dari game yang kamu ikuti. Cuplikan singkat — klik untuk baca lengkap di sumbernya.",
    "news.all": "Semua game",
    "news.featured": "Sorotan",
    "news.shown": "berita ditampilkan",
    "news.read": "Baca di sumber",
    "news.empty": "Belum ada berita untuk pilihan ini.",
    "news.more": "Muat lebih banyak",
    "news.via": "via",

    "ev.metaTitle": "Event & Banner Game Online — Countdown | KodeGG",
    "ev.metaDesc":
      "Event & banner gacha yang sedang berlangsung: Genshin, Honkai: Star Rail, Zenless Zone Zero. Lengkap dengan countdown real-time kapan berakhir.",
    "ev.title": "Event & banner",
    "ev.desc": "Yang lagi berlangsung sekarang, plus hitung mundur kapan berakhir. Jangan sampai kelewat.",
    "ev.all": "Semua game",
    "ev.allType": "Semua",
    "ev.banner": "Banner",
    "ev.event": "Event",
    "ev.endsIn": "Berakhir dalam",
    "ev.ended": "Berakhir",
    "ev.starts": "Mulai",
    "ev.shown": "sedang berlangsung",
    "ev.empty": "Tidak ada yang cocok dengan filter ini.",
    "ev.more": "Muat lebih banyak",
    "ev.close": "Tutup",

    "fav.metaTitle": "Game Favorit — KodeGG",
    "fav.metaDesc": "Game yang kamu simpan di KodeGG. Akses cepat ke kode & event game favoritmu.",
    "fav.title": "Game favorit",
    "fav.desc": "Game yang kamu simpan. Klik ikon hati di Jelajah Game untuk menambah.",
    "fav.empty": "Belum ada favorit. Buka Jelajah Game dan klik ikon hati untuk menyimpan.",
    "fav.browse": "Jelajah Game",

    "foot.updated": "Terakhir diperbarui",
    "foot.sources": "Sumber data",
    "foot.disclaimer":
      "KodeGG bukan situs resmi dan tidak berafiliasi dengan HoYoverse atau penerbit game mana pun. Seluruh nama game, item, dan aset adalah milik pemiliknya masing-masing.",
    "foot.attribution": "Data giveaway disediakan oleh GamerPower.",
  },
  en: {
    "nav.discover": "Discover",
    "nav.saved": "Saved",
    "nav.codes": "Codes",
    "nav.news": "News & Events",

    "page.live": "LIVE · UPDATED HOURLY",
    "page.title": "All redeem codes",
    "page.desc":
      "Active codes pulled straight from official sources every hour. Expired codes aren't deleted — they're archived into a full database.",
    "page.metaTitle": "Latest Online Game Redeem Codes — KodeGG",
    "page.metaDesc":
      "Active redeem codes for Genshin Impact, Honkai: Star Rail, Zenless Zone Zero, and Honkai Impact 3rd. Auto-updated hourly, with a full archive of expired codes.",

    "stat.active": "active codes",
    "stat.games": "games",
    "stat.archived": "archived codes",

    "ctl.search": "Search game, reward, or code…",
    "ctl.allGames": "All games",
    "ctl.sortNew": "Newest",
    "ctl.sortAZ": "Name A–Z",
    "ctl.shown": "active codes shown",
    "ctl.empty": "No codes match. Try another keyword or game.",
    "ctl.more": "Load more",

    "card.active": "ACTIVE",
    "card.check": "CHECK",
    "card.checkHint": "Source hasn't re-verified this code still works — try it in-game first.",
    "card.new": "NEW",
    "card.expired": "EXPIRED",
    "card.copy": "Copy",
    "card.copied": "Copied ✓",
    "card.claim": "Claim",
    "card.seen": "Seen",
    "card.noReward": "Source lists no reward details",
    "card.rewardNote": "Reward text as provided by the source",
    "card.stale": "Source unreachable — last known data",

    "arch.title": "Expired code archive",
    "arch.desc": "Codes that no longer work. Kept so they stay searchable.",
    "arch.count": "codes archived",
    "arch.expiredOn": "Expired",
    "arch.noMatch": "No archived codes match this filter.",
    "arch.emptyTitle": "Archive is still empty",
    "arch.emptyDesc":
      "Codes move here automatically once they disappear from their official source.",

    "how.title": "How to redeem",
    "how.step1": "Copy a code above.",
    "how.step2":
      "Open the redemption menu — on the game's official site (e.g. HoYoverse) or in-game (Settings → Redeem/Exchange Code), depending on the game.",
    "how.step3": "Sign in, paste the code, and claim. Rewards arrive via in-game mail.",
    "how.note":
      "Codes are region- and level-gated. If one is rejected, it's likely out of quota or invalid on your server.",

    "cat.metaTitle": "Browse Online Games — Game Database | KodeGG",
    "cat.metaDesc":
      "Browse popular online & live-service games: gacha/RPG, MOBA, battle royale, strategy. Search, filter by genre, and find redeem codes for each game on KodeGG.",
    "cat.title": "Browse online games",
    "cat.desc":
      "A database of online & live-service games. Search, filter by genre, and jump to each game's redeem codes.",
    "cat.search": "Search game name…",
    "cat.all": "All",
    "cat.sortPop": "Popular",
    "cat.sortNew": "Newest",
    "cat.sortRating": "Rating",
    "cat.sortAZ": "A–Z",
    "cat.sortBy": "Sort",
    "cat.shown": "games shown",
    "cat.hasCodes": "Has codes",
    "cat.viewCodes": "View codes",
    "cat.browseOnly": "Coming soon",
    "cat.empty": "No games match. Try another keyword or genre.",
    "cat.more": "Load more",

    "feed.live": "LIVE · UPDATED HOURLY",
    "feed.title": "Latest news & events",
    "feed.desc": "Every update from the games you follow in one stream — live events (with countdowns) and news, newest first. Tap for details & open the source.",
    "feed.metaTitle": "Latest Online Game News & Events — KodeGG",
    "feed.metaDesc": "Latest news and events for online games: Genshin, Honkai: Star Rail, Zenless Zone Zero, Honkai Impact 3rd, Tears of Themis. From official HoYoLAB, auto-updated.",
    "feed.all": "All",
    "feed.events": "Events",
    "feed.news": "News",
    "feed.archive": "Archive",
    "feed.open": "Open",
    "feed.shown": "items shown",
    "feed.empty": "Nothing matches this selection yet.",

    "news.metaTitle": "Latest Online Game News — KodeGG",
    "news.metaDesc":
      "Latest news & updates for online games: Genshin, Honkai, Zenless, Wuthering Waves, Mobile Legends, Free Fire, and more. Curated from trusted sources.",
    "news.title": "Online game news",
    "news.desc": "The latest from the games you follow. Short summaries — click to read the full story at the source.",
    "news.all": "All games",
    "news.featured": "Featured",
    "news.shown": "articles shown",
    "news.read": "Read at source",
    "news.empty": "No news for this selection yet.",
    "news.more": "Load more",
    "news.via": "via",

    "ev.metaTitle": "Online Game Events & Banners — Countdown | KodeGG",
    "ev.metaDesc":
      "Ongoing gacha events & banners: Genshin, Honkai: Star Rail, Zenless Zone Zero. With real-time countdowns to when they end.",
    "ev.title": "Events & banners",
    "ev.desc": "What's live right now, with a countdown to when it ends. Don't miss out.",
    "ev.all": "All games",
    "ev.allType": "All",
    "ev.banner": "Banner",
    "ev.event": "Event",
    "ev.endsIn": "Ends in",
    "ev.ended": "Ended",
    "ev.starts": "Starts",
    "ev.shown": "ongoing",
    "ev.empty": "Nothing matches this filter.",
    "ev.more": "Load more",
    "ev.close": "Close",

    "fav.metaTitle": "Saved Games — KodeGG",
    "fav.metaDesc": "The games you saved on KodeGG. Quick access to your favorite games' codes & events.",
    "fav.title": "Saved games",
    "fav.desc": "Games you've saved. Tap the heart icon on Browse Games to add.",
    "fav.empty": "No saved games yet. Open Browse Games and tap the heart icon to save.",
    "fav.browse": "Browse Games",

    "foot.updated": "Last updated",
    "foot.sources": "Data sources",
    "foot.disclaimer":
      "KodeGG is an unofficial site and is not affiliated with HoYoverse or any game publisher. All game names, items, and assets belong to their respective owners.",
    "foot.attribution": "Giveaway data provided by GamerPower.",
  },
};

export function t(lang) {
  const table = DICT[lang] ?? DICT[DEFAULT_LANG];
  return (key) => table[key] ?? DICT[DEFAULT_LANG][key] ?? key;
}

export const otherLang = (lang) => (lang === "id" ? "en" : "id");
