// Orkestrator auto-video YouTube: deteksi kode baru → pilih game terbaik (maks
// N/hari, prioritas populer, anti-dobel) → render + VO + musik → upload Unlisted.
// Jalan di GitHub Actions setelah fetch. Aman-dilewati bila YT belum di-set.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { renderShort, ffmpegBin } from "./video/render-short.mjs";
import { renderWide, renderWideThumb, fmtWIB } from "./video/render-wide.mjs";
import { gambarGame, coverMobile } from "./src/game-media.mjs";
import { seriesPemain, seriesPemainBergulir } from "./src/player-series.mjs";
import { makeVO, muxAudio } from "./video/make-audio.mjs";
import { buildMetadata } from "./video/metadata.mjs";
import { uploadVideo, ytConfigured, attachToPlaylist, ytProjectCount } from "./video/upload.mjs";
import { UNIT_PER_VIDEO, unitSisa, sisaPlaylist, PLAYLIST_HARIAN, ringkas as ringkasKuota } from "./video/yt-kuota.mjs";
import { gameSlug } from "./src/games.mjs";
import { simpanPending, buangPending, semuaPending } from "./video/pending-thumbs.mjs";
import { saringSusulan } from "./video/susulan.mjs";
import { susunNaskah } from "./video/naskah.mjs";
import { siklusRilis, kodeSekarat, kodeBaru, kedalamanArsip, ringkasWawasan } from "./video/wawasan.mjs";

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
// DIUKUR ULANG 5 Agu 2026 dari konsol: 10.038 unit / 47 upload = 213,6 unit per
// video, bukan 209. Dan `todayCount` TIDAK menghitung dua video harian dari
// workflow terpisah (roundup + top50), jadi angka 45 di sini sebenarnya berarti
// 47 upload — persis yang membuat kuota tembus 100% hari itu.
// 10.000 / 213,6 = 46 upload; dikurangi 2 video workflow dan 1 untuk margin
// pembacaan rutin → 43. Menurunkan ini tak mengurangi hasil: upload ke-46 dst
// memang gagal, cuma selama ini gagalnya SETELAH menghabiskan waktu render.
// Dinaikkan 43 → 52 setelah thumbnails.set dihentikan untuk Shorts (lihat
// alasannya di pemanggilan uploadVideo). Biaya per Shorts turun 213,6 → 163,6
// unit, jadi langit-langitnya naik dari 46 ke ~58 video/hari. Diambil 52, bukan
// 58: angka 163,6 masih turunan dari pengukuran hari-ber-thumbnail, jadi
// sisakan ruang sampai konsol Google memberi angka baru yang bersih besok.
// 52 → 65 (6 Agu 2026), sesudah konsol Google memperlihatkan DUA kuota terpisah
// yang selama ini tercampur dalam satu angka di kepala:
//
//   Video Uploads per day = 100  → puncak pemakaian kita 54%. Kuota KERAS, dan
//                                  bukan ini yang mengikat. Plafon mutlak 100.
//   Queries per day = 10.000     → puncak 100%. INILAH yang mengikat.
//
// Dengan biaya 163,6 unit/video (sesudah thumbnails.set dihentikan untuk Shorts)
// plafon unitnya 10.000/163,6 = 61 video, dikurangi 2 video dari workflow
// terpisah yang tak terhitung `todayCount` → 59. Playlist kini SEPENUHNYA manual
// (VIDEO_SKIP_PLAYLIST=1), jadi playlists.insert dan playlistItems.insert tak
// lagi dibayar dari kuota — itu yang memberi ruang di atas 59.
//
// Diambil 65, bukan lebih tinggi, karena 163,6 masih ANGKA TURUNAN dari
// pengukuran hari-ber-thumbnail; belum ada pembacaan konsol yang bersih untuk
// hari tanpa thumbnail DAN tanpa playlist. Naikkan lagi hanya setelah konsol
// memberi angka nyata — bukan setelah sehari berjalan tanpa galat, karena
// kegagalan kuota muncul sebagai upload yang ditolak SETELAH render, bukan
// sebagai galat yang mencolok.
// 65 → 46 (10 Agu 2026), sesudah kanal beralih ke LANDSCAPE.
//
// Landscape mengirim thumbnails.set yang untuk Shorts sengaja dilewati, dan
// panggilan itu 50 unit. Biaya per video kembali dari 163,6 ke 213,6 — persis
// selisih yang sama yang dulu terukur saat thumbnail dihentikan, cuma arahnya
// terbalik. Plafonnya jadi 10.000/213,6 = 46,8 video.
//
// 65 dibiarkan berarti video ke-47 dan seterusnya ditolak kuota SETELAH
// menghabiskan waktu render — persis pemborosan yang sudah pernah dicatat di
// atas. Menurunkannya tak mengurangi hasil sedikit pun; ia cuma memindahkan
// kegagalan ke sebelum render.
//
// 46 → 57 (11 Agu 2026), sesudah komentar otomatis dihentikan.
//
// commentThreads.insert 50 unit ikut hilang, jadi biaya per video 213,6 →
// 163,6 — sama persis dengan biaya Shorts dulu, karena thumbnail (+50) dan
// komentar (−50) saling meniadakan. Plafonnya 10.000/163,6 = 61 video;
// dikurangi 2 video dari workflow terpisah yang tak terhitung `todayCount`
// dan margin untuk pembacaan rutin → 57.
//
// Margin itu bukan kehati-hatian berlebihan: di 46 kemarin, kuota habis persis
// dan laporan harian gagal membaca YouTube sama sekali.
//
// Mau lebih dari 57/hari: tambah project Google Cloud kedua (rotasi sudah
// didukung lewat YT_CLIENT_ID_2/SECRET_2/REFRESH_TOKEN_2) — itu menggandakan
// kuota query, bukan menaikkan angka ini.
//
// KOREKSI 13 Agu 2026 — PREMIS SELURUH PARAGRAF DI ATAS TERNYATA KELIRU.
// Dengan jumlah panggilan yang akhirnya tercatat (video/yt-kuota.mjs), selisih
// konsol satu run bisa dipecah persis: 2.017 unit untuk 13 video, dan SEMUANYA
// milik playlist + thumbnail + pembacaan. videos.insert tak menyumbang satu unit
// pun ke "Queries per day" — upload dibatasi kuota terpisah "Video Uploads per
// day" (100). Jadi "163,6 unit per video" bukan harga upload, melainkan harga
// rombongan yang menyertainya.
//
// Artinya plafon unit sekarang ~10.000/103 ≈ 97 video, jauh di atas 57. Angka 57
// SENGAJA DIBIARKAN: menaikkannya keputusan pemilik kanal (menyangkut berapa
// banyak yang layak terbit sehari), bukan konsekuensi otomatis dari kuota yang
// ternyata lebih longgar. Batas kerasnya tetap 100 upload/hari.
const MAX_PER_DAY = Number(process.env.VIDEO_MAX_PER_DAY || 57);
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
// Indeks case-INsensitive dari kunci `posted`. Kunci Roblox sengaja
// case-sensitive (kapitalisasi bagian dari kodenya), tapi sumber kadang menulis
// kode yang sama berbeda — dan sejak kartu bisa menampilkan varian, kode UTAMA
// pun bisa berpindah kapitalisasi saat sumber lain menyusul ("FARM" → "Farm").
// Tanpa indeks ini, perpindahan itu terbaca sebagai kode yang BELUM pernah
// divideokan, lalu game yang sama diunggah lagi untuk kode yang sama persis.
// Dibangun sekali lalu ikut diperbarui tiap penandaan baru.
let _postedCI = null;
const postedCI = (state) => (_postedCI ??= new Set(Object.keys(state.posted ?? {}).map((k) => k.toLowerCase())));
const tandaiPosted = (state, key) => { state.posted[key] = true; postedCI(state).add(key.toLowerCase()); };
const sudahDiposting = (state, id, code, platform) =>
  !!(state.posted[ck(id, code, platform)] || state.posted[`${id}:${code}`])
  || postedCI(state).has(`${id}:${code}`.toLowerCase());
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

