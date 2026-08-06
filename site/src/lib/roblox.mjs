// Pembaca cache roblox-codes.json (vertikal Roblox) untuk build SSG.
// Sumber data = worker/data/roblox-codes.json (dari RoCodes.gg). Bentuk mirror
// codes.mjs supaya bisa pakai pola kartu/sort yang sama.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CACHE = process.env.KODEGG_ROBLOX ?? resolve(process.cwd(), "../worker/data/roblox-codes.json");

const ICON_DIR = "/assets/roblox";
export const robloxIconUrl = (id) => `${ICON_DIR}/${id}.png`;

// Aturan badge sama dengan mobile (lihat codes.mjs): baru ditarik ATAU baru
// dirilis dalam 24 jam, asal bukan impor pertama sebuah game (`bulk`).
const NEW_MS = 24 * 3600 * 1000;
const NOW_MS = Date.now();

function shape(item, games) {
  const g = games[item.game] || {};
  const dateMs = Date.parse(item.date ?? "") || 0;
  const firstSeenMs = Date.parse(item.firstSeenAt ?? "") || 0;
  // rankMs = kunci sort "Terbaru": tanggal rilis dulu; kalau tak ada & bukan
  // impor massal pertama, pakai firstSeen. (Lihat codes.mjs untuk alasan `bulk`.)
  const rankMs = dateMs || (item.bulk ? 0 : firstSeenMs);
  // newMs = dasar badge "BARU". Memakai TANGGAL RILIS sumber; firstSeen hanya
  // dipakai bila sumber tak memberi tanggal (umur tak diketahui — dan itu beda
  // dari diketahui-tua). Dulu max(dateMs, firstSeenMs): kode lama yang baru kita
  // TEMUKAN ikut dicap BARU — kejadian 2 Agu 2026, Shindo Life "5YearSL2!" rilis
  // 23 Des 2025 (222 hari) tampil BARU karena RoCodes baru memunculkannya hari
  // itu. Sejalan dengan saringan usia pemicu notif/video di fetch-roblox.
  // Kode TANPA tanggal rilis (praktis semua kode Roblox Den — halaman mereka tak
  // pernah memberi tanggal) hanya boleh BARU bila SUMBER menandainya "NEW CODE"
  // (item.srcNew). Tanpa syarat ini, tiap kali kita pertama membaca halaman Den
  // berisi ratusan kode lama, semuanya dicap BARU selama 24 jam — dan itu terjadi
  // bergelombang tiap jam selama backfill Den ke 267 game.
  // Catatan: jalur MOBILE sengaja TETAP memakai firstSeen tanpa syarat, karena di
  // sana kode tak bertanggal (mis. NIKKE/Whiteout dari editorial) memang genuine
  // baru saat ditemukan — tak ada sumber yang menumpahkan ratusan kode lama.
  // Umur penanda NEW dihitung dari kapan SUMBER memasangnya (srcNewAt = stempel
  // "Last checked" halaman Den), bukan dari kapan kita menemukannya. Badge NEW di
  // Den menempel sampai halamannya diperiksa lagi: 2 Agu 2026 Anime Astral
  // Simulator memajang 34 NEW CODE padahal terakhir dicek 31 Juli. Memakai
  // firstSeen di situ akan mencap 34 kode berumur ≥2 hari sebagai BARU.
  // Dipakai bukti PALING TUA di antara keduanya, karena masing-masing hanya batas
  // atas: Den mempertahankan badge NEW berhari-hari (2 Agu 2026: halaman Shindo
  // Life dicek hari itu juga, tapi 7 dari 9 kode ber-NEW rilis 17-26 Juli), jadi
  // srcNewAt saja bisa membuat kode 2 pekan tampak baru; sebaliknya firstSeen
  // saja mencap kode lama sebagai baru begitu halamannya pertama kali kita baca.
  const srcNewMs = Number(item.srcNewAt) || 0;
  const bukti = srcNewMs && firstSeenMs ? Math.min(srcNewMs, firstSeenMs) : srcNewMs || firstSeenMs;
  const newMs = dateMs || (item.bulk || !item.srcNew ? 0 : bukti);
  return {
    ...item, // termasuk source/sources/sourceUrls dari worker (RoCodes &/atau Roblox Den)
    name: g.name ?? item.gameName ?? "—",
    icon: robloxIconUrl(item.game),
    gameSlug: g.slug ?? item.game,
    rankMs,
    firstSeenMs,
    isNew: newMs > 0 && NOW_MS - newMs <= NEW_MS,
    verified: item.verified === true,
    search: `${g.name ?? ""} ${item.code ?? ""} ${item.reward ?? ""}`.toLowerCase(),
  };
}

