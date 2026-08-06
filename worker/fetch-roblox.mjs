// KodeGG — penarik kode ROBLOX. Output: data/roblox-codes.json.
//
// DUA SUMBER PRIMER yang saling melengkapi + saling cross-check:
//   - RoCodes.gg   (fetchRoCodes)   — punya universeId, howTo, tanggal.
//   - Roblox Den   (fetchRobloxDen) — punya reward bagus, placeId, game lain.
// Kode di-UNION per game; tiap kode mencatat sumber mana yang punya. Kode yang
// ada di KEDUA primer = otomatis lebih terpercaya (saling konfirmasi).
//
// VERIFIED: kode ditandai verified bila dikonfirmasi ≥2 sumber (gabungan: primer
// yang punya kode + situs editorial cross-check). Cross-check editorial (5 situs)
// tetap dipakai sebagai lapisan tambahan.
//
// AUTO-EXPAND (Fase 3): seed kurasi + akumulasi + discovery game terpopuler
// (Roblox explore-api) yang ada di RoCodes ATAU Roblox Den, sampai MAX_GAMES.

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { preferCasing } from "./src/normalize.mjs";
import { ROBLOX_GAMES, robloxSlug, ROBLOX_NAME_OVERRIDE, ROBLOX_REDEEM_NOTE, ROBLOX_HOWTO_PIN, ROBLOX_ALIAS, NAMA_BEDA_OK } from "./src/roblox-games.mjs";
import { fetchRoCodes } from "./src/sources/rocodes.mjs";
import { fetchRobloxDen, fetchRobloxDenIndex } from "./src/sources/robloxden.mjs";
import { scoutDen } from "./src/den-scout.mjs";
import { scoutRoCodes } from "./src/rocodes-scout.mjs";
import { sapuIdentitas, petaUid, petaPlace, sambungUlang } from "./src/uid-map.mjs";
import { deteksiMiss } from "./src/miss-detector.mjs";
import { catatDeskripsi, laporanDeskripsi } from "./src/desc-probe.mjs";
import { rekamProbe, ringkasProbe } from "./src/lastmod-probe.mjs";
import { fetchRoCodesIndex } from "./src/roblox-discover.mjs";
import { crossCheckActive } from "./src/sources/roblox-crosscheck.mjs";
import { scanLevelup, petaExpired, normSlug } from "./src/sources/levelupplay.mjs";
import { fetchPromoCodes } from "./src/sources/roblox-promo.mjs";
import { discoverPopularWithCodes, inferGenres } from "./src/roblox-discover.mjs";
import { mergeWithPrevious } from "./src/archive.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/roblox-codes.json");
// Batas atas jumlah game. HARUS ≥ ukuran semesta "populer + punya kode" dari
// discoverPopularWithCodes (~367), kalau tidak prevGames (data run lalu) mengunci
// semua slot dan game HOT baru tak pernah bisa masuk (bug: game 9.9K pemain +
// featured RoCodes kejebak di luar karena cap 250 keburu penuh oleh prevGames).
// Game tanpa kode aktif tetap gugur → angka final natural di bawah cap ini.
// Dinaikkan 400 → 600 (3 Agu 2026) karena cap-nya SUDAH mengikat: game tercatat
// 385, semesta discovery memuat 20 game yang benar-benar belum dipantau, jadi 5
// tertahan — termasuk Catalog Avatar Creator (86.329 pemain). Perhatikan cap ini
// hanya membatasi jalur discovery (lihat `break` di buildGameSet); prevGames
// masuk TANPA batas, jadi makin penuh daftar kita, makin sempit jatah game baru.
// Itulah kenapa gejalanya muncul perlahan lalu mendadak menutup total.
//
// TIDAK dilepas sepenuhnya: cap ini satu-satunya rem kalau discovery/den-scout
// suatu saat memuntahkan ribuan game. Biaya tiap game = 1 penarikan RoCodes per
// run (TAK digerbangi) = 24/hari; 385 game ≈ 9.240 permintaan/hari, 600 ≈ 14.400.
// Durasi bukan kendala (run rutin 1-2 menit). Solusi sebenarnya untuk beban itu
// adalah menggerbangi RoCodes dg <lastmod> spt Den — menunggu data
// lastmod-probe.json; kalau terbukti jujur, angkanya turun drastis dan cap ini
// bisa dilonggarkan lagi tanpa menambah beban.
const MAX_GAMES = 600;
const CONCURRENCY = 5; // game paralel maks (rendah = tak membanjiri RoCodes/Den)
// Cross-check editorial — dua tingkat, dijadwal supaya cakupan LUAS tapi beban
// justru TURUN (terukur: 8.760 → 6.665 permintaan/hari):
//   tingkat 1 — game ramai (>= CROSSCHECK_MIN), tiap 3 jam;
//   tingkat 2 — SEMUA game, dijamin kena minimal 1× sehari.
// Dulu: tiap jam untuk game >=10K saja (73 game) — sempit sekaligus boros.
const CROSSCHECK_MIN = Number(process.env.CROSSCHECK_MIN || 5000);
const CROSS_TIAP_JAM = Number(process.env.CROSS_INTERVAL_H || 3);
// Tingkat 2 disebar rata per run, bukan diborong dalam satu run: 373 game × 5
// situs sekaligus = 1.865 permintaan meledak bersamaan ke 5 situs kecil. Dengan
// jatah per run, cakupan hariannya sama tapi bebannya rata.
const CROSS_HARIAN_MAX = Number(process.env.CROSS_DAILY_MAX || 25);
const ARCHIVE_CAP = 300; // arsip kode kedaluwarsa per game — besar biar praktis "selamanya" tanpa JSON meledak liar

// Sumber primer. url = untuk atribusi (dilink di kartu).
const PRIMARIES = [
  { name: "RoCodes.gg", fetch: fetchRoCodes, url: (s) => `https://rocodes.gg/codes/${s}`, slugKey: "rocodesSlug" },
  { name: "Roblox Den", fetch: fetchRobloxDen, url: (s) => `https://robloxden.com/game-codes/${s}`, slugKey: "denSlug" },
];

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { active: [], archive: [] };
  }
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