// Nama yang DICETAK di kartu video. Biasanya `rawName` — nama asli game di
// Roblox, yang lebih dikenal penonton daripada nama versi situs sumber.
//
// Tapi rawName datang dari API Roblox lewat universeId, dan untuk sebagian game
// justru universeId itulah yang sedang kita ragukan. Terlihat 4 Agu 2026: kartu
// video Fighting Simulator mencetak "[🌌 DIM 2] Anime Fighting Simulator" —
// nama game LAIN — dan itu tayang, bukan cuma tersimpan. Judul, deskripsi, dan
// kodenya benar; hanya nama di kartunya yang berbohong.
//
// Untuk game yang identitasnya bersengketa (tercatat di identitas-beda.json),
// pakai `name` dari halaman sumber yang kodenya benar-benar kita ambil. Nama itu
// dijamin sepadan dengan kode yang ditampilkan, dan itulah yang penting di sini.
const idRagu = new Set(readJSON(resolve(DATA, "identitas-beda.json"), []).map((x) => x.game));
const namaKartu = (id, g) => (idRagu.has(id) ? g.name : g.rawName || g.name).split("|")[0].trim();

// Thumbnail diambil detik 12.5: semua kartu kode sudah ke-reveal (kartu ke-4
// muncul ~8.7s) DAN baris teaser "+N kode lagi" sudah tampil (11.5s), sebelum
// transisi outro (14.4s). Detik 8 dulu cuma dapat 3 kartu.
function thumb(videoPath, outPath) {
  return new Promise((res) => { const ff = spawn(ffmpegBin(), ["-y", "-ss", "12.5", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outPath], { stdio: "ignore" }); ff.on("close", res); });
}

// ── FORMAT VIDEO: landscape (bawaan) atau short ────────────────────────────
//
// Kanal beralih ke landscape 10 Agu 2026. Alasannya bukan selera melainkan
// dua hal terukur:
//
//  1. Trafik sudah pindah ke PENCARIAN. Diukur pada 2 Shorts Drag Drive
//     Simulator, 3 hari pertamanya: 93,4% dan 95,3% view datang dari
//     YT_SEARCH, Shorts feed cuma 5,4% dan 3,3%. Yang membawa penonton bukan
//     formatnya, melainkan peringkat pencarian — dan pencarian tak peduli
//     video itu tegak atau mendatar.
//
//  2. JAM TAYANG SHORTS TIDAK DIHITUNG untuk ambang 4.000 jam. Data kanal 28
//     hari: 208 jam total, tapi yang berasal dari video >60 detik cuma 2 jam.
//     Artinya jalur monetisasi lewat jam tayang praktis jalan di tempat.
//     Beralih ke landscape membuat ~175 jam per 28 hari itu berlaku.
//
// KODE SHORTS SENGAJA TIDAK DISENTUH. Yang bercabang cuma titik render, dan
// pilihannya dibaca dari variabel workflow — jadi kembali ke Shorts tak perlu
// commit maupun deploy, cukup set VIDEO_FORMAT=short di GitHub Variables dan
// run berikutnya sudah memakainya lagi.
const FORMAT = String(process.env.VIDEO_FORMAT || "landscape").toLowerCase() === "short" ? "short" : "landscape";

// universeId dibaca dari data saat render, BUKAN dititipkan di objek kandidat.
// Kandidat ikut tersimpan ke pending-videos.json dan bertahan antar-run; nilai
// yang dititipkan di sana bisa basi, sedangkan pembacaan di sini selalu ikut
// data terbaru. Juga menghemat penyuntingan 6 tempat pembuat kandidat.
let _uid = null;
const uidUntuk = (id) => {
  _uid ??= readJSON(resolve(DATA, "roblox-codes.json"), { games: {} }).games ?? {};
  return _uid[id]?.universeId ?? null;
};

// Tautan playlist game, dari peta yang disinkron tiap run. Dulu baris ini
// ditempel di KOMENTAR saat upload (karena ID playlist baru pasti setelah
// terpasang); sekarang di DESKRIPSI, dibaca dari peta. Untuk game yang playlist
// -nya baru dibuat detik itu juga, petanya belum memuatnya dan barisnya
// dilewati — lebih baik tanpa tautan daripada tautan ke playlist yang belum ada.
let _ytpl = null;
const playlistUrlUntuk = (c) => {
  _ytpl ??= readJSON(resolve(DATA, 'yt-playlists.json'), {});
  const pid = _ytpl[c.id] ?? _ytpl[c.slug];
  return pid ? `https://youtube.com/playlist?list=${pid}` : null;
};

// Label tanggal thumbnail — WIB dan WAJIB memuat tahun (lihat renderWideThumb).
const stempelTanggal = (d) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(d);

/**
 * Render satu video + thumbnail-nya, sesuai FORMAT. Memulangkan lewat berkas:
 * `fin` (video final bersuara) dan `th` (thumbnail).
 *
 * Perbedaan jalur yang penting: renderShort menghasilkan video BISU lalu
 * muxAudio menempelkan VO + ding + musik dari berkas MP3, sedangkan renderWide
 * mensintesis musik & SFX-nya sendiri dan cuma menerima voPath. Jadi muxAudio
 * TIDAK boleh dipakai untuk landscape — delay ding-nya pun dipatok ke panjang
 * Shorts (adelay=18150) dan akan meleset di durasi lain.
 */
// ── WAWASAN & CARA REDEEM — MOBILE SAJA (14 Agu 2026) ────────────────────────
//
// Dibuka bertahap, mobile dulu, atas keputusan pemilik kanal. Alasannya bukan
// teknis melainkan blast radius: mobile 28 game (yang video-nya juga paling
// telanjang dan yang kebetulan direview manusia), Roblox 586 game dengan volume
// harian tinggi — cacat yang lolos di sana menggandakan diri jauh lebih cepat
// daripada bisa kita perbaiki. Roblox tinggal dibuka dengan mencabut penjagaan
// platform di bawah, setelah mobile terbukti mulus beberapa hari.
//
// Registry redeem dimuat SEKALI per proses. Ia tinggal di site/, jadi impornya
// dibungkus try: worker harus tetap jalan kalau berkas situs berubah bentuk,
// dan kehilangan satu adegan jauh lebih ringan daripada kehilangan videonya.
let _redeem = undefined;
let _rbSteps = undefined;
async function robloxSteps() {
  if (_rbSteps !== undefined) return _rbSteps;
  try { _rbSteps = await import(pathToFileURL(resolve(HERE, "../site/src/lib/robloxSteps.mjs")).href); }
  catch (e) { console.log(`  (langkah redeem Roblox dilewati: ${e.message})`); _rbSteps = null; }
  return _rbSteps;
}

/** Langkah redeem bilingual untuk kartu video, apa pun platformnya. */
async function redeemUntuk(c) {
  if (c.platform === "ROBLOX") {
    const m = await robloxSteps();
    if (!m?.langkahRedeem) return null;
    const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {} });
    const g = rb.games?.[c.id] ?? {};
    const r = m.langkahRedeem(c.name, Array.isArray(g.howTo) ? g.howTo : [], m.LANGKAH_STANDAR, c.id);
    return r?.id?.length ? { req: null, reqEn: null, steps: r.id, stepsEn: r.en ?? [] } : null;
  }
  const reg = await redeemRegistry();
  const r = reg?.[c.id];
  return r?.ingame?.id?.length
    ? { req: r.req?.id ?? null, reqEn: r.req?.en ?? null, steps: r.ingame.id, stepsEn: r.ingame.en ?? [] }
    : null;
}
async function redeemRegistry() {
  if (_redeem !== undefined) return _redeem;
  try {
    const { REDEEM } = await import(pathToFileURL(resolve(HERE, "../site/src/lib/redeem.mjs")).href);
    _redeem = REDEEM ?? null;
  } catch (e) {
    console.log(`  (registry redeem dilewati: ${e.message})`);
    _redeem = null;
  }
  return _redeem;
}

