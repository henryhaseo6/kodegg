// Registry game ONLINE / live-service — SATU-SATUNYA sumber kebenaran.
// Dipakai worker DAN situs (site/ mengimpor file ini), jadi menambah game cukup
// di satu tempat.
//
// Aturan CLAUDE.md: hanya game online/live-service. Game offline/single-player di-skip.
//
// Field yang tak boleh hilang saat menambah game:
//   isHoyo     true = punya kode HoYoverse (ditarik lewat rantai sumber kode).
//              Kunci per-sumber (seria/ennead) ada di masing-masing adapter,
//              bukan di sini — registry cukup tahu "ini game HoYo".
//   appleId    bundleId App Store  → sumber icon #1 (iTunes Lookup API).
//   androidId  package Play Store  → sumber icon #2 (fallback bila App Store gagal).
//   iconFile   nama berkas hasil fetch di site/public/assets/games/.
//
// Icon & kode sama-sama pakai RANTAI banyak sumber (lihat src/chain.mjs) supaya
// tidak bergantung pada satu penyedia.

export const GAMES = {
  gi: {
    name: "Genshin Impact",
    isHoyo: true,
    redeemUrl: "https://genshin.hoyoverse.com/en/gift",
    genres: ["rpg", "gacha"],
    appleId: "com.miHoYo.GenshinImpact",
    androidId: "com.miHoYo.GenshinImpact",
    iconFile: "gi.png",
  },
  hsr: {
    name: "Honkai: Star Rail",
    isHoyo: true,
    redeemUrl: "https://hsr.hoyoverse.com/gift",
    genres: ["rpg", "gacha"],
    appleId: "com.HoYoverse.hkrpgoversea",
    androidId: "com.HoYoverse.hkrpgoversea",
    iconFile: "hsr.png",
  },
  zzz: {
    name: "Zenless Zone Zero",
    isHoyo: true,
    redeemUrl: "https://zenless.hoyoverse.com/redemption",
    genres: ["action", "gacha"],
    appleId: "com.HoYoverse.Nap",
    androidId: "com.HoYoverse.Nap",
    iconFile: "zzz.png",
  },
  hi3: {
    name: "Honkai Impact 3rd",
    isHoyo: true,
    redeemUrl: "https://honkaiimpact3.hoyoverse.com/gift",
    genres: ["action", "gacha"],
    appleId: "com.miHoYo.bh3global",
    androidId: "com.miHoYo.bh3global",
    iconFile: "hi3.png",
  },
  tot: {
    name: "Tears of Themis",
    isHoyo: true, // seria mendukung key "tot"
    redeemUrl: "https://tot.hoyoverse.com/gift",
    genres: ["otome", "gacha"],
    appleId: "com.miHoYo.tot.glb",
    androidId: "com.miHoYo.tot.glb",
    iconFile: "tot.png",
  },
  // --- Game via wiki (tanpa API resmi; lihat sources/wiki.mjs) ---
  wuwa: {
    name: "Wuthering Waves",
    codeSource: "wiki",
    redeemUrl: "https://wutheringwaves.kurogames.com/",
    genres: ["rpg", "gacha"],
    appleId: "com.kurogame.wutheringwaves.global",
    androidId: "com.kurogame.wutheringwaves.global",
    iconFile: "wuwa.png",
  },
  r1999: {
    name: "Reverse: 1999",
    codeSource: "wiki",
    redeemUrl: null, // redeem HANYA in-game (Settings → Exchange Code); tak ada halaman web
    genres: ["rpg", "gacha", "strategy"],
    appleId: "com.bluepoch.m.en.reverse1999.ios",
    androidId: "com.bluepoch.reverse1999",
    iconFile: "r1999.png",
  },
  afkj: {
    name: "AFK Journey",
    codeSource: "wiki",
    redeemUrl: "https://www.afkjourney.com/gift-code",
    genres: ["idle", "rpg"],
    appleId: "com.farlightgames.igame.ios",
    androidId: "com.farlightgames.igame.gp",
    iconFile: "afkj.png",
  },
  // Infinity Nikki (Infold/Papergames) — via Fandom wiki + crimsonwitch.
  // Redeem HANYA in-game (Settings → Redeem Code); tak ada halaman web resmi.
  nikki: {
    name: "Infinity Nikki",
    codeSource: "wiki",
    redeemUrl: null,
    genres: ["adventure", "gacha"],
    appleId: "com.infoldgames.infinitynikkien",
    androidId: "com.infoldgames.infinitynikki",
    iconFile: "nikki.png",
  },
};

/** Jalur publik icon sebuah game (dipakai situs). */
export const ICON_DIR = "/assets/games";
export const iconUrl = (id) => (GAMES[id]?.iconFile ? `${ICON_DIR}/${GAMES[id].iconFile}` : null);

/** Id internal semua game HoYoverse (punya rantai sumber kode). */
export const HOYO_IDS = Object.entries(GAMES)
  .filter(([, meta]) => meta.isHoyo)
  .map(([id]) => id);

/**
 * Judul giveaway yang JELAS game offline/single-player → skip (aturan CLAUDE.md).
 * GamerPower type=loot mayoritas live-service, tapi sesekali menyelipkan DLC
 * game offline. Cocokkan sebagai substring, case-insensitive.
 */
export const OFFLINE_DENYLIST = [
  "minecraft", // DLC dunia/skin, bukan live-service
];

export function isOfflineTitle(title = "") {
  const t = title.toLowerCase();
  return OFFLINE_DENYLIST.some((bad) => t.includes(bad));
}