async function fetchPlayers(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50).join(",");
    try {
      const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${batch}`);
      if (!res.ok) continue;
      // rootPlaceId ikut disimpan: API ini SUDAH dipanggil untuk jumlah pemain,
      // jadi tautan "buka di Roblox" tak menambah satu pun permintaan. Cakupannya
      // juga lebih luas daripada placeId Den (478 vs 424 game).
      // `description` ikut dipungut untuk probe hulu (src/desc-probe.mjs). Sama
      // seperti rootPlaceId: datanya sudah ada di respons ini, jadi mencatatnya
      // tak menambah satu pun permintaan.
      for (const g of (await res.json()).data ?? []) out[g.id] = { playing: g.playing ?? 0, name: g.name || null, rootPlaceId: g.rootPlaceId ?? null, description: g.description || "" };
    } catch {
      /* pertahankan nilai lama */
    }
  }
  return out;
}

// placeId (dari Roblox Den) → universeId (untuk thumbnail & player count).
async function resolveUniverse(placeId) {
  try {
    const res = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return (await res.json()).universeId ?? null;
  } catch {
    return null;
  }
}

const isGeneric = (r) => !r || /^(free\s+)?(in-?game\s+)?(rewards?|gifts?|goodies|codes?)$/i.test(r.trim());

// Pilih langkah redeem antara RoCodes & Roblox Den, hormati ROBLOX_HOWTO_PIN.
// Langkah yang cuma mengulang SYARAT (redeemNote) dibuang: situs sudah memajang
// syarat itu sebagai callout tersendiri di ATAS daftar langkah, jadi tanpa ini
// pembaca melihat kalimat yang sama dua kali (kejadian di rivals — langkah Den
// memuat "You must follow the developers …" sebagai butir ke-4).
// `prev`/`prevSrc` = hasil run sebelumnya. WAJIB dipakai: halaman Den digerbangi
// <lastmod>, jadi pada run yang Den-nya tak ditarik `den` kosong — tanpa
// carry-forward, game yang di-pin ke Den akan JATUH BALIK ke RoCodes dan
// langkahnya bolak-balik tiap jam. (Kejadian: pin rivals dipasang 09:37 WIB,
// run 16:02 WIB masih memajang langkah RoCodes yang usang.)
function pilihHowTo(id, ro, den, prev, prevSrc) {
  const pin = ROBLOX_HOWTO_PIN[id];
  const punya = { den, rocodes: ro };
  let dipakai, src;
  if (pin && punya[pin]?.length) { dipakai = punya[pin]; src = pin; }
  else if (pin && prevSrc === pin && prev?.length) { dipakai = prev; src = pin; } // sumber pin tak ditarik run ini
  else if (ro?.length) { dipakai = ro; src = "rocodes"; }
  else if (den?.length) { dipakai = den; src = "den"; }
  else { dipakai = prev?.length ? prev : []; src = prev?.length ? prevSrc : null; }

  // Buang langkah yang cuma mengulang SYARAT (redeemNote): situs sudah memajang
  // syarat itu sebagai callout tersendiri di ATAS daftar langkah.
  const note = ROBLOX_REDEEM_NOTE[id]?.en;
  if (note) {
    const inti = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const n = inti(note);
    const out = dipakai.filter((s) => inti(s) !== n);
    if (out.length) dipakai = out; // jangan sampai daftar jadi kosong
  }
  return { howTo: dipakai, howToSrc: src };
}

// Gabungkan hasil beberapa primer untuk 1 game. Tiap kode → sumber yang punya.
function mergeCodes(perSource) {
  const merge = (lists) => {
    const map = new Map(); // codeLower → item
    for (const { name, url, items } of lists) {
      for (const c of items) {
        const key = (c.code ?? "").trim().toLowerCase();
        if (!key) continue;
        let it = map.get(key);
        if (!it) {
          it = { code: c.code.trim(), reward: null, date: null, endsAt: null, sources: [], sourceUrls: {} };
          map.set(key, it);
        }
        // KAPITALISASI: pilih yang paling mungkin ASLI, bukan yang kebetulan
        // datang duluan. Diukur 5 Agu 2026 atas 20 game teratas: 18,6% kode yang
        // ada di KEDUA sumber berbeda kapitalisasinya, dan polanya sistematis —
        // Roblox Den menormalkan semuanya jadi huruf besar sementara RoCodes
        // mempertahankan aslinya (Sub2Fer999 vs SUB2FER999, fudd10_v2 vs
        // FUDD10_V2). Kode Roblox case-sensitive saat ditukar, jadi memilih yang
        // salah membuat kode yang benar-benar aktif tampak tak bisa dipakai.
        //
        // Selama ini versi yang benar menang secara KEBETULAN, karena RoCodes
        // kebetulan lebih dulu di PRIMARIES. Itu rapuh: untuk 61 game yang slug
        // RoCodes-nya sudah 404, Den jadi satu-satunya sumber dan versi
        // huruf-besarnya yang tampil tanpa perlawanan.
        const tulis = c.code.trim();
        it.code = preferCasing(it.code, tulis);
        // Rekam SEMUA penulisan yang pernah dilihat. Kode Roblox case-sensitive
        // saat ditukar, dan preferCasing cuma menebak mana yang asli — untuk 16%
        // kasus (dua-duanya berkapitalisasi campuran) tebakan itu tak punya dasar
        // sama sekali. Menyimpan varian lain membuat kartu bisa menawarkannya
        // sebagai cadangan, alih-alih menyembunyikan tebakan sebagai kepastian.
        (it._tulisan ??= new Set()).add(tulis);
        if (!it.sources.includes(name)) it.sources.push(name);
        it.sourceUrls[name] = url;
        if ((!it.reward || isGeneric(it.reward)) && c.reward && !isGeneric(c.reward)) it.reward = c.reward;
        if (!it.date && c.date) it.date = c.date;
        if (!it.endsAt && c.endsAt) it.endsAt = c.endsAt;
        // check (Roblox Den "CHECK"): ragu bila SEMUA sumber ragu; hilang begitu
        // ADA sumber yg daftarin TANPA check (confident) → confident/verified menang.
        // srcCheck = keraguan MENTAH sumber, direkam SEBELUM aturan `_confident`
        // di bawah menghapusnya. Tanpa ini keraguan Den lenyap terlalu dini:
        // RoCodes tak punya konsep CHECK sama sekali, jadi SETIAP kode yang ia
        // daftarkan otomatis terhitung "confident" dan membatalkan CHECK dari
        // Den — bukan karena RoCodes menyatakan kode itu baik-baik saja, tapi
        // karena ia memang tak punya cara menyatakan sebaliknya. Diamnya sebuah
        // sumber bukan kesaksian. (TR Legacy 6 Agu 2026: WEHIT25KLIKES &
        // LETSGO20KLIKES ditandai CHECK oleh Den, tampil "Verified" di kita.)
        //
        // DIKUNCI KE DEN, dan itu bukan kehati-hatian berlebihan: denPunya dan
        // roPunya mendorong OBJEK TERSIMPAN YANG SAMA saat sebuah sumber
        // dilewati, jadi srcCheck yang diwariskan buta akan menempel selamanya
        // lewat sisi RoCodes — bahkan setelah Den mencabut keraguannya.
        if (c.check || (c.srcCheck && name === "Roblox Den")) it.srcCheck = true;
        if (c.check) it._check = true; else it._confident = true;
        if (c.srcNew) it.srcNew = true; // ada sumber menandainya "kode baru"
        // Kapan penanda itu dipasang (= "Last checked" halaman sumber). Ambil yang
        // paling baru bila dua sumber sama-sama menandai.
        if (c.srcNewAt > 0 && !(it.srcNewAt >= c.srcNewAt)) it.srcNewAt = c.srcNewAt;
      }
    }
    for (const it of map.values()) {
      if (it._check && !it._confident) it.check = true;
      delete it._check; delete it._confident;
      // altCode = penulisan LAIN yang juga dilaporkan sumber. Hanya diisi kalau
      // benar-benar berbeda dari yang dipilih — kartu tak perlu menampilkan
      // apa-apa saat semua sumber sepakat (diukur: 95,6% kasus).
      const lain = [...(it._tulisan ?? [])].filter((t) => t !== it.code);
      if (lain.length) it.altCode = lain[0];
      delete it._tulisan;
    }
    return [...map.values()];
  };
  return {
    active: merge(perSource.map((p) => ({ name: p.name, url: p.url, items: p.active }))),
    archive: merge(perSource.map((p) => ({ name: p.name, url: p.url, items: p.archive }))),
  };
}

async function buildGameSet(prevGames) {
  const set = new Map();
  const seen = new Set();
  const canon = (e) => e.rocodesSlug || e.denSlug;
  const add = (id, e) => {
    const k = canon(e);
    if (!k || set.has(id) || seen.has(k)) return;
    set.set(id, e);
    seen.add(k);
  };
  // Seed: coba KEDUA primer dg slug yang sama (den gagal → di-skip mulus).
  for (const [id, m] of Object.entries(ROBLOX_GAMES)) add(id, { rocodesSlug: m.slug, denSlug: m.slug, name: m.name, genres: m.genres ?? [], seed: true });
  for (const [id, g] of Object.entries(prevGames)) add(id, { rocodesSlug: g.rocodesSlug ?? g.slug ?? null, denSlug: g.denSlug ?? null, name: g.name, genres: g.genres ?? [], universeId: g.universeId, players: g.players });
  const popular = await discoverPopularWithCodes();
  for (const g of popular) {
    if (set.size >= MAX_GAMES) break;
    add(canon(g), { rocodesSlug: g.rocodesSlug, denSlug: g.denSlug, name: g.name, genres: g.featured ? [] : inferGenres(g.name, canon(g)), universeId: g.universeId, players: g.players, featured: g.featured, needsVerify: g.needsVerify });
  }
  return set;
}

// Dedup by universeId: game yg SAMA bisa punya >1 slug (mis. RoCodes "rivals" &
// "roblox-rivals", atau "fish-it" & "roblox-fish-it") → tampil dobel. universeId
// = identitas sejati game. Gabungkan: pilih survivor (dual-source dulu, lalu kode
// terbanyak, lalu nama terpendek), UNION kode dua slug (dedup per kode), lebur
// meta kosong. Jalan tiap run → dobel tak muncul lagi walau slug baru bermunculan.
function dedupByUniverse(gamesMap, activeArr, archiveArr) {
  const groups = new Map();
  for (const [id, g] of Object.entries(gamesMap)) {
    const uid = Number(g.universeId); // universeId bisa number ATAU string → samakan
    if (!uid) continue;
    (groups.get(uid) ?? groups.set(uid, []).get(uid)).push(id);
  }
  const remap = new Map(); // loserId → survivorId
  for (let ids of groups.values()) {
    if (ids.length < 2) continue;
    // PENJAGA placeId. universeId dipakai di sini sebagai identitas sejati, tapi
    // universeId sendiri BISA SALAH — dan kalau salahnya menunjuk game lain yang
    // ramai, dua game berbeda terlihat kembar lalu kodenya dilebur. Kejadian
    // 4 Agu 2026: `fighting-simulator` menyimpan uid 10321202755 (milik Anime
    // Fighting Simulator). Saat halaman Den Anime Fighting Simulator ditemukan,
    // keduanya segrup → 5 kode Anime FS masuk ke Fighting Simulator, tampil di
    // situs, dan ikut terbit sebagai video.
    //
    // placeId membantah dengan MURAH: itu identitas halaman yang kodenya benar-
    // benar kita pakai, sudah tersimpan, jadi tak perlu satu pun panggilan API.
    // placeId berbeda = halaman berbeda = game berbeda, apa pun kata universeId.
    // Duplikat sah (rivals / roblox-rivals) menunjuk placeId yang SAMA → tetap
    // digabung seperti sebelumnya.
    const pid = (id) => Number(gamesMap[id]?.placeId) || 0;
    const berplace = ids.filter((id) => pid(id));
    if (berplace.length > 1) {
      const utama = pid(berplace[0]);
      const bentrok = berplace.filter((id) => pid(id) !== utama);
      if (bentrok.length) {
        console.log(`  [dedup] uid ${gamesMap[ids[0]]?.universeId} diklaim ${ids.length} game dg placeId BERBEDA → tak digabung: ${ids.join(", ")}`);
        ids = ids.filter((id) => !bentrok.includes(id));
        if (ids.length < 2) continue;
      }
    }
    const nActive = (id) => activeArr.reduce((n, c) => n + (c.game === id ? 1 : 0), 0);
    const score = (id) => {
      const g = gamesMap[id];
      return [g.rocodesSlug && g.denSlug ? 1 : 0, nActive(id), -(g.name?.length ?? 99)];
    };
    ids.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2];
    });
    const survivor = ids[0];
    const s = gamesMap[survivor];
    for (const loser of ids.slice(1)) {
      remap.set(loser, survivor);
      const l = gamesMap[loser];
      if (!s.denSlug && l.denSlug) s.denSlug = l.denSlug;
      if ((s.howTo?.length ?? 0) < (l.howTo?.length ?? 0)) s.howTo = l.howTo;
      s.crossCheck = [...new Set([...(s.crossCheck ?? []), ...(l.crossCheck ?? [])])];
      s.verified = s.verified || l.verified;
      s.players = Math.max(s.players ?? 0, l.players ?? 0);
      delete gamesMap[loser];
    }
  }
  if (!remap.size) return { active: activeArr, archive: archiveArr };
  const reassign = (arr) => {
    const seen = new Set();
    const out = [];
    for (const c of arr) {
      const gid = remap.get(c.game) ?? c.game;
      const key = `${gid}|${(c.code ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(gid === c.game ? c : { ...c, game: gid, gameName: gamesMap[gid]?.name ?? c.gameName });
    }
    return out;
  };
  return { active: reassign(activeArr), archive: reassign(archiveArr) };
}

