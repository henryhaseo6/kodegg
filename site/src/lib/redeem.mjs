// Cara redeem kode per-game. Metode tiap game BEDA — data ini diverifikasi dari
// halaman resmi + guide tepercaya (pockettactics, prydwen, game8, fandom), bukan
// karangan. Dipakai oleh halaman /game/[game] untuk section "Cara redeem" +
// HowTo JSON-LD. Game baru yang belum terdaftar pakai FALLBACK (langkah umum
// yang jujur, ditandai `generic`), jadi worker auto-generate tetap aman.
//
// Struktur tiap entri:
//   web      : URL halaman redeem resmi, atau null (in-game only)
//   account  : nama akun untuk login di web ("HoYoverse"/"Bluepoch"/dst)
//   req      : {id,en} syarat sebelum kode bisa dipakai, atau null
//   note     : {id,en} catatan penting (iOS/case-sensitive), atau null
//   ingame   : {id:[...],en:[...]} langkah redeem DI DALAM game (selalu ada)

export const REDEEM = {
  gi: {
    web: "https://genshin.hoyoverse.com/en/gift",
    account: "HoYoverse",
    req: { id: "Adventure Rank 10 ke atas", en: "Adventure Rank 10 or higher" },
    note: {
      id: "Redeem lewat dalam game tidak tersedia di iOS — pakai halaman web.",
      en: "In-game redeem isn't available on iOS — use the web page.",
    },
    ingame: {
      id: [
        "Buka Menu Paimon di dalam game",
        "Masuk ke Settings → Account",
        "Ketuk Redeem Code",
        "Tempel kode, lalu tekan Exchange",
      ],
      en: [
        "Open the Paimon Menu in-game",
        "Go to Settings → Account",
        "Tap Redeem Code",
        "Paste the code, then press Exchange",
      ],
    },
  },

  hsr: {
    web: "https://hsr.hoyoverse.com/gift",
    account: "HoYoverse",
    req: {
      id: "Fitur Mail sudah terbuka (selesaikan misi awal “A Moment of Peace”)",
      en: "Mail feature unlocked (finish the early mission “A Moment of Peace”)",
    },
    note: {
      id: "Redeem lewat dalam game tidak tersedia di iOS — pakai halaman web.",
      en: "In-game redeem isn't available on iOS — use the web page.",
    },
    ingame: {
      id: [
        "Buka Menu (ikon telepon)",
        "Ketuk Profile Settings (ikon •••)",
        "Pilih Redemption Code",
        "Masukkan kode, lalu tekan Confirm",
      ],
      en: [
        "Open the Menu (phone icon)",
        "Tap Profile Settings (••• icon)",
        "Select Redemption Code",
        "Enter the code, then press Confirm",
      ],
    },
  },

  zzz: {
    web: "https://zenless.hoyoverse.com/redemption/",
    account: "HoYoverse",
    req: {
      id: "Inter-Knot Level 5 (selesaikan prolog untuk membuka Mailbox)",
      en: "Inter-Knot Level 5 (finish the prologue to unlock the Mailbox)",
    },
    note: null,
    ingame: {
      id: ["Buka Menu → More", "Pilih Redemption Code", "Masukkan kode, lalu tekan Confirm"],
      en: ["Open Menu → More", "Select Redemption Code", "Enter the code, then press Confirm"],
    },
  },

  hi3: {
    web: null,
    account: null,
    req: { id: "Kode Global hanya berfungsi di server NA/EU", en: "Global codes only work on NA/EU servers" },
    note: null,
    ingame: {
      id: [
        "Dari layar utama, ketuk Player ID/avatar di pojok kiri atas",
        "Masuk ke Account",
        "Buka kotak “Enter Redemption Code”",
        "Tempel kode (case-sensitive), lalu tekan Get",
      ],
      en: [
        "From the main screen, tap your Player ID/avatar at the top-left",
        "Go to Account",
        "Open the “Enter Redemption Code” box",
        "Paste the code (case-sensitive), then press Get",
      ],
    },
  },

  tot: {
    web: "https://tot.hoyoverse.com/gift/",
    account: "HoYoverse",
    req: {
      id: "Sudah membuat karakter & menautkan akun HoYoverse di User Center",
      en: "Created a character and linked your HoYoverse account in the User Center",
    },
    note: null,
    ingame: {
      id: [
        "Buka Profile → Settings",
        "Pilih Code Redemption (ada juga di Customer Service)",
        "Masukkan kode (case-sensitive), lalu tekan Submit",
      ],
      en: [
        "Open Profile → Settings",
        "Select Code Redemption (also under Customer Service)",
        "Enter the code (case-sensitive), then press Submit",
      ],
    },
  },

  wuwa: {
    web: null,
    account: null,
    req: { id: "Union Level 2 (kalahkan boss tutorial pertama)", en: "Union Level 2 (beat the first tutorial boss)" },
    note: null,
    ingame: {
      id: [
        "Buka Terminal (menu utama) → Settings",
        "Buka tab “Other Settings”",
        "Di bagian Account, tekan Redeem di sebelah “Redemption Code”",
        "Masukkan kode, lalu ambil hadiah dari Mailbox (ikon amplop)",
      ],
      en: [
        "Open the Terminal (main menu) → Settings",
        "Go to the “Other Settings” tab",
        "Under Account, press Redeem next to “Redemption Code”",
        "Enter the code, then claim rewards from the Mailbox (envelope icon)",
      ],
    },
  },

  r1999: {
    web: "https://re1999.bluepoch.com/en/gift",
    account: "Bluepoch",
    req: { id: "Selesaikan tutorial awal untuk mencapai layar utama", en: "Finish the opening tutorial to reach the main screen" },
    note: { id: "Kode tidak case-sensitive.", en: "Codes are not case-sensitive." },
    ingame: {
      id: [
        "Ketuk avatar pemain/ikon menu (pojok kiri atas)",
        "Masuk ke Settings → tab Account",
        "Pilih “Exchange Code Reward”",
        "Masukkan kode, lalu tekan Confirm",
      ],
      en: [
        "Tap the player avatar/menu icon (top-left)",
        "Go to Settings → Account tab",
        "Select “Exchange Code Reward”",
        "Enter the code, then press Confirm",
      ],
    },
  },

  afkj: {
    web: null,
    account: null,
    req: { id: "Selesaikan tutorial awal untuk mencapai layar utama", en: "Finish the opening tutorial to reach the main screen" },
    note: null,
    ingame: {
      id: [
        "Ketuk avatar pemain (pojok kiri atas)",
        "Ketuk ikon roda gigi/Settings (sisi kanan)",
        "Buka tab “Others” → tombol “Promo Code”",
        "Tempel kode — hadiah dikirim ke Mailbox",
      ],
      en: [
        "Tap your player avatar (top-left)",
        "Tap the cog/Settings wheel (right side)",
        "Open the “Others” tab → “Promo Code” button",
        "Paste the code — rewards are sent to your Mailbox",
      ],
    },
  },

  nikki: {
    web: "https://infinitynikki.infoldgames.com/proj/redeem_code.html",
    account: "Infold",
    req: { id: "Selesaikan tutorial awal & capai kota pertama", en: "Finish the opening tutorial and reach the first city" },
    note: { id: "Kode bersifat case-sensitive.", en: "Codes are case-sensitive." },
    ingame: {
      id: [
        "Buka menu Pear-Pal (tekan Esc di PC) → ikon gear (Settings)",
        "Buka tab “Other”",
        "Klik Redeem di sebelah “Redeem Code”",
        "Masukkan kode, lalu tekan Confirm",
      ],
      en: [
        "Open the Pear-Pal menu (press Esc on PC) → gear icon (Settings)",
        "Go to the “Other” tab",
        "Click Redeem next to “Redeem Code”",
        "Enter the code, then press Confirm",
      ],
    },
  },
};