async function read() {
  try {
    return JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return { updatedAt: null, active: [], archive: [], games: {} };
  }
}

const bySort = (a, b) => b.rankMs - a.rankMs || b.firstSeenMs - a.firstSeenMs;

/** Homepage: N kode Roblox terbaru lintas game + hitungan. Diversifikasi: maks
 * 2 kode per game supaya satu game yang baru drop banyak kode tak memborong
 * section (showcase lebih banyak game). */
export async function loadRobloxHome(limit = 8) {
  const raw = await read();
  const games = raw.games ?? {};
  const active = (raw.active ?? []).map((c) => shape(c, games)).sort(bySort);
  const perGame = {};
  const top = [];
  for (const c of active) {
    if (limit && top.length >= limit) break;
    const n = (perGame[c.game] = (perGame[c.game] ?? 0) + 1);
    if (n <= 2) top.push(c);
  }
  // TRENDING Roblox: game teramai (pemain konkuren realtime, di-refresh tiap jam
  // di worker). Dinamis — urutan otomatis berubah saat popularitas bergeser.
  const activeByGame = {};
  for (const c of raw.active ?? []) activeByGame[c.game] = (activeByGame[c.game] ?? 0) + 1;
  const trending = Object.entries(games)
    .map(([gid, g]) => ({
      id: gid,
      name: g.name,
      slug: g.slug ?? gid,
      icon: robloxIconUrl(gid),
      players: g.players ?? 0,
      genre: rbxGenreLabel(g.genres?.[0]),
      verified: g.verified === true,
      codeCount: activeByGame[gid] ?? 0,
    }))
    .sort((a, b) => b.players - a.players)
    .slice(0, 7);

  return {
    updatedAt: raw.updatedAt ?? null,
    counts: raw.counts ?? { active: active.length, archived: (raw.archive ?? []).length, games: Object.keys(games).length },
    top,
    trending,
    gamesCount: Object.keys(games).length,
  };
}

