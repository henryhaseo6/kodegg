// Katalog game ONLINE / live-service untuk halaman "Jelajah Game".
//
// Superset dari GAMES (registry kode): mencakup game yang KITA punya kodenya
// (hasCodes:true → kartu bisa tautkan ke halaman kode) DAN game online lain
// dalam ruang lingkup CLAUDE.md yang hanya untuk dijelajahi.
//
// Genre dikurasi (bukan dari iTunes yang cuma "Games,Roleplaying") supaya filter
// genre bermakna. Metadata lain (rating, tanggal rilis, cover, ratingCount)
// ditarik worker dari iTunes Lookup — lihat fetch-catalog.mjs.
//
// Aturan CLAUDE.md: hanya game online/live-service. Semua entri di sini online.

import { GAMES } from "./games.mjs";

// Game tambahan (browse-only, belum punya halaman kode).
const BROWSE = {
  mlbb: { name: "Mobile Legends: Bang Bang", genres: ["moba"], appleId: "com.mobile.legends.usa" },
  wildrift: { name: "League of Legends: Wild Rift", genres: ["moba"], appleId: "com.riotgames.league.wildrift" },
  hok: { name: "Honor of Kings", genres: ["moba"], appleId: "com.levelinfinite.sgameGlobal" },
  aov: { name: "Arena of Valor", genres: ["moba"], appleId: "com.ngame.allstar.eu" },
  pubgm: { name: "PUBG Mobile", genres: ["br", "shooter"], appleId: "com.tencent.ig" },
  codm: { name: "Call of Duty: Mobile", genres: ["br", "shooter"], appleId: "com.activision.callofduty.shooter" },
  ff: { name: "Free Fire", genres: ["br", "shooter"], appleId: "com.dts.freefireth" },
  nikke: { name: "Goddess of Victory: NIKKE", genres: ["rpg", "gacha", "shooter"], appleId: "com.proximabeta.nikke" },
  ba: { name: "Blue Archive", genres: ["rpg", "gacha"], appleId: "com.nexon.bluearchive" },
  whiteout: { name: "Whiteout Survival", genres: ["strategy", "idle"], appleId: "com.gof.global" },
  lastwar: { name: "Last War: Survival", genres: ["strategy", "idle"], appleId: "com.lastwar.ios" },
};

/**
 * Katalog gabungan. Game berkode diambil dari GAMES (+ hasCodes:true), lalu
 * game browse ditambahkan. Satu bentuk seragam: { id, name, genres, appleId, hasCodes }.
 */
export const CATALOG = {
  ...Object.fromEntries(
    Object.entries(GAMES).map(([id, meta]) => [
      id,
      { name: meta.name, genres: meta.genres ?? [], appleId: meta.appleId, hasCodes: true },
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(BROWSE).map(([id, meta]) => [id, { ...meta, hasCodes: false }]),
  ),
};

export const CATALOG_IDS = Object.keys(CATALOG);
