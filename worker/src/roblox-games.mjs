// Registry game ROBLOX — vertikal terpisah dari GAMES (game mobile).
// Sumber kode: RoCodes.gg (lihat sources/rocodes.mjs). Menambah game = 1 entri
// { slug (path /codes/<slug> di RoCodes), name, genres }. universeId/placeId,
// howTo, dan status verified ditarik OTOMATIS dari payload RoCodes saat fetch,
// jadi tak perlu ditulis manual di sini.
//
// Aturan CLAUDE.md: game online/live-service. Roblox experience = online.

export const ROBLOX_GAMES = {
  bloxfruits: { slug: "blox-fruits", name: "Blox Fruits", genres: ["rpg", "adventure", "anime"] },
  bluelock: { slug: "blue-lock-rivals", name: "Blue Lock Rivals", genres: ["sports", "anime", "fighting"] },
  typesoul: { slug: "type-soul", name: "Type Soul", genres: ["rpg", "anime", "fighting"] },
  animevanguards: { slug: "anime-vanguards", name: "Anime Vanguards", genres: ["td", "anime", "rpg"] },
  growagarden: { slug: "grow-a-garden", name: "Grow a Garden", genres: ["simulator", "casual"] },
  nights99: { slug: "99-nights-in-the-forest", name: "99 Nights in the Forest", genres: ["survival", "adventure"] },
  fisch: { slug: "fisch", name: "Fisch", genres: ["simulator", "adventure"] },
  bladeball: { slug: "blade-ball", name: "Blade Ball", genres: ["fighting", "sports"] },
  animeadventures: { slug: "anime-adventures", name: "Anime Adventures", genres: ["td", "anime", "rpg"] },
  kinglegacy: { slug: "king-legacy", name: "King Legacy", genres: ["rpg", "adventure", "anime"] },
  basketballzero: { slug: "basketball-zero", name: "Basketball Zero", genres: ["sports", "anime"] },
  volleyballlegends: { slug: "volleyball-legends", name: "Volleyball Legends", genres: ["sports", "anime"] },
  dresstoimpress: { slug: "dress-to-impress", name: "Dress to Impress", genres: ["casual", "roleplay"] },
  petsim99: { slug: "pet-simulator-99", name: "Pet Simulator 99", genres: ["simulator", "casual"] },
  adoptme: { slug: "adopt-me", name: "Adopt Me!", genres: ["roleplay", "casual"] },
};

// Override NAMA saja (slug/URL TAK berubah) — utk game auto-discover yg nama
// sumbernya kurang tepat / nyesatin. Mis. RoCodes judulin "The Strongest
// Battlegrounds Music" padahal kode-nya Kill Sound Effect (bukan lagu) → pakai
// "Sound" biar visitor gak ngerasa ketipu. Keyed by game id.
export const ROBLOX_NAME_OVERRIDE = {
  "the-strongest-battlegrounds": "The Strongest Battlegrounds Sound",
};

// ALIAS PENCARIAN per-game — nama Indonesia & singkatan komunitas.
//
// Diukur dari YouTube Analytics 4 Agu 2026 (kueri yang BENAR-BENAR membawa
// penonton, bukan tebakan): pemain Indonesia mencari game dengan nama
// TERJEMAHAN, dan judul kita seluruhnya Inggris.
//   Throw a Coin      → 6 dari 6 kueri teratas berbahasa Indonesia, NOL Inggris
//                       ("kode lempar koin" 171, "kode di lempar koin" 160, …)
//   Catch a Monster   → "kode redeem tangkap monster" 48, "kode terbaru
//                       tangkap monster" 28 — bercampur dengan kueri Inggris
//   Drag Drive Sim    → "kode ddc terbaru" 87, "kode redeem dds" 27
//                       (DDC & DDS = singkatan komunitas, tak ada di judul kita)
//
// SENGAJA manual & berbasis bukti. Menerjemahkan 435 nama game otomatis akan
// menghasilkan omong kosong untuk sebagian besar (dan melanggar aturan
// fidelitas: jangan mengarang istilah). Tambahkan hanya bila datanya
// menunjukkan orang memang mencarinya begitu.
//
// Dipakai untuk TAG & deskripsi video — bukan judul, supaya judul tetap bersih.
export const ROBLOX_ALIAS = {
  // Orang mengetiknya TUNGGAL ("capybara vs plant", 28 tayangan dlm 7 hari)
  // sedangkan nama resminya jamak — cukup untuk meleset dari pencocokan.
  "capybaras-vs-plants": ["capybara vs plant", "capybara vs plants"],
  "throw-a-coin": ["lempar koin"],
  "catch-a-monster": ["tangkap monster"],
  "drag-drive-simulator": ["ddc", "dds"],
  // Ditemukan oleh laporan harian 4 Agu 2026 sbg "kueri belum dikenali":
  // "kode redeem tds terbaru" (26 tayangan).
  "tower-defense-simulator": ["tds"],
};