// Label genre Roblox (istilah game, sama ID/EN) untuk kartu.
const RBX_GENRE = { anime: "Anime", rpg: "RPG", sports: "Sports", fighting: "Fighting", td: "Tower Defense", simulator: "Simulator", adventure: "Adventure", survival: "Survival", casual: "Casual", roleplay: "Roleplay", moba: "MOBA", horror: "Horror" };
function rbxGenreLabel(key) {
  if (!key) return "";
  return RBX_GENRE[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Kartu game Roblox untuk halaman Favorit (bentuk selaras loadCatalog): dipakai
 * agar game Roblox yang difavoritkan ikut tampil di /saved. platform:"roblox"
 * menandai URL /roblox/<slug>. */
export async function loadRobloxSavedCards() {
  const raw = await read();
  return Object.entries(raw.games ?? {}).map(([gid, g]) => ({
    id: gid,
    name: g.name,
    slug: g.slug ?? gid,
    cover: robloxIconUrl(gid),
    genreLabels: (g.genres ?? []).map(rbxGenreLabel).filter(Boolean),
    hasCodes: true,
    platform: "roblox",
  }));
}

/** Katalog game Roblox (getStaticPaths per-game + hub). Default urut KODE TERBARU
 * (tanggal kode terbaru tiap game) → game yang jarang update kode turun ke bawah. */
export async function loadRobloxCatalog() {
  const raw = await read();
  const games = raw.games ?? {};
  const activeByGame = {};
  const newestByGame = {};
  // lastChangeByGame = kapan ISI HALAMAN game ini terakhir berubah = saat kode
  // terakhir MASUK (firstSeenAt) atau dirilis (date), mana yg lebih baru.
  // Beda tujuan dari `newestMs`: itu utk sort "kode terbaru" (sengaja mengabaikan
  // firstSeen pd impor massal). Yang ini untuk <lastmod> sitemap, jadi impor
  // massal justru DIHITUNG — halamannya memang baru berubah saat itu.
  const lastChangeByGame = {};
  for (const c of raw.active ?? []) {
    activeByGame[c.game] = (activeByGame[c.game] ?? 0) + 1;
    const ubah = Math.max(Date.parse(c.firstSeenAt ?? "") || 0, Date.parse(c.date ?? "") || 0);
    if (ubah > (lastChangeByGame[c.game] ?? 0)) lastChangeByGame[c.game] = ubah;
    // SAMA dg rankMs homepage: tanggal rilis dulu; kalau tak ada & BUKAN impor
    // massal pertama, baru firstSeen. Tanpa ini, game yg baru di-discover (kode
    // lama tapi `bulk`) salah naik ke puncak "kode terbaru" krn firstSeen=hari ini.
    const ms = Date.parse(c.date ?? "") || (c.bulk ? 0 : Date.parse(c.firstSeenAt ?? "")) || 0;
    if (ms > (newestByGame[c.game] ?? 0)) newestByGame[c.game] = ms;
  }
  return Object.entries(games)
    .map(([id, g]) => ({
      id,
      name: g.name,
      slug: g.slug ?? id,
      icon: robloxIconUrl(id),
      genres: g.genres ?? [],
      verified: g.verified === true,
      activeCount: activeByGame[id] ?? 0,
      newestMs: newestByGame[id] ?? 0, // tanggal kode terbaru → sort "terbaru"
      lastChangeMs: lastChangeByGame[id] ?? 0, // perubahan isi halaman → <lastmod> sitemap
      players: g.players ?? 0, // pemain konkuren realtime → sort "terpopuler"
    }))
    .sort((a, b) => b.newestMs - a.newestMs || b.activeCount - a.activeCount || a.name.localeCompare(b.name));
}

/** Daftar ringkas game Roblox (id + nama) untuk picker notifikasi. `id` = kunci
 * filter push-notify (cocok dg field `game` pada kode), bukan slug. */
export async function loadRobloxGameList() {
  const raw = await read();
  return Object.entries(raw.games ?? {})
    .map(([id, g]) => ({ id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Kode PROMO Roblox platform (halaman /roblox/promo-codes). */
export async function loadRobloxPromo() {
  const raw = await read();
  const p = raw.promo ?? { active: [], archive: [] };
  const shape = (c) => ({ ...c, verified: c.verified === true });
  return {
    updatedAt: p.updatedAt ?? raw.updatedAt ?? null,
    active: (p.active ?? []).map(shape),
    archive: (p.archive ?? []).map(shape),
  };
}

/** Per-game (halaman /roblox/<slug>): meta + kode aktif + arsip. */
export async function loadRobloxGame(slug) {
  const raw = await read();
  const games = raw.games ?? {};
  const entry = Object.entries(games).find(([, g]) => (g.slug ?? "") === slug);
  if (!entry) return null;
  const [id, g] = entry;
  const active = (raw.active ?? []).filter((c) => c.game === id).map((c) => shape(c, games)).sort(bySort);
  const archive = (raw.archive ?? []).filter((c) => c.game === id).map((c) => shape(c, games)).sort(bySort);
  return {
    id,
    slug,
    name: g.name,
    icon: robloxIconUrl(id),
    genres: g.genres ?? [],
    universeId: g.universeId ?? null,
    placeId: g.placeId ?? null,
    // rootPlaceId = alamat game di roblox.com. Dipakai tombol "Buka di Roblox",
    // dan cakupannya lebih luas daripada placeId (478 vs 424 game).
    rootPlaceId: g.rootPlaceId ?? null,
    players: g.players ?? 0, // pemain konkuren (realtime, refresh hourly)
    crossCheck: Array.isArray(g.crossCheck) ? g.crossCheck : [], // situs editorial pengonfirmasi
    // Kode yang sumbernya menandai CHECK tak dihitung, walau ia lolos
    // cross-check: chip ini berdiri di kepala halaman sebagai janji, dan
    // menghitung kode yang salah satu sumbernya ragukan membuat janji itu
    // lebih besar dari buktinya. Kartunya sendiri sudah menampilkan CEK DULU.
    verifiedCount: active.filter((c) => c.verified && !c.srcCheck).length,
    howTo: Array.isArray(g.howTo) ? g.howTo : [],
    // Syarat redeem (mis. RIVALS wajib follow developer-nya dulu). Bilingual
    // {en,id} dari registry manual worker/src/roblox-games.mjs.
    // `links` (opsional) = akun/halaman yang harus dibuka pembaca utk memenuhi
    // syaratnya — bikin syarat itu bisa DIKERJAKAN, bukan cuma dibaca.
    redeemNote: g.redeemNote && g.redeemNote.en ? g.redeemNote : null,
    updatedAt: raw.updatedAt ?? null,
    // "Terakhir dicek" = fetchedAt TERBARU antar kode game ini (= run terakhir
    // yg sukses menarik sumbernya; game yg fetch-nya gagal fetchedAt-nya lama).
    checkedAt:
      [...active, ...archive].reduce((mx, c) => Math.max(mx, Date.parse(c.fetchedAt ?? "") || 0), 0) ||
      (raw.updatedAt ? Date.parse(raw.updatedAt) : 0),
    active,
    archive,
  };
}

/**
 * Kode Roblox yang RILIS dalam N hari terakhir, dikelompokkan per game.
 *
 * Dasarnya `c.date` — tanggal rilis dari sumber — BUKAN firstSeenAt. Bedanya
 * menentukan: firstSeenAt cuma mencatat kapan kita pertama membaca halamannya,
 * jadi game yang baru masuk katalog akan menyeret puluhan kode lama seolah baru
 * (terlihat 2 Agu 2026: 108 game terbaca "dapat kode baru" padahal itu gelombang
 * backfill). Kode tanpa tanggal sengaja dibuang — lebih baik daftar ini pendek
 * dan jujur daripada panjang tapi tak bisa dipertanggungjawabkan.
 *
 * Kode ber-badge CEK DULU juga dibuang: halaman ini menjawab "kode apa yang baru
 * dan bisa dipakai", dan menyertakan kode yang kita sendiri ragukan merusak
 * justru janji itu.
 */
export async function loadRobloxThisWeek(hari = 7) {
  const raw = await read();
  const games = raw.games ?? {};
  const batas = NOW_MS - hari * 24 * 3600 * 1000;
  const per = new Map();
  for (const c of raw.active ?? []) {
    // srcCheck ikut disaring: halaman ini memajang kode sebagai temuan terbaik
    // minggu ini, dan kode yang salah satu sumbernya ragukan tak layak berdiri
    // di sana — walau ia lolos cross-check.
    if (c.check || c.srcCheck) continue;
    const ms = Date.parse(c.date ?? "") || 0;
    if (!ms || ms < batas) continue;
    const g = games[c.game];
    if (!g) continue;
    if (!per.has(c.game)) per.set(c.game, { id: c.game, name: g.name, slug: g.slug ?? c.game, icon: robloxIconUrl(c.game), players: g.players ?? 0, codes: [] });
    per.get(c.game).codes.push({ ...c, verified: c.verified === true, tanggalMs: ms });
  }
  const daftar = [...per.values()];
  for (const g of daftar) g.codes.sort((a, b) => b.tanggalMs - a.tanggalMs);
  // Diurutkan menurut PEMAIN, bukan tanggal: pembaca datang untuk menemukan kode
  // game yang mereka mainkan, dan game teramai paling mungkin itu. Tanggal sudah
  // tercetak di tiap kode, jadi tak ada informasi yang hilang.
  daftar.sort((a, b) => b.players - a.players || b.codes.length - a.codes.length);
  return {
    updatedAt: raw.updatedAt ?? null,
    games: daftar,
    totalKode: daftar.reduce((n, g) => n + g.codes.length, 0),
    totalGame: daftar.length,
    katalogGame: Object.keys(games).length,
  };
}
