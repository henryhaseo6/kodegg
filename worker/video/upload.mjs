// Upload video ke YouTube via Data API v3 (OAuth refresh token).
// Env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (project utama).
//
// MULTI-PROJECT (opsional — nambah kuota saat game makin banyak): set juga
//   YT_CLIENT_ID_2 / YT_CLIENT_SECRET_2 / YT_REFRESH_TOKEN_2 (dst _3.._9).
//   Tiap Google Cloud project punya kuota query 10rb unit/hari SENDIRI. Saat
//   project aktif kena quotaExceeded (atau invalid_grant), upload auto-ROTASI
//   ke project berikutnya — semua ke channel YOUTUBE YANG SAMA. Batas count
//   channel (~100 upload/hari) tetap berlaku, jadi naikkan VIDEO_MAX_PER_DAY
//   seperlunya. 1 project = perilaku lama (tak ada rotasi).
// googleapis di-import LAZY (dynamic) → render/DRY_RUN tak butuh paket ini.
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pantau, sisaPlaylist, PLAYLIST_HARIAN } from "./yt-kuota.mjs";

// Kumpulkan set kredensial: project 1 (tanpa suffix) + _2.._9 bila ada.
function credentialSets() {
  const S = [], E = process.env;
  const add = (id, sec, rt, label) => { if (id && sec && rt) S.push({ clientId: id, clientSecret: sec, refreshToken: rt, label }); };
  add(E.YT_CLIENT_ID, E.YT_CLIENT_SECRET, E.YT_REFRESH_TOKEN, "P1");
  for (let i = 2; i <= 9; i++) add(E[`YT_CLIENT_ID_${i}`], E[`YT_CLIENT_SECRET_${i}`], E[`YT_REFRESH_TOKEN_${i}`], `P${i}`);
  return S;
}
let _sets = null, _idx = 0;
const sets = () => (_sets ??= credentialSets());

export function ytConfigured() { return sets().length > 0; }
export const ytProjectCount = () => sets().length;

async function activeClient() {
  const { google } = await import("googleapis");
  const s = sets()[Math.min(_idx, sets().length - 1)];
  const o = new google.auth.OAuth2(s.clientId, s.clientSecret);
  o.setCredentials({ refresh_token: s.refreshToken });
  // pantau(): tiap panggilan tercatat ke data/kuota-yt.json. Dibungkus DI SINI,
  // di satu-satunya tempat klien dibuat, supaya pemanggil baru ikut tercatat
  // tanpa harus ingat menambahkannya.
  return pantau(google.youtube({ version: "v3", auth: o }));
}
const client = activeClient; // alias — playlist & komentar pakai project aktif
const activeLabel = () => sets()[Math.min(_idx, sets().length - 1)]?.label ?? "P?";
// Naikkan pointer ke project berikutnya. false bila sudah project terakhir.
function rotate() { if (_idx + 1 < sets().length) { _idx++; return true; } return false; }
// Klasifikasi error insert: "quota" (kuota harian habis) / "token" (refresh
// token mati) / null (error lain → JANGAN rotasi, lempar apa adanya).
function quotaOrAuth(e) {
  const s = `${e?.message || ""} ${JSON.stringify(e?.errors ?? e?.response?.data?.error ?? "")}`;
  if (/invalid_grant/i.test(s)) return "token";
  if (/quotaExceeded|dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded/i.test(s)) return "quota";
  return null;
}

