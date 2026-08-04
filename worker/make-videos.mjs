// Orkestrator auto-video YouTube: deteksi kode baru → pilih game terbaik (maks
// N/hari, prioritas populer, anti-dobel) → render + VO + musik → upload Unlisted.
// Jalan di GitHub Actions setelah fetch. Aman-dilewati bila YT belum di-set.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { renderShort, ffmpegBin } from "./video/render-short.mjs";
import { makeVO, muxAudio } from "./video/make-audio.mjs";
import { buildMetadata } from "./video/metadata.mjs";
import { uploadVideo, ytConfigured, attachToPlaylist, ytProjectCount } from "./video/upload.mjs";
import { gameSlug } from "./src/games.mjs";
import { simpanPending, buangPending, semuaPending } from "./video/pending-thumbs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const ASSETS_ROBLOX = resolve(HERE, "../site/public/assets/roblox");
const ASSETS_GAMES = resolve(HERE, "../site/public/assets/games");
const TMP = resolve(HERE, "../_video-tmp");
const STATE_PATH = resolve(DATA, "video-state.json");
const PENDING_PL = resolve(DATA, "pending-playlists.json"); // playlist gagal (rate-limit) → retry run berikutnya
const PENDING_VID = resolve(DATA, "pending-videos.json"); // kandidat yg tak muat RENDER_MAX → antri run berikutnya
// Batas UPLOAD otomatis/hari. Diukur ULANG 3 Agu 2026 dari Google Cloud console:
// 47 upload = 9.810 unit → ~209 unit/video EFEKTIF (termasuk thumbnail, playlist,
// sync per jam), bukan ~188 seperti perkiraan 23 Jul. Artinya langit-langit nyata
// ~47 video/hari: angka 50 tak akan pernah tercapai, kuota keras yang kena
// duluan. Diset 45 → ~9.400 unit, menyisakan ruang untuk pembacaan rutin.
// (Komentar lama bilang "Diset 45" padahal konstantanya 50 — kini disamakan.)
// Kalau lonjakan kode makin ramai & mentok, sisanya jatuh ke jalur manual (aman).
// Bisa dioverride lewat Variable repo VIDEO_MAX_PER_DAY.
const MAX_PER_DAY = Number(process.env.VIDEO_MAX_PER_DAY || 45);
// Batas RENDER/run: sisanya antre ke run berikutnya. Dulu 8 utk hemat menit
// Actions (repo private); kini repo PUBLIC → menit unlimited, jadi dinaikkan ke
// 15 agar kode baru lebih cepat jadi video (catch-up lebih gesit). Total upload
// harian tetap dibatasi MAX_PER_DAY (kuota YouTube). Aman utk memori runner.
const RENDER_MAX = Number(process.env.VIDEO_RENDER_MAX || 15);
// Tahan pembuatan playlist lewat API (kuota playlist baru YouTube ~10/hari).
// Dipakai saat kita sengaja menambah banyak game sekaligus: videonya boleh naik,
// tapi jatah playlist disisakan untuk game yang benar-benar dapat kode baru.
// Video yang terdampak dicetak di akhir run + ringkasan Actions supaya bisa
// dibuatkan playlist manual (atau lewat yt-maintenance mode=playlistadd).
const SKIP_PLAYLIST = process.env.VIDEO_SKIP_PLAYLIST === "1";
const BULK_MIN_PLAYERS = Number(process.env.VIDEO_BULK_MIN_PLAYERS || 10000); // game baru TANPA kode fresh: min pemain utk video "semua kode"
const FRESH_MIN_PLAYERS = Number(process.env.VIDEO_FRESH_MIN_PLAYERS || 2000); // game baru DENGAN kode fresh: ambang lebih rendah (kodenya layak)
// SUSULAN (backlog) — game berkode-aktif yang belum pernah punya video sama
// sekali. Jalur kode-baru menuntut kode rilis ≤48 jam dan jalur "semua kode"
// cuma menyapu game yang baru masuk katalog di run itu; game yang lewat dari
// keduanya tak punya jalan masuk lagi selamanya. Terukur 4 Agu 2026: 218 game,
// 18 di antaranya >10rb pemain (Berry Avenue 39rb pemain / 182 kode aktif).
//
// Dijalankan HANYA di jam terakhir sebelum kuota reset (tengah malam PT), dan
// hanya memakai slot yang tersisa. Alasannya: kuota yang tak terpakai hari itu
// akan hangus, sedangkan video kode-baru bersifat mendesak dan harus selalu
// menang di jam-jam sebelumnya. Karena reset menyusul beberapa menit kemudian,
// borongan ini tak mengurangi jatah hari berikutnya.
const BACKLOG_HOUR_PT = Number(process.env.VIDEO_BACKLOG_HOUR_PT || 23); // jam PT mulai boleh borong (23 = jam terakhir)
const BACKLOG_MIN_PLAYERS = Number(process.env.VIDEO_BACKLOG_MIN_PLAYERS || 2000);
const BACKLOG_OFF = process.env.VIDEO_BACKLOG === "0";
// Jam PT saat ini — dipakai utk membuka jendela borongan sekaligus menutupnya
// tepat sebelum tengah malam.
const jamPT = (d) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hour12: false }).format(d));
const hariPT = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
// Default PUBLIC: channel sudah live & ratusan video publik, fase "review dulu"
// lewat. Menyetel YT_PRIVACY sbg Variable terus kelupaan → video diam-diam
// unlisted (kejadian berhari-hari). Set YT_PRIVACY=unlisted hanya bila memang
// mau menahan (mis. saat menguji).
const PRIVACY = process.env.YT_PRIVACY || "public";
const DRY_RUN = process.env.DRY_RUN === "1"; // render + simpan lokal, TANPA upload
const CHECK = process.argv.includes("--check"); // cek ADA kerja video? exit 0=ada, 1=tidak (tanpa deps berat)
const REVIEW = resolve(HERE, "../_video-review");
const OUTDIR = resolve(HERE, "../_video-out"); // video utk upload manual (di-artifact-kan CI)
// Thumbnail Shorts yang gagal dipasang, menunggu run berikutnya. Ditaruh di
// worker/data/ karena folder itu YANG DI-COMMIT workflow — satu-satunya tempat
// yang bertahan antar-run tanpa infrastruktur tambahan.
const THUMB_DIR = resolve(DATA, "pending-thumbs");