async function main() {
  const now = new Date().toISOString();
  const prev = await readPrevious();

  const set = await buildGameSet(prev.games ?? {});

  // ── Roblox Den: tarik HANYA yang halamannya berubah ───────────────────────
  // Cakupan Den melonjak (35 → ~300 game) sejak daftar slug pindah ke sitemap.
  // Menarik semuanya tiap jam = ~7.300 permintaan/hari ke situs kecil — tak
  // sopan & mubazir: sitemap mereka menunjukkan hanya ~119 dari 4.900 halaman
  // berubah per 24 jam. Jadi halaman Den ditarik bila `lastmod` sitemap lebih
  // baru dari terakhir kali kita menariknya (`denAt` per game).
  const denIndex = await fetchRobloxDenIndex();
  const prevGamesMap = prev.games ?? {};

  // Pemantau ekor-panjang: game yang kodenya baru diperbarui di Den tapi belum
  // kita pantau. Discovery utama berbasis chart Roblox → game yang sedang NAIK
  // tak masuk chart, padahal di situ permintaan pencarian kode paling besar.
  const SCOUT = resolve(dirname(OUT), "den-scout.json");
  const SCOUT_RO = resolve(dirname(OUT), "rocodes-scout.json");
  let memo = {};
  try { memo = JSON.parse(await readFile(SCOUT, "utf8")); } catch { /* pertama kali */ }
  let memoRo = {};
  try { memoRo = JSON.parse(await readFile(SCOUT_RO, "utf8")); } catch { /* pertama kali */ }
  // TAMBAL denSlug yang tertinggal. buildGameSet menyusun: seed → game LAMA →
  // populer, dan entri yang sudah ada tak bisa ditimpa. Game lama membawa
  // `denSlug: null` apa adanya — nilai itu dihitung dulu terhadap indeks Den yang
  // cuma 109 slug (satu halaman daftar). Setelah indeks pindah ke sitemap (~4.400
  // slug), 267 game ternyata SLUG-nya ada di Den tapi tetap null selamanya karena
  // tak pernah dihitung ulang. Jadi sumber primer kedua yang sudah kita bangun
  // tak akan pernah menyentuh mereka.
  //
  // Pencocokan tetap PERSIS (bukan fuzzy) — dicoba apa adanya plus varian awalan
  // "roblox-", karena RoCodes kerap memberi awalan itu pada slug-nya sementara Den
  // tidak (mis. kita "roblox-smiles" vs Den "smiles").
  // Jadwal cross-check editorial (lihat catatan di konstanta).
  const jamIni = new Date().getUTCHours();
  const putaranTingkat1 = jamIni % CROSS_TIAP_JAM === 0;
  let harianSisa = CROSS_HARIAN_MAX;
  const HARI_MS = 24 * 3600 * 1000;
  const perluCrossCheck = (id, entry) => {
    if (entry.seed || entry.featured) return true;
    if (putaranTingkat1 && (entry.players ?? 0) >= CROSSCHECK_MIN) return true;
    // Tingkat 2: game yang belum di-cross-check 24 jam terakhir, dijatah per run.
    const xAt = Number(prevGamesMap[id]?.xAt ?? 0);
    if (Date.now() - xAt > HARI_MS && harianSisa > 0) { harianSisa -= 1; return true; }
    return false;
  };

  // TAMBAL slug RoCodes yang RUSAK. Slug tersimpan bisa 404 permanen (mis. kita
  // simpan "fish-it" padahal RoCodes memakai "roblox-fish-it") — penarikan gagal
  // TIAP JAM tanpa suara, dan kodenya jadi sisa lama yang tak pernah diperbarui.
  // Terparah: Rivals (232K pemain) & Fish It (126K). Ketahuan 2 Agu 2026 lewat
  // laporan user: RoCodes bilang aktif, Den bilang expired, situs ikut yang basi.
  const roIndexSlug = await fetchRoCodesIndex();
  let roTambal = 0;
  if (roIndexSlug.size) {
    for (const [id, e] of set) {
      if (!e.rocodesSlug || roIndexSlug.has(e.rocodesSlug)) continue;
      // Dua pola beda-slug yang TERBUKTI (diperiksa manual oleh user 2 Agu 2026):
      //   1. awalan SEO — kita "fish-it" vs RoCodes "roblox-fish-it";
      //   2. apostrof — nama "Dandy's World" jadi "dandy-s-world" di kita & Den,
      //      tapi "dandys-world" di RoCodes (apostrof dibuang, bukan jadi tanda
      //      hubung). Kena juga ke "jule-s-rng" → "jules-rng".
      const apos = (t) => t.replace(/-s-/g, "s-").replace(/-s$/, "s");
      const varian = new Set();
      for (const dasar of [e.rocodesSlug, id].filter(Boolean)) {
        for (const bentuk of [dasar, apos(dasar)]) {
          varian.add(bentuk);
          varian.add(bentuk.replace(/^roblox-/, ""));
          varian.add(`roblox-${bentuk}`);
        }
      }
      const cocok = [...varian].find((v) => v && roIndexSlug.has(v));
      if (cocok) { e.rocodesSlug = cocok; roTambal++; }
    }
    if (roTambal) console.log(`slug RoCodes diperbaiki utk ${roTambal} game (sebelumnya 404 tiap run)`);
    // ALARM slug mati. Kegagalan penarikan per-game DIAM (catch kosong: "sumber
    // ini tak punya game → lanjut"), jadi slug yang 404 permanen bisa bertahan
    // berbulan-bulan sambil situs menyajikan sisa lama — persis yang terjadi pada
    // Rivals (232K pemain) & Fish It (126K). Dicatat ke berkas supaya audit
    // harian melaporkannya tanpa perlu menembak jaringan.
    //
    // CATATAN: pencarian slug MIRIP di sitemap sudah diuji dan DITOLAK sebagai
    // penambal otomatis — kandidat ber-skor tinggi ternyata game lain
    // (fighting-simulator → weapon-fighting-simulator, brainrot → to-be-brainrot,
    // knife-vs-gun-duels → knife-duels; ketiganya universeId-nya beda). Kalau
    // suatu saat dipasang, WAJIB diverifikasi universeId halaman kandidat dulu.
    const mati = [];
    for (const [id, e] of set) {
      if (!e.rocodesSlug || roIndexSlug.has(e.rocodesSlug)) continue;
      mati.push({ game: id, slug: e.rocodesSlug, denSlug: e.denSlug ?? null, players: e.players ?? 0 });
    }
    mati.sort((a, b) => b.players - a.players);
    await writeFile(resolve(dirname(OUT), "slug-404.json"), JSON.stringify(mati, null, 1));
    if (mati.length) {
      const buta = mati.filter((m) => !m.denSlug).length;
      console.log(`slug RoCodes 404: ${mati.length} game${buta ? ` — ${buta} DI ANTARANYA TANPA SUMBER LAIN` : " (semuanya masih punya Roblox Den)"}`);
    }
  }

  let ditambal = 0;
  for (const [id, e] of set) {
    if (e.denSlug) continue;
    const kandidat = new Set();
    for (const dasar of [id, e.rocodesSlug].filter(Boolean)) {
      kandidat.add(dasar);
      kandidat.add(dasar.replace(/^roblox-/, ""));
      kandidat.add(`roblox-${dasar}`);
    }
    const cocok = [...kandidat].find((c) => denIndex.has(c));
    if (cocok) { e.denSlug = cocok; ditambal++; }
  }
  if (ditambal) console.log(`denSlug ditambal utk ${ditambal} game (slug ada di sitemap Den tapi belum terhubung)`);

  // ─── PETA IDENTITAS & PENYAMBUNGAN ULANG ───────────────────────────────────
  // Penambalan di atas bekerja lewat TEBAKAN NAMA, dan itu terbukti tak cukup:
  // diukur 6 Agu 2026, 75 dari 491 game (15%) menembak halaman RoCodes yang
  // sudah tak ada — Murderers VS Sheriffs (85.326 pemain), Tower of Hell — dan
  // pencocokan nama cuma menemukan 2 dari 12 teratas, KEDUANYA game yang salah.
  // Ditambah 50 game yang tak pernah punya slug Den, seperempat katalog
  // bersumber tunggal: kalau sumber satu-satunya telat, kita ikut telat dan tak
  // ada pembanding yang memberitahu.
  //
  // Yang dipakai di sini identitas, bukan nama. Sapuan mencatat universeId tiap
  // slug sumber (RoCodes menyediakannya langsung; Den lewat placeId), lalu
  // ikatan yang putus disambung dengan mencarinya balik. Lihat src/uid-map.mjs.
  const UIDRO = resolve(dirname(OUT), "rocodes-uid.json");
  const UIDDEN = resolve(dirname(OUT), "den-uid.json");
  let uidRo = {}, uidDen = {};
  try { uidRo = JSON.parse(await readFile(UIDRO, "utf8")); } catch { /* pertama kali */ }
  try { uidDen = JSON.parse(await readFile(UIDDEN, "utf8")); } catch { /* pertama kali */ }

  try {
    const r = await sapuIdentitas({
      idx: roIndexSlug, memo: uidRo, jatah: Number(process.env.RO_UID_PER_RUN || 60), label: "rocodes",
      baca: async (slug) => { const x = await fetchRoCodes(slug); return { uid: Number(x.meta?.universeId) || null, place: Number(x.meta?.placeId) || null }; },
    });
    uidRo = r.memoBaru;
    await writeFile(UIDRO, JSON.stringify(uidRo, null, 1));
  } catch (e) { console.log(`[uid-map rocodes] dilewati: ${e.message}`); }

  try {
    const r = await sapuIdentitas({
      idx: denIndex, memo: uidDen, jatah: Number(process.env.DEN_UID_PER_RUN || 40), label: "den",
      baca: async (slug) => { const x = await fetchRobloxDen(slug); return { uid: null, place: Number(x.meta?.placeId) || null }; },
    });
    uidDen = r.memoBaru;
    await writeFile(UIDDEN, JSON.stringify(uidDen, null, 1));
  } catch (e) { console.log(`[uid-map den] dilewati: ${e.message}`); }

  {
    const ro = sambungUlang(set, roIndexSlug, petaUid(uidRo), "rocodesSlug", (e) => e.universeId);
    const den = sambungUlang(set, denIndex, petaPlace(uidDen), "denSlug", (e) => e.placeId);
    for (const s of [...ro.sambung, ...den.sambung]) {
      console.log(`  ↻ ${s.nama}: ${s.lama ?? "(belum ada)"} → ${s.baru}`);
    }
    console.log(`[sambung] RoCodes ${ro.sambung.length}/${ro.putus} putus tersambung · Den ${den.sambung.length}/${den.putus}`);
  }

  const slugDipantau = new Set([...set.values()].map((e) => e.denSlug).filter(Boolean));
  const { tambah, memoBaru } = await scoutDen(denIndex, slugDipantau, memo);
  for (const t of tambah) {
    // denSlug = rocodesSlug: kalau slug-nya kebetulan juga ada di RoCodes, dua
    // primer langsung aktif; kalau tidak, RoCodes gagal dilewati mulus.
    set.set(t.slug, { rocodesSlug: t.slug, denSlug: t.slug, name: t.name, genres: [], universeId: t.universeId, players: t.players, needsVerify: false });
  }
  await writeFile(SCOUT, JSON.stringify(memoBaru, null, 1));

  // SCOUT RoCodES. Dijalankan SETELAH scoutDen supaya game yang baru saja
  // ditemukan Den ikut terhitung "sudah dipantau" — kalau tidak, game yang sama
  // bisa masuk dua kali lewat dua slug berbeda.
  const roDipantau = new Set([...set.values()].map((e) => e.rocodesSlug).filter(Boolean));
  const uidDipantau = new Map();
  for (const [gid, e] of set) { const u = Number(e.universeId) || 0; if (u && !uidDipantau.has(u)) uidDipantau.set(u, gid); }
  const { tambah: roTambah, pindah: roPindah, memoBaru: memoRoBaru } = await scoutRoCodes(roIndexSlug, roDipantau, uidDipantau, memoRo);
  // SLUG PINDAH: game yang sudah dipantau, halaman RoCodes-nya berganti alamat.
  // Diverifikasi lewat universeId, jadi aman dari jebakan pencocokan nama yang
  // dulu menolak fitur ini (fighting-simulator → weapon-fighting-simulator).
  for (const p of roPindah) { const e = set.get(p.game); if (e) e.rocodesSlug = p.slugBaru; }
  for (const t of roTambah) {
    if (set.has(t.slug)) continue;
    set.set(t.slug, { rocodesSlug: t.slug, denSlug: t.slug, name: t.name, genres: [], universeId: t.universeId, players: t.players, needsVerify: false });
  }
  await writeFile(SCOUT_RO, JSON.stringify(memoRoBaru, null, 1));

  // levelupplay.my — sumber KODE EXPIRED saja, dirotasi habis dalam 24 jam.
  // Sitemap mereka tak punya <lastmod>, jadi tak ada cara tahu halaman mana yang
  // berubah; satu-satunya jalan memeriksa semuanya bergiliran. Jatah per run =
  // jumlah halaman / 24, jadi menyesuaikan sendiri saat katalog mereka tumbuh.
  const LEVELUP = resolve(dirname(OUT), "levelup-expired.json");
  let memoLU = {};
  try { memoLU = JSON.parse(await readFile(LEVELUP, "utf8")); } catch { /* pertama kali */ }
  try {
    const { memoBaru } = await scanLevelup(memoLU);
    memoLU = memoBaru;
    await writeFile(LEVELUP, JSON.stringify(memoLU, null, 1));
  } catch (e) { console.log(`[levelup] dilewati: ${e.message}`); }
  const luExpired = petaExpired(memoLU);

  const entries = [...set.entries()];

  // Kode Den yang SUDAH kita punya, per game — dipakai saat halamannya dilewati.
  // WAJIB: tanpa ini, kode yang hanya ada di Den lenyap dari hasil merge lalu
  // ikut diarsipkan otomatis (game-nya dianggap "covered"), padahal halamannya
  // tak berubah = kodenya masih terpampang di sana.
  // Usia cadangan utk kode TANPA tanggal rilis. Roblox Den tak pernah memberi
  // tanggal (0 dari 896 kode Den-saja punya `date`), sehingga kode-kode itu kebal
  // terhadap SEMUA aturan berbasis usia: tak bisa disapu (365 hari), tak dapat
  // badge CEK DULU otomatis (180 hari). Proksi yang jujur: sejak kapan KITA
  // menyimpannya — "sudah setahun kami bawa dan tak satu pun sumber kedua
  // mengonfirmasi" adalah bukti yang setara.
  const prevSeen = new Map();
  for (const c of [...(prev.active ?? []), ...(prev.archive ?? [])]) {
    const t = Date.parse(c.firstSeenAt ?? "") || 0;
    if (t) prevSeen.set(`${c.game}:${String(c.code).toLowerCase()}`, t);
  }

  const denPunya = {}, roPunya = {};
  for (const [kunci, arr] of [["active", prev.active ?? []], ["archive", prev.archive ?? []]]) {
    for (const c of arr) {
      const src = c.sources?.length ? c.sources : [c.source];
      if (src.includes("Roblox Den")) ((denPunya[c.game] ??= { active: [], archive: [] })[kunci]).push(c);
      if (src.includes("RoCodes.gg")) ((roPunya[c.game] ??= { active: [], archive: [] })[kunci]).push(c);
    }
  }
  // Backfill awal (game yang belum pernah ditarik dari Den) dibatasi per run
  // supaya rilis ini tak meledak jadi 300 permintaan sekaligus.
  const DEN_BACKFILL_MAX = Number(process.env.DEN_BACKFILL_MAX || 40);
  let backfillSisa = DEN_BACKFILL_MAX;
  // Game yang halaman Den-nya ditarik PERTAMA KALI run ini. Kode Den yang belum
  // pernah kita lihat pada game-game ini BUKAN kode baru — cuma kejar-tayang
  // sumber kedua (umurnya bisa berbulan-bulan). Lihat pemakaian di `newly`.
  const denBackfill = new Set();
  // Catatan yang tetap berlaku: sitemap Den terbit dalam BATCH yang tertunda
  // (probe 4 Agu 2026, 69 sampel — entri paling segar pun berumur 168 menit,
  // p10 928 menit), sehingga kode Den-saja dulu baru terlihat median 403 menit
  // setelah stempelnya bergerak. Itu cacat di sisi mereka dan tak bisa
  // diperbaiki dari sini. Dulu jawabannya "buka gerbang untuk game ramai";
  // sekarang rotasi di bawah yang menanggungnya, untuk KEDUA sumber, karena
  // stempel RoCodes ternyata tak lebih baik — ia malah hampir tak pernah maju.
  // ── ROTASI TERTUA-DULUAN ───────────────────────────────────────────────────
  // Menggantikan "langit-langit kebasian + jatah", yang KELAPARAN, bukan antre.
  //
  // Aturan lama: tarik bila data lebih tua dari N jam, maksimal Q per run —
  // dievaluasi mengikuti urutan katalog. Urutan katalog itu STABIL, jadi begitu
  // sekelompok besar game melewati ambang bersamaan (dan mereka memang selalu
  // bersamaan, karena ditarik dalam batch yang sama sehingga kedaluwarsa
  // serentak), jatah selalu dimenangkan game yang sama. Yang kalah akan kalah
  // lagi run berikutnya, dan lagi. Bukan menunggu giliran — tak pernah dapat.
  //
  // Terukur 6 Agu 2026: jatah 40+25 sebenarnya CUKUP untuk siklus 12 jam (butuh
  // 35+26), tapi jarak tarikan nyata TR Legacy 23 jam dan RoCodes menggantung
  // 48 jam. Akibatnya bukan sekadar lambat: halaman kita memajang vonis yang
  // sumbernya sudah cabut — Roblox Den menghidupkan lagi IDONTGETPAID dan
  // TY41KLIKES, kita masih menyebutnya expired.
  //
  // Aturan baru: tiap run tarik Q game yang datanya PALING TUA. Tak ada ambang,
  // jadi jatah selalu terpakai penuh; tak ada urutan stabil, jadi tak ada yang
  // bisa kalah dua kali berturut-turut. Batas terburuknya jadi aritmetika biasa
  // dan bisa dijanjikan: jumlah ÷ jatah run.
  //
  // Q dipilih untuk sasaran ~6 jam (316÷6≈53, 411÷6≈69). <lastmod> tetap dipakai
  // di atas ini sebagai PEMERCEPAT — bila stempel maju, tarik sekarang juga
  // tanpa menunggu giliran.
  // JATAH DIHITUNG DARI SASARAN, BUKAN ANGKA MATI. Jaminan rotasi ini adalah
  // aritmetika `jumlah ÷ jatah`, jadi jatah tetap berarti jaminannya MEMUDAR
  // diam-diam saat katalog tumbuh: 411 game ÷ 70 = 5,9 jam hari ini, tapi 1.000
  // game ÷ 70 = 14,3 jam — tanpa satu pun galat atau perubahan setelan, cuma
  // karena kita menambah game. Persis jenis pembusukan senyap yang sudah dua
  // kali menggigit di sini (slug mati, kode Den lenyap saat sumber dilewati).
  // Dengan jatah diturunkan dari sasaran, angka yang dijanjikan tetap sama dan
  // yang menyesuaikan adalah ongkosnya — dan itu terlihat di log.
  const TOPI = Number(process.env.ROTASI_MAX || 220); // pengaman ongkos per run
  const buatRotasi = (layak, stempel, targetJam, label) => {
    const antre = entries
      .filter(([id, e]) => layak(id, e))
      .map(([id]) => [id, Number(stempel(id)) || 0])
      .sort((a, b) => a[1] - b[1]);
    const jatah = Math.min(TOPI, Math.ceil(antre.length / Math.max(1, targetJam)));
    const s = new Set(antre.slice(0, jatah).map(([id]) => id));
    if (antre.length) {
      const tuaJam = (Date.now() - antre[0][1]) / 3600000;
      const siklus = jatah > 0 ? (antre.length / jatah).toFixed(1) : "∞";
      const kena = jatah >= TOPI ? " [KENA TOPI — siklus melar dari sasaran]" : "";
      console.log(`[rotasi ${label}] ${s.size}/${antre.length} ditarik · tertua ${tuaJam.toFixed(1)} jam · siklus ~${siklus} jam (sasaran ${targetJam})${kena}`);
    }
    return s;
  };
  // TINGKATAN SERAGAM UNTUK KEDUA PRIMER.
  //
  // Sebelumnya keduanya diperlakukan berbeda: Den punya jalur selalu-tarik untuk
  // game ≥5.000 pemain, RoCodes tidak punya sama sekali. Pembenarannya dulu
  // adalah anggapan bahwa stempel RoCodes cukup jujur untuk menggantikan jalur
  // itu. Anggapan itu gugur hari ini (6 Agu 2026): stempel RoCodes untuk game
  // ≥50K pemain berumur p50 502 jam — 21 hari — dan untuk 5K-10K, NOL persen
  // yang lebih muda dari 6 jam. Pemercepat itu nyaris tak pernah menyala.
  //
  // Dan memang tak seharusnya ada yang diistimewakan: keduanya sumber PRIMER
  // yang saling melengkapi, bukan utama dan cadangan. Masing-masing meliput game
  // yang tak ada di sebelahnya (75 game hanya di Den, 50 hanya di RoCodes), jadi
  // sumber yang ditarik lebih jarang bukan "cadangan yang tertinggal" — ia satu-
  // satunya mata untuk sebagian katalog. Memberinya siklus lebih lambat berarti
  // membutakan bagian itu, bukan menghemat.
  const RAMAI_MIN = Number(process.env.ROTASI_RAMAI_MIN || 5000);
  const TARGET_RAMAI = Number(process.env.ROTASI_TARGET_RAMAI || 1);
  const TARGET_BIASA = Number(process.env.ROTASI_TARGET_JAM || 6);
  const rotasiSumber = (label, layak, stempel) =>
    new Set([
      ...buatRotasi((id, e) => layak(id, e) && (e.players ?? 0) >= RAMAI_MIN, stempel, TARGET_RAMAI, `${label}-ramai`),
      ...buatRotasi((id, e) => layak(id, e) && (e.players ?? 0) < RAMAI_MIN, stempel, TARGET_BIASA, label),
    ]);

  const denRotasi = rotasiSumber(
    "den",
    (id, e) => e.denSlug && (e.players ?? 0) > 0 && Number(prevGamesMap[id]?.denAt ?? 0) > 0,
    (id) => prevGamesMap[id]?.denAt,
  );
  const perluDen = (id, slug, players) => {
    if (!slug) return false;
    // Pemain 0 → halaman Den ditarik supaya placeId-nya bisa dipakai memeriksa
    // ulang identitas (lihat "PERBAIKAN IDENTITAS"). Jumlahnya segelintir game.
    if (!(players > 0)) return true;
    const lm = denIndex.get(slug) ?? 0;
    const terakhir = Number(prevGamesMap[id]?.denAt ?? 0);
    if (!terakhir) { if (backfillSisa-- > 0) { denBackfill.add(id); return true; } return false; }
    // <lastmod> = PEMERCEPAT, bukan penentu. Stempel Den petunjuk yang lemah:
    // isi halaman bisa berubah tanpa ia ikut maju (Knockout 6 Agu 2026 — "Farm"
    // sudah dipindah ke expired, denAt kita beku 8 run berturut-turut, vonisnya
    // tak pernah sampai dan kode mati sejak Juli tetap tampil aktif). Jadi ia
    // hanya boleh MEMPERCEPAT giliran, tak pernah menggantikannya.
    if (lm > terakhir) return true;
    if (denRotasi.has(id)) return true;
    return false;
  };
  // Rotasi RoCodes — aturan, ambang, dan sasaran PERSIS sama dengan Den.
  // Game yang belum pernah ditarik atau slug-nya tak ada di sitemap sengaja di
  // luar antrean: keduanya sudah ditangani lebih dulu di perluRo, dan
  // memasukkannya hanya akan membuat slug mati (75 per 6 Agu 2026) memakan jatah
  // tiap jam tanpa hasil.
  const roRotasi = rotasiSumber(
    "rocodes",
    (id, e) => e.rocodesSlug && roIndexSlug.has(e.rocodesSlug) && Number(prevGamesMap[id]?.roAt ?? 0) > 0,
    (id) => prevGamesMap[id]?.roAt,
  );
  const perluRo = (id, slug) => {
    if (!slug) return false;
    const terakhir = Number(prevGamesMap[id]?.roAt ?? 0);
    if (!terakhir) return true; // belum pernah ditarik → wajib
    const lm = roIndexSlug.get(slug) ?? 0;
    if (!lm) return true; // slug tak ada di sitemap → jangan diam-diam berhenti menariknya
    if (lm > terakhir) return true;
    // STEMPEL ROCODES TERNYATA TAK LEBIH JUJUR DARI DEN. Dasar gerbang ini dulu
    // adalah anggapan stempelnya andal, jadi ia dipasang paling ketat: cuma 2
    // tarikan/jam dari 487 game, dan umur data rata-rata 46,6 jam.
    //
    // Dibantah 6 Agu 2026 oleh Player Select: kode "Spider" (rilis 5 Agu) ada di
    // RoCodes lengkap dengan tanggalnya, tapi <lastmod> slug itu tetap 14:20
    // sementara kita sudah menarik pukul 15:01 — jadi gerbang menyimpulkan "tak
    // ada perubahan" dan kodenya hanya masuk lewat Den, TANPA tanggal rilis.
    //
    // Kerugiannya lebih besar daripada di Den, karena RoCodes satu-satunya
    // sumber tanggal rilis kita — dan tanggal itulah yang menggerakkan badge
    // BARU, urutan "terbaru", jalur video kode-baru, dan halaman "minggu ini".
    //
    // 12 jam dengan jatah 40/run: tiap halaman tersentuh minimal ~2x sehari,
    // biayanya ~40 permintaan/jam alih-alih 487 bila gerbang dilepas.
    if (roRotasi.has(id)) return true;
    return false;
  };
  let denTarik = 0, denLewat = 0, roTarik = 0, roLewat = 0;
  const namaBerubah = []; // jejak perubahan nama game (lihat pemakaian di bawah)

  console.log(`memproses ${entries.length} game (2 primer: RoCodes + Roblox Den; indeks Den ${denIndex.size} slug)…`);

  const results = await mapLimit(entries, CONCURRENCY, async ([id, entry]) => {
    // Tarik dari tiap primer yang punya slug untuk game ini.
    const perSource = [];
    let rocodesMeta = null;
    let denMeta = null;
    let denAt = Number(prevGamesMap[id]?.denAt ?? 0);
    let roAt = Number(prevGamesMap[id]?.roAt ?? 0);
    let denDilewati = false, roDilewati = false;
    for (const p of PRIMARIES) {
      const slug = entry[p.slugKey];
      if (!slug) continue;
      // Dilewati = halaman tak berubah → pakai kode yang sudah kita simpan dari
      // penarikan sebelumnya (halaman sama = isi sama). Carry-forward ini WAJIB:
      // tanpa itu, tiap run yang melewati sebuah sumber akan menghapus seluruh
      // kode dari sumber tersebut.
      if (p.name === "Roblox Den" && !perluDen(id, slug, entry.players)) {
        const punya = denPunya[id];
        if (punya) perSource.push({ name: p.name, url: p.url(slug), active: punya.active, archive: punya.archive });
        denLewat++;
        denDilewati = true; // pertahankan denSlug walau tak ditarik run ini
        continue;
      }
      if (p.name === "RoCodes.gg" && !perluRo(id, slug)) {
        const punya = roPunya[id];
        if (punya) perSource.push({ name: p.name, url: p.url(slug), active: punya.active, archive: punya.archive });
        roLewat++;
        roDilewati = true;
        continue;
      }
      try {
        const r = await p.fetch(slug);
        perSource.push({ name: p.name, url: p.url(slug), active: r.active, archive: r.archive });
        if (p.name === "RoCodes.gg") { rocodesMeta = r.meta; roAt = Math.max(roIndexSlug.get(slug) ?? 0, Date.now()); roTarik++; }
        else {
          denMeta = r.meta;
          // Stempel "Last checked" halaman Den — terbukti identik sampai ke menit
          // dengan <lastmod> sitemapnya (dicek 2 Agu 2026: shindo-life 05:53,
          // anime-astral-simulator 31 Jul 04:03, keduanya sama persis). Dipakai
          // sebagai UMUR penanda "NEW CODE": badge itu menempel sampai Den
          // memeriksa halamannya lagi, jadi ia bukan bukti "baru hari ini" —
          // halaman yang terakhir dicek seminggu lalu tetap memajang NEW CODE.
          const lm = denIndex.get(slug) ?? 0;
          if (lm > 0) for (const c of [...(r.active ?? []), ...(r.archive ?? [])]) if (c.srcNew) c.srcNewAt = lm;
          denAt = Math.max(lm, Date.now());
          denTarik++;
        }
      } catch {
        /* sumber ini tak punya game / gagal → lanjut */
      }
    }
    if (perSource.length === 0) return { id, ok: false };

    const { active, archive } = mergeCodes(perSource);
    if (active.length === 0 && archive.length === 0) return { id, ok: false };

    // Verifikasi identitas untuk token-match longgar (needsVerify): universeId yg
    // DILAPORKAN sumber harus == universeId API Roblox. Buang false-positive game
    // beda-mirip (mis. "Mansion Tycoon" → "sea-mansion-tycoon"). Match exact/
    // homepage/seed/prev tak lewat sini (identitasnya sudah pasti).
    if (entry.needsVerify) {
      let srcUid = Number(rocodesMeta?.universeId) || 0;
      if (!srcUid && denMeta?.placeId) srcUid = Number(await resolveUniverse(denMeta.placeId)) || 0;
      if (!srcUid || srcUid !== Number(entry.universeId)) return { id, ok: false };
    }

    // RoCodes kerap menambahkan awalan "Roblox " untuk SEO ("Roblox Knockout
    // Codes") padahal nama game aslinya bukan itu — situs kita memakai nama asli
    // (lihat kebijakan penamaan; "Roblox" hanya ditambahkan di judul video/SEO).
    // Awalan dibuang hanya bila ADA BUKTI, bukan asumsi:
    //   (a) Roblox Den menyebut nama tanpa awalan itu, ATAU
    //   (b) nama resmi dari API Roblox (rawName, tersimpan dari run sebelumnya)
    //       tak memuat kata "Roblox" sama sekali.
    // Game yang memang bernama "Roblox ..." tak tersentuh karena kedua bukti itu
    // akan gagal.
    // Rapikan nama apa pun sumbernya: buang tag pembaruan dalam kurung siku/biasa,
    // emoji, dan embel-embel promosi setelah "|". Developer Roblox rutin
    // menempelkan itu ke nama game ("[249]", "(Shinobi Life 2)", "🐟", "| Candy &
    // Chocolate") dan tiap situs kode menyalinnya berbeda-beda.
    //
    // Diterapkan ke nama TERPILIH, bukan mengganti sumbernya. Diukur pada 429
    // game: nama dari RoCodes/Den ternyata SUDAH bersih — cuma 1 yang bocor
    // ("Shindo Life (Shinobi Life 2)"). Sebaliknya, mengganti sumber ke nama
    // resmi Roblox mengubah 114 nama dan mengimpor penjejalan kata kunci milik
    // developer ("Driving Empire Car Racing RP", "Berry Avenue RP") — lebih
    // konsisten tapi lebih buruk dibaca. Jadi yang dibetulkan bentuknya, bukan
    // sumbernya. Tanda seperti "+" dan "!" SENGAJA dipertahankan
    // ("+1 Speed Monkey Escape" tetap utuh).
    const rapikanNama = (n) => {
      const out = String(n || "")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .replace(/\p{Extended_Pictographic}/gu, " ")
        .replace(/[️‍]/g, "")
        .replace(/\s*\|.*$/, "")
        .replace(/\s+/g, " ")
        .replace(/^[\s\-–—|:,·]+|[\s\-–—|:,·]+$/g, "")
        .trim();
      return out || String(n || "").trim(); // jangan sampai jadi kosong
    };
    const buangAwalanRoblox = (n) => {
      if (!n || !/^roblox\s+/i.test(n)) return n;
      const tanpa = n.replace(/^roblox\s+/i, "").trim();
      if (!tanpa) return n;
      if (denMeta?.name && denMeta.name.trim().toLowerCase() === tanpa.toLowerCase()) return tanpa;
      const resmi = prevGamesMap[id]?.rawName;
      if (resmi && !/roblox/i.test(resmi)) return tanpa;
      return n;
    };
    // NAMA: RoCodes dulu, lalu Den. TAPI sejak RoCodes digerbangi, pada run yang
    // RoCodes-nya dilewati `rocodesMeta` null — dan tanpa penjaga, namanya jatuh
    // ke Den lalu BERUBAH-UBAH tiap jam tergantung sumber mana yang kebetulan
    // ditarik. Kejadian 4 Agu 2026: "Shindo Life" (RoCodes) berganti jadi
    // "Shindo Life (Shinobi Life 2)" (Den), dan itu memutus pemetaan playlist
    // sehingga tombol YouTube hilang dari halaman game.
    //
    // `nameSrc` mencatat sumber nama yang sedang dipakai: kalau sumber itu tak
    // ditarik run ini, nama sebelumnya DIPERTAHANKAN alih-alih diganti sumber
    // lain. Pola sama dengan pilihHowTo.
    const namaRo = buangAwalanRoblox(rocodesMeta?.name);
    const namaDen = denMeta?.name;
    const prevNama = prevGamesMap[id]?.name, prevNamaSrc = prevGamesMap[id]?.nameSrc;
    let name, nameSrc = null;
    if (ROBLOX_NAME_OVERRIDE[id]) { name = ROBLOX_NAME_OVERRIDE[id]; nameSrc = "override"; }
    else if (entry.seed) { name = entry.name; nameSrc = "seed"; }
    else if (namaRo) { name = namaRo; nameSrc = "rocodes"; }
    else if (prevNamaSrc === "rocodes" && prevNama) { name = prevNama; nameSrc = "rocodes"; } // RoCodes cuma tak ditarik run ini
    else if (namaDen) { name = namaDen; nameSrc = "den"; }
    else { name = prevNama || entry.name; nameSrc = prevNamaSrc ?? null; }
    if (nameSrc !== "override") name = rapikanNama(name); // override manual dihormati apa adanya
    // Nama yang berubah-ubah itu mahal: memutus pemetaan playlist, mengubah judul
    // video, dan bikin penonton ragu apakah ini game yang sama. Sebelumnya
    // perubahan nama terjadi TANPA jejak — ketahuan hanya karena user melihat
    // tombol YouTube hilang. Sekarang tiap perubahan dicatat, jadi kalau sebuah
    // game bolak-balik namanya, itu terlihat di log tanpa perlu beruntung.
    if (prevNama && prevNama !== name) namaBerubah.push(`${id}: "${prevNama}" → "${name}" [${nameSrc}]`);
    const slugRo = entry.rocodesSlug;
    const slugDen = entry.denSlug;

    // Cross-check editorial (5 situs) dg slug terbaik.
    // Cross-check editorial hanya utk game populer (bounded load); long-tail
    // tetap tampil kodenya (dari primer), badge Verified nyusul saat naik populer.
    let xset = new Set();
    let xExpired = new Set();
    let bySite = [];
    let xJalan = false;
    if (perluCrossCheck(id, entry)) {
      ({ set: xset, bySite, expiredSet: xExpired } = await crossCheckActive(slugRo || slugDen));
      xJalan = true;
    }
    // Vonis expired dari levelupplay — dibaca dari memo, nol tembakan jaringan.
    // Disuntik ke jalur editorial yang SUDAH ADA, jadi aturan expiry-nya tak
    // berubah sedikit pun: `olehEditorial` tetap mensyaratkan tak ada editorial
    // lain yang bilang aktif, dan kode fresh tetap dilindungi grace.
    // Hanya vonis expired yang dipakai — daftar aktif mereka sengaja diabaikan
    // (untuk Knockout mereka bilang 31 aktif / 2 expired vs Den 5 / 36).
    // Dicocokkan lewat BEBERAPA slug: slug situs kita, id internal, lalu slug
    // kedua sumber primer. Slug levelupplay kadang berbeda dari ketiganya
    // ("sol-s-rng" vs "sols-rng"), dan normSlug membuang semua tanda hubung
    // sehingga variasi itu tak lagi jadi soal.
    const luSet = [robloxSlug(id), id, slugRo, slugDen]
      .filter(Boolean)
      .map((x) => luExpired.get(normSlug(x)))
      .find((x) => x?.size);
    if (luSet?.size) {
      if (!xExpired.size) xExpired = new Set(luSet); else for (const k of luSet) xExpired.add(k);
      xJalan = true;
    }

    // universeId: RoCodes → placeId Den (resolve) → discovery. Normalisasi ke
    // Number (sumber kadang string) → dedup & fetchPlayers konsisten.
    let universeId = rocodesMeta?.universeId ?? entry.universeId ?? null;
    if (!universeId && denMeta?.placeId) universeId = await resolveUniverse(denMeta.placeId);
    universeId = universeId != null ? Number(universeId) || null : null;

    // PERBAIKAN IDENTITAS: universeId yang ADA pun bisa SALAH, dan gejalanya
    // diam — jumlah pemain 0 selamanya. Kejadian 4 Agu 2026: Anime Astral
    // Simulator tersimpan sebagai universe 9797806474 = "[DUNGEON🔥] Simulador de
    // Astral de Anime", kloning berbahasa Portugis yang sudah mati (0 pemain),
    // padahal kodenya berasal dari game Inggris yang hidup (10502841145, 22 ribu
    // pemain). Akibatnya bukan kosmetik: players 0 < ambang 2.000, jadi game
    // dengan 132 kode aktif itu TAK PERNAH dibuatkan video.
    //
    // Dulu placeId Den hanya dipakai bila universeId KOSONG, jadi identitas yang
    // salah dari RoCodes tak pernah terkoreksi. Sekarang: kalau run sebelumnya
    // melaporkan 0 pemain DAN placeId Den menunjuk universe LAIN, ambil yang dari
    // Den — placeId adalah identitas halaman yang kodenya benar-benar kita pakai.
    // Game yang memang sepi resolve ke universe yang sama → tak berubah.
    if (universeId && !(prevGamesMap[id]?.players > 0) && denMeta?.placeId) {
      const uidDen = Number(await resolveUniverse(denMeta.placeId)) || 0;
      if (uidDen && uidDen !== universeId) {
        console.log(`  [${id}] universeId dikoreksi ${universeId} → ${uidDen} (dari placeId Den; uid lama 0 pemain)`);
        universeId = uidDen;
      }
    }

    // Keputusan EXPIRED (akurasi > kelengkapan; arsip non-destruktif jadi risiko
    // over-expire kecil). Kode aktif dipindah ke arsip bila:
    //  (a) endsAt sudah lewat → definitif, tanpa grace.
    //  (b) ≥1 PRIMER tandai expired, ATAU editorial tandai expired (& tak ada
    //      editorial lain bilang aktif) → arsip, KECUALI kode masih FRESH (≤48j):
    //      grace agar sumber yang telat update tak membunuh kode baru.
    const nowMs = Date.now();
    const GRACE_MS = 48 * 3600 * 1000;
    // Kode TUA (tgl rilis > ~6 bln) yg belum diverifikasi → tandai CHECK "cek
    // dulu" (BUKAN expire): kemungkinan basi walau sumber lambat (mis. RoCodes)
    // masih daftarin aktif. Non-destruktif; verified selalu menang.
    const AGE_CHECK_MS = 180 * 24 * 3600 * 1000;
    // SAPU USIA: kode ber-badge CEK DULU yang umurnya sudah lewat ambang ini
    // dipindah ke arsip, bukan dibiarkan tampil "aktif dengan peringatan".
    // Alasan: kode Roblox umumnya hidup mingguan-bulanan; yang bertahan setahun
    // TANPA satu pun sumber kedua mengonfirmasi hampir pasti mati. Membiarkan
    // 51% daftar aktif berisi kode yang kita sendiri ragukan membuat label
    // "terverifikasi" kehilangan arti — dan itu jualan utama situs ini.
    // Pengaman: `check` mensyaratkan !verified (kode yang 2 sumber bilang aktif
    // tak tersentuh), kode `perm` dikecualikan, dan arsip tetap terlihat pembaca.
    const AGE_EXPIRE_MS = Number(process.env.AGE_EXPIRE_DAYS || 365) * 24 * 3600 * 1000;
    // Ambang "CEK DULU mandek" — jauh lebih pendek dari AGE_EXPIRE karena yang
    // dinilai bukan usia kodenya, melainkan berapa lama keraguan itu dibiarkan
    // menggantung tanpa ada sumber yang mengonfirmasi.
    const CHECK_STALE_MS = Number(process.env.CHECK_STALE_DAYS || 14) * 24 * 3600 * 1000;
    const primExpired = new Set(archive.map((c) => c.code.toLowerCase()));
    // mk() merakit objek kode final dengan daftar field EKSPLISIT — apa pun yang
    // dihitung mergeCodes tapi tak disebut di sini akan hilang tanpa jejak.
    // Terjadi pada `altCode` 5 Agu 2026: merge-nya benar, tapi 0 dari 5.929 kode
    // membawanya sampai ke data. Kalau menambah field baru di mergeCodes,
    // TAMBAHKAN JUGA DI SINI.
    const mk = (c, extra) => ({ game: id, gameName: name, source: c.sources[0], sources: c.sources, sourceUrls: c.sourceUrls, code: c.code, ...(c.altCode ? { altCode: c.altCode } : {}), reward: c.reward, date: c.date, ...(c.srcNew ? { srcNew: true } : {}), ...(c.srcNewAt > 0 ? { srcNewAt: c.srcNewAt } : {}), ...extra });

    const fActive = [];
    const archFromActive = [];
    let nVer = 0;
    for (const c of active) {
      const key = c.code.toLowerCase();
      const endsMs = c.endsAt ? Date.parse(c.endsAt) : 0;
      const endsPassed = endsMs > 0 && endsMs < nowMs;
      const dateMs = c.date ? Date.parse(c.date) : 0;
      const isFresh = dateMs > 0 && nowMs - dateMs <= GRACE_MS;
      const edConfirm = xset.has(key) ? 1 : 0;
      const verified = c.sources.length + edConfirm >= 2; // >=2 sumber sepakat
      // umurMs: tanggal rilis bila ada, kalau tidak sejak kapan kita menyimpannya.
      const umurMs = dateMs || prevSeen.get(`${id}:${key}`) || 0;
      const oldUnverified = umurMs > 0 && nowMs - umurMs > AGE_CHECK_MS;
      // Badge "CEK DULU": sumber menandai CHECK, atau kode tua (>6 bln) yg tak
      // terverifikasi. Dihitung SEBELUM keputusan expiry karena ikut jadi bahan
      // pertimbangannya (lihat konflikRagu).
      const check = !verified && (c.check === true || oldUnverified);
      const olehPrimer = primExpired.has(key);
      const olehEditorial = xExpired.has(key) && !xset.has(key);
      // KONFLIK editorial: sebagian bilang expired, sebagian bilang aktif.
      // Biasanya suara "aktif" menyelamatkan kode. TAPI kalau kode itu memang
      // SUDAH kita ragukan (CEK DULU — tua & tak terverifikasi, atau ditandai
      // CHECK oleh sumber), keraguan + perselisihan sudah cukup untuk
      // mengarsipkan. Kode terverifikasi tak tersentuh: `check` mensyaratkan
      // !verified, jadi kode yang 2 sumber bilang aktif tetap aman.
      const konflikRagu = xExpired.has(key) && xset.has(key) && check;
      const terlaluTua = check && !c.perm && umurMs > 0 && nowMs - umurMs > AGE_EXPIRE_MS;
      // CEK DULU yang MANDEK: ditandai ragu dan tak ada satu pun sumber yang
      // mengonfirmasinya setelah CHECK_STALE_MS. Diukur 3 Agu 2026: 1.537 kode
      // (19% katalog) berstatus CEK DULU, 858 sudah >7 hari, dan sepanjang
      // sejarah hanya 88 yang pernah lepas dari status itu — jadi menunggu lebih
      // lama praktis tak mengubah apa pun. Tak satu pun dari mereka `verified`
      // atau terdaftar di >1 sumber, jadi tak ada bukti yang ikut terbuang.
      // Keputusan user: sapu semua yang lewat ambang, termasuk game besar yang
      // liputan editorialnya nihil (mis. Murder Mystery 2) — konsekuensinya
      // diterima demi katalog yang lebih bersih. Arsip TIDAK menghapus: kodenya
      // tetap terlihat pembaca di tab arsip.
      const mandek = check && !c.perm && umurMs > 0 && nowMs - umurMs > CHECK_STALE_MS;
      const votedExpired = olehPrimer || olehEditorial || konflikRagu || terlaluTua || mandek;
      if (endsPassed || (votedExpired && !isFresh)) {
        // expiredBy = ALASAN kode ini diarsipkan. Tanpa jejak ini, kode yang
        // hilang dari daftar aktif tak bisa dipertanggungjawabkan: tak ada cara
        // membedakan kode yang memang habis waktunya dari kode yang dibunuh satu
        // situs editorial yang parsing-nya rusak. Penting terutama saat cakupan
        // sumber berubah (mis. gelombang arsip dari Roblox Den).
        const expiredBy = endsPassed ? "endsAt" : olehPrimer ? "primer" : olehEditorial ? "editorial" : konflikRagu ? "editorial-konflik" : mandek && !terlaluTua ? "cek-mandek" : "usia";
        archFromActive.push(mk(c, { status: "expired", endsAt: c.endsAt, expiredBy }));
        continue;
      }
      if (verified) nVer += 1;
      // srcCheck = SUMBER PRIMER menandai kode ini CHECK ("kami ragu ini masih
      // jalan"). Dipisahkan dari `check` di atas dengan sengaja, karena keduanya
      // menjawab pertanyaan berbeda dan dipakai di tempat berbeda:
      //
      //   check     → ikut jadi bahan KEPUTUSAN ARSIP (konflikRagu, terlaluTua,
      //               mandek). Syarat !verified-nya TIDAK boleh dilonggarkan:
      //               `mandek` bersandar pada fakta bahwa kode ber-check tak
      //               punya sumber lain yang membelanya, dan melonggarkannya
      //               akan mengarsipkan kode yang RoCodes masih daftarkan aktif.
      //   srcCheck  → murni untuk TAMPILAN, dan tak pernah dibungkam.
      //
      // Kenapa perlu: kartu memilih badge dengan `verified ? Verified : check ?
      // CEK DULU`, sementara `check` sendiri mensyaratkan !verified — jadi kode
      // yang Den ragukan TAPI juga dilisting RoCodes tampil "Verified" hijau,
      // klaim kepercayaan paling kuat di halaman, justru saat salah satu sumber
      // menyatakan ragu. Diukur 6 Agu 2026: 4% kode dua-sumber pada 12 game
      // teratas (≈120 kode se-situs), mis. TR Legacy "WEHIT25KLIKES" dan
      // "LETSGO20KLIKES" — Den CHECK, kita cetak Verified.
      //
      // Cross-check menghitung berapa SUMBER yang mendaftarkan sebuah kode,
      // bukan berapa yang meyakininya. Suara ragu tak boleh terbaca sebagai
      // suara setuju.
      fActive.push(mk(c, { endsAt: c.endsAt, verified, ...(check ? { check: true } : {}), ...(c.srcCheck === true ? { srcCheck: true } : {}) }));
    }
    const roActive = new Set(fActive.map((c) => c.code.toLowerCase()));
    const edSrc = bySite.filter((s) => [...s.set].some((c) => roActive.has(c))).map((s) => s.name);
    // Atribusi cross-check = primer selain sumber utama + situs editorial pengonfirmasi.
    const primaryNames = [...new Set(active.flatMap((c) => c.sources))];
    const crossCheck = [...new Set([...primaryNames.slice(1), ...edSrc])];
    // Arsip = expired eksplisit primer + kode yg dipindah dari aktif (dedup by code).
    const archMap = new Map();
    for (const c of archive) archMap.set(c.code.toLowerCase(), mk(c, { status: "expired", expiredBy: "primer" }));
    for (const c of archFromActive) archMap.set(c.code.toLowerCase(), c);
    const fArchive = [...archMap.values()];

    const nExp = archFromActive.length;
    console.log(`  [${id}] ✓ ${fActive.length} aktif (${nVer} verified) + ${fArchive.length} arsip${nExp ? ` (${nExp} di-expire)` : ""} [${primaryNames.join("+")}]`);
    return {
      id,
      ok: true,
      fActive,
      fArchive,
      meta: {
        name,
        ...(nameSrc ? { nameSrc } : {}),
        slug: robloxSlug(id),
        rocodesSlug: slugRo ?? null,
        // denDilewati: halaman tak berubah & sengaja tak ditarik — slug-nya TETAP
        // disimpan, kalau tidak game ini terlihat "belum pernah kena Den" lagi dan
        // antrean backfill tak pernah maju.
        denSlug: denDilewati || perSource.some((p) => p.name === "Roblox Den") ? slugDen : null,
        // Kapan halaman Den game ini terakhir DITARIK — dibandingkan dg <lastmod>
        // sitemap Den di run berikutnya supaya halaman yang tak berubah dilewati.
        ...(denAt ? { denAt } : {}),
        // Sama untuk RoCodes — sejak sumber ini ikut digerbangi.
        ...(roAt ? { roAt } : {}),
        // placeId halaman Den — identitas halaman yang kodenya kita pakai.
        // Disimpan supaya identitas bisa diperiksa ulang TANPA menarik halaman
        // Den lagi (lihat audit identitas di bawah).
        ...((denMeta?.placeId ?? prevGamesMap[id]?.placeId) ? { placeId: denMeta?.placeId ?? prevGamesMap[id].placeId } : {}),
        // Kapan cross-check editorial terakhir dijalankan utk game ini — dasar
        // penjadwalan tingkat 2 (jaminan minimal 1× sehari untuk SEMUA game).
        ...(xJalan ? { xAt: Date.now() } : prevGamesMap[id]?.xAt ? { xAt: prevGamesMap[id].xAt } : {}),
        genres: entry.genres?.length ? entry.genres : inferGenres(name, slugRo || slugDen || ""),
        universeId,
        // Dibawa-serta saat RoCodes dilewati: tanpa ini status verified game
        // akan JATUH ke false tiap run yang tak menariknya — regresi yang
        // langsung terlihat pembaca.
        verified: rocodesMeta?.verified ?? prevGamesMap[id]?.verified ?? false,
        crossCheck,
        // Cara redeem spesifik: RoCodes dulu, lalu Roblox Den, lalu situs pakai
        // langkah standar bilingual bila keduanya kosong. Urutan itu bisa DIBALIK
        // per-game lewat ROBLOX_HOWTO_PIN untuk kasus yang terbukti usang
        // (mis. rivals). Lihat alasannya di registry.
        // howToSrc ikut disimpan supaya run berikutnya tahu sumber mana yang
        // sedang dipakai — tanpa itu, carry-forward tak bisa membedakan langkah
        // hasil pin dari langkah fallback.
        ...pilihHowTo(id, rocodesMeta?.howTo, denMeta?.howTo, prevGamesMap[id]?.howTo, prevGamesMap[id]?.howToSrc),
        // Syarat/catatan redeem. Sumbernya berlapis:
        //   1. ROBLOX_REDEEM_NOTE — kurasi manual, satu-satunya yang punya
        //      terjemahan ID. Menang supaya terjemahan tak tertimpa.
        //   2. spanduk `notice--important` Roblox Den — OTOMATIS untuk semua
        //      game, lengkap dengan tautan akun/komunitas yang harus dibuka.
        //   3. nilai run sebelumnya — WAJIB, karena halaman Den digerbangi
        //      <lastmod>: tanpa ini syaratnya berkedip hilang-muncul tiap jam
        //      pada run yang Den-nya tak ditarik (bug yang sama dengan howTo).
        ...(() => {
          const n = ROBLOX_REDEEM_NOTE[id] ?? denMeta?.notice ?? prevGamesMap[id]?.redeemNote;
          return n ? { redeemNote: n } : {};
        })(),
        // Nama Indonesia / singkatan komunitas — dipakai sbg TAG video supaya
        // ditemukan lewat kueri yang terbukti dipakai orang (lihat ROBLOX_ALIAS).
        ...(ROBLOX_ALIAS[id]?.length ? { alias: ROBLOX_ALIAS[id] } : {}),
      },
    };
  });

  const freshActive = [];
  const freshArchive = [];
  const games = {};
  const covered = new Set();
  let failed = 0;
  for (const r of results) {
    if (!r || !r.ok) {
      failed += 1;
      continue;
    }
    freshActive.push(...r.fActive);
    freshArchive.push(...r.fArchive);
    games[r.id] = r.meta;
    covered.add(r.id);
  }

  // Dedup game duplikat (universeId sama, slug beda spt rivals/roblox-rivals):
  // reassign kode FRESH ke id survivor SEBELUM merge. KRUSIAL — kalau dedup jalan
  // SETELAH merge, kode dari slug-loser (mis. roblox-fish-it) di-cocokkan pakai
  // codeKey `roblox-fish-it:X` yg tak pernah ada di data lama (`fish-it:X`) →
  // firstSeenAt reset ke `now` tiap run → kirim "kode baru" palsu tiap jam (bug
  // notif spam). Dedup dulu → codeKey konsisten → firstSeenAt awet.
  const { active: freshDD, archive: freshArchDD } = dedupByUniverse(games, freshActive, freshArchive);
  console.log(`Roblox Den: ${denTarik} halaman ditarik (berubah / game ramai), ${denLewat} dilewati (pakai simpanan)`);
  console.log(`RoCodes.gg: ${roTarik} halaman ditarik (berubah), ${roLewat} dilewati (pakai simpanan)`);
  if (namaBerubah.length) console.log(`NAMA GAME BERUBAH (${namaBerubah.length}): ${namaBerubah.slice(0, 12).join(" · ")}${namaBerubah.length > 12 ? ` (+${namaBerubah.length - 12})` : ""}`);
  const { active, archive: fullArchive, newlyArchived } = mergeWithPrevious(freshDD, freshArchDD, prev, covered, now);
  const mergedGames = { ...(prev.games ?? {}), ...games };
  // PURGE game DUPLIKAT yg nyangkut di prev.games (universeId sama, slug beda
  // spt fish-it/roblox-fish-it): buang yg KALAH (kode aktif lebih sedikit; seri →
  // slug lebih panjang) dari games map → hapus halaman & arsip "hantu" di situs.
  // Aman: game "Roblox X" yg universeId-nya UNIK tak tersentuh (ids.length<2).
  {
    const ytpl = (() => { try { return JSON.parse(readFileSync(resolve(HERE, "data/yt-playlists.json"), "utf8")); } catch { return {}; } })();
    const hasPl = (id) => (ytpl[id] ? 1 : 0), nAct = (id) => active.filter((c) => c.game === id).length;
    const byUni = new Map();
    for (const [id, g] of Object.entries(mergedGames)) { if (!g.universeId) continue; const a = byUni.get(g.universeId) ?? []; a.push(id); byUni.set(g.universeId, a); }
    for (const [, ids] of byUni) {
      if (ids.length < 2) continue;
      // survivor: yg PUNYA playlist dulu (jaga video yg udah ada) → kode aktif
      // terbanyak → slug terpendek (kanonik). Cegah orphan playlist.
      ids.sort((a, b) => hasPl(b) - hasPl(a) || nAct(b) - nAct(a) || a.length - b.length);
      const keep = ids[0];
      for (const drop of ids.slice(1)) {
        // REMAP kode drop → survivor (kode dari sumber lain, mis. Roblox Den,
        // tak hilang — cuma selisih 1 kode) lalu hapus game-nya.
        for (const c of active) if (c.game === drop) c.game = keep;
        for (const c of fullArchive) if (c.game === drop) c.game = keep;
        delete mergedGames[drop];
      }
    }
    // dedup active by game+code setelah remap (idempotent utk data normal → aman)
    const seenA = new Set();
    for (let i = 0; i < active.length; i++) { const k = active[i].game + "::" + active[i].code; if (seenA.has(k)) { active.splice(i, 1); i--; } else seenA.add(k); }
    // REMAP DI ATAS BISA MEMBUAT ULANG BENTROK AKTIF∩ARSIP: kode yang aktif di id
    // pemenang tapi terarsip di id yang dibuang kini berbagi game id yang sama.
    // Penyaring di mergeWithPrevious berjalan SEBELUM remap, jadi tak menangkapnya
    // — kejadian 2 Agu 2026: fish-it, 28 kode tampil aktif SEKALIGUS expired
    // beberapa jam setelah bentrok serupa diperbaiki di tempat lain.
    const aktifSetelahRemap = new Set(active.map((c) => `${c.game}:${String(c.code).toLowerCase()}`));
    let bersih = 0;
    for (let i = 0; i < fullArchive.length; i++) {
      if (aktifSetelahRemap.has(`${fullArchive[i].game}:${String(fullArchive[i].code).toLowerCase()}`)) { fullArchive.splice(i, 1); i--; bersih++; }
    }
    if (bersih) console.log(`bentrok aktif∩arsip pasca-remap dibersihkan: ${bersih} kode`);
  }

  // Cap arsip per game (simpan ARCHIVE_CAP terbaru) → roblox-codes.json tak
  // membengkak tak terbatas seiring bertambahnya game & kode kedaluwarsa.
  const archByGame = new Map(), seenArch = new Set();
  for (const c of fullArchive) {
    if (!mergedGames[c.game]) continue; // arsip milik game yg udah di-purge → buang (no halaman hantu)
    const ak = c.game + "::" + c.code; if (seenArch.has(ak)) continue; seenArch.add(ak); // dedup arsip setelah remap
    const arr = archByGame.get(c.game);
    if (arr) arr.push(c);
    else archByGame.set(c.game, [c]);
  }
  const archive = [];
  for (const arr of archByGame.values()) {
    arr.sort((a, b) => (Date.parse(b.date ?? b.expiredAt ?? "") || 0) - (Date.parse(a.date ?? a.expiredAt ?? "") || 0));
    for (const c of arr.slice(0, ARCHIVE_CAP)) archive.push(c);
  }

  const uids = [...new Set(Object.values(mergedGames).map((g) => g.universeId).filter(Boolean))];
  const players = await fetchPlayers(uids);
  for (const g of Object.values(mergedGames)) {
    const pd = g.universeId ? players[g.universeId] : null;
    if (pd) { if (pd.playing != null) g.players = pd.playing; if (pd.name) g.rawName = pd.name; if (pd.rootPlaceId) g.rootPlaceId = pd.rootPlaceId; } // rawName = nama asli Roblox (+emoji/tag) utk visual video
  }

  // ── PROBE DESKRIPSI (mencatat saja, tak menyentuh situs) ──────────────────
  // Menguji satu-satunya jalur hulu yang tersisa setelah yang lain mati satu per
  // satu (Discord butuh bot di server, X berbayar, group shout Roblox null dan
  // throttle 429 setelah ~5 permintaan): apakah pengembang menempelkan kode di
  // deskripsi game LEBIH DULU daripada kode itu sampai ke Den/RoCodes.
  // Deskripsinya sudah terbawa di fetchPlayers, jadi ini nol permintaan tambahan.
  if (process.env.DESC_PROBE_OFF !== "1") {
    try {
      const PROBE = resolve(dirname(OUT), "desc-probe.json");
      let memoD = {};
      try { memoD = JSON.parse(await readFile(PROBE, "utf8")); } catch { /* pertama kali */ }
      const punyaSemua = new Map();
      const isiPunya = (arr, ms) => { for (const c of arr) { let m = punyaSemua.get(c.game); if (!m) punyaSemua.set(c.game, (m = new Map())); const k = String(c.code ?? "").toLowerCase(); const t = Date.parse(c.firstSeenAt ?? "") || ms; if (!m.has(k) || t < m.get(k)) m.set(k, t); } };
      isiPunya(active, Date.now()); isiPunya(archive, Date.now());
      const deskripsi = new Map();
      for (const [gid, g] of Object.entries(mergedGames)) {
        const pd = g.universeId ? players[g.universeId] : null;
        if (pd?.description) deskripsi.set(g.universeId, { desc: pd.description, gid });
      }
      const { memoBaru, baru, awal } = catatDeskripsi({
        deskripsi,
        kodeKita: (gid) => new Set((punyaSemua.get(gid) ?? new Map()).keys()),
        memo: memoD,
      });
      await writeFile(PROBE, JSON.stringify(memoBaru, null, 1));
      // Sengaja disebut KANDIDAT, bukan kode: ekstraksinya tak menyaring bentuk
      // sama sekali (lihat desc-probe.mjs), jadi mayoritasnya memang bukan kode.
      // Menyebutnya "kode baru" akan membuat angka ini terbaca sebagai temuan,
      // padahal pembuktiannya baru datang berminggu-minggu kemudian.
      if (awal) console.log(`[desc-probe] GARIS DASAR dipasang dari ${deskripsi.size} deskripsi — semuanya dicap "sudah di sana", tak satu pun bisa jadi bukti`);
      else {
        console.log(`[desc-probe] ${deskripsi.size} deskripsi dibaca · ${baru.length} token BARU muncul (deskripsi disunting sejak run lalu)`);
        for (const b of baru.slice(0, 8)) console.log(`  ? ${b.code} — ${b.game}`);
      }
      laporanDeskripsi(memoBaru, (gid) => punyaSemua.get(gid) ?? new Map());
    } catch (e) { console.log(`[desc-probe] dilewati: ${e.message}`); }
  }

  // ── AUDIT NAMA (lapis kedua, khusus game TANPA placeId) ───────────────────
  // Audit identitas di bawah mengadu universeId dengan placeId Den. Itu tak bisa
  // dipakai untuk game yang cuma bersumber RoCodes: mereka tak punya placeId,
  // jadi identitasnya tak punya pembanding sama sekali. Terukur 4 Agu 2026: 288
  // game begitu, 102 di antaranya cukup ramai untuk dibuatkan video.
  //
  // Pembandingnya nama universe dari API Roblox — dan ini GRATIS: fetchPlayers
  // di atas sudah memulangkannya (dipakai jadi rawName), jadi nol panggilan
  // tambahan. Nama meleset jauh = universeId mungkin menunjuk game lain, gejala
  // yang sama dengan Fighting Simulator sebelum ketahuan.
  //
  // Ambang sengaja longgar: nama game Roblox sering dijejali kata kunci & emoji
  // ("Haulers" → "🚚 drive and fight") tanpa berganti game. Uji sekali jalan 4
  // Agu 2026 atas 102 game menghasilkan 1 tanda tanya dan itupun positif palsu —
  // jadi alarm di sini jarang, dan yang muncul layak dilihat.
  try {
    const rapiN = (s) => String(s || "").toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    const bedaNama = [];
    for (const [id, g] of Object.entries(mergedGames)) {
      if (!g.universeId || g.placeId || !g.rawName) continue; // punya placeId → sudah diadu audit identitas
      if (NAMA_BEDA_OK[id]) continue; // sudah diperiksa mata & dinyatakan game yang sama
      const a = rapiN(g.name), b = rapiN(g.rawName);
      if (!a || !b) continue;
      const kata = a.split(" ").filter((w) => w.length > 3);
      const cocok = a === b || b.includes(a) || a.includes(b)
        || (kata.length > 0 && kata.filter((w) => b.includes(w)).length / kata.length >= 0.5);
      if (!cocok) bedaNama.push({ game: id, nama: g.name, namaRoblox: g.rawName, universeId: g.universeId, players: g.players ?? 0 });
    }
    bedaNama.sort((x, y) => y.players - x.players);
    await writeFile(resolve(dirname(OUT), "nama-beda.json"), JSON.stringify(bedaNama, null, 1));
    if (bedaNama.length) console.log(`[audit-nama] ${bedaNama.length} game tanpa placeId namanya jauh beda dari nama Roblox: ${bedaNama.slice(0, 5).map((b) => b.game).join(", ")}`);
  } catch (e) {
    console.log(`[audit-nama] dilewati: ${e.message}`);
  }

  // Kode PROMO Roblox platform (bukan per-game) — ditukar di roblox.com.
  let promo = prev.promo ?? { active: [], archive: [] };
  try {
    const p = await fetchPromoCodes();
    if (p.active.length) {
      // firstSeenAt dipertahankan lintas-run (utk deteksi kode promo baru di
      // auto-video). Yang belum pernah terlihat → firstSeenAt = now.
      const seen = new Map((prev.promo?.active ?? []).map((c) => [c.code, c.firstSeenAt]));
      const active = p.active.map((c) => ({ ...c, firstSeenAt: seen.get(c.code) ?? now }));
      promo = { updatedAt: now, active, archive: p.archive };
    }
    console.log(`  promo: ${p.active.length} aktif + ${p.archive.length} arsip`);
  } catch (e) {
    console.log(`  promo gagal: ${e.message} (pertahankan lama)`);
  }

  const payload = {
    updatedAt: now,
    counts: { active: active.length, archived: archive.length, games: Object.keys(mergedGames).length },
    games: mergedGames,
    active,
    archive,
    promo,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 2));

  // ── DETEKTOR MISS (lapor saja) ───────────────────────────────────────────
  // Menjawab "apakah ada kode yang kelewat?" dengan pengukuran, bukan
  // penalaran. Dua kesimpulan yang ditarik dari penalaran pada 6 Agu 2026
  // ternyata dua-duanya salah, dan tak ada apa pun di pipeline ini yang bisa
  // membantahnya saat itu. Lihat src/miss-detector.mjs.
  if (process.env.MISS_OFF !== "1") {
    try {
      const punyaAktif = new Map(), punyaArsip = new Map();
      const isi = (peta, arr) => { for (const c of arr) { let s = peta.get(c.game); if (!s) peta.set(c.game, (s = new Set())); s.add(String(c.code ?? "").toLowerCase()); } };
      isi(punyaAktif, active); isi(punyaArsip, archive);
      await deteksiMiss({
        set,
        milik: (gid) => ({ aktif: punyaAktif.get(gid) ?? new Set(), arsip: punyaArsip.get(gid) ?? new Set() }),
        jumlah: Number(process.env.MISS_SAMPLE || 8),
        sumber: [
          { field: "rocodesSlug", nama: "ro", ambil: fetchRoCodes },
          { field: "denSlug", nama: "den", ambil: fetchRobloxDen },
        ],
      });
    } catch (e) { console.log(`[miss] dilewati: ${e.message}`); }
  }

  // ── AUDIT IDENTITAS (lapor saja) ─────────────────────────────────────────
  // Celah yang paling berbahaya karena DIAM: universeId salah yang menunjuk game
  // LAIN yang RAMAI. Koreksi otomatis hanya berjalan saat pemain 0 — kalau uid
  // salahnya kebetulan hidup, jumlah pemainnya wajar, tak ada yang mencurigakan,
  // dan game itu bisa dibuatkan video memakai data pemain milik game lain.
  //
  // Pemeriksaannya: bandingkan universeId tersimpan dengan hasil resolve placeId
  // Den. Beda = salah satu identitas keliru. TIDAK diperbaiki otomatis — kalau
  // slug Den dan RoCodes kebetulan menunjuk game berbeda, menimpa sepihak justru
  // memperburuk. Ditulis ke identitas-beda.json untuk ditinjau.
  //
  // Dibatasi & bergilir: yang paling lama tak diperiksa didahulukan, supaya
  // seluruh katalog terlewati dalam beberapa hari tanpa membanjiri API Roblox.
  try {
    const UID_CEK_MAX = Number(process.env.UID_AUDIT_MAX || 15);
    const kandidat = Object.entries(games)
      .filter(([, g]) => g.placeId && g.universeId)
      .sort((a, b) => (a[1].uidAt ?? 0) - (b[1].uidAt ?? 0))
      .slice(0, UID_CEK_MAX);
    const beda = [];
    for (const [id, g] of kandidat) {
      const uid = Number(await resolveUniverse(g.placeId)) || 0;
      g.uidAt = Date.now();
      if (uid && uid !== Number(g.universeId)) {
        beda.push({ game: id, tersimpan: Number(g.universeId), dariPlaceId: uid, placeId: g.placeId, players: g.players ?? 0 });
      }
    }
    const P = resolve(dirname(OUT), "identitas-beda.json");
    let lama = [];
    try { lama = JSON.parse(await readFile(P, "utf8")); } catch { /* pertama kali */ }
    const gabung = [...beda, ...lama.filter((x) => !beda.some((b) => b.game === x.game))].slice(0, 200);
    await writeFile(P, JSON.stringify(gabung, null, 1));
    if (beda.length) console.log(`[audit-identitas] ${beda.length} game universeId-nya BEDA dari placeId Den: ${beda.map((b) => b.game).join(", ")}`);
    else console.log(`[audit-identitas] ${kandidat.length} game diperiksa, identitas cocok semua`);
    await writeFile(OUT, JSON.stringify(payload, null, 2)); // uidAt ikut tersimpan
  } catch (e) {
    console.log(`[audit-identitas] dilewati: ${e.message}`);
  }

  // Notif "kode baru" HANYA utk kode yg genuine baru di game yg SUDAH dipantau.
  // `!c.bulk` membuang import-pertama game baru di-discover (mis. sailor-piece 166
  // kode sekaligus) → cegah banjir notif tiap ada game baru.
  // `!denBackfill.has(c.game)`: saat halaman Den sebuah game ditarik PERTAMA
  // KALI, kode Den yang tak dimiliki RoCodes ikut masuk & firstSeenAt-nya = now
  // — padahal itu kode LAMA yang baru kita lihat, bukan kode yang baru rilis.
  // Tanpa saringan ini, backfill Den (304 game) mengirim notif "kode baru" massal
  // DAN memicu video "KODE BARU" utk puluhan game berisi kode berbulan-bulan.
  // Kode yang memang baru rilis tetap tertangkap: make-videos punya jalur "fresh"
  // (tanggal rilis ≤48 jam) yang menyapu semua game tiap run, lepas dari daftar ini.
  // Saringan dipersempit ke KODE-nya, bukan seluruh game: yang ditahan hanya
  // kode yang HANYA dimiliki Den. Kode yang juga muncul di RoCodes berarti baru
  // di sumber yang memang sudah kita baca tiap jam → itu genuine baru, tetap
  // memicu notif & video walau game-nya kebetulan sedang backfill run ini.
  const denSaja = (c) => {
    const src = c.sources?.length ? c.sources : [c.source];
    return src.length === 1 && src[0] === "Roblox Den";
  };
  // "Kode baru" = baru DIRILIS, bukan sekadar baru KITA LIHAT. Sumber bisa
  // sewaktu-waktu menambahkan kode lama ke daftarnya (mis. RoCodes memunculkan
  // 5YearSL2! & Year5ShindoLife! Shindo Life pada 2 Agu 2026, padahal rilisnya
  // 23 Des 2025 — 222 hari sebelumnya). Tanpa saringan usia, kode setengah tahun
  // memicu notifikasi "kode baru" dan video berjudul "KODE BARU!".
  // Kode TANPA tanggal rilis dibiarkan lolos: umurnya tak diketahui, dan itu
  // beda dari diketahui-tua.
  const USIA_BARU_MS = Number(process.env.NEW_MAX_AGE_DAYS || 7) * 24 * 3600 * 1000;
  const nowMsBaru = Date.parse(now);
  // Kode BERTANGGAL dinilai dari usia rilis. Kode TANPA tanggal (praktis semua
  // kode Den — halaman mereka tak pernah memberi tanggal) kini harus membawa
  // penanda "NEW CODE" dari Den. Sebelumnya semua kode tak bertanggal lolos,
  // jadi satu halaman Den berisi 300+ kode lama bisa mengirim puluhan "kode
  // baru" palsu begitu kita pertama kali membacanya.
  const usiaMasukAkal = (c) => {
    const d = Date.parse(c.date ?? "") || 0;
    if (d > 0) return nowMsBaru - d <= USIA_BARU_MS;
    if (c.srcNew !== true) return false;
    // Penanda NEW menempel sampai halamannya diperiksa ulang, jadi ia harus
    // dinilai dari kapan pemeriksaan itu terjadi (srcNewAt), bukan dari kapan
    // KITA menemukannya. Tanpa itu, game yang halamannya terakhir dicek pekan
    // lalu tetap mengirim "kode baru" begitu kita pertama membacanya.
    const at = Number(c.srcNewAt) || 0;
    return at > 0 ? nowMsBaru - at <= USIA_BARU_MS : true;
  };
  const newly = active.filter((c) => c.firstSeenAt === now && c.code && !c.bulk && !(denBackfill.has(c.game) && denSaja(c)) && usiaMasukAkal(c));

  // Probe keandalan <lastmod> kedua sumber — MENCATAT SAJA, tak mengubah alur.
  // Hasilnya menentukan dua keputusan yang belum bisa diambil: (a) apakah gerbang
  // lastmod pada Den memperlambat deteksi, (b) apakah RoCodes boleh ikut
  // digerbangi (memangkas 8.400 permintaan/hari). Lihat src/lastmod-probe.mjs.
  if (newly.length) {
    const PROBE = resolve(dirname(OUT), "lastmod-probe.json");
    let lama = [];
    try { lama = JSON.parse(await readFile(PROBE, "utf8")); } catch { /* pertama kali */ }
    try {
      const roIndex = await fetchRoCodesIndex();
      const sampel = rekamProbe(newly, roIndex, denIndex, mergedGames, lama);
      await writeFile(PROBE, JSON.stringify(sampel, null, 1));
      console.log(ringkasProbe(sampel));
    } catch (e) { console.log("probe lastmod gagal (abaikan):", e.message); }
  }
  // Game yang BARU masuk pantauan run ini (impor pertama). Kodenya bisa lama
  // semua (backfill) → dipakai make-videos utk video "semua kode aktif" pada game
  // besar. TAPI kalau sebuah kode punya tanggal rilis sumber dalam 48 jam, ia
  // benar-benar BARU (situs pun menandainya "New") → dicatat terpisah sbg `fresh`
  // supaya bisa dibuatkan video "KODE BARU" walau gamenya baru & tak sebesar 10K.
  const FRESH_MS = 48 * 3600 * 1000;
  const nowMs = Date.parse(now);
  const bulk = {};
  for (const c of active) {
    if (c.firstSeenAt !== now || !c.code || !c.bulk) continue;
    const b = (bulk[c.game] ??= { count: 0, fresh: [] });
    b.count++;
    const d = Date.parse(c.date ?? "");
    if (d > 0 && nowMs - d <= FRESH_MS && !c.perm) b.fresh.push({ code: c.code, reward: c.reward ?? "" });
  }
  const bulkGames = Object.entries(bulk).map(([game, b]) => ({ game, count: b.count, fresh: b.fresh }));
  await writeFile(resolve(dirname(OUT), "new-roblox-codes.json"), JSON.stringify({ generatedAt: now, codes: newly, bulkGames }, null, 2));

  console.log(
    `✓ data/roblox-codes.json — ${payload.counts.active} aktif, ${payload.counts.archived} arsip ` +
      `(+${newlyArchived} baru diarsipkan), ${covered.size}/${entries.length} game OK, ${Object.keys(mergedGames).length} total` +
      (failed ? `, ${failed} gagal` : ""),
  );
}

main().catch((e) => {
  console.error("fetch-roblox gagal:", e);
  process.exit(1);
});
