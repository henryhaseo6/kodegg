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
    genres: ["rpg", "action", "gacha"],
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
    genres: ["action", "rpg", "gacha"],
    appleId: "com.HoYoverse.Nap",
    androidId: "com.HoYoverse.Nap",
    iconFile: "zzz.png",
  },
  hi3: {
    name: "Honkai Impact 3rd",
    isHoyo: true,
    redeemUrl: "https://honkaiimpact3.hoyoverse.com/gift",
    genres: ["action", "rpg", "gacha"],
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
    genres: ["rpg", "action", "gacha"],
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
  // --- Game via redeem-code-tracker (sources/redeemtracker.mjs) ---
  e7: {
    name: "Epic Seven",
    codeSource: "redeemtracker",
    redeemUrl: null, // redeem in-game (Menu → coupon)
    genres: ["rpg", "gacha"],
    appleId: "com.stove.epic7.ios",
    androidId: "com.stove.epic7.google",
    iconFile: "e7.png",
  },
  endfield: {
    name: "Arknights: Endfield",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["rpg", "strategy", "gacha"],
    appleId: "com.gryphline.endfield.ios",
    androidId: "com.gryphline.endfield.global",
    iconFile: "endfield.png",
  },
  nte: {
    name: "Neverness to Everness",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["action", "rpg", "gacha"],
    appleId: "com.hottagames.nte",
    androidId: "com.hottagames.nte",
    iconFile: "nte.png",
  },
  diablo: {
    name: "Diablo Immortal",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["action", "rpg", "mmorpg"],
    appleId: "com.blizzard.diablo.immortal",
    androidId: "com.blizzard.diablo.immortal",
    iconFile: "diablo.png",
  },
  afka: {
    name: "AFK Arena",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["idle", "rpg"],
    appleId: "com.lilithgame.hgames.ios",
    androidId: "com.lilithgame.hgame.gp",
    iconFile: "afka.png",
  },
  gtales: {
    name: "Guardian Tales",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["action", "adventure", "rpg"],
    appleId: "com.kakaogames.gdts",
    androidId: "com.kakaogames.gdts",
    iconFile: "gtales.png",
  },
  mongil: {
    name: "Mongil: Star Dive",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["rpg", "gacha"],
    appleId: "com.netmarble.monster2",
    androidId: "com.netmarble.monster2",
    iconFile: "mongil.png",
  },
  dtrav: {
    name: "Dragon Traveler",
    codeSource: "redeemtracker",
    redeemUrl: null, // redeem in-game (Gift Code)
    genres: ["rpg", "idle", "gacha"],
    appleId: "com.gametree.lhlr.ios",
    androidId: "com.gametree.lhlr.gp",
    iconFile: "dtrav.png",
  },
  sxs: {
    name: "Sword x Staff",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["rpg", "idle", "strategy"],
    appleId: "com.zjcs.ios.us",
    androidId: "com.zjcs.android.us",
    iconFile: "sxs.png",
  },
  evernight: {
    name: "Ever Night: Reawakening",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["rpg", "idle", "gacha"],
    appleId: "com.yongyesea.ios",
    androidId: "com.yongyesea.az",
    iconFile: "evernight.png",
  },
  // --- Ditemukan bot pemantau sumber (discover-sources.mjs) 21 Jul 2026 ---
  drr: {
    name: "Dragon Raja: ReRise",
    codeSource: "redeemtracker", // + cross-check editorial (lihat editorial.mjs)
    redeemUrl: null,
    genres: ["mmorpg", "rpg", "action"],
    appleId: "com.fh.eu.drc.ios",
    androidId: "com.fh.sea.drc.gp",
    iconFile: "drr.png",
  },
  icre: {
    name: "Illusion Connect: Re",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["rpg", "gacha", "strategy"],
    appleId: "com.sugargame.mjlj",
    androidId: "com.sugargame.mjlj.gp",
    iconFile: "icre.png",
  },
  tlon: {
    name: "The Legend of Neverland",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["mmorpg", "rpg", "adventure"],
    appleId: "com.arkgames.tlonglobal",
    androidId: "com.gameark.ggplay.lonsea",
    iconFile: "tlon.png",
  },
  afkac: {
    // Mode "Companions" dilacak terpisah oleh redeem-code-tracker (kodenya beda
    // dari AFK Arena Classic) — aplikasinya sama, jadi id store & ikonnya ikut.
    name: "AFK Arena: Companions",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["idle", "rpg", "gacha"],
    appleId: "com.lilithgame.hgames.ios",
    androidId: "com.lilithgame.hgame.gp",
    iconFile: "afkac.png",
  },
  // Valorant DI-HOLD: ada di redeem-code-tracker, tapi tak punya listing App
  // Store/Play Store global (Valorant Mobile belum rilis luas) → pipeline ikon
  // tak punya sumber. Tambahkan bila versi mobile-nya sudah tersedia resmi.
  isekai: {
    name: "Isekai: Slow Life",
    codeSource: "redeemtracker",
    redeemUrl: null, // redeem in-game (Settings → Gift Code)
    genres: ["idle", "strategy", "rpg"],
    appleId: "com.iskslow.mislen.ios",
    androidId: "com.iskslowtest.mislen",
    iconFile: "isekai.png",
  },
  loe: {
    name: "Legend of Elements",
    codeSource: "redeemtracker",
    redeemUrl: null, // redeem in-game (Settings → Gift Code)
    genres: ["mmorpg", "rpg", "idle"],
    appleId: "com.us.zzsj.ios",
    androidId: "com.zzsjus.google",
    iconFile: "loe.png",
  },
  starsail: {
    name: "Star Sailors",
    codeSource: "redeemtracker",
    redeemUrl: null,
    genres: ["rpg", "gacha", "strategy"],
    appleId: "com.com2usholdings.starsailors.ios.apple.global.normal",
    androidId: "com.com2usholdings.starsailors.android.google.global.normal",
    iconFile: "starsail.png",
  },
  // --- Game via cross-check editorial ≥2 sumber (sources/editorial.mjs) ---
  // Tak ada tracker cepat → NIKKE dilacak situs guide; akurasi dijaga dengan
  // hanya menampilkan kode yang ≥2 sumber sepakat aktif.
  gov: {
    name: "Goddess of Victory: NIKKE",
    codeSource: "editorial",
    redeemUrl: null, // redeem in-game (Settings → Other → coupon)
    genres: ["rpg", "action", "gacha"],
    appleId: "com.proximabeta.nikke",
    androidId: "com.proximabeta.nikke",
    iconFile: "gov.png",
  },
  mlbb: {
    name: "Mobile Legends: Bang Bang",
    codeSource: "editorial",
    redeemUrl: "https://www.mobilelegends.com/redeem",
    genres: ["moba"],
    appleId: "com.mobile.legends",
    androidId: "com.mobile.legends",
    iconFile: "mlbb.png",
  },
  sdsgc: {
    name: "The Seven Deadly Sins: Grand Cross",
    codeSource: "editorial",
    redeemUrl: "https://coupon.netmarble.com/nanagb", // portal coupon resmi Netmarble
    genres: ["rpg", "gacha"],
    appleId: "com.netmarble.nanagb",
    androidId: "com.netmarble.nanagb",
    iconFile: "sdsgc.png",
  },
  // --- Game via whiteoutsurvival-community (sources/whiteout.mjs) ---
  wos: {
    name: "Whiteout Survival",
    codeSource: "whiteout",
    redeemUrl: "https://wos-giftcode.centurygame.com/",
    genres: ["strategy", "survival"],
    appleId: "com.gof.global",
    androidId: "com.gof.global",
    iconFile: "wos.png",
  },
};

/** Jalur publik icon sebuah game (dipakai situs). */
export const ICON_DIR = "/assets/games";
export const iconUrl = (id) => (GAMES[id]?.iconFile ? `${ICON_DIR}/${GAMES[id].iconFile}` : null);

// Slug URL keyword dari NAMA game (mis. "Genshin Impact" → "genshin-impact"),
// dipakai di URL /game/<slug> untuk SEO. `id` internal (gi, mlbb) tetap kunci
// data (codes.json, events, icon). Slug diturunkan dari nama → stabil selama
// nama tak berubah. Semua slug terbukti unik (dicek saat migrasi).
const slugify = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const GAME_SLUG = Object.fromEntries(Object.keys(GAMES).map((id) => [id, slugify(GAMES[id].name)]));
export const gameSlug = (id) => GAME_SLUG[id] ?? id;
export const gameIdFromSlug = (slug) => Object.keys(GAME_SLUG).find((id) => GAME_SLUG[id] === slug) ?? null;

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