const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const fmtPlayers = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
// Kunci "kode ini sudah divideokan". Untuk MOBILE dikecilkan hurufnya: kode yang
// sama bisa BERUBAH kapitalisasinya antar-run (hoyo-codes duluan dg HURUF BESAR,
// wiki/crimsonwitch nyusul dg kapitalisasi resmi → nilai `code` ikut berubah).
// Dengan kunci case-sensitive, perubahan itu terbaca sebagai KODE BARU → video
// DOBEL utk kode yang sama. Roblox tetap case-sensitive (kapitalisasi = identitas
// kode di sana). Lihat codeKey di src/normalize.mjs.
const ck = (game, code, platform) => `${game}:${platform === "ROBLOX" ? code : String(code).toLowerCase()}`;
// Kompat mundur: state lama menyimpan kunci mobile apa adanya (belum dikecilkan).
// Cek KEDUANYA, kalau tidak seluruh kode mobile lama terbaca "belum divideokan"
// dan langsung dibanjiri video ulang saat rilis ini jalan pertama kali.
const sudahDiposting = (state, id, code, platform) =>
  !!(state.posted[ck(id, code, platform)] || state.posted[`${id}:${code}`]);
// Total kode yg diklaim di video = gabungan unik aktif + baru (kode baru kadang
// belum ke-merge ke daftar aktif → jangan sampai angka "+N lagi" meleset).
// `ci` = samakan kode yg cuma beda kapitalisasi (MOBILE). Jaring pengaman lapis
// kedua: data sudah didedup di fetch-codes, tapi kalau satu varian lolos lagi,
// jangan sampai video mengklaim jumlah kode yg digelembungkan (kejadian 31 Jul:
// video Genshin bilang "13 kode aktif" padahal 10) atau memajang kode yg sama
// dua kali (EVERWINTER + Everwinter di satu video).
const norm = (code, ci) => (ci ? String(code).toLowerCase() : code);
const countAll = (active, newCodes, ci = false) => new Set([...active.map((c) => norm(c.code, ci)), ...newCodes.map((c) => norm(c.code, ci))]).size;
// Path ikon dari deskriptor kandidat (di-recompute saat rekonstruksi antrian).
const iconFor = (d) => (d.isPromo ? resolve(ASSETS_ROBLOX, "roblox-promo.png") : resolve(d.platform === "ROBLOX" ? ASSETS_ROBLOX : ASSETS_GAMES, `${d.id}.png`));

// Thumbnail diambil detik 12.5: semua kartu kode sudah ke-reveal (kartu ke-4
// muncul ~8.7s) DAN baris teaser "+N kode lagi" sudah tampil (11.5s), sebelum
// transisi outro (14.4s). Detik 8 dulu cuma dapat 3 kartu.
function thumb(videoPath, outPath) {
  return new Promise((res) => { const ff = spawn(ffmpegBin(), ["-y", "-ss", "12.5", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outPath], { stdio: "ignore" }); ff.on("close", res); });
}