// Penanda "jatah playlist harian sudah habis", bertahan antar-run lewat berkas
// di worker/data (folder yang di-commit workflow). Kuncinya hari PACIFIC karena
// itulah siklus reset kuota YouTube.
// KODEGG_DATA: bisa diarahkan ke direktori lain untuk MENGUJI tanpa mengotori
// data asli — sama seperti audit-data.mjs & yt-kuota.mjs.
const DATA = process.env.KODEGG_DATA || resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const PL_LIMIT = resolve(DATA, "playlist-limit.json");
const hariPT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function jatahPlaylistHabis() {
  try {
    if (JSON.parse(readFileSync(PL_LIMIT, "utf8"))?.hari !== hariPT()) return false;
    // PENANDA BASI SEMBUH SENDIRI. Kalau catatan panggilan kita menunjukkan jatah
    // hari ini masih ada, penanda itu pasti dipasang oleh penolakan sesaat —
    // bukan oleh plafon harian. Tanpa jalan pulih ini, satu penolakan di menit
    // ke-59 mengunci pembuatan playlist selama 23 jam berikutnya (14 Agu 2026).
    if (sisaPlaylist() > 0) return false;
    return true;
  } catch { return false; }
}
function tandaiJatahHabis() {
  try { writeFileSync(PL_LIMIT, JSON.stringify({ hari: hariPT(), pada: new Date().toISOString() }, null, 1) + "\n"); } catch { /* jangan gagalkan upload */ }
}

/** Cari playlist milik channel berdasarkan JUDUL; kalau belum ada, bikin. */
const tidur = (detik) => new Promise((r) => setTimeout(r, detik * 1000));

// Kunci pencocokan playlist = nama GAME saja (buang "— Kode Redeem" & "Codes").
// Cegah duplikat saat format judul bergeser: playlist lama "X — Kode Redeem"
// (batch manual awal) dan baru "X Codes — Kode Redeem" (auto) dianggap sama.
// TANDA BACA IKUT DINORMALKAN — samakan dengan `normalize` di
// fetch-yt-playlists.mjs, yang sudah begitu sejak awal.
//
// Dua komponen ini mencocokkan hal yang sama dengan aturan berbeda, dan itu
// yang membuat playlist kembar: pemetaan game→playlist menganggap "Death Order:
// Simon Says" sama dengan "Death Order Simon Says", sedangkan pembuatan
// playlist di sini menganggapnya berbeda. Saat sumber mengubah cara menulis
// judul game (titik duanya hilang antara 29–30 Jul 2026), ensurePlaylist tak
// menemukan yang lama lalu membuat yang kedua — dan videonya terbelah 2 lawan 4.
//
// Nama game di Roblox memang berubah-ubah tanda bacanya, dan katalog kita
// mengikuti judul halaman sumber. Jadi pencocokan playlist tak boleh bergantung
// pada tanda baca sama sekali.
// Daftar playlist yang terbukti bersortir OTOMATIS (menolak `position`).
// Disimpan di worker/data/ yang ikut ter-commit workflow, jadi pengetahuannya
// bertahan antar-run — runner CI sekali pakai, tanpa ini tiap run belajar ulang
// dengan cara yang sama mahalnya.
const FILE_SORTIR = resolve(DATA, "playlist-tersortir.json");
const tersortirOtomatis = new Set(((() => {
  try { return JSON.parse(readFileSync(FILE_SORTIR, "utf8")); } catch { return []; }
})()));
function catatTersortir(pid) {
  if (tersortirOtomatis.has(pid)) return;
  tersortirOtomatis.add(pid);
  try { writeFileSync(FILE_SORTIR, JSON.stringify([...tersortirOtomatis], null, 1) + "\n"); }
  catch { /* CI read-only? jangan gagalkan upload */ }
}