/** Wawasan per-game dari data kita sendiri (Roblox & mobile).
 *
 *  SUMBER BERKASNYA IKUT PLATFORM. Versi pertama selalu membaca codes.json —
 *  berkas MOBILE — karena waktu itu memang khusus mobile. Mencabut penjagaan
 *  platform tanpa membetulkan ini tak akan menyalakan apa pun: game Roblox tak
 *  ada di codes.json, jadi `aktif` kosong dan fungsinya memulangkan null diam-
 *  diam. Kelihatan seperti fitur yang menolak jalan tanpa sebab.
 */
function wawasanUntuk(c) {
  const berkas = c.platform === "ROBLOX" ? "roblox-codes.json" : "codes.json";
  const mc = readJSON(resolve(DATA, berkas), { active: [], archive: [] });
  const aktif = (mc.active ?? []).filter((x) => x.game === c.id);
  const arsip = (mc.archive ?? []).filter((x) => x.game === c.id);
  if (!aktif.length) return null;
  const nowMs = Date.now();
  return {
    siklus: siklusRilis([...aktif, ...arsip], { nowMs }),
    sekarat: kodeSekarat(aktif, { nowMs }),
    baru: kodeBaru(aktif, { nowMs }),
    arsip: kedalamanArsip(aktif, arsip),
  };
}

async function buatVideo(c, { base, vo, fin, th }, allMode, now) {
  // Naskah & adegan wawasan untuk SEMUA game landscape (Roblox dibuka 15 Agu
  // 2026, setelah mobile jalan sehari penuh tanpa keluhan). Shorts tetap memakai
  // voScript lama — jalur itu tak punya adegan wawasan sama sekali.
  const wawasan = FORMAT === "short" ? null : wawasanUntuk(c);
  // CARA REDEEM — dua sumber berbeda, karena dua platform menyimpannya di tempat
  // berbeda:
  //   MOBILE → registry manual site/src/lib/redeem.mjs (26 game, diverifikasi
  //            dengan membuka gamenya)
  //   ROBLOX → site/src/lib/robloxSteps.mjs, yang sudah dipakai halaman game.
  //            Ia menyusun langkah BILINGUAL dari howTo sumber (620 dari 632
  //            game punya), dengan langkah baku sebagai jaring pengaman.
  //
  // Kemarin aku menyimpulkan Roblox "tak punya data cara redeem" karena cuma
  // memeriksa registry manual — padahal situs sudah menampilkannya per-game
  // sejak lama. Yang kurang bukan datanya, melainkan videonya tak pernah
  // menengok ke sana.
  const redeem = await redeemUntuk(c);
  // GAMBAR PROMOSI & DERET PEMAIN DIAMBIL DI SINI, sebelum naskah — bukan di
  // jalur landscape seperti dulu.
  //
  // Kalimat pemain ("sekarang ada 271 ribu orang main, 24 jam terakhir bergerak
  // antara 240 sampai 300 ribu") butuh angka dari `seri`. Selama naskah disusun
  // sebelum pemanggilan itu, kalimat tersebut MUSTAHIL ikut — dan itu justru
  // bahan yang cuma dipunyai Roblox, satu-satunya yang tak bisa ditiru kanal
  // lain karena datang dari pengukuran 10-menit milik kita sendiri.
  const uid = FORMAT !== "short" && c.platform === "ROBLOX" ? uidUntuk(c.id) : null;
  const media = uid ? await gambarGame(uid, 8) : [];
  // KOLASE LATAR MOBILE — cover seluruh game mobile berkode, jadi satu wallpaper
  // diam. Game mobile tak punya universeId, jadi tak ada gambar promosi
  // per-game; sebelum ini latarnya cuma ikon 128px yang diperbesar 8x, praktis
  // bidang gelap polos.
  //
  // Menyala secara bawaan (bukan lewat variabel "aktifkan") karena kegagalannya
  // sudah aman dengan sendirinya: coverMobile memulangkan array kosong saat
  // jaringan atau katalog bermasalah, dan renderWide jatuh ke latar lama.
  // KOLASE_MATI=1 tetap disediakan sebagai jalan mundur tanpa deploy.
  const kolase = c.platform === "MOBILE" && process.env.KOLASE_MATI !== "1"
    ? await coverMobile(DATA)
    : null;
  if (kolase?.length) console.log(`  ↳ kolase latar: ${kolase.length} cover game mobile`);
  // BERGULIR DULU (24 jam sampai detik ini), baru jatuh ke berkas harian.
  const seri = uid ? ((await seriesPemainBergulir(uid)) ?? (await seriesPemain(uid))) : null;
  if (seri) console.log(`  ↳ grafik pemain: ${seri.titik} titik (${seri.bergulir ? "24 jam bergulir" : "hari kalender " + seri.tanggal})`);

  const naskah = (wawasan || uid)
    ? susunNaskah({
        name: c.name, activeCount: c.activeCount, codes: c.displayCodes,
        wawasan, redeem,
        pemain: c.players > 0 ? { sekarang: c.players, puncak: seri?.puncak ?? 0, rendah: seri?.rendah ?? 0, bergulir: !!seri?.bergulir } : null,
        allMode, isPromo: c.isPromo,
      })
    : null;
  if (naskah) console.log(`  ↳ wawasan: ${wawasan ? ringkasWawasan(wawasan) : "—"}${redeem ? ` · redeem ${redeem.steps.length} langkah` : ""} · naskah ${naskah.dipakai.length} kalimat (${naskah.dipakai.join(", ")})`);

  await makeVO({ name: c.name, activeCount: c.activeCount, allMode, isPromo: c.isPromo, outPath: vo, text: naskah?.teks ?? null });

  if (FORMAT === "short") {
    const moreCount = Math.max(0, c.activeCount - c.displayCodes.length); // sisa kode di situs → teaser "+N lagi"
    await renderShort({
      game: { name: c.displayName || c.name, platform: c.platform, players: c.players ? fmtPlayers(c.players) : null },
      codes: c.displayCodes, activeCount: c.activeCount, moreCount, fetchedAt: c.fetchedAt,
      allMode, iconPath: c.iconPath, outPath: base,
    });
    await muxAudio({ videoPath: base, voPath: vo, outPath: fin });
    await thumb(fin, th);
    return;
  }

  // LANDSCAPE. Masukan opsional renderWide dikirim EKSPLISIT. renderWide memberi
  // nilai bawaan aman untuk semuanya, jadi yang lupa dikirim hilang tanpa satu
  // pun error — video Drag Drive Simulator 9 Agu terbit tanpa grafik, tanpa VO,
  // dan tanpa jumlah pemain persis karena itu.
  //
  // `uid`, `media`, dan `seri` sudah diambil di atas (naskah membutuhkannya).
  // LATAR VIDEO — ROBLOX SAJA, dan itu bukan pilihan gaya melainkan isi klipnya:
  // di dalamnya karakter Roblox berkelahi. Memasangnya di belakang kode Genshin
  // atau Honkai akan menampilkan game yang salah di layar.
  //
  // Klipnya disediakan workflow (aset rilis `aset-latar`). Kalau variabelnya tak
  // dinyalakan atau unduhannya gagal, nilainya kosong → renderWide memakai latar
  // lama seperti biasa.
  const latarVideo = (c.platform === "ROBLOX" && process.env.LATAR_VIDEO) || null;
  if (latarVideo) console.log("  ↳ latar video aktif");

  await renderWide({
    game: { name: c.displayName || c.name, slug: c.slug, players: c.players ?? 0 },
    codes: c.displayCodes, activeCount: c.activeCount, fetchedAt: c.fetchedAt,
    iconPath: c.iconPath, outPath: fin, voPath: vo,
    series: seri?.series ?? null, seriesWaktu: seri?.bergulir ? { mulaiMs: seri.mulaiMs, sampaiMs: seri.sampaiMs } : null, media,
    // null utk Roblox → kedua adegan wawasan dilewati, videonya persis seperti
    // sebelum perubahan ini.
    wawasan, redeem, latarVideo, kolase,
  });
  await renderWideThumb({
    // `c.name` — nama KATALOG, bukan `displayName`.
    //
    // displayName memakai rawName Roblox yang penuh hiasan promosi ("[⏰ AA]
    // Dog Race 🐕💨"); itu benar untuk VIDEO, yang menampilkan game apa adanya.
    // Untuk thumbnail yang dibutuhkan justru nama yang dicari orang — dan itu
    // sudah tersedia bersih di c.name, sumber yang sama yang membangun judul
    // video dan judul playlist. Diukur 10 Agu 2026: 0 dari 588 nama katalog
    // memuat emoji atau kurung, sementara 453 game punya rawName yang berbeda.
    game: { name: c.name || c.displayName },
    activeCount: c.activeCount,
    newCount: (c.newCodes ?? []).length,
    dateLabel: stempelTanggal(now),
    // Instan yang SAMA dengan pil di video (c.fetchedAt), bukan waktu render —
    // dua stempel kembar yang berbeda menit lebih membingungkan daripada tak
    // ada stempel sama sekali.
    timeLabel: fmtWIB(c.fetchedAt ? new Date(c.fetchedAt) : now),
    iconPath: c.iconPath, media, outPath: th,
  });
}