function buildCandidates() {
  const out = [];
  // ROBLOX
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {}, active: [] });
  // Kode badge "CEK DULU" (c.check = belum diverifikasi/ragu) TAK dimasukkan ke
  // video mana pun — jangan umbar kode meragukan (kualitas). Berlaku semua game.
  const chkKey = (game, code) => `${game}:${(code || "").toLowerCase()}`;
  const checkSet = new Set((rb.active || []).filter((c) => c.check).map((c) => chkKey(c.game, c.code)));
  rb.active = (rb.active || []).filter((c) => !c.check);
  const rbNewFile = readJSON(resolve(DATA, "new-roblox-codes.json"), { codes: [] });
  const rbNew = rbNewFile.codes;
  const rbNewByGame = {};
  for (const c of rbNew) (rbNewByGame[c.game] = rbNewByGame[c.game] || []).push(c);
  for (const [id, nc0] of Object.entries(rbNewByGame)) {
    const g = rb.games[id]; if (!g) continue;
    const nc = nc0.filter((c) => !checkSet.has(chkKey(id, c.code))); // buang kode baru yg "CEK DULU"
    if (!nc.length) continue; // semua kode baru game ini meragukan → skip video
    const active = rb.active.filter((c) => c.game === id);
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: (g.players ?? 0),
      newCodes: nc, activeCount: countAll(active, nc), fetchedAt: rbNewFile.generatedAt,
      displayCodes: pickDisplay(nc, active), descCodes: pickDisplay(nc, active, false, DESC_MAX),
    });
  }
  // ROBLOX — KODE FRESH (window-based, dicek TIAP run, bukan sekali saat impor).
  // Game mana pun dg kode ber-tanggal ≤48 jam & pemain ≥ FRESH_MIN → video "KODE
  // BARU". Tahan thd (a) fluktuasi jumlah pemain real-time (game di ambang 2K bisa
  // turun saat jam tidur → dulu one-shot bikin ketinggalan permanen), dan (b) drop
  // RENDER_MAX. Dedup: game yg sudah punya playlist (= sudah ada video) dilewati —
  // sinyal andal, mencakup upload manual yg tak tercatat di state.
  const FRESH_MS = 48 * 3600 * 1000;
  const nowMs = Date.parse(rbNewFile.generatedAt) || Date.now();
  const ytpl = readJSON(resolve(DATA, "yt-playlists.json"), {});
  for (const [id, g] of Object.entries(rb.games)) {
    if (rbNewByGame[id]) continue; // sudah lewat jalur kode-baru run ini
    // CATATAN: dulu juga skip `ytpl[id]` (game yg sudah punya playlist), TAPI itu bikin
    // kode baru yg upload-nya GAGAL (mis. token mati) tak pernah di-retry — kodenya
    // hilang dari new-roblox-codes.json (per-run) & game-nya punya playlist → mandek.
    // Sekarang game-punya-playlist TETAP disurvei; yg semua kodenya sudah divideokan
    // di-buang oleh filter posted (baris ~302), jadi tak ada video dobel.
    if ((g.players ?? 0) < FRESH_MIN_PLAYERS) continue;
    const active = rb.active.filter((c) => c.game === id);
    // "fresh" = baru RILIS dlm 48j (c.date = tgl rilis dari sumber). JANGAN pakai
    // firstSeenAt: game archive-dump (mis. project-baki-3 194 kode, one-fruit 126)
    // ke-discover sekaligus → firstSeenAt semua baru walau kodenya lama; kalau
    // pakai max(date,firstSeenAt) SEMUA keitung "fresh" → spam video 100+ kode.
    // c.date bedain kode genuine-baru (tgl rilis baru) vs archive (tgl rilis lama).
    const fresh = active.filter((c) => { const d = Date.parse(c.date ?? "") || 0; return d > 0 && nowMs - d <= FRESH_MS && !c.perm; });
    if (fresh.length === 0) continue;
    const freshCodes = fresh.map((c) => ({ code: c.code, reward: c.reward ?? "" }));
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: g.players ?? 0,
      newCodes: freshCodes, activeCount: countAll(active, freshCodes), fetchedAt: rbNewFile.generatedAt,
      displayCodes: pickDisplay(freshCodes, active), descCodes: pickDisplay(freshCodes, active, false, DESC_MAX),
    });
  }
  // ROBLOX — game BARU masuk pantauan TANPA kode fresh (semua backfill lama) →
  // video "SEMUA KODE" hanya bila besar (≥ BULK_MIN); isinya kode lama, kurang
  // layak diumbar utk game sepi. One-shot (bulkGames); drop-nya ditangkap antrian.
  for (const { game: id } of rbNewFile.bulkGames ?? []) {
    const g = rb.games[id]; if (!g) continue;
    if (rbNewByGame[id] || ytpl[id] || out.some((c) => c.id === id)) continue;
    if ((g.players ?? 0) < BULK_MIN_PLAYERS) continue;
    const active = rb.active.filter((c) => c.game === id);
    if (active.length === 0) continue;
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: g.players ?? 0,
      newCodes: active, activeCount: active.length, fetchedAt: rbNewFile.generatedAt, allMode: true,
      displayCodes: pickDisplay([], active), descCodes: pickDisplay([], active, false, DESC_MAX),
    });
  }

  // MOBILE
  const mc = readJSON(resolve(DATA, "codes.json"), { active: [] });
  // Kode "CEK DULU" mobile — disaring SEBELUM daftar aktif dipangkas, supaya
  // kunci-nya bisa dipakai menyaring kode BARU juga (cermin jalur Roblox).
  // Saat ini mobile belum pernah punya kode ber-check (0 dari 350), tapi tanpa
  // saringan ini jalur kode-baru mobile akan meloloskannya diam-diam kalau suatu
  // saat sumbernya mulai menandai kode ragu.
  const mChkKey = (game, code) => `${game}:${(code || "").toLowerCase()}`;
  const mCheckSet = new Set((mc.active || []).filter((c) => c.check).map((c) => mChkKey(c.game, c.code)));
  mc.active = (mc.active || []).filter((c) => !c.check);
  const cat = readJSON(resolve(DATA, "games.json"), { games: [] });
  const catById = Object.fromEntries((cat.games ?? []).map((g) => [g.id, g]));
  const mNewFile = readJSON(resolve(DATA, "new-codes.json"), { codes: [] });
  const mNew = mNewFile.codes;
  const mNewByGame = {};
  for (const c of mNew) (mNewByGame[c.game] = mNewByGame[c.game] || []).push(c);
  for (const [id, nc0] of Object.entries(mNewByGame)) {
    const nc = nc0.filter((c) => !mCheckSet.has(mChkKey(id, c.code))); // buang kode baru "CEK DULU"
    if (!nc.length) continue; // semua kode baru game ini meragukan → skip video
    const meta = catById[id];
    const active = mc.active.filter((c) => c.game === id);
    out.push({
      // slug HARUS dari games.mjs (sumber kebenaran URL situs). games.json tak
      // punya field slug → dulu jatuh ke id mentah & link deskripsi jadi 404
      // (mis. /id/game/r1999/ padahal halamannya /id/game/reverse-1999/).
      platform: "MOBILE", id, name: meta?.name ?? nc[0]?.gameName ?? id, slug: gameSlug(id), players: 0,
      iconPath: resolve(ASSETS_GAMES, `${id}.png`), rank: 1e9, // mobile prioritas (game besar, jarang)
      newCodes: nc, activeCount: countAll(active, nc, true), fetchedAt: mNewFile.generatedAt,
      displayCodes: pickDisplay(nc, active, true), descCodes: pickDisplay(nc, active, true, DESC_MAX),
    });
  }
  // MOBILE — KODE FRESH (fallback, dicek TIAP run) — sejajar jalur fresh Roblox.
  // Game mobile dg kode ber-firstSeen/date ≤48j & un-posted yg TAK ada di
  // new-codes.json (mis. kode barunya gagal upload → hilang dari file per-run).
  // Tanpa ini, game mobile ber-playlist yg kode barunya gagal tak pernah ke-retry
  // (mis. Sword x Staff). Yg sudah divideokan ke-filter posted (baris ~302).
  const nowMsM = Date.parse(mNewFile.generatedAt) || Date.now();
  for (const id of [...new Set(mc.active.map((c) => c.game))]) {
    if (mNewByGame[id] || out.some((c) => c.id === id)) continue;
    const active = mc.active.filter((c) => c.game === id);
    const fresh = active.filter((c) => { const d = Date.parse(c.date ?? "") || 0; return d > 0 && nowMsM - d <= FRESH_MS && !c.perm; });
    if (!fresh.length) continue;
    const meta = catById[id], freshCodes = fresh.map((c) => ({ code: c.code, reward: c.reward ?? "" }));
    out.push({
      platform: "MOBILE", id, name: meta?.name ?? active[0]?.gameName ?? id, slug: gameSlug(id), players: 0,
      iconPath: resolve(ASSETS_GAMES, `${id}.png`), rank: 1e9,
      newCodes: freshCodes, activeCount: countAll(active, freshCodes, true), fetchedAt: mNewFile.generatedAt,
      displayCodes: pickDisplay(freshCodes, active, true), descCodes: pickDisplay(freshCodes, active, true, DESC_MAX),
    });
  }
  // Dedup by universeId: buang kandidat ROBLOX yg universeId-nya SUDAH punya
  // video/playlist di id LAIN (kasus flip-flop nama → id baru, mis. dog-race vs
  // roblox-dog-race). Cegah Short & playlist DOBEL — 1 game = 1 seri video.
  const uniWithVideo = new Set();
  for (const plid of Object.keys(ytpl)) { const gg = rb.games[plid]; if (gg?.universeId) uniWithVideo.add(gg.universeId); }
  const deduped = out.filter((c) => {
    if (c.platform !== "ROBLOX") return true;
    const uni = rb.games[c.id]?.universeId;
    if (uni && !ytpl[c.id] && uniWithVideo.has(uni)) { console.log(`  ⏭ skip ${c.id}: universeId ${uni} sudah punya video di id lain (anti-dup)`); return false; }
    return true;
  });
  // Tempel SEMUA kode aktif tiap game ke kandidat (allCodes). Pas video jadi,
  // seluruh kode aktif game itu di-mark posted — bukan cuma subset new-codes-file.
  // Cegah jalur fresh-codes nge-surface ULANG game yg baru divideokan (dobel);
  // hanya kode yg benar2 baru (muncul setelahnya) yg memicu video berikutnya.
  const rbByGame = {}, mcByGame = {};
  for (const c of rb.active) (rbByGame[c.game] ??= []).push(c.code);
  for (const c of mc.active) (mcByGame[c.game] ??= []).push(c.code);
  for (const c of deduped) c.allCodes = (c.platform === "ROBLOX" ? rbByGame[c.id] : mcByGame[c.id]) ?? c.newCodes.map((n) => n.code);
  return deduped.sort((a, b) => b.rank - a.rank);
}