export const plKey = (t) => (t || "")
  .toLowerCase()
  .replace(/\s*—\s*kode redeem\s*$/i, "")
  .replace(/\s+codes$/i, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// PETA JUDUL→ID PLAYLIST (data/playlist-id.json, ditulis fetch-yt-playlists.mjs
// yang memang sudah menyisir seluruh playlist tiap jam — jadi peta ini gratis).
//
// Tanpanya, ensurePlaylist menyisir SELURUH playlist channel tiap kali dipanggil:
// 424 playlist ÷ 50 per halaman = 9 panggilan = 9 unit, untuk mencari sesuatu
// yang ID-nya sudah kita simpan. Di 57 video/hari itu ~500 unit (5% kuota
// harian) dibayar berulang untuk jawaban yang sama. Dengan peta: 1 unit.
//
// Tetap DIVERIFIKASI ke API (playlists.list by id), bukan dipercaya buta —
// playlist bisa dihapus manual di Studio, dan ID basi akan membuat video masuk
// ke playlist yang tak ada. Kalau verifikasi kosong → jatuh ke penyisiran penuh.
const FILE_PLID = resolve(DATA, "playlist-id.json");
const petaPlaylist = (() => {
  try { return JSON.parse(readFileSync(FILE_PLID, "utf8")); } catch { return {}; }
})();
function catatPlaylistId(kunci, pid) {
  if (!kunci || !pid || petaPlaylist[kunci] === pid) return;
  petaPlaylist[kunci] = pid;
  try { writeFileSync(FILE_PLID, JSON.stringify(petaPlaylist, null, 1) + "\n"); }
  catch { /* CI read-only? jangan gagalkan upload */ }
}

/** Cari playlist by nama game; kalau belum ada, bikin. `baru` = true bila baru dibuat.
 *  lang = bahasa metadata playlist ("id" Shorts, "en" Top 50/Roundup).
 *  Bila ketemu playlist lama yg judul/bahasanya beda template sekarang (mis. batch
 *  manual "X — Kode Redeem" tanpa "Codes", atau playlist EN yg ke-set "id") →
 *  otomatis dinormalisasi ke judul+deskripsi+bahasa yang benar. */
async function ensurePlaylist(yt, title, description, lang = "id", tanpaBuat = false) {
  const want = plKey(title);
  // Jalur cepat: ID sudah dikenal → 1 unit untuk memastikan playlistnya masih
  // ada + mengambil snippet-nya (dibutuhkan pemeriksaan normalisasi di bawah).
  const tersimpan = petaPlaylist[want];
  if (tersimpan) {
    try {
      const r = await yt.playlists.list({ part: ["snippet"], id: [tersimpan] });
      const p = r.data.items?.[0];
      if (p) return await pakaiPlaylist(yt, p, title, description, lang, want);
      console.log(`  ↳ playlist "${title}" tak ada lagi di channel (ID tersimpan basi) — menyisir ulang`);
    } catch (e) { console.log(`  ↳ cek playlist lewat ID gagal (${e.message}) — menyisir ulang`); }
  }
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
    const hit = (r.data.items ?? []).find((p) => plKey(p.snippet?.title) === want);
    if (hit) return await pakaiPlaylist(yt, hit, title, description, lang, want);
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  // tanpaBuat: playlist belum ada & kita sedang menghemat jatah pembuatan
  // playlist baru (~10/hari). Memasukkan video ke playlist yang SUDAH ada tak
  // memakai jatah itu, jadi hanya pembuatannya yang ditahan — bukan seluruh
  // proses playlist.
  if (tanpaBuat) return null;
  // REM JATAH HABIS. playlists.insert menelan 50 unit kuota WALAU DITOLAK, dan
  // jatah pembuatan playlist baru (~10/hari) reset harian — jadi begitu ditolak
  // sekali, semua percobaan berikutnya hari itu pasti gagal DAN tetap membakar
  // kuota. Terukur 4 Agu 2026: 27 upload memakai 6.865 unit padahal tarif normal
  // ~209/video (≈5.636); selisih ~1.229 unit cocok dengan percobaan-percobaan
  // yang pasti gagal (satu run bahkan mencoba 8 kali = 400 unit terbuang).
  //
  // Ditandai per HARI PACIFIC, sama dengan siklus reset kuota YouTube.
  if (jatahPlaylistHabis()) { console.log("  ↳ jatah playlist harian sudah habis — pembuatan ditahan (hemat kuota)"); return null; }
  const made = await yt.playlists.insert({
    // localizations disertakan sejak awal — alasan sama dg cabang update di atas:
    // defaultLanguage sendirian tak cukup untuk membuat bahasa tersimpan.
    part: ["snippet", "status", "localizations"],
    requestBody: {
      snippet: { title, description, defaultLanguage: lang },
      status: { privacyStatus: "public" },
      localizations: { [lang]: { title, description } },
    },
  });
  catatPlaylistId(want, made.data.id);
  return { id: made.data.id, baru: true };
}

/** Playlist ketemu (lewat peta ID atau penyisiran): normalisasi judul/bahasa
 *  bila perlu, ingat ID-nya, pulangkan. */
async function pakaiPlaylist(yt, hit, title, description, lang, want) {
  catatPlaylistId(want, hit.id);
  const cur = hit.snippet ?? {};
  if (cur.title !== title || (cur.defaultLanguage || "") !== lang || (description && (cur.description || "") !== description)) {
    try {
      // localizations WAJIB ikut dikirim. playlists.update MENGGANTI snippet,
      // dan `defaultLanguage` sendirian tak membuat YouTube menyimpan bahasa —
      // yang dipakai Studio ("Title and description language") adalah entri
      // localizations. Tanpa ini: setelan bahasa yang di-set manual di Studio
      // TERHAPUS tiap ada video baru masuk playlist, lalu kosongnya memicu
      // update ini lagi di upload berikutnya — loop penulisan sia-sia yang
      // membakar 50 unit kuota per video. (Dilaporkan user 1 Agt 2026.)
      await yt.playlists.update({
        part: ["snippet", "localizations"],
        requestBody: { id: hit.id, snippet: { title, description, defaultLanguage: lang }, localizations: { [lang]: { title, description } } },
      });
      console.log(`  ↳ playlist dinormalisasi: "${cur.title}" → "${title}" [${lang}]`);
    } catch (e) { console.log(`  playlist normalisasi gagal (abaikan): ${e.message}`); }
  }
  return { id: hit.id, baru: false };
}

/** Upload 1 video. privacy: 'unlisted'|'public'|'private'. */
export async function uploadVideo({ videoPath, title, description, tags, privacy = "unlisted", thumbnailPath, playlistTitle, playlistDescription, comment, lang = "id", localizations, tanpaBuatPlaylist = false }) {
  // lang = bahasa metadata + audio. Short = "id" (VO Indonesia + teks bilingual);
  // video long (Top 50/roundup) = "en" (full English, cuma musik/SFX tanpa VO).
  // Insert video — dgn ROTASI multi-project: kalau project aktif kena quota
  // habis / token mati & masih ada project lain, pindah project & ulang (stream
  // dibuat ulang tiap percobaan). Semua project upload ke channel yg sama.
  let yt, res;
  for (;;) {
    yt = await activeClient();
    try {
      res = await yt.videos.insert({
        // part WAJIB memuat "localizations" bila terjemahan disertakan — kalau
        // tidak, YouTube mengabaikannya diam-diam (tak ada error).
        part: localizations && Object.keys(localizations).length ? ["snippet", "status", "localizations"] : ["snippet", "status"],
        requestBody: {
          // localizations = terjemahan judul/deskripsi (mis. `id` utk video long
          // berbahasa Inggris — YouTube menolak menerjemahkannya otomatis).
          snippet: { title, description, tags, categoryId: "20", defaultLanguage: lang, defaultAudioLanguage: lang }, // 20 = Gaming
          ...(localizations && Object.keys(localizations).length ? { localizations } : {}),
          // containsSyntheticMedia: narasi video pakai TTS neural (suara sintetis).
          // Visualnya grafis buatan sendiri (bukan orang/tempat nyata), tapi YouTube
          // minta disclosure utk "realistic sounds ... made with AI" → deklarasikan.
          status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
        },
        media: { body: createReadStream(videoPath) },
      }, { maxContentLength: Infinity, maxBodyLength: Infinity });
      break;
    } catch (e) {
      const jenis = quotaOrAuth(e);
      if (jenis && sets().length > 1) {
        console.log(`  ⚠ project ${activeLabel()} ${jenis === "token" ? "token mati (perbaiki refresh token-nya)" : "kuota habis"} → rotasi project berikutnya`);
        if (rotate()) continue;
        console.log(`  ✗ semua ${sets().length} project habis kuota/mati hari ini`);
      }
      throw e; // 1 project, atau semua habis, atau error non-kuota → lempar
    }
  }
  const id = res.data.id;
  // YouTube kadang MENIMPA privacy yang kita minta (mis. channel muda yang
  // melewati batas upload harian → dipaksa unlisted). Diamnya berbahaya: video
  // terlihat "sukses" padahal tak tayang publik. Cek balik, biaya 1 unit.
  try {
    const cek = await yt.videos.list({ part: ["status"], id: [id] });
    const nyata = cek.data.items?.[0]?.status?.privacyStatus;
    if (nyata && nyata !== privacy) {
      console.log(`  ⚠ privacy diminta "${privacy}" tapi YouTube menyetel "${nyata}" — kemungkinan batas upload harian channel.`);
      if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Privacy ditimpa YouTube::${id} jadi "${nyata}" (diminta "${privacy}")`);
    }
  } catch { /* pengecekan gagal ≠ upload gagal */ }

  let thumbPending = null;
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try { await yt.thumbnails.set({ videoId: id, media: { body: createReadStream(thumbnailPath) } }); }
    catch (e) {
      // JANGAN diam-diam diabaikan: video tanpa thumbnail kustom memakai potongan
      // frame acak, dan itu hal pertama yang dilihat orang di hasil pencarian.
      // Dikembalikan sbg `thumbPending` supaya pemanggil bisa mengantrikannya
      // (thumbnail roundup/top50 bisa dirender ulang dari tanggalnya).
      console.log("  thumbnail gagal:", e.message, "— dikembalikan utk diantrikan");
      thumbPending = id;
    }
  }
  // Playlist per game. Gagal di sini TAK boleh menggagalkan upload yg sudah jadi.
  // `playlistPending` diisi bila gagal (mis. rate-limit playlist YouTube ~10/hari)
  // → orkestrator mengantrikannya utk dicoba lagi di run berikutnya.
  let playlistPending = null;
  let pidPlaylist = null;
  if (playlistTitle) {
    // Sekarang memulangkan ID playlist-nya, bukan sekadar true. Dibutuhkan
    // komentar di bawah: ID itu baru diketahui DI SINI (playlist bisa saja baru
    // dibuat detik ini), sehingga metadata.mjs — yang merakit komentar jauh
    // sebelum upload — mustahil menyisipkannya sendiri.
    const ok = await attachToPlaylist(yt, id, playlistTitle, playlistDescription ?? "", lang, tanpaBuatPlaylist);
    if (!ok) playlistPending = { videoId: id, playlistTitle, playlistDescription: playlistDescription ?? "" };
    else if (typeof ok === "string") pidPlaylist = ok;
  }
  // Komentar berisi link halaman game — TINGGAL DI-PIN MANUAL di Studio/app,
  // karena API YouTube tak punya endpoint pin. Butuh scope youtube.force-ssl:
  // kalau token lama (upload+youtube saja), akan 403 → jalankan gen-token.mjs lagi.
  if (comment) {
    // Baris playlist DITAMBAHKAN DI SINI, bukan di metadata.mjs, karena ID-nya
    // baru pasti setelah playlist benar-benar terpasang. Kalau playlist gagal
    // (kena rate-limit, atau pembuatannya ditahan demi kuota), barisnya tak
    // ditulis sama sekali — lebih baik komentar tanpa tautan playlist daripada
    // tautan ke playlist yang belum ada.
    //
    // Gunanya baru terasa belakangan: di hari terbit, video terbaru game ini
    // ya video ini sendiri. Sebulan kemudian, orang yang mendarat di sini lewat
    // pencarian bisa langsung melompat ke yang terbaru — dan upload.mjs
    // menyisipkan tiap video di position 0, jadi yang teratas selalu terbaru.
    const teksKomentar = pidPlaylist
      ? `${comment}\n🎬 Video terbaru game ini (paling atas di playlist):\nhttps://youtube.com/playlist?list=${pidPlaylist}`
      : comment;
    try {
      await yt.commentThreads.insert({ part: ["snippet"], requestBody: { snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: teksKomentar } } } } });
      console.log("  ↳ komentar diposting (pin manual di Studio)");
    } catch (e) {
      const hint = /insufficient|scope|forbidden/i.test(e.message) ? " — token perlu scope youtube.force-ssl, jalankan: node worker/video/gen-token.mjs" : "";
      console.log(`  komentar gagal (abaikan): ${e.message}${hint}`);
    }
  }
  return { id, url: `https://youtu.be/${id}`, playlistPending, thumbPending };
}

