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

  // --- Game via redeem-code-tracker/editorial (riset per-game, diverifikasi) ---
  e7: {
    web: "https://epic7.onstove.com/en/coupon",
    account: "STOVE",
    req: null,
    note: null,
    webSteps: {
      id: [
        "Buka halaman kupon resmi (tombol di atas)",
        "Login akun STOVE, atau masukkan Membership Number + pilih server",
        "Masukkan kode kupon",
        "Klik Redeem — hadiah masuk ke in-game mail",
      ],
      en: [
        "Open the official coupon page (button above)",
        "Log in with STOVE, or enter your Membership Number + pick your server",
        "Enter the coupon code",
        "Click Redeem — rewards arrive in your in-game mail",
      ],
    },
    ingame: {
      id: [
        "Ketuk ikon Menu (pojok kanan atas)",
        "Buka bagian Event / News",
        "Ketuk tombol/tab 'COUPON'",
        "Masukkan kode di kotak teks",
        "Ketuk Redeem lalu ambil hadiah dari mailbox",
      ],
      en: [
        "Tap the Menu icon (top-right corner)",
        "Go to the Event / News section",
        "Tap the 'COUPON' button/tab",
        "Enter the code in the text box",
        "Tap Redeem and claim rewards from the mailbox",
      ],
    },
  },

  endfield: {
    web: null,
    account: null,
    req: { id: "Sistem Mail sudah terbuka (setelah misi 'Break the Siege', usai prolog)", en: "Mail system unlocked (after the 'Break the Siege' mission, past the prologue)" },
    note: { id: "Kode tidak case-sensitive. Sebagian kode terkunci platform (mis. ENDFIELD4PC hanya PC).", en: "Codes are not case-sensitive. Some codes are platform-locked (e.g. ENDFIELD4PC is PC-only)." },
    ingame: {
      id: [
        "Buka Menu (ESC di PC / tombol Options di PS5)",
        "Pilih ikon Settings (kiri atas)",
        "Buka tab 'Platform & Account'",
        "Pilih 'Exchange Code'",
        "Masukkan kode, Confirm, lalu ambil dari Mail",
      ],
      en: [
        "Open Menu (ESC on PC / Options button on PS5)",
        "Select the Settings icon (top-left)",
        "Open the 'Platform & Account' tab",
        "Select 'Exchange Code'",
        "Enter the code, Confirm, then claim from Mail",
      ],
    },
  },

  nte: {
    web: null,
    account: null,
    req: { id: "Selesaikan tutorial & Episode 0 'Unforeseen Yet Foretold'", en: "Finish the tutorial and Episode 0 'Unforeseen Yet Foretold'" },
    note: { id: "Kode case-sensitive. Buka mailbox dan klaim manual — memasukkan kode saja belum memberi item.", en: "Codes are case-sensitive. Open the mailbox and claim manually — entering the code alone doesn't grant items." },
    ingame: {
      id: [
        "Buka game dan login",
        "Ketuk tombol Menu (pojok kanan atas)",
        "Ketuk opsi tiga titik '...' (kanan atas)",
        "Pilih 'Redeem Code'",
        "Masukkan/tempel kode, Confirm, lalu ambil dari mailbox",
      ],
      en: [
        "Open the game and log in",
        "Tap the Menu button (top-right corner)",
        "Tap the three-dots '...' option (top-right)",
        "Select 'Redeem Code'",
        "Enter/paste the code, Confirm, then claim from the mailbox",
      ],
    },
  },

  diablo: {
    web: null, // situs .com yang beredar BUKAN domain Blizzard → andalkan in-game
    account: null,
    req: null,
    note: { id: "Sebagian kode terkunci region. Cara paling andal lewat dalam game.", en: "Some codes are region-locked. The most reliable route is in-game." },
    ingame: {
      id: [
        "Buka Settings dari menu utama",
        "Pilih tab 'Accounts' (sisi kiri)",
        "Di bagian 'Redeem Code', ketuk 'Redeem'",
        "Masukkan kode di kotak teks",
        "Tekan 'Redeem' lalu ambil dari mailbox",
      ],
      en: [
        "Open Settings from the main menu",
        "Select the 'Accounts' tab (left side)",
        "Under 'Redeem Code', tap 'Redeem'",
        "Enter the code in the text box",
        "Press 'Redeem' then claim from the mailbox",
      ],
    },
  },

  afka: {
    web: "https://cdkey.lilith.com/afk-global",
    account: null,
    req: null,
    note: { id: "Kode case-sensitive; spasi berlebih membatalkannya. Tombol redeem di dalam game sudah dihapus — pakai web.", en: "Codes are case-sensitive; an extra space invalidates them. The in-game redeem button was removed — use the web." },
    webSteps: {
      id: [
        "Buka halaman resmi (tombol di atas)",
        "Masukkan UID (lihat di avatar pojok kiri atas game)",
        "Buat Verification Code di dalam game (Settings), berlaku ~2 menit, lalu masukkan",
        "Tempel kode redeem, klik Redeem — hadiah ke Mailbox",
      ],
      en: [
        "Open the official page (button above)",
        "Enter your UID (found on your avatar, top-left in-game)",
        "Generate a Verification Code in-game (Settings), valid ~2 min, then enter it",
        "Paste the redeem code and click Redeem — rewards go to your Mailbox",
      ],
    },
    ingame: {
      id: [
        "Redeem TIDAK tersedia di dalam game (tombolnya dihapus)",
        "Buka avatar (kiri atas) untuk melihat UID",
        "Buka Settings → buat Verification Code",
        "Lanjutkan penukaran di halaman web di atas",
      ],
      en: [
        "In-game redeem is NOT available (the button was removed)",
        "Open your avatar (top-left) to see your UID",
        "Go to Settings → generate a Verification Code",
        "Finish redeeming on the web page above",
      ],
    },
  },

  gtales: {
    web: "https://coupon.kakaogames.com/guardiantales/en/",
    account: null,
    req: null,
    note: { id: "Tidak ada tanggal kedaluwarsa resmi — redeem secepatnya.", en: "No official expiry dates — redeem as soon as possible." },
    webSteps: {
      id: [
        "Buka halaman kupon resmi (tombol di atas)",
        "Pilih region kamu + masukkan User ID",
        "Masukkan Coupon Code",
        "Konfirmasi — hadiah masuk ke mailbox",
      ],
      en: [
        "Open the official coupon page (button above)",
        "Select your region + enter your User ID",
        "Enter the Coupon Code",
        "Confirm — rewards go to your mailbox",
      ],
    },
    ingame: {
      id: [
        "Buka Guardian Tales",
        "Buka menu Options (pojok kanan atas)",
        "Buka 'Account Settings'",
        "Ketuk 'Enter Coupon Code'",
        "Masukkan kode lalu ketuk Confirm",
      ],
      en: [
        "Open Guardian Tales",
        "Open the Options menu (top-right corner)",
        "Open 'Account Settings'",
        "Tap 'Enter Coupon Code'",
        "Enter the code then tap Confirm",
      ],
    },
  },

  mongil: {
    web: "https://coupon.netmarble.com/monster2",
    account: null,
    req: null,
    note: { id: "Kode case-sensitive; satu kode sekali per akun. Di iOS tombol redeem in-game tak ada — wajib pakai web.", en: "Codes are case-sensitive; one code once per account. On iOS the in-game redeem button is missing — you must use the web." },
    webSteps: {
      id: [
        "Buka halaman kupon resmi (tombol di atas)",
        "Masukkan Player ID (32 karakter) di kolom 'Member code'",
        "Masukkan Coupon code",
        "Klik Redeem — hadiah masuk ke Mail",
      ],
      en: [
        "Open the official coupon page (button above)",
        "Enter your Player ID (32 characters) in the 'Member code' field",
        "Enter the Coupon code",
        "Click Redeem — rewards arrive in your Mail",
      ],
    },
    ingame: {
      id: [
        "Buka Settings dari menu",
        "Buka tab 'Other'",
        "Di 'Customer Support' gulir ke 'Redemption Code'",
        "Masukkan kode di jendela",
        "Pilih 'Use' lalu ambil dari Mail",
      ],
      en: [
        "Open Settings from the menu",
        "Go to the 'Other' tab",
        "Under 'Customer Support' scroll to 'Redemption Code'",
        "Enter the code in the window",
        "Select 'Use' then claim from Mail",
      ],
    },
  },

  mlbb: {
    web: "https://m.mobilelegends.com/en/codexchange",
    account: null,
    req: null,
    note: { id: "Verification code berlaku 30 menit. Kode redeem case-sensitive — masukkan persis, tanpa spasi.", en: "The verification code is valid 30 minutes. Redemption codes are case-sensitive — enter exactly, no spaces." },
    webSteps: {
      id: [
        "Buka halaman code exchange resmi (tombol di atas)",
        "Masukkan Game ID + Zone/Server ID (lihat di profil avatar in-game)",
        "Minta Verification Code — cek in-game Mail lalu masukkan (berlaku 30 menit)",
        "Masukkan kode redeem, klik Redeem",
      ],
      en: [
        "Open the official code exchange page (button above)",
        "Enter your Game ID + Zone/Server ID (from your in-game avatar profile)",
        "Request a Verification Code — check your in-game Mail then enter it (valid 30 min)",
        "Enter the redemption code and click Redeem",
      ],
    },
    ingame: {
      id: [
        "Redeem hanya lewat web — tak ada menu kode di dalam game",
        "Buka profil avatar untuk melihat Game ID + Zone ID",
        "Verification code dikirim ke ikon Mail in-game",
        "Lanjutkan penukaran di halaman web di atas",
      ],
      en: [
        "Redeem is web-only — there's no code menu in-game",
        "Open your avatar profile to see your Game ID + Zone ID",
        "The verification code is sent to your in-game Mail icon",
        "Finish redeeming on the web page above",
      ],
    },
  },

  sdsgc: {
    web: "https://coupon.netmarble.com/nanagb",
    account: "Netmarble",
    req: { id: "Selesaikan tutorial awal", en: "Finish the tutorial levels" },
    note: {
      id: "Kode dimasukkan satu per satu. Di metode web, Netmarble ID perlu dimasukkan ulang untuk tiap kode.",
      en: "Enter codes one at a time. On the web method, re-enter your Netmarble ID for each code.",
    },
    webSteps: {
      id: [
        "Buka halaman kupon resmi Netmarble (tombol di atas)",
        "Login / masukkan Netmarble ID kamu",
        "Masukkan kode kupon",
        "Klik Redeem — hadiah masuk ke in-game mail",
      ],
      en: [
        "Open the official Netmarble coupon page (button above)",
        "Log in / enter your Netmarble ID",
        "Enter the coupon code",
        "Click Redeem — rewards arrive in your in-game mail",
      ],
    },
    ingame: {
      id: [
        "Buka game (selesaikan dulu tutorial)",
        "Ketuk menu di pojok kanan bawah",
        "Ketuk 'Misc'",
        "Pilih opsi 'Coupons'",
        "Masukkan kode satu per satu, lalu ambil hadiah dari in-game mail",
      ],
      en: [
        "Open the game (finish the tutorial first)",
        "Tap the menu in the bottom-right",
        "Tap 'Misc'",
        "Select the 'Coupons' option",
        "Enter codes one at a time, then claim rewards from in-game mail",
      ],
    },
  },

  gov: {
    web: null,
    account: null,
    req: { id: "Selesaikan Stage 1-4 untuk membuka portal CD-Key", en: "Clear Stage 1-4 to unlock the CD-Key portal" },
    note: { id: "CD-Key sekali pakai per akun; sebagian terkunci region.", en: "CD-Keys are single-use per account; some are region-restricted." },
    ingame: {
      id: [
        "Di Lobby, ketuk tombol Notice (kanan atas)",
        "Di bagian Event Notice, ketuk CD-Key Redemption Portal",
        "Masukkan CD Key",
        "Ketuk Redeem Now",
        "Kembali ke Lobby dan ambil hadiah lewat Mailbox",
      ],
      en: [
        "From the Lobby, tap the Notice button (top-right)",
        "Under Event Notice, tap the CD-Key Redemption Portal",
        "Enter the CD Key",
        "Tap Redeem Now",
        "Return to the Lobby and collect rewards from the Mailbox",
      ],
    },
  },

  wos: {
    web: "https://wos-giftcode.centurygame.com/",
    account: null,
    req: null,
    note: { id: "Kode case-sensitive & sekali pakai per akun; cepat kedaluwarsa. Hadiah lewat in-game mail.", en: "Codes are case-sensitive & single-use per account; they expire quickly. Rewards via in-game mail." },
    webSteps: {
      id: [
        "Buka halaman gift code resmi (tombol di atas)",
        "Masukkan Player ID (lihat di profil avatar in-game)",
        "Masukkan kode, klik Redeem",
        "Hadiah masuk ke in-game mail",
      ],
      en: [
        "Open the official gift code page (button above)",
        "Enter your Player ID (from your in-game avatar profile)",
        "Enter the code and click Redeem",
        "Rewards arrive in your in-game mail",
      ],
    },
    ingame: {
      id: [
        "Ketuk avatar (kiri atas)",
        "Buka Settings",
        "Pilih Gift Code",
        "Masukkan kode dan ketuk Redeem",
      ],
      en: [
        "Tap your avatar (top-left)",
        "Open Settings",
        "Select Gift Code",
        "Enter the code and tap Redeem",
      ],
    },
  },

  dtrav: {
    web: null,
    account: null,
    req: { id: "Selesaikan Chapter 1 untuk membuka opsi Redeem Code", en: "Complete Chapter 1 to unlock the Redeem Code option" },
    note: { id: "Kode tidak case-sensitive. Satu klaim berhasil per akun.", en: "Codes are not case-sensitive. One successful claim per account." },
    ingame: {
      id: [
        "Ketuk avatar karakter (pojok kiri atas)",
        "Di layar profil pemain, ketuk Redeem Code (kiri bawah)",
        "Masukkan kode",
        "Ketuk Confirm",
      ],
      en: [
        "Tap your character avatar (top-left corner)",
        "On the player profile screen, tap Redeem Code (bottom-left)",
        "Enter your code",
        "Tap Confirm",
      ],
    },
  },

  sxs: {
    web: null,
    account: null,
    req: { id: "Mailbox terbuka setelah menuntaskan stage pertama World (Originisle)", en: "Mailbox unlocks after clearing the first World (Originisle) stage" },
    note: { id: "Kode case-sensitive — ketik persis. Hadiah di Mailbox (burung di rumah).", en: "Codes are case-sensitive — type exactly. Rewards in the Mailbox (bird at your house)." },
    ingame: {
      id: [
        "Ketuk ikon kubus/Menu (kanan bawah)",
        "Pilih User Center",
        "Pilih Gift Code",
        "Ketik kode persis seperti tertulis dan konfirmasi",
        "Ambil hadiah dari Mailbox (burung di rumah kamu)",
      ],
      en: [
        "Tap the cube/Menu icon (bottom-right)",
        "Select User Center",
        "Select Gift Code",
        "Type the code exactly as written and confirm",
        "Collect rewards from the Mailbox (bird at your house)",
      ],
    },
  },

  evernight: {
    web: null,
    account: null,
    req: null,
    note: { id: "Kode case-sensitive — masukkan persis termasuk huruf besar/kecil.", en: "Codes are case-sensitive — enter exactly, including letter case." },
    ingame: {
      id: [
        "Ketuk Avatar (pojok kiri atas)",
        "Pilih Settings dari menu pop-up",
        "Pilih opsi Gift Code",
        "Masukkan kode di kolom teks",
        "Tekan Submit",
      ],
      en: [
        "Tap your Avatar (top-left corner)",
        "Select Settings from the pop-up menu",
        "Choose the Gift Code option",
        "Enter the code in the text field",
        "Press Submit",
      ],
    },
  },

  isekai: {
    web: null,
    account: null,
    req: null,
    note: { id: "Kode case-sensitive; hindari spasi berlebih. Sekali pakai per akun.", en: "Codes are case-sensitive; avoid extra spaces. One use per account." },
    ingame: {
      id: [
        "Ketuk avatar profil (pojok kiri atas)",
        "Di menu halaman profil, ketuk Gift Code",
        "Masukkan kode yang valid dan konfirmasi",
        "Ambil hadiah dari mailbox dalam game",
      ],
      en: [
        "Tap the profile avatar (top-left corner)",
        "On the profile page menu, tap Gift Code",
        "Enter a valid code and confirm",
        "Collect rewards from the in-game mailbox",
      ],
    },
  },

  loe: {
    web: null,
    account: null,
    req: null,
    note: { id: "Kadang case-sensitive — disarankan copy-paste. Sekali pakai per akun.", en: "Sometimes case-sensitive — copy-paste recommended. One use per account." },
    ingame: {
      id: [
        "Ketuk ikon Avatar (pojok kiri atas)",
        "Pilih Settings dari menu",
        "Klik Gift Code",
        "Masukkan kode di kolom 'Enter gift code'",
        "Ketuk Exchange",
      ],
      en: [
        "Tap your Avatar icon (top-left corner)",
        "Select Settings from the menu",
        "Click Gift Code",
        "Input the code in the 'Enter gift code' field",
        "Tap Exchange",
      ],
    },
  },

  starsail: {
    web: "https://coupon.withhive.com/3167",
    account: null,
    req: null,
    note: { id: "Kode case-sensitive; tiap kupon sekali per CS Code. Hadiah di Mailbox (disimpan 7 hari).", en: "Codes are case-sensitive; each coupon once per CS Code. Rewards in the Mailbox (kept 7 days)." },
    webSteps: {
      id: [
        "Ambil CS Code dari game (Menu → Settings → Account)",
        "Buka halaman kupon resmi (tombol di atas)",
        "Masukkan CS Code + kode kupon",
        "Klik Use Coupon — hadiah masuk ke Mailbox",
      ],
      en: [
        "Get your CS Code from the game (Menu → Settings → Account)",
        "Open the official coupon page (button above)",
        "Enter your CS Code + the coupon code",
        "Click Use Coupon — rewards go to your Mailbox",
      ],
    },
    ingame: {
      id: [
        "Ketuk ikon Menu (kanan atas)",
        "Ketuk Account (Settings → Account)",
        "Salin CS Code (sisi kiri); ketuk tombol Redeem",
        "Masukkan kode kupon di kolom teks",
        "Ketuk Use Coupon dan ambil hadiah dari Mailbox",
      ],
      en: [
        "Tap the Menu icon (top-right)",
        "Tap Account (Settings → Account)",
        "Copy your CS Code (left side); tap the Redeem button",
        "Enter the coupon code in the text field",
        "Tap Use Coupon and collect rewards from the Mailbox",
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
    // webSteps custom (mis. flow UID + Verification Code) mengalahkan pola
    // generik "login akun + pilih server" yang hanya pas untuk game ala HoYo.
    webSteps: e.webSteps ? e.webSteps[lang] : e.web ? webSteps(e.account, lang) : null,
  };
}