// Kartu tampil di video: kode BARU dulu (maks MAX_DISPLAY), lalu kode aktif
// TERBARU — tanpa memandang ada/tidaknya reward. Sisanya (bila game punya banyak
// kode) → teaser "+N lagi" di video.
const MAX_DISPLAY = 4; // Short harus tetap kebaca; jangan jejalin semua kode.
// Deskripsi video TEKS, bukan kartu — muat lebih banyak tanpa bikin sesak, dan
// tiap kode di sana ikut terbaca mesin pencari. Kartu tetap 4 (keputusan: video
// = 4 kode terbaru, arsip lengkap ada di situs).
const DESC_MAX = 8;
function pickDisplay(newCodes, active, ci = false, max = MAX_DISPLAY) {
  const seen = new Set();
  const disp = [];
  // Penyortiran DILAKUKAN DI SINI, bukan di pemanggil. Dulu `terbaruDulu()` cuma
  // dipasang di dua pemanggil jalur manual (--game=), sedangkan 6 pemanggil jalur
  // OTOMATIS mengoper daftar apa adanya — jadi bug yang dicatat di komentar
  // `recency` (video Genshin memilih kode rilis Juni & melewatkan kode hari itu,
  // semata karena posisi array) tetap hidup di jalur yang paling sering jalan.
  // Karena slotnya cuma 4, urutan menentukan kode mana yang benar-benar dilihat
  // penonton. Ditaruh di dalam fungsi supaya tak bisa terlupa lagi.
  newCodes = terbaruDulu(newCodes);
  active = terbaruDulu(active);
  for (const c of newCodes) { if (disp.length >= max) break; if (seen.has(norm(c.code, ci))) continue; seen.add(norm(c.code, ci)); disp.push({ code: c.code, reward: c.reward || "", isNew: true }); }
  // Pad MURNI berdasarkan KEBARUAN — reward TIDAK lagi menyalip.
  //
  // Dulu kode ber-reward didahulukan supaya kartunya lebih informatif. Tapi
  // akibatnya kode yang lebih baru tapi rewardnya tak dilaporkan sumber bisa
  // kalah oleh kode lama yang kebetulan punya reward — padahal yang dicari
  // penonton adalah kode yang MASIH JALAN, dan kode terbaru paling mungkin
  // begitu. Kartu tanpa reward tetap layak: render mengisinya "Reward in-game".
  for (const c of active) { if (disp.length >= max) break; if (seen.has(norm(c.code, ci))) continue; seen.add(norm(c.code, ci)); disp.push({ code: c.code, reward: c.reward || "", isNew: false }); }
  return disp;
}

// Kebaruan sebuah kode: tanggal RILIS sumber, jatuh ke firstSeenAt kalau sumber
// tak punya tanggal. Dipakai video "semua kode aktif" — kartunya cuma 4, jadi yg
// tampil harus kode TERBARU, bukan urutan array mentah. (Kejadian 1 Agt 2026:
// video Genshin on-demand memilih LEGEDILJKSGM (rilis Juni) & melewatkan
// Everwinter yang rilis hari itu, semata karena posisinya di array.)
// HARUS sama persis dengan rankMs di site/src/lib/roblox.mjs, kalau tidak urutan
// kartu video berbeda dari urutan kartu di halaman game — pembaca yang menonton
// video lalu membuka situs melihat dua daftar "terbaru" yang bertentangan.
//
// Dulu `max(date, firstSeen)`, dan itu melanggar prinsip yang sama yang sudah
// ditegakkan di badge & roundup: kode yang RILIS lama tapi baru KITA TEMUKAN
// ikut terangkat ke atas. `date` (tanggal rilis sumber) adalah kebenarannya;
// firstSeen cuma cadangan saat sumber tak memberi tanggal. `bulk` = impor
// pertama game baru → umurnya tak diketahui, jangan diangkat.
//
// JEBAKAN: pakai `?? ""`, JANGAN `?? 0`. Untuk kode tanpa tanggal, Date.parse(0)
// memulangkan 1999-12-31 (angka 0 dikoersi jadi string "0" = tahun 2000), bukan
// NaN — nilainya truthy sehingga cadangan firstSeen tak pernah terpakai. Versi
// lama lolos karena dibungkus Math.max, di rumus baru ini langsung salah.
const recency = (c) => (Date.parse(c.date ?? "") || 0) || (c.bulk ? 0 : Date.parse(c.firstSeenAt ?? "") || 0);
const terbaruDulu = (arr) => [...arr].sort((a, b) => recency(b) - recency(a));

/**
 * Badge "BARU · NEW" pada kartu video on-demand.
 *
 * Di jalur otomatis badge menempel pada kode PEMICU video (newCodes). Jalur
 * on-demand tak punya pemicu (newCodes kosong) → dulu SEMUA kartu tampil polos,
 * padahal kodenya bisa saja rilis hari itu juga. Di sini badge mengikuti DATA:
 * kode yang rilis ≤48 jam ditandai baru — sama persis dengan badge "BARU" di
 * halaman game, jadi video & situs tak saling bertentangan.
 *
 * Sengaja TIDAK mengubah `allMode`: judul/VO tetap "Semua Kode Aktif" karena
 * video ini memang memuat semua kode aktif, bukan cuma yang baru. Badge menandai
 * kartunya, bukan mengklaim seluruh isinya baru.
 */
const FRESH_BADGE_MS = 48 * 3600 * 1000;
function tandaiBaru(disp, active, ci = false) {
  const now = Date.now();
  const baru = new Set(active.filter((c) => now - recency(c) <= FRESH_BADGE_MS && recency(c) > 0).map((c) => norm(c.code, ci)));
  return disp.map((d) => ({ ...d, isNew: baru.has(norm(d.code, ci)) }));
}

/**
 * Kandidat ATAS PERMINTAAN: `node worker/make-videos.mjs --game=driving-empire`.
 * Untuk game yang tak lolos jalur otomatis (kodenya tak baru / impor pertamanya
 * sudah lewat) tapi layak dibuatkan video — mode "semua kode aktif", hasilnya ke
 * _video-out/ untuk diupload manual. Tak menyentuh video-state.json.
 */
function buildOnDemand(id) {
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {}, active: [] });
  // Terima ID internal ATAU slug URL (mis. "blox-fruits" utk id "bloxfruits") —
  // biar `--game=` gampang (user liat slug di URL, bukan id).
  if (!rb.games[id]) { const f = Object.entries(rb.games).find(([, gg]) => (gg.slug ?? "") === id); if (f) id = f[0]; }
  const g = rb.games[id];
  if (g) {
    const active = rb.active.filter((c) => c.game === id && !c.check); // buang kode "CEK DULU"
    if (active.length === 0) return null;
    return {
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: 0, newCodes: [], activeCount: active.length,
      fetchedAt: new Date().toISOString(), allMode: true, displayCodes: tandaiBaru(pickDisplay([], terbaruDulu(active)), active), descCodes: tandaiBaru(pickDisplay([], terbaruDulu(active), false, DESC_MAX), active),
    };
  }
  const mc = readJSON(resolve(DATA, "codes.json"), { active: [] });
  const active = mc.active.filter((c) => c.game === id && !c.check); // buang kode "CEK DULU"
  if (active.length === 0) return null;
  const cat = readJSON(resolve(DATA, "games.json"), { games: [] });
  const meta = (cat.games ?? []).find((x) => x.id === id);
  return {
    platform: "MOBILE", id, name: meta?.name ?? active[0]?.gameName ?? id, slug: gameSlug(id), players: 0,
    iconPath: resolve(ASSETS_GAMES, `${id}.png`), rank: 0, newCodes: [], activeCount: countAll(active, [], true),
    fetchedAt: new Date().toISOString(), allMode: true, displayCodes: tandaiBaru(pickDisplay([], terbaruDulu(active), true), active, true), descCodes: tandaiBaru(pickDisplay([], terbaruDulu(active), true, DESC_MAX), active, true),
  };
}