// Kode yang situs cetak berbadge "CEK DULU" — HARUS memakai uji yang sama persis
// dengan CodeCard.astro, kalau tidak situs dan video saling membantah.
//
// Dulu di sini cuma `c.check`, dan itu bocor: `srcCheck` (Roblox Den sendiri
// menandai kode ini ragu) lolos ke video, padahal di situs kodenya tampil CEK
// DULU. Terukur 7 Agu 2026: 438 kode di 244 game. Sebagian game malah 100%
// begitu — War Tycoon, Arsenal, dan Anime Slashing Simulator seluruh kodenya
// diragukan, jadi videonya membuka dengan "semua terverifikasi" lalu
// menyodorkan daftar yang tak satu pun dipercaya situsnya sendiri.
//
// Uji lapangan 7 Agu 2026 (29 kode, 3 game) menutup perdebatannya: dari 15 kode
// srcCheck yang benar-benar dicoba di dalam game, 15 mati. Nol keliru.
//
// `tuaRagu` SENGAJA dibiarkan lolos. Ia menandai kode tua yang kedua primer
// masih daftarkan (1.538 kode, 24 game termasuk Grow a Garden dan Jailbreak),
// dan sampai kini NOL yang pernah diuji lapangan. Membuangnya berarti menghapus
// game besar dari kanal atas dasar dugaan. Buang kalau nanti ada buktinya.
const diragukan = (c) => c.check === true || c.srcCheck === true;