/**
 * Tambahkan sebuah video ke playlist game-nya (buat playlist bila belum ada).
 * Return true bila berhasil, false bila gagal (mis. rate-limit playlist YouTube).
 * Dipakai uploadVideo DAN orkestrator utk mengulang antrian playlist tertunda.
 */
// Pasang thumbnail ke video yang SUDAH ada. Dipakai jalur perbaikan: saat kuota
// habis, thumbnail gagal dipasang padahal videonya sudah tayang — dan berbeda
// dari playlist, kegagalan itu dulu cuma "diabaikan" tanpa antrean, jadi tak
// pernah pulih sendiri. Thumbnail adalah hal PERTAMA yang dilihat orang di hasil
// pencarian, jadi kehilangannya lebih mahal daripada kelihatannya.
export async function setThumbnail(videoId, thumbnailPath) {
  if (!existsSync(thumbnailPath)) throw new Error(`thumbnail tak ada: ${thumbnailPath}`);
  const yt = await client();
  await yt.thumbnails.set({ videoId, media: { body: createReadStream(thumbnailPath) } });
}

export async function attachToPlaylist(ytOrNull, videoId, playlistTitle, playlistDescription = "", lang = "id", tanpaBuat = false) {
  const yt = ytOrNull ?? (await client());
  try {
    const hasil = await ensurePlaylist(yt, playlistTitle, playlistDescription, lang, tanpaBuat);
    if (!hasil) { console.log(`  ↳ playlist "${playlistTitle}" belum ada — pembuatan ditahan (hemat kuota)`); return false; }
    const { id: pid, baru } = hasil;
    // Playlist BARU perlu waktu propagasi sebelum bisa diisi — insert langsung
    // sering ditolak/timeout (kasus nyata: "Zombie Island"/"Blox Fruits" kebuat
    // tapi kosong). Window utk playlist baru diperpanjang (dulu 3s+9s → kurang).
    if (baru) await tidur(8);
    // position 0 = SELALU di paling atas playlist. "Default video order" adalah
    // setelan khusus Studio yang TAK ada di Data API (resource playlists cuma
    // punya snippet/status/contentDetails/player/localizations), jadi urutan tak
    // bisa diatur dari kode. Menyisipkan di posisi 0 memberi hasil yang sama
    // seperti "Date published (newest)" tanpa perlu menyentuh 177 playlist satu
    // per satu. Pada playlist yang sudah di-set urut tanggal, posisi ini
    // diabaikan — jadi aman untuk keduanya.
    // `position: 0` cuma SAH di playlist bersortir manual. Playlist yang di-set
    // "Date published (newest)" MENOLAK-nya dengan error "Playlist should use
    // manual sorting to support position" — dan videonya gagal masuk sama sekali
    // (kejadian 2 Agu 2026: Reverse: 1999). Dugaan awal bahwa posisi "diabaikan"
    // pada playlist tersortir itu KELIRU. Jadi: coba dengan posisi dulu (biar
    // video baru di atas), kalau ditolak karena sortir → ulangi tanpa posisi.
    // Di playlist tersortir, urutan tampilannya memang sudah diatur sortirnya.
    // PLAYLIST TERSORTIR OTOMATIS DIINGAT, tak dicoba-gagal tiap kali.
    //
    // Percobaan dengan `position: 0` pada playlist bersortir otomatis SELALU
    // ditolak, lalu diulang tanpa posisi — dua playlistItems.insert, 100 unit,
    // untuk satu video. Sortirnya sifat playlist yang tak berubah-ubah, jadi
    // kegagalan pertama itu bisa diprediksi dan tak perlu diulang tiap upload.
    //
    // Terukur 11 Agu 2026 dari tab Metrics konsol: PlaylistItemService.Insert
    // punya 26,92% error — artinya sekitar sepertiga video membayar dobel.
    // Sortir playlist TIDAK bisa dibaca lewat Data API (resource playlists tak
    // memuatnya), jadi satu-satunya cara mengetahuinya memang dengan mencoba —
    // tapi cukup SEKALI per playlist, bukan sekali per video.
    const insertPl = (snippet) => yt.playlistItems.insert({ part: ["snippet"], requestBody: { snippet } });
    const dasar = { playlistId: pid, resourceId: { kind: "youtube#video", videoId } };
    const masukkan = async () => {
      if (tersortirOtomatis.has(pid)) return insertPl(dasar);
      try { return await insertPl({ ...dasar, position: 0 }); }
      catch (e) {
        if (!/manual sorting/i.test(e.message ?? "")) throw e;
        console.log("  ↳ playlist tersortir otomatis → masuk tanpa posisi (dicatat)");
        catatTersortir(pid);
        return insertPl(dasar);
      }
    };
    const sudahMasuk = async () => {
      const isi = await yt.playlistItems.list({ part: ["snippet"], playlistId: pid, maxResults: 50 });
      return (isi.data.items ?? []).some((i) => i.snippet?.resourceId?.videoId === videoId);
    };
    // Playlist YouTube BOLEH memuat video sama berkali-kali — insert TAK gagal
    // meski sudah ada (kasus nyata: retry queue menambah ulang video yg sudah
    // dimasukkan manual → dobel). Jadi cek dulu SEBELUM insert (playlist lama).
    if (!baru && (await sudahMasuk())) { console.log(`  ↳ playlist: ${playlistTitle} (sudah ada)`); return pid; }
    const jedas = baru ? [0, 5, 10, 20] : [0, 3, 6]; // baru: ~8+35s window (propagasi); lama: cepat
    for (let i = 0; i < jedas.length; i++) {
      if (jedas[i]) await tidur(jedas[i]);
      try { await masukkan(); console.log(`  ↳ playlist: ${playlistTitle}${baru ? " (baru)" : ""}`); return pid; }
      catch (e) {
        if (await sudahMasuk()) { console.log(`  ↳ playlist: ${playlistTitle} (sudah ada)`); return pid; }
        if (i === jedas.length - 1) throw e;
      }
    }
    return false;
  } catch (e) {
    const kena = /exhaust|rate|quota/i.test(e.message);
    // SATU PENOLAKAN ≠ JATAH HARIAN HABIS.
    //
    // Pola `/exhaust|rate|quota/` ikut menangkap `rateLimitExceeded` dan
    // `userRateLimitExceeded` — itu batas SESAAT (terlalu cepat menembak), bukan
    // plafon playlist harian. Menandainya sebagai "habis" mengunci pembuatan
    // playlist untuk SISA HARI PT itu.
    //
    // Terjadi 14 Agu 2026 dan mahal: penanda ditulis 00:59 PT — 59 menit setelah
    // hari PT dimulai — lalu memblokir sisanya ~23 jam. Buku kuota hari itu
    // mencatat playlists.insert = 1 dari ~10. Empat video terbit tanpa playlist
    // padahal jatahnya nyaris utuh.
    //
    // Sekarang penandanya baru dipasang kalau catatan kita sendiri memang
    // menunjukkan jatahnya sudah terpakai. Kalau belum, penolakan diperlakukan
    // sebagai gangguan sesaat: videonya masuk antrean pending-playlists.json dan
    // dicoba lagi di run berikutnya — jalur yang memang sudah ada.
    const sisa = sisaPlaylist();
    const benarHabis = kena && sisa <= 0;
    if (benarHabis) tandaiJatahHabis();
    console.log(`  playlist gagal (abaikan): ${e.message}${benarHabis ? " (jatah playlist harian habis — ditahan sampai reset)" : kena ? ` (penolakan sesaat; jatah masih ${sisa}/${PLAYLIST_HARIAN} — akan dicoba lagi run berikutnya)` : ""}`);
    return false;
  }
}