/**
 * SUSULAN: game Roblox berkode-aktif yang BELUM PERNAH punya video.
 *
 * Sengaja diturunkan ulang dari data terkini tiap run, BUKAN diantrikan ke
 * berkas. Itu bedanya dengan `bulkGames`: antrian yang sekali-jalan bisa hilang
 * permanen kalau run-nya gagal, sedangkan daftar ini selalu bisa dihitung lagi.
 * Konsekuensinya menyenangkan — item yang tak sempat terangkat malam ini otomatis
 * ikut lagi besok tanpa bookkeeping apa pun.
 *
 * Playlist dipakai sebagai bukti "sudah pernah ada video" (sinyal yang sama
 * dipakai jalur bulk), TAPI tak cukup sendirian: pembuatan playlist bisa gagal
 * kena rate-limit padahal videonya sudah tayang. Karena itu state `posted` ikut
 * diperiksa — kalau semua kode aktifnya sudah pernah divideokan, lewati.
 */
function buildBacklog(state, batas) {
  if (batas <= 0) return [];
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {}, active: [] });
  const ytpl = readJSON(resolve(DATA, "yt-playlists.json"), {});
  const out = [];
  for (const [id, g] of Object.entries(rb.games)) {
    if ((g.players ?? 0) < BACKLOG_MIN_PLAYERS) continue;
    if (ytpl[g.slug ?? id] || ytpl[id]) continue;
    const active = rb.active.filter((c) => c.game === id && !c.check); // kode "CEK DULU" tak pernah masuk video
    if (active.length === 0) continue;
    if (active.every((c) => sudahDiposting(state, id, c.code, "ROBLOX"))) continue;
    const urut = terbaruDulu(active);
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: (g.rawName || g.name).split("|")[0].trim(), slug: g.slug ?? id,
      players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: g.players ?? 0,
      newCodes: [], activeCount: active.length, fetchedAt: new Date().toISOString(),
      allMode: true, backlog: true,
      displayCodes: tandaiBaru(pickDisplay([], urut), active),
      descCodes: tandaiBaru(pickDisplay([], urut, false, DESC_MAX), active),
    });
  }
  out.sort((a, b) => b.players - a.players); // yang paling ramai duluan
  return out.slice(0, batas);
}

// Antrian playlist tertunda (gagal krn rate-limit YouTube). Ditulis ke file →
// bertahan antar-run → dikuras saat limit playlist sudah reset.
function enqueuePending(item) {
  const q = readJSON(PENDING_PL, []);
  if (!q.some((x) => x.videoId === item.videoId)) { q.push(item); writeFileSync(PENDING_PL, JSON.stringify(q, null, 2)); }
}
async function drainPending() {
  let q = readJSON(PENDING_PL, []);
  if (q.length === 0) return;
  // URUT PEMAIN TERBANYAK DULU. Jatah pembuatan playlist baru di YouTube cuma
  // ~10/hari, dan pengurasan berhenti di kegagalan pertama — jadi urutan antrean
  // menentukan siapa yang kebagian. Dulu FIFO: game 48 pemain bisa menghabiskan
  // jatah sebelum game 22 ribu pemain kebagian. Entri lama tanpa `players`
  // dianggap 0 dan jatuh ke belakang; itu benar, mereka memang tak terukur.
  q = [...q].sort((a, b) => (b.players ?? 0) - (a.players ?? 0));
  console.log(`playlist tertunda: ${q.length} → coba pasang (urut pemain terbanyak)…`);
  const sisa = [];
  for (const item of q) {
    const ok = await attachToPlaylist(null, item.videoId, item.playlistTitle, item.playlistDescription);
    if (!ok) { sisa.push(item); break; } // kena rate-limit lagi → sisanya biar run berikutnya (jangan hantam)
  }
  // item setelah yg gagal juga dikembalikan ke antrian
  const idxGagal = q.indexOf(sisa[0]);
  const tertahan = idxGagal >= 0 ? q.slice(idxGagal) : [];
  writeFileSync(PENDING_PL, JSON.stringify(tertahan, null, 2));
  console.log(`  ${q.length - tertahan.length} terpasang, ${tertahan.length} masih tertunda.`);
}

/**
 * Bulan "YYYY-MM" menurut WIB (bukan UTC) — batas bulan sejalan dg stempel
 * tanggal di video; rekap Agustus muncul tepat 1 Agustus 00:00 WIB, bukan 07:00.
 *
 * WAJIB dipakai di KEDUA sisi gerbang rekap promo (baca & tulis `promoMonth`).
 * BUG 1 Agu 2026: gerbang dibaca pakai bulan WIB tapi disimpan pakai bulan UTC
 * (`toISOString().slice(0,7)`) → selama 7 jam window WIB-sudah-Agustus-tapi-UTC-
 * masih-Juli, gerbang tak pernah menutup → 8 video promo duplikat (tiap jam,
 * 00:03–07:03 WIB) sampai UTC ikut ganti bulan. Kambuh tiap awal bulan.
 */
function bulanWIB(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

// PROMO Roblox: kode platform (ditukar di roblox.com/promocodes), bukan per-game.
// Video dibuat bila (a) ada kode promo BARU run ini, atau (b) awal bulan baru
// (rekap bulanan) — sesuai permintaan user. `promoActive` disimpan utk penandaan.
function buildPromoCandidate(state, now) {
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { promo: {} });
  const promo = rb.promo ?? {};
  const active = promo.active ?? [];
  if (active.length === 0) return null;
  const baru = active.filter((c) => c.firstSeenAt === promo.updatedAt && !state.posted[`promo:${c.code}`]);
  const perluRekap = state.promoMonth !== bulanWIB(now);
  if (baru.length === 0 && !perluRekap) return null; // tak ada kode baru & rekap bulan ini sudah
  const allMode = baru.length === 0; // rekap = "semua kode aktif"; ada baru = "kode baru"
  return {
    platform: "ROBLOX", id: "roblox-promo", name: "Roblox Promo Codes", slug: "promo-codes",
    players: 0, isPromo: true, promoActive: active, rank: 5e8, // prioritas tinggi (di bawah mobile)
    iconPath: resolve(ASSETS_ROBLOX, "roblox-promo.png"),
    newCodes: baru, activeCount: active.length, fetchedAt: promo.updatedAt, allMode,
    displayCodes: pickDisplay(baru, active), descCodes: pickDisplay(baru, active, false, DESC_MAX),
  };
}