// PIN sumber langkah redeem per-game. Default: RoCodes menang, Den mengisi bila
// RoCodes kosong (lihat fetch-roblox.mjs). Default itu dipertahankan karena
// disurvei 3 Agu 2026 pada 40 game teratas, Den TIDAK lebih baru secara umum —
// dari 19 game yang punya keduanya, 7 pada dasarnya sama dan di beberapa sisanya
// RoCodes justru lebih lengkap (mis. fish-it: RoCodes mencantumkan syarat "must
// be Level 10", Den tidak). Tak ada sumber yang menstempel kapan panduannya
// ditulis, jadi "paling baru" tak bisa dideteksi otomatis — makanya pin ini
// MANUAL, hanya untuk kasus yang sudah diverifikasi mata.
// Nilai: "den" | "rocodes".
export const ROBLOX_HOWTO_PIN = {
  // RoCodes masih menyuruh "Verify your Twitter account after following
  // @NosniyRBLX"; alur sebenarnya sekarang + → More → Codes (dicek 3 Agu 2026).
  rivals: "den",
};

// SYARAT redeem per-game — hal yang bikin kode GAGAL walau kodenya benar & masih
// aktif (mis. wajib follow developer, wajib join grup, wajib level tertentu).
// Ditulis manual & diverifikasi ke sumber, TIDAK ditarik otomatis: parser howTo
// kita cuma menangkap daftar langkah, sedangkan syarat begini ditulis sumber
// sebagai catatan terpisah di luar daftar itu.
//
// `en` = VERBATIM dari sumber (aturan fidelitas CLAUDE.md). `id` = terjemahan
// kalimat penghubungnya saja; nama akun/developer TIDAK diterjemahkan.
// Keyed by game id.
export const ROBLOX_REDEEM_NOTE = {
  // Sumber: robloxden.com/game-codes/rivals (dicek 3 Agu 2026). Ketiga akun
  // diverifikasi ada di Roblox: Nosniy Games (communities/3461453),
  // SenseiWarrior (users/15941965), Nosniy (users/20349956).
  rivals: {
    en: "You must follow the developers Nosniy Games, SenseiWarrior and Nosniy to redeem codes.",
    id: "Kamu harus follow developer Nosniy Games, SenseiWarrior, dan Nosniy dulu supaya kode bisa di-redeem.",
    // Tautan langsung ke akun yang harus di-follow — syaratnya jadi bisa
    // DIKERJAKAN, bukan cuma dibaca. URL diambil dari Roblox sendiri (bukan dari
    // situs kode), jadi identitasnya pasti.
    links: [
      { label: "Nosniy Games", url: "https://www.roblox.com/communities/3461453/Nosniy-Games" },
      { label: "SenseiWarrior", url: "https://www.roblox.com/users/15941965/profile" },
      { label: "Nosniy", url: "https://www.roblox.com/users/20349956/profile" },
    ],
  },
};

// Slug URL keyword dari NAMA (mis. "Blox Fruits" -> "blox-fruits") untuk /roblox/<slug>.
const slugify = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const ROBLOX_SLUG = Object.fromEntries(Object.keys(ROBLOX_GAMES).map((id) => [id, slugify(ROBLOX_GAMES[id].name)]));
export const robloxSlug = (id) => ROBLOX_SLUG[id] ?? id;
export const robloxIdFromSlug = (slug) => Object.keys(ROBLOX_SLUG).find((id) => ROBLOX_SLUG[id] === slug) ?? null;

// Game yang nama Roblox-nya memang JAUH beda dari nama katalog kita, dan sudah
// DIPERIKSA MATA bahwa itu game yang sama. Dipakai audit nama (fetch-roblox.mjs)
// supaya temuan yang sudah dinyatakan aman berhenti berteriak tiap pagi —
// peringatan yang selalu muncul dan selalu tak perlu adalah peringatan yang
// akhirnya tak dibaca, dan itu justru menutupi temuan yang sungguhan.
//
// Isi hanya setelah benar-benar diverifikasi: kreator, pola kode, deskripsi.
// Kunci = id game kita, nilai = alasan singkat (agar bisa ditinjau ulang nanti).
export const NAMA_BEDA_OK = {
  // Ganti judul jadi "🚚 drive and fight" (keyword stuffing khas Roblox).
  // Diverifikasi 4 Agu 2026: kreator sama (646 Studios), deskripsinya menyebut
  // kode milestone "25KLIKES" — pola yang sama dengan kode kita (15000LIKES,
  // 500LIKES, release). Game yang sama, cuma judulnya dirombak.
  haulers: "ganti judul jadi '🚚 drive and fight', kreator & pola kode sama",
};