// Langkah umum untuk game yang belum terdaftar (worker auto-generate game baru).
// Sengaja generik + jujur — tidak mengarang menu spesifik yang belum diverifikasi.
const FALLBACK = {
  web: null,
  account: null,
  req: null,
  note: {
    id: "Langkah umum — cek situs resmi game untuk metode pastinya.",
    en: "General steps — check the game's official site for the exact method.",
  },
  ingame: {
    id: [
      "Buka game, lalu masuk ke menu Settings/Pengaturan",
      "Cari opsi “Redeem Code” / “Redemption Code” (biasanya di bagian Account)",
      "Masukkan kode persis seperti tertulis",
      "Konfirmasi — hadiah biasanya masuk ke in-game mail",
    ],
    en: [
      "Open the game and go to Settings",
      "Find the “Redeem Code” / “Redemption Code” option (usually under Account)",
      "Enter the code exactly as written",
      "Confirm — rewards usually arrive in your in-game mail",
    ],
  },
  generic: true,
};

// Langkah metode WEB — polanya sama untuk semua game yang punya halaman resmi,
// cuma nama akun & URL yang beda. Dibangun dari `account`.
function webSteps(account, lang) {
  const acc = account || "";
  return lang === "id"
    ? [
        "Buka halaman redeem resmi (tombol di atas)",
        `Login akun ${acc} lalu pilih server/karakter kamu`,
        "Masukkan kode redeem",
        "Klik Redeem — hadiah masuk ke in-game mail",
      ]
    : [
        "Open the official redeem page (button above)",
        `Log in with your ${acc} account and pick your server/character`,
        "Enter the redeem code",
        "Click Redeem — rewards arrive in your in-game mail",
      ];
}

// Info redeem siap-render untuk satu game + bahasa. gameId tak dikenal → FALLBACK.
export function redeemInfo(gameId, lang) {
  const e = REDEEM[gameId] || FALLBACK;
  return {
    generic: !!e.generic,
    web: e.web || null,
    account: e.account || null,
    req: e.req ? e.req[lang] : null,
    note: e.note ? e.note[lang] : null,
    ingame: e.ingame[lang],
    webSteps: e.web ? webSteps(e.account, lang) : null,
  };
}