async function main() {
  const now = new Date();
  // Hari kuota = hari PACIFIC, bukan UTC. Kuota YouTube reset tengah malam PT;
  // dulu dihitung UTC, jadi counter kita reset 7 jam LEBIH AWAL (00:00 UTC =
  // 07:00 WIB, sedangkan kuota baru pulih 14:00 WIB). Akibatnya tiap pagi
  // pipeline merasa punya puluhan slot padahal kuota masih habis — terlihat
  // 3 Agu 2026 pukul 10:03 WIB: counter 7/50 (merasa 43 slot) sementara konsol
  // Google menunjukkan 9.810/10.000 terpakai. Upload-nya gagal & ke-antri
  // (jaringnya bekerja), tapi tiap percobaan tetap membakar waktu render.
  // CATATAN: hanya untuk jatah kuota. `today` (UTC) tetap dipakai untuk nama
  // berkas & penyaringan log — log menyimpan stempel UTC, dan nama berkas
  // sebaiknya tak mundur sehari hanya karena zona kuota.
  const hariKuota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = now.toISOString().slice(0, 10);
  const state = readJSON(STATE_PATH, { date: hariKuota, todayCount: 0, posted: {}, log: [] });
  // Reset HANYA saat hari maju. Saat pindah dari penanggalan UTC ke PT, tanggal
  // tersimpan bisa lebih DEPAN dari hari PT — kalau direset juga, counter jadi
  // 0 persis di jendela yang kuotanya justru sedang habis. Lebih aman kurang
  // pakai daripada gagal berulang.
  if (hariKuota > state.date) { state.date = hariKuota; state.todayCount = 0; }

  // Mode --check: tentukan ADA kerja video/playlist tanpa render/upload/deps berat.
  // Dipakai CI utk melewati install deps video (canvas/ffmpeg/edge-tts) & render
  // pada run tanpa video (hemat menit Actions). Exit 0=ada kerja, 1=tidak.
  if (CHECK) {
    const cands = buildCandidates().filter((c) => c.newCodes.some((nc) => !sudahDiposting(state, c.id, nc.code, c.platform)));
    const promoC = buildPromoCandidate(state, now);
    const pv = readJSON(PENDING_VID, []).length, pp = readJSON(PENDING_PL, []).length;
    // Susulan WAJIB ikut dihitung. Tanpa ini CI menyimpulkan "tak ada kerja" lalu
    // melewati install deps video — dan itu terjadi justru di malam sepi, yaitu
    // malam yang kuotanya paling banyak tersisa dan paling butuh borongan.
    const bl = !BACKLOG_OFF && jamPT(now) >= BACKLOG_HOUR_PT && MAX_PER_DAY - state.todayCount > 0
      ? buildBacklog(state, RENDER_MAX).length : 0;
    const kerja = cands.length + (promoC ? 1 : 0) + pv + pp + bl;
    console.log(`cek video: ${kerja} unit (fresh ${cands.length}, promo ${promoC ? 1 : 0}, antri-vid ${pv}, antri-pl ${pp}, susulan ${bl})`);
    process.exit(kerja > 0 ? 0 : 1);
  }

  // Kuras antrian playlist tertunda lebih dulu (limit playlist mungkin sudah reset).
  if (ytConfigured() && !DRY_RUN) await drainPending();
  // Kuras thumbnail Shorts yang tertunda (kuota habis di run sebelumnya).
  // Murah: 1 panggilan API per thumbnail, tak ada render sama sekali.
  if (ytConfigured() && !DRY_RUN) {
    // SEMUA jenis, bukan cuma Shorts: thumbnail roundup & top50 juga menitip
    // berkasnya ke sini karena workflow harian mereka jalan tepat saat kuota
    // habis. Run per-jam inilah yang pertama menyentuh kuota setelah reset
    // 07:00 UTC, jadi di sinilah pemulihan paling mungkin berhasil.
    const antre = semuaPending().filter((x) => x.file);
    if (antre.length) {
      const { setThumbnail } = await import("./video/upload.mjs");
      let ok = 0;
      for (const x of antre) {
        const f = resolve(THUMB_DIR, x.file || `${x.videoId}.jpg`);
        if (!existsSync(f)) { buangPending(x.videoId); continue; } // berkasnya hilang → jangan menggantung selamanya
        try { await setThumbnail(x.videoId, f); rmSync(f, { force: true }); buangPending(x.videoId); ok++; }
        catch (e) { console.log(`  thumbnail ${x.videoId} masih gagal: ${e.message}`); break; } // kuota belum pulih → hentikan, coba lagi run berikutnya
      }
      if (ok) console.log(`thumbnail tertunda dipasang: ${ok}/${antre.length}`);
    }
  }

  const onDemandId = process.argv.find((a) => a.startsWith("--game="))?.slice(7);
  if (onDemandId) {
    const c = buildOnDemand(onDemandId);
    if (!c) { console.log(`game "${onDemandId}" tak ditemukan / tak punya kode aktif.`); return; }
    mkdirSync(TMP, { recursive: true }); mkdirSync(OUTDIR, { recursive: true });
    console.log(`▶ [atas permintaan] ${c.name} (${c.platform}) — ${c.activeCount} kode aktif`);
    const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
    const moreCount = Math.max(0, c.activeCount - c.displayCodes.length);
    await renderShort({ game: { name: c.displayName || c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, allMode: true, iconPath: c.iconPath, outPath: base });
    await makeVO({ name: c.name, activeCount: c.activeCount, allMode: true, outPath: vo });
    await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
    await thumb(fin, th);
    const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.descCodes ?? c.displayCodes, activeCount: c.activeCount, allMode: true, redeemNote: c.redeemNote, alias: c.alias, now });
    const stem = `${today}-${c.id}`;
    copyFileSync(fin, resolve(OUTDIR, `${stem}.mp4`));
    copyFileSync(th, resolve(OUTDIR, `${stem}.jpg`));
    writeFileSync(resolve(OUTDIR, `${stem}.txt`), `JUDUL:\n${meta.title}\n\nDESKRIPSI:\n${meta.description}\n\nTAG:\n${(meta.tags ?? []).join(", ")}\n\nPLAYLIST:\n${meta.playlistTitle}\n\nPLAYLIST_DESC:\n${meta.playlistDescription ?? ""}\n\nKOMENTAR:\n${meta.comment ?? ""}\n`);
    try { rmSync(TMP, { recursive: true, force: true }); } catch {}
    console.log(`  ✓ _video-out/${stem}.mp4 (+ .jpg thumbnail, .txt metadata)\n    judul: ${meta.title}`);
    return;
  }

  const tanpaPlaylist = []; // VIDEO_SKIP_PLAYLIST: dibuatkan playlist manual
  const fresh = buildCandidates();
  // Vertikal PROMO Roblox: video tiap bulan (rekap) ATAU saat ada kode promo baru.
  const promoC = buildPromoCandidate(state, now);
  if (promoC) fresh.unshift(promoC);
  // ANTRIAN VIDEO: kandidat yg run lalu tak muat RENDER_MAX. Sinyal "kode baru"
  // sekali-jalan (bulkGames & new-codes cuma ada di run impor) → yg ke-drop hilang
  // permanen kalau tak diantrikan. Diproses DULUAN biar tak keburu basi.
  const pending = readJSON(PENDING_VID, []).map((d) => ({ ...d, iconPath: iconFor(d) }));
  const seen = new Set();
  let candidates = [...pending, ...fresh].filter((c) => {
    if (seen.has(c.id)) return false; // dedup: antrian menang atas fresh (lebih lama)
    seen.add(c.id);
    return c.isPromo || c.newCodes.some((nc) => !sudahDiposting(state, c.id, nc.code, c.platform)); // buang yg semua kodenya sudah divideokan
  });
  // PRIORITAS slot upload (kuota API ~45/hari): game player TERBESAR duluan → game
  // gede (mis. RIVALS 241K) tak kebuang ke manual saat hari rame. Promo tetap depan.
  candidates.sort((a, b) => (b.isPromo ? 1 : 0) - (a.isPromo ? 1 : 0) || (b.rank ?? b.players ?? 0) - (a.rank ?? a.players ?? 0)); // rank: mobile=1e9 (prioritas), roblox=players
  let remaining = MAX_PER_DAY - state.todayCount;
  console.log(`kandidat: ${candidates.length} (antrian ${pending.length} + baru ${fresh.length}) | slot upload hari ini: ${Math.max(0, remaining)}/${MAX_PER_DAY}`);
  // BORONGAN SUSULAN di jam terakhir sebelum kuota reset. Ditaruh SETELAH sort
  // supaya selalu di buntut: kode baru tak boleh kalah oleh susulan, betapa pun
  // ramai game-nya. Slot yang diisi = sisa kuota hari ini, dipotong RENDER_MAX.
  if (!BACKLOG_OFF && jamPT(now) >= BACKLOG_HOUR_PT && remaining > 0) {
    // Dry-run dibatasi 2 supaya jalur ini bisa dipratinjau tanpa menunggu 15
    // render (~17 menit) — kalau tak bisa dicoba, tak bisa dipercaya.
    const muat = Math.min(DRY_RUN ? 2 : remaining, RENDER_MAX) - candidates.length;
    const susulan = buildBacklog(state, muat);
    if (susulan.length) {
      candidates.push(...susulan);
      console.log(`borongan susulan (jam ${jamPT(now)} PT, sisa kuota ${remaining}): +${susulan.length} game belum pernah ada videonya — ${susulan.slice(0, 3).map((c) => `${c.name} (${c.players})`).join(", ")}${susulan.length > 3 ? ", …" : ""}`);
    } else if (muat > 0) {
      console.log(`borongan susulan: tak ada game tersisa yang memenuhi syarat (≥${BACKLOG_MIN_PLAYERS} pemain, belum ada video).`);
    }
  }
  if (candidates.length === 0) { console.log("tak ada kode baru → tak ada video."); writeFileSync(PENDING_VID, "[]\n"); return; }
  const canUpload = ytConfigured() && !DRY_RUN;
  if (!canUpload && !DRY_RUN) console.log("YT belum di-set (YT_CLIENT_ID/SECRET/REFRESH_TOKEN) — semua video dirender utk upload manual. Lihat DEPLOY-YOUTUBE.md.");
  if (canUpload && ytProjectCount() > 1) console.log(`  ↻ multi-project YT aktif: ${ytProjectCount()} project (auto-rotasi saat kuota habis)`);

  // Render SEMUA kandidat (dibatasi RENDER_MAX biar CI tak kelamaan): yang muat
  // kuota harian diupload otomatis, sisanya disimpan di _video-out/ + file
  // metadata utk diupload manual. Tanpa ini, kode ke-4 dst hari itu tak pernah
  // dapat video sama sekali.
  const picks = candidates.slice(0, RENDER_MAX);
  // Sisa yg tak muat → SIMPAN sbg antrian run berikutnya (bukan di-drop). Promo &
  // on-demand tak diantrikan (punya cadence sendiri). Cap 40 biar tak membengkak.
  // Susulan TAK diantrikan: daftarnya diturunkan ulang tiap run, jadi yang tak
  // terangkat malam ini muncul lagi sendiri. Mengantrikannya justru merugikan —
  // antrian diproses paling depan, sehingga susulan bakal menyerobot kode baru.
  const overflow = candidates.slice(RENDER_MAX).filter((c) => !c.isPromo && !c.backlog).slice(0, 40);
  writeFileSync(PENDING_VID, JSON.stringify(overflow.map(({ iconPath, ...d }) => d), null, 2) + "\n"); // iconPath di-recompute saat rekonstruksi
  if (overflow.length) console.log(`(dibatasi ${RENDER_MAX}/run — ${overflow.length} game diantrikan utk run berikutnya)`);
  mkdirSync(TMP, { recursive: true });
  if (DRY_RUN) mkdirSync(REVIEW, { recursive: true }); else mkdirSync(OUTDIR, { recursive: true });
  const requeue = []; // kuota upload habis → antri retry run berikut (JANGAN mark posted)
  for (const c of picks) {
    if (canUpload && remaining <= 0) { requeue.push(c); continue; } // kuota habis → jgn render, antri retry
    // PENJAGA TENGAH MALAM PT. Borongan susulan sengaja dijadwalkan mepet reset;
    // kalau run-nya molor dan tanggal PT keburu maju, upload berikutnya memakan
    // kuota HARI BARU — persis kerugian yang penjadwalan ini ingin hindari.
    // Dilepas begitu saja (tanpa requeue) karena daftarnya bisa dihitung ulang.
    if (c.backlog && hariPT(new Date()) !== state.date) { console.log(`  ⏭ ${c.name}: tengah malam PT terlewat, susulan dihentikan (lanjut besok)`); continue; }
    let quotaManual = false;
    try {
      console.log(`\n▶ ${c.name} (${c.platform}) — ${c.newCodes.length} kode baru`);
      const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
      const moreCount = Math.max(0, c.activeCount - c.displayCodes.length); // sisa kode di situs → teaser "+N lagi"
      await renderShort({ game: { name: c.displayName || c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null }, codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt, allMode: c.allMode, iconPath: c.iconPath, outPath: base });
      await makeVO({ name: c.name, activeCount: c.activeCount, allMode: c.allMode, isPromo: c.isPromo, outPath: vo });
      await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
      await thumb(fin, th);
      const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.descCodes ?? c.displayCodes, activeCount: c.activeCount, allMode: c.allMode, isPromo: c.isPromo, redeemNote: c.redeemNote, alias: c.alias, now });
      if (DRY_RUN) {
        const dst = resolve(REVIEW, `${c.id}.mp4`); copyFileSync(fin, dst);
        console.log(`  ✓ [DRY] ${dst}\n    judul: ${meta.title}`);
        continue; // dry run: tak upload, tak update state
      }
      // Simpan utk upload manual: dipakai saat kuota habis, YT belum di-set,
      // ATAU upload gagal. Video yang sudah jadi jangan sampai hilang.
      const simpanManual = (alasan) => {
        const stem = `${today}-${c.id}`;
        copyFileSync(fin, resolve(OUTDIR, `${stem}.mp4`));
        copyFileSync(th, resolve(OUTDIR, `${stem}.jpg`));
        writeFileSync(resolve(OUTDIR, `${stem}.txt`), `JUDUL:\n${meta.title}\n\nDESKRIPSI:\n${meta.description}\n\nTAG:\n${(meta.tags ?? []).join(", ")}\n\nPLAYLIST:\n${meta.playlistTitle}\n\nPLAYLIST_DESC:\n${meta.playlistDescription ?? ""}\n\nKOMENTAR:\n${meta.comment ?? ""}\n`);
        console.log(`  ✓ manual (${alasan}): _video-out/${stem}.mp4 — "${meta.title}"`);
        state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, title: meta.title, mode: "manual", alasan, file: `${stem}.mp4` });
      };

      if (canUpload && remaining > 0) {
        try {
          // SKIP_PLAYLIST menahan PEMBUATAN playlist baru saja. Video untuk game
          // yang playlist-nya SUDAH ada tetap dimasukkan — itu tak memakai jatah
          // harian (yang dibatasi YouTube adalah playlists.insert).
          const { id, url, playlistPending, thumbPending } = await uploadVideo({ videoPath: fin, ...meta, privacy: PRIVACY, thumbnailPath: th, tanpaBuatPlaylist: SKIP_PLAYLIST });
          // Thumbnail Shorts TAK BISA dirender ulang seperti video long: dia
          // potongan frame dari mp4 yang ikut terhapus bersama runner, dan
          // Shorts tak bisa diberi thumbnail lewat Studio desktop (harus API atau
          // aplikasi HP). Jadi kalau gagal, JPG-nya (±180 KB) disimpan ke
          // worker/data/ — yang memang di-commit workflow — supaya run berikutnya
          // bisa memasangnya tanpa perlu videonya lagi. Berkasnya dihapus begitu
          // terpasang, jadi tak menumpuk.
          if (thumbPending) {
            try {
              mkdirSync(THUMB_DIR, { recursive: true });
              copyFileSync(th, resolve(THUMB_DIR, `${id}.jpg`));
              simpanPending({ videoId: id, kind: "short", file: `${id}.jpg` });
              console.log(`  ! thumbnail diantrikan (${id}) — run berikutnya akan memasangnya`);
            } catch (e2) { console.log(`  ! thumbnail gagal diantrikan: ${e2.message}`); }
          }
          if (SKIP_PLAYLIST && playlistPending) tanpaPlaylist.push({ id, judul: meta.playlistTitle });
          console.log(`  ✓ upload (${PRIVACY}): ${url} — "${meta.title}"`);
          state.todayCount += 1; remaining -= 1;
          state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, videoId: id, title: meta.title, mode: "upload" });
          // `players` ikut disimpan supaya pengurasan bisa MENDAHULUKAN game besar
          // (lihat drainPending). Jatah playlist baru YouTube cuma ~10/hari.
          if (playlistPending) enqueuePending({ ...playlistPending, players: c.players ?? 0, game: c.id });
        } catch (e) {
          // Error upload HAMPIR SELALU account-wide (kuota / token `invalid_grant` /
          // rate limit) → STOP upload run ini + ANTRI RETRY (JANGAN mark posted) biar
          // auto-upload begitu beres (mis. token di-refresh). Queue di-cap 40, aman.
          console.log(`  ✗ upload gagal: ${e.message}`);
          remaining = 0; requeue.push(c); quotaManual = true;
          simpanManual("upload gagal");
        }
      } else {
        simpanManual("YT belum di-set");
      }
      // Mark posted KECUALI ke-antri retry gara2 kuota (biar diulang run berikut).
      if (!quotaManual) for (const code of c.allCodes ?? c.newCodes.map((n) => n.code)) state.posted[ck(c.id, code, c.platform)] = true;
      if (!quotaManual && c.isPromo) {
        // Rekap bulan ini beres + semua kode promo saat ini ditandai (jangan
        // ulang bulan ini kecuali muncul kode promo yg benar-benar baru).
        state.promoMonth = bulanWIB(now); // WIB — HARUS sama dg sisi baca (lihat bulanWIB)
        for (const pc of c.promoActive ?? []) state.posted[`promo:${pc.code}`] = true;
      }
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); // simpan tiap video → aman bila run dibatalkan
    } catch (e) {
      console.log(`  ✗ gagal ${c.name}: ${e.message}`);
    }
  }
  // Antrian retry (kuota habis) + overflow render → PENDING_VID (dedup by id), diproses run berikut.
  if (!DRY_RUN) {
    const seenP = new Set(), merged = [...requeue, ...overflow].filter((c) => !seenP.has(c.id) && seenP.add(c.id));
    writeFileSync(PENDING_VID, JSON.stringify(merged.map(({ iconPath, ...d }) => d), null, 2) + "\n");
    if (requeue.length) console.log(`(${requeue.length} game diantrikan retry — kuota upload habis run ini)`);
  }
  if (!DRY_RUN) {
    // prune state biar tak membengkak
    const keys = Object.keys(state.posted); if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete state.posted[k];
    state.log = state.log.slice(0, 300);
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  }
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
  const manual = state.log.filter((l) => l.mode === "manual" && l.at?.slice(0, 10) === today).length;
  console.log(`\nselesai — ${state.todayCount}/${MAX_PER_DAY} upload otomatis hari ini${manual ? `, ${manual} video nunggu upload manual (_video-out/)` : ""}.`);
  if (tanpaPlaylist.length) {
    // SENGAJA tak diantrikan ke pending-playlists.json — VIDEO_SKIP_PLAYLIST
    // dipakai justru ketika kita ingin jatah playlist harian TIDAK terpakai.
    console.log(`\n[!] ${tanpaPlaylist.length} video TANPA playlist (VIDEO_SKIP_PLAYLIST=1):`);
    for (const v of tanpaPlaylist) console.log(`    ${v.id}  →  ${v.judul}`);
    console.log(`    Buat manual di Studio, atau: yt-maintenance mode=playlistadd ids=${tanpaPlaylist.map((v) => v.id).join(",")} apply=true`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const baris = tanpaPlaylist.map((v) => `- \`${v.id}\` → ${v.judul}`).join("\n");
      try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Video tanpa playlist (hemat kuota): ${tanpaPlaylist.length}\n${baris}\n`, { flag: "a" }); } catch {}
    }
  }
}

main().catch((e) => { console.error("make-videos error:", e.message); process.exit(0); });