function buildCandidates() {
  const out = [];
  // ROBLOX
  const rb = readJSON(resolve(DATA, "roblox-codes.json"), { games: {}, active: [] });
  // Kode badge "CEK DULU" TAK dimasukkan ke video mana pun — jangan umbar kode
  // meragukan (kualitas). Berlaku semua game.
  const chkKey = (game, code) => `${game}:${(code || "").toLowerCase()}`;
  const checkSet = new Set((rb.active || []).filter(diragukan).map((c) => chkKey(c.game, c.code)));
  rb.active = (rb.active || []).filter((c) => !diragukan(c));
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
      platform: "ROBLOX", id, name: g.name, displayName: namaKartu(id, g), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
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
      platform: "ROBLOX", id, name: g.name, displayName: namaKartu(id, g), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
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
      platform: "ROBLOX", id, name: g.name, displayName: namaKartu(id, g), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
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
  const mCheckSet = new Set((mc.active || []).filter(diragukan).map((c) => mChkKey(c.game, c.code)));
  mc.active = (mc.active || []).filter((c) => !diragukan(c));
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
// Batas 4 dipasang untuk SHORTS: layar tegak sempit, dan menjejali kode
// membuatnya tak terbaca. Landscape punya batas yang berbeda sifatnya —
// renderWide memangkas sendiri dari ekor sampai muat anggaran 30 detik, jadi
// mengirim lebih banyak tak pernah membuat videonya kepanjangan, cuma membuat
// slot yang tersedia benar-benar terpakai.
//
// Terukur: Death Ball (13 kode aktif) dengan batas 4 menghasilkan video 15,9
// detik — separuh anggaran terbuang, padahal jam tayang justru yang sedang
// dikejar. Batas 10 membiarkan renderWide yang memutuskan, dan ia berhenti
// tepat sebelum 30 detik.
const MAX_DISPLAY = String(process.env.VIDEO_FORMAT || "landscape").toLowerCase() === "short" ? 4 : 10;
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
// PEMECAH SERI: kode yang SUMBER tandai "baru" menang saat skor kebaruannya sama.
//
// JUJUR SOAL DAMPAKNYA: diukur 7 Agu 2026, ini mengubah NOL dari 262 game yang
// kodenya melebihi jumlah slot. Bukan perbaikan, melainkan penghapus
// kesewenangan. 693 kode (12%) berskor NOL — tanpa tanggal rilis DAN bulk,
// sehingga cadangan firstSeen pun mati — dan untuk mereka urutan selama ini
// ditentukan POSISI ARRAY, yang bisa berubah kapan saja tanpa alasan. Kebetulan
// hari ini posisi array sudah menaruh yang ber-srcNew di depan; besok belum tentu.
//
// Alasan srcNew yang dipilih sebagai pemecah, bukan kriteria lain: uji lapangan
// 7 Agu 2026 (34 kode, 4 game) menunjukkan di antara kode yang kita sebut bisa
// dipakai, yang ber-srcNew 10 hidup 0 mati, yang tanpa 2 hidup 3 mati. Ketiga
// kesalahan kita — IDULADHA2026, WEHEARYOU, DRAGDRIVEDANGCAP — semuanya tanpa
// srcNew.
//
// Yang TIDAK boleh disimpulkan dari situ: menyaring kode tanpa srcNew. Dua kode
// hidup di sampel juga tak punya penanda itu — Den mencabut badge NEW seiring
// waktu, jadi ketiadaannya berarti "tak tahu", bukan "mati".
//
// Sengaja TIDAK memakai srcNewAt sebagai tanggal, walau tersedia di 849 kode:
// nilainya adalah jam KITA menarik halaman, bukan jam kode dirilis. Memasukkannya
// ke recency akan membuat kode ber-srcNew selalu mengalahkan kode yang benar-benar
// rilis hari ini. Sebagai pemecah seri ia aman — hanya bekerja saat recency sama.
const terbaruDulu = (arr) =>
  [...arr].sort((a, b) => recency(b) - recency(a) || (b.srcNew === true ? 1 : 0) - (a.srcNew === true ? 1 : 0));

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
    const active = rb.active.filter((c) => c.game === id && !diragukan(c)); // buang kode "CEK DULU"
    if (active.length === 0) return null;
    return {
      platform: "ROBLOX", id, name: g.name, displayName: namaKartu(id, g), slug: g.slug ?? id, players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: 0, newCodes: [], activeCount: active.length,
      fetchedAt: new Date().toISOString(), allMode: true, displayCodes: tandaiBaru(pickDisplay([], terbaruDulu(active)), active), descCodes: tandaiBaru(pickDisplay([], terbaruDulu(active), false, DESC_MAX), active),
    };
  }
  const mc = readJSON(resolve(DATA, "codes.json"), { active: [] });
  const active = mc.active.filter((c) => c.game === id && !diragukan(c)); // buang kode "CEK DULU"
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
    const active = rb.active.filter((c) => c.game === id && !diragukan(c)); // kode "CEK DULU" tak pernah masuk video
    if (active.length === 0) continue;
    if (active.every((c) => sudahDiposting(state, id, c.code, "ROBLOX"))) continue;
    const urut = terbaruDulu(active);
    out.push({
      platform: "ROBLOX", id, name: g.name, displayName: namaKartu(id, g), slug: g.slug ?? id,
      players: g.players ?? 0, redeemNote: g.redeemNote ?? null, alias: g.alias ?? null,
      iconPath: resolve(ASSETS_ROBLOX, `${id}.png`), rank: g.players ?? 0,
      newCodes: [], activeCount: active.length, fetchedAt: new Date().toISOString(),
      // allCodes WAJIB diisi di sini. Penanda "sudah divideokan" ditulis lewat:
      //   for (const code of c.allCodes ?? c.newCodes.map(n => n.code)) tandaiPosted(...)
      // dan item borongan lahir dengan newCodes: [] — jadi tanpa allCodes, loop
      // itu tak pernah berjalan sekali pun dan video borongan TIDAK MENINGGALKAN
      // JEJAK APA PUN. Game-nya tetap "belum pernah ada videonya" selamanya.
      //
      // Satu-satunya hal lain yang mengeluarkannya dari antrean adalah punya
      // playlist — padahal pembuatan playlist dibatasi ~10/hari oleh YouTube
      // sementara borongan menembak sampai 15. Sisanya diunggah ulang tiap hari.
      // Terbukti 6 Agu 2026: dua run berjarak 25 menit menghasilkan 5 video
      // duplikat (A Dusty Trip, Build A Boat For Treasure, My Avatar, Realistic
      // Street Soccer, Tower Defense Simulator).
      allCodes: active.map((c) => c.code),
      allMode: true, backlog: true,
      // SENGAJA TANPA tandaiBaru — video borongan TIDAK BOLEH memasang badge/[NEW]
      // (keputusan 12 Agu 2026). Alasannya bukan estetika: game borongan justru
      // yang baru MASUK pantauan kita, jadi kode lamanya berulang kali ber-firstSeen
      // baru, dan `recency` jatuh ke firstSeen saat sumber tak memberi tanggal
      // (praktis semua kode Roblox Den) → hampir seluruh kartunya akan dicap BARU
      // padahal isinya arsip. Jalur pemicu (newCodes) & on-demand tetap menandai:
      // di sana penandanya memang menjawab "kode ini baru buat penonton".
      displayCodes: pickDisplay([], urut),
      descCodes: pickDisplay([], urut, false, DESC_MAX),
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

    // Entri roundup/top50 TANPA berkas: thumbnail-nya deterministik dari tanggal,
    // jadi dirender ulang lewat skripnya sendiri (yang punya akses charts/R2).
    //
    // Kenapa di sini dan bukan di workflow harian masing-masing: keduanya jalan
    // 17:30 & 17:35 UTC — sepuluh jam setelah reset kuota, ketika Shorts sudah
    // menghabiskannya. Itu justru jam terburuk untuk mencoba lagi, dan itulah
    // sebabnya video 4 Agu terbit tanpa thumbnail lalu tak pernah pulih. Run
    // per-jam ini menyentuh kuota paling segar tepat setelah 07:00 UTC.
    const antreLong = semuaPending().filter((x) => !x.file && x.date && (x.kind === "roundup" || x.kind === "top50"));
    for (const x of antreLong) {
      const skrip = x.kind === "roundup" ? "make-codes-roundup.mjs" : "make-top50.mjs";
      console.log(`thumbnail ${x.kind} ${x.date} (${x.videoId}) — render ulang…`);
      const kode = await new Promise((res) => {
        const p = spawn(process.execPath, [resolve(HERE, skrip), `--date=${x.date}`, `--thumb-only=${x.videoId}`], { stdio: "inherit" });
        p.on("close", res); p.on("error", () => res(1));
      });
      // Skripnya sendiri yang memanggil buangPending saat berhasil; kalau gagal
      // entrinya sengaja DIBIARKAN supaya run berikutnya mencoba lagi.
      if (kode !== 0) { console.log(`  gagal (exit ${kode}) — tetap di antrean`); break; }
    }
  }

  const onDemandId = process.argv.find((a) => a.startsWith("--game="))?.slice(7);
  if (onDemandId) {
    const c = buildOnDemand(onDemandId);
    if (!c) { console.log(`game "${onDemandId}" tak ditemukan / tak punya kode aktif.`); return; }
    mkdirSync(TMP, { recursive: true }); mkdirSync(OUTDIR, { recursive: true });
    console.log(`▶ [atas permintaan] ${c.name} (${c.platform}) — ${c.activeCount} kode aktif`);
    const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
    await buatVideo(c, { base, vo, fin, th }, true, now);
    const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.descCodes ?? c.displayCodes, activeCount: c.activeCount, allMode: true, redeemNote: c.redeemNote, alias: c.alias, now, shorts: FORMAT === "short", playlistUrl: playlistUrlUntuk(c) });
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
  // REM KEDUA: UNIT, bukan cuma hitungan video.
  //
  // MAX_PER_DAY menghitung VIDEO dan diam-diam berasumsi hari ini cuma berisi
  // video. Yang tak terhitung: antrean playlist & thumbnail tertunda, yang tiap
  // satunya 50 unit dan bisa datang berpuluh sekaligus. 12 Agu 2026 run pertama
  // sesudah reset menghabiskan 1.483 unit dengan hanya 3 upload — 990 di antaranya
  // milik 7 playlist + 6 thumbnail tertunda dari kemarin. Hari yang begitu memulai
  // "57 slot" dengan kuota yang sudah bocor 10% dan berakhir dengan penolakan di
  // tengah jalan, yang justru MELAHIRKAN antrean baru untuk besok.
  //
  // Sisa unit dibaca dari catatan panggilan nyata (data/kuota-yt.json), bukan
  // ditebak dari konstanta. CADANGAN disisakan untuk pembacaan rutin yang bukan
  // video: sinkron playlist tiap jam (~9 unit × 24) + audit laporan harian.
  const CADANGAN = Number(process.env.YT_UNIT_CADANGAN || 500);
  const slotUnit = Math.floor((unitSisa() - CADANGAN) / UNIT_PER_VIDEO);
  if (slotUnit < remaining) {
    console.log(`rem kuota: sisa ~${unitSisa()} unit (cadangan ${CADANGAN}) → ${Math.max(0, slotUnit)} video, di bawah slot ${remaining} — pakai yang lebih kecil`);
    remaining = slotUnit;
  }
  // Angka dalam kurung = kandidat MENTAH sebelum disaring, jadi sengaja tak
  // menjumlah ke angka pertama. Ditulis eksplisit "dari" supaya tak terbaca
  // sebagai penjumlahan yang meleset.
  console.log(`kandidat: ${candidates.length} perlu video (dari ${pending.length} antrean + ${fresh.length} terdeteksi; sisanya sudah divideokan) | slot upload hari ini: ${Math.max(0, remaining)}/${MAX_PER_DAY}`);
  // BORONGAN SUSULAN di jam terakhir sebelum kuota reset. Ditaruh SETELAH sort
  // supaya selalu di buntut: kode baru tak boleh kalah oleh susulan, betapa pun
  // ramai game-nya. Slot yang diisi = sisa kuota hari ini, dipotong RENDER_MAX.
  if (!BACKLOG_OFF && jamPT(now) >= BACKLOG_HOUR_PT && remaining > 0) {
    // Dry-run dibatasi 2 supaya jalur ini bisa dipratinjau tanpa menunggu 15
    // render (~17 menit) — kalau tak bisa dicoba, tak bisa dipercaya.
    const muat = Math.min(DRY_RUN ? 2 : remaining, RENDER_MAX) - candidates.length;
    // Game yang SUDAH jadi kandidat run ini dikeluarkan dari susulan.
    //
    // buildBacklog menyaring lewat `state.posted` — catatan game yang pernah
    // punya video. Game yang baru masuk daftar kandidat beberapa baris di atas
    // belum tercatat di sana, jadi ia lolos dua kali dan terbit DUA video dalam
    // menit yang sama: satu "Kode Terbaru" (jalur kode baru) dan satu "Semua
    // Kode Aktif" (jalur susulan). Terjadi 8 Agu 2026 pada Chicken Farm dan
    // Grow a Chicken Fighter — dua game yang serentak baru masuk katalog DAN
    // membawa kode baru, sehingga memenuhi syarat kedua jalur sekaligus.
    //
    // Ongkosnya bukan cuma 164 unit kuota terbuang: di kanal, dua video judul
    // nyaris kembar untuk game yang sama, terbit selisih menit, terbaca sebagai
    // spam oleh penonton maupun YouTube.
    //
    // 13 Agu 2026: saringan yang dipasang di sini ternyata TAK PERNAH BEKERJA —
    // ia mencocokkan `c.game`, padahal kandidat berkunci `c.id` (`game` itu nama
    // field di record KODE dan di entri log). Himpunannya selalu kosong, jadi
    // semua lolos. Pindah ke video/susulan.mjs supaya ada tesnya + alarm bila
    // field identitas berganti nama lagi.
    const susulan = saringSusulan(buildBacklog(state, muat), candidates);
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
  let picks = candidates.slice(0, RENDER_MAX);
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
  // ── BORONGAN BERGELOMBANG ──────────────────────────────────────────────────
  // RENDER_MAX membatasi satu gelombang, bukan satu run. Sebelumnya keduanya
  // sama, dan itu membuang kuota persis di jam yang dirancang untuk
  // menghabiskannya: 7 Agu 2026 pukul 23 PT tersisa 42 slot tapi borongan cuma
  // mengambil 15, dan tak ada run lagi sebelum reset pukul 00:00 PT — 27 slot
  // hangus.
  //
  // Sekarang: render satu gelombang, periksa sisa kuota, susun ulang daftar
  // borongan, lanjut sampai kuota habis. Daftarnya memang diturunkan ulang tiap
  // kali (bukan diantrikan), jadi gelombang berikutnya otomatis tak mengulang
  // yang barusan — tandanya sudah ditulis ke state tiap video selesai.
  //
  // Tiga rem, dan ketiganya perlu:
  //   kuota    — tujuan utamanya; berhenti tepat saat habis
  //   waktu    — run ini berbagi runner dengan tarikan data per jam; melar
  //              melewati jam berikutnya membuat run itu mengantre
  //   tengah malam PT — reset kuota; melewatinya berarti memakai jatah HARI BARU
  const MENIT_MAX = Number(process.env.VIDEO_MAX_MENIT || 40);
  const mulaiMs = Date.now();
  let gelombang = 1;
  let sudahRender = 0; // laju render dihitung darinya → ukuran gelombang berikutnya
  while (picks.length) {
  for (const c of picks) {
    if (canUpload && remaining <= 0) { requeue.push(c); continue; } // kuota habis → jgn render, antri retry
    // Dicek ULANG tiap video, bukan sekali di awal: pengurasan antrean playlist/
    // thumbnail di run yang sama ikut memakan unit SESUDAH slot dihitung. Tanpa
    // pemeriksaan ini, video terakhir dirender penuh lalu ditolak saat upload.
    if (canUpload && unitSisa() < UNIT_PER_VIDEO) {
      console.log(`  ⏭ ${c.name}: sisa unit kuota ~${unitSisa()} < ongkos satu video (~${UNIT_PER_VIDEO}) — diantrikan ke run berikutnya`);
      requeue.push(c); continue;
    }
    // PENJAGA TENGAH MALAM PT. Borongan susulan sengaja dijadwalkan mepet reset;
    // kalau run-nya molor dan tanggal PT keburu maju, upload berikutnya memakan
    // kuota HARI BARU — persis kerugian yang penjadwalan ini ingin hindari.
    // Dilepas begitu saja (tanpa requeue) karena daftarnya bisa dihitung ulang.
    // Dulu penjaga ini cuma memeriksa apakah tengah malam SUDAH lewat, dan itu
    // membiarkan satu video bocor: yang dimulai 23:59 PT selesai dirender lalu
    // diunggah pukul 00:00+, memakan jatah HARI BARU — persis kerugian yang
    // penjadwalan jam 23 PT ingin hindari. Sekarang berhenti sebelum tengah
    // malam, dengan margin selebar satu video (dihitung dari laju run ini, bukan
    // ditebak). Keputusan user: lebih baik kehilangan beberapa slot daripada
    // menyeberang reset.
    const sisaKeResetMnt = (23 - jamPT(new Date())) * 60 + (60 - new Date().getUTCMinutes());
    const marginMnt = sudahRender > 0 ? (Date.now() - mulaiMs) / 60000 / sudahRender : 2;
    if (c.backlog && (hariPT(new Date()) !== state.date || sisaKeResetMnt <= marginMnt)) {
      console.log(`  ⏭ ${c.name}: mepet reset kuota PT (sisa ${Math.max(0, sisaKeResetMnt)} menit), susulan dihentikan — lanjut besok`);
      continue;
    }
    let quotaManual = false;
    try {
      console.log(`\n▶ ${c.name} (${c.platform}) — ${c.newCodes.length} kode baru`);
      const base = resolve(TMP, "base.mp4"), vo = resolve(TMP, "vo.mp3"), fin = resolve(TMP, "final.mp4"), th = resolve(TMP, "thumb.jpg");
      await buatVideo(c, { base, vo, fin, th }, c.allMode, now);
      const meta = buildMetadata({ name: c.name, platform: c.platform, slug: c.slug, codes: c.descCodes ?? c.displayCodes, activeCount: c.activeCount, allMode: c.allMode, isPromo: c.isPromo, redeemNote: c.redeemNote, alias: c.alias, now, shorts: FORMAT === "short", playlistUrl: playlistUrlUntuk(c) });
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
          //
          // BORONGAN MENAHAN PEMBUATAN PLAYLIST — TAPI HANYA SAAT JATAHNYA MEMANG
          // TIPIS (sejak 14 Agu 2026; sebelumnya tanpa syarat).
          //
          // Alasan aslinya tetap berlaku: jatah playlist baru YouTube ~10/hari
          // sementara borongan menembak sampai 15 per run. Log 6 Agu 2026 penuh
          // baris "jatah playlist harian sudah habis — pembuatan ditahan".
          //
          // Yang keliru adalah menahannya TANPA MELIHAT SISA. 13 Agu 2026 baru 7
          // dari ~10 terpakai, tapi dua video borongan tetap terbit tanpa playlist
          // — dan jadi yatim PERMANEN, karena kodenya sudah ditandai posted
          // sehingga tak pernah diulang. Efeknya sampai ke situs: game punya
          // video, tapi tombol "Video di YouTube" tak muncul (dibaca dari
          // yt-playlists.json). Ketahuan dari user yang bertanya "kenapa ada video
          // yang tak ada playlistnya padahal kuota longgar" — dan "kuota longgar"
          // yang dia lihat memang benar, cuma menunjuk batas yang berbeda.
          //
          // Borongan jalan di JAM TERAKHIR sebelum reset (23:00 PT), jadi jatah
          // yang tersisa saat itu akan hangus dalam hitungan menit kalau tak
          // dipakai. Menyisakannya untuk "kode baru nanti" tak ada gunanya —
          // nantinya sudah hari berikutnya, dengan jatah yang baru.
          const jatahPlaylist = sisaPlaylist();
          const tahanPlaylist = SKIP_PLAYLIST || (c.backlog === true && jatahPlaylist <= 0);
          if (c.backlog === true && !SKIP_PLAYLIST) {
            console.log(`  ↳ jatah playlist hari ini: sisa ${jatahPlaylist}/${PLAYLIST_HARIAN} → ${tahanPlaylist ? "ditahan" : "boleh dibuat"}`);
          }
          //
          // Jalur kode-baru untuk game yang benar-benar baru TIDAK disentuh: di
          // situ playlist tetap dibuat otomatis dalam jatah 10/hari, karena
          // game-game itu datang beberapa per hari, bukan puluhan.
          // thumbnailPath SENGAJA TIDAK DIKIRIM untuk Shorts. Dibuktikan 5 Agu
          // 2026 dengan membuka gambarnya, bukan mengukurnya: video AFK Journey
          // yang diunggah 3 Agu (thumbnails.set dipanggil saat upload, tiga hari
          // propagasi) tetap menampilkan potongan frame tengah animasi — 3 kartu
          // kode, tanpa kartu ke-4, tanpa baris "+N kode lagi di kodegg.com" yang
          // pasti ada di render kita. YouTube mengabaikan thumbnail unggahan untuk
          // Shorts dan memilih framenya sendiri.
          //
          // Panggilannya tetap DIJAWAB "berhasil" oleh API, jadi kesia-siaan ini
          // tak pernah memunculkan error — sementara thumbnails.set menelan 50
          // unit. Pada ~45 video/hari itu ~2.250 unit, 22% dari seluruh kuota
          // harian, dibakar untuk gambar yang tak pernah tampil.
          //
          // Video LONG (roundup & top50) tak lewat sini dan tetap memakai
          // thumbnail kustom — di sana YouTube memang memakainya.
          //
          // LANDSCAPE MEMBALIK KEPUTUSAN DI ATAS. Alasan tak mengirim thumbnail
          // adalah "YouTube mengabaikannya untuk Shorts", dan itu tak berlaku di
          // sini — komentar itu sendiri sudah mencatat pengecualiannya pada video
          // long. Video 16:9 MEMAKAI thumbnail unggahan, dan seluruh rancangan
          // thumbnail landscape (badge jumlah kode, tanda BARU, kolase gambar
          // game) tak ada gunanya kalau tak pernah dikirim.
          //
          // Terlihat 10 Agu 2026: tiga video landscape pertama terbit memakai
          // potongan frame pilihan YouTube. Gejalanya diam — API tak mengeluh
          // karena memang tak ada yang diminta.
          const kirimThumb = FORMAT === "landscape";
          // KOMENTAR OTOMATIS DIHENTIKAN (10 Agu 2026).
          //
          // commentThreads.insert 50 unit — 23% anggaran per video — untuk teks
          // yang hampir tak pernah terlihat: API YouTube tak punya endpoint pin,
          // jadi komentarnya duduk di dasar kolom komentar, dan 46 video sehari
          // mustahil di-pin manual satu per satu.
          //
          // Isinya tak hilang. Dua hal yang cuma ada di komentar — peringatan
          // CASE-SENSITIVE dan tautan playlist — sekarang di DESKRIPSI, tempat
          // yang justru selalu tampil. Sisanya memang sudah ada di sana.
          //
          // Hematnya: 213,6 → 163,6 unit/video, plafon 46 → 61 video/hari.
          //
          // Jalur upload MANUAL tetap memasang komentar (meta.comment masih
          // ditulis ke berkas .txt): jumlahnya sedikit dan bisa di-pin tangan,
          // jadi di sana 50 unit itu terbayar.
          const { comment: _takDipakai, ...metaUpload } = meta;
          const { id, url, playlistPending, thumbPending } = await uploadVideo({ videoPath: fin, ...metaUpload, privacy: PRIVACY, thumbnailPath: kirimThumb ? th : undefined, tanpaBuatPlaylist: tahanPlaylist });
          // Thumbnail Shorts TAK BISA dirender ulang seperti video long: dia
          // potongan frame dari mp4 yang ikut terhapus bersama runner, dan
          // Shorts tak bisa diberi thumbnail lewat Studio desktop (harus API atau
          // aplikasi HP). Jadi kalau gagal, JPG-nya (±180 KB) disimpan ke
          // worker/data/ — yang memang di-commit workflow — supaya run berikutnya
          // bisa memasangnya tanpa perlu videonya lagi. Berkasnya dihapus begitu
          // terpasang, jadi tak menumpuk.
          // Antrean thumbnail Shorts ikut dihapus: memasangnya ulang nanti pun
          // tetap diabaikan YouTube, jadi antrean itu cuma menunda pemborosan.
          //
          // Untuk LANDSCAPE antrean itu justru penting: thumbnail-nya dipakai,
          // dan berkasnya hidup di runner yang sekali pakai — kalau gagal dan
          // tak disimpan, ia hilang bersama runner dan videonya selamanya
          // memakai frame pilihan YouTube.
          //
          // Berkas JPG-nya IKUT DISALIN ke worker/data/pending-thumbs/ — folder
          // yang ikut ter-commit workflow. Pengurasan antrean membaca dari sana
          // (baris ~732), dan tanpa salinan itu entrinya langsung dibuang di run
          // berikutnya karena berkasnya tak ditemukan. Berbeda dari thumbnail
          // roundup/top50 yang deterministik dari tanggal dan bisa dirender
          // ulang, thumbnail per-game bergantung pada data kode saat itu.
          if (kirimThumb && thumbPending) {
            try {
              mkdirSync(THUMB_DIR, { recursive: true });
              const namaThumb = `${id}.jpg`;
              copyFileSync(th, resolve(THUMB_DIR, namaThumb));
              simpanPending({ videoId: id, kind: "wide", file: namaThumb, judul: meta.title });
              console.log("  ↳ thumbnail gagal — diantrikan utk run berikutnya");
            } catch (e) { console.log(`  ↳ thumbnail gagal & tak bisa diantrikan: ${e.message}`); }
          } else void thumbPending;
          // Daftar "buat MANUAL" hanya untuk yang TAK akan dicoba ulang sendiri.
          // Jalur normal sudah diantrikan ke pending-playlists.json beberapa baris
          // di bawah (`playlistPending && !c.backlog`), jadi memasukkannya ke sini
          // juga akan menyuruh orang mengerjakan tangan sesuatu yang sudah beres
          // otomatis di run berikutnya.
          if (playlistPending && (SKIP_PLAYLIST || c.backlog === true)) tanpaPlaylist.push({ id, judul: meta.playlistTitle });
          console.log(`  ✓ upload (${PRIVACY}): ${url} — "${meta.title}"`);
          state.todayCount += 1; remaining -= 1;
          state.log.unshift({ at: now.toISOString(), game: c.id, name: c.name, videoId: id, title: meta.title, mode: "upload" });
          // `players` ikut disimpan supaya pengurasan bisa MENDAHULUKAN game besar
          // (lihat drainPending). Jatah playlist baru YouTube cuma ~10/hari.
          // BORONGAN TIDAK DIANTRIKAN. `tanpaBuatPlaylist` cuma menahan
          // pembuatan playlist SAAT ITU; tanpa penjaga di sini, permintaannya
          // tetap masuk pending-playlists.json dan drainPending() membuatnya
          // otomatis begitu kuota reset — persis yang ingin dihindari, cuma
          // tertunda beberapa jam.
          //
          // Alasannya sama dengan kenapa borongan melewati pembuatan playlist
          // sejak awal: jatah playlist baru YouTube ~10/hari sementara borongan
          // menembak puluhan per malam. Yang tak muat menumpuk di antrean lalu
          // dibuat entah kapan, di luar kendali. Untuk borongan, playlist dibuat
          // manual — daftarnya dicetak di ringkasan run.
          if (playlistPending && !c.backlog) enqueuePending({ ...playlistPending, players: c.players ?? 0, game: c.id });
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
      if (!quotaManual) for (const code of c.allCodes ?? c.newCodes.map((n) => n.code)) tandaiPosted(state, ck(c.id, code, c.platform));
      if (!quotaManual && c.isPromo) {
        // Rekap bulan ini beres + semua kode promo saat ini ditandai (jangan
        // ulang bulan ini kecuali muncul kode promo yg benar-benar baru).
        state.promoMonth = bulanWIB(now); // WIB — HARUS sama dg sisi baca (lihat bulanWIB)
        for (const pc of c.promoActive ?? []) state.posted[`promo:${pc.code}`] = true;
      }
      sudahRender += 1;
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); // simpan tiap video → aman bila run dibatalkan
    } catch (e) {
      console.log(`  ✗ gagal ${c.name}: ${e.message}`);
    }
  }
    // ── gelombang berikutnya? ────────────────────────────────────────────────
    picks = [];
    const menit = (Date.now() - mulaiMs) / 60000;
    const bolehLanjut = !DRY_RUN && canUpload && remaining > 0
      && jamPT(new Date()) >= BACKLOG_HOUR_PT && hariPT(new Date()) === state.date;
    if (bolehLanjut && menit >= MENIT_MAX) {
      console.log(`(gelombang berhenti: ${menit.toFixed(0)} menit terpakai, batas ${MENIT_MAX} — sisa ${remaining} slot dilanjut besok)`);
    } else if (bolehLanjut) {
      // UKURAN GELOMBANG DIPOTONG WAKTU TERSISA, bukan cuma kuota. Memeriksa
      // batas hanya di ANTARA gelombang tak cukup: gelombang yang mulai di menit
      // 39 tetap berjalan penuh dan berakhir di menit 55. Disimulasikan sebelum
      // dikirim — 42 slot menghasilkan 46 menit dengan batas 40.
      //
      // Laju dihitung dari gelombang yang SUDAH berjalan run ini, jadi ia
      // menyesuaikan sendiri saat render melambat (video berkode banyak) tanpa
      // perlu angka yang ditebak di muka.
      const selesai = Math.max(1, sudahRender);
      const perVideo = menit / selesai;
      const muatWaktu = Math.max(0, Math.floor((MENIT_MAX - menit) / Math.max(0.2, perVideo)));
      // JANGAN PERNAH MENYEBERANG RESET KUOTA. Penjaga tengah-malam yang lama
      // bekerja per-video dan diperiksa SEBELUM render, jadi video yang dimulai
      // pukul 23:59 PT tetap berjalan dan unggahannya jatuh ke jatah HARI BARU —
      // persis kerugian yang penjadwalan jam 23 PT ingin hindari.
      //
      // Di sini gelombang berikutnya dipotong sisa waktu menuju tengah malam PT,
      // dengan margin satu video. Keputusan user: "yang penting gak sampe
      // ngelewatin reset APInya, hilang sedikit gpp, yang penting konsisten" —
      // jadi sisa slot sengaja direlakan daripada mempertaruhkan jatah besok.
      const kePT00 = (() => {
        const d = new Date();
        const j = jamPT(d), m = d.getUTCMinutes();
        return (23 - j) * 60 + (60 - m); // menit menuju 00:00 PT
      })();
      const muatSebelumReset = Math.max(0, Math.floor((kePT00 - perVideo) / Math.max(0.2, perVideo)));
      const jatah = Math.min(remaining, RENDER_MAX, muatWaktu, muatSebelumReset);
      const lanjut = jatah > 0 ? buildBacklog(state, jatah) : [];
      if (lanjut.length) {
        gelombang += 1;
        picks = lanjut;
        console.log(`\n── gelombang ${gelombang}: ${lanjut.length} game · sisa kuota ${remaining} · ${menit.toFixed(0)}/${MENIT_MAX} menit · ~${perVideo.toFixed(1)} mnt/video ──`);
      } else if (jatah === 0) {
        console.log(`(gelombang berhenti: sisa waktu tak cukup untuk video berikutnya — ${menit.toFixed(0)}/${MENIT_MAX} menit, sisa ${remaining} slot dilanjut besok)`);
      }
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
  // Hitung dari BERKAS yang benar-benar ada, bukan dari catatan log. Entri
  // "manual" bertahan di state (dan ikut ter-commit), sedangkan berkasnya hidup
  // di mesin yang merendernya. Akibatnya run CI melaporkan "36 video nunggu
  // upload manual (_video-out/)" untuk video yang sudah diunggah dari laptop —
  // menyuruh mencari berkas yang tak pernah ada di runner. Terlihat 5 Agu 2026.
  const manual = state.log.filter((l) => l.mode === "manual" && l.at?.slice(0, 10) === today
    && l.file && existsSync(resolve(OUTDIR, l.file))).length;
  console.log(`\nselesai — ${state.todayCount}/${MAX_PER_DAY} upload otomatis hari ini${manual ? `, ${manual} video nunggu upload manual (_video-out/)` : ""}.`);
  // Rincian panggilan API run ini + akumulasi hari PT. Dicetak SELALU, bukan cuma
  // saat mepet: angka inilah yang selama ini cuma bisa dibaca dari konsol Google
  // sehari kemudian — dan karena itu tiap penyetelan MAX_PER_DAY jadi tebak-tebakan.
  {
    const k = ringkasKuota();
    console.log(`kuota YouTube (hari PT ${k.hari}): ~${k.unit} unit terpakai, sisa ~${k.sisa}${k.rinci ? `\n  ${k.rinci}` : ""}`);
  }
  if (tanpaPlaylist.length) {
    // SENGAJA tak diantrikan ke pending-playlists.json — VIDEO_SKIP_PLAYLIST
    // dipakai justru ketika kita ingin jatah playlist harian TIDAK terpakai.
    console.log(`\n[!] ${tanpaPlaylist.length} video TANPA playlist — buat MANUAL (borongan / VIDEO_SKIP_PLAYLIST):`);
    for (const v of tanpaPlaylist) console.log(`    ${v.id}  →  ${v.judul}`);
    console.log(`    Buat manual di Studio, atau: yt-maintenance mode=playlistadd ids=${tanpaPlaylist.map((v) => v.id).join(",")} apply=true`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const baris = tanpaPlaylist.map((v) => `- \`${v.id}\` → ${v.judul}`).join("\n");
      try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Playlist untuk dibuat MANUAL: ${tanpaPlaylist.length}\n${baris}\n`, { flag: "a" }); } catch {}
    }
  }
}

main().catch((e) => { console.error("make-videos error:", e.message); process.exit(0); });
