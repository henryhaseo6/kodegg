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
import { createReadStream, existsSync } from "node:fs";

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
  return google.youtube({ version: "v3", auth: o });
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

/** Cari playlist milik channel berdasarkan JUDUL; kalau belum ada, bikin. */
const tidur = (detik) => new Promise((r) => setTimeout(r, detik * 1000));

// Kunci pencocokan playlist = nama GAME saja (buang "— Kode Redeem" & "Codes").
// Cegah duplikat saat format judul bergeser: playlist lama "X — Kode Redeem"
// (batch manual awal) dan baru "X Codes — Kode Redeem" (auto) dianggap sama.
const plKey = (t) => (t || "").toLowerCase().replace(/\s*—\s*kode redeem\s*$/i, "").replace(/\s+codes$/i, "").trim();

/** Cari playlist by nama game; kalau belum ada, bikin. `baru` = true bila baru dibuat.
 *  lang = bahasa metadata playlist ("id" Shorts, "en" Top 50/Roundup).
 *  Bila ketemu playlist lama yg judul/bahasanya beda template sekarang (mis. batch
 *  manual "X — Kode Redeem" tanpa "Codes", atau playlist EN yg ke-set "id") →
 *  otomatis dinormalisasi ke judul+deskripsi+bahasa yang benar. */
async function ensurePlaylist(yt, title, description, lang = "id") {
  const want = plKey(title);
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
    const hit = (r.data.items ?? []).find((p) => plKey(p.snippet?.title) === want);
    if (hit) {
      const cur = hit.snippet ?? {};
      if (cur.title !== title || (cur.defaultLanguage || "") !== lang) {
        try {
          await yt.playlists.update({ part: ["snippet"], requestBody: { id: hit.id, snippet: { title, description, defaultLanguage: lang } } });
          console.log(`  ↳ playlist dinormalisasi: "${cur.title}" → "${title}" [${lang}]`);
        } catch (e) { console.log(`  playlist normalisasi gagal (abaikan): ${e.message}`); }
      }
      return { id: hit.id, baru: false };
    }
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  const made = await yt.playlists.insert({
    part: ["snippet", "status"],
    requestBody: { snippet: { title, description, defaultLanguage: lang }, status: { privacyStatus: "public" } },
  });
  return { id: made.data.id, baru: true };
}

/** Upload 1 video. privacy: 'unlisted'|'public'|'private'. */
export async function uploadVideo({ videoPath, title, description, tags, privacy = "unlisted", thumbnailPath, playlistTitle, playlistDescription, comment, lang = "id" }) {
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
        part: ["snippet", "status"],
        requestBody: {
          snippet: { title, description, tags, categoryId: "20", defaultLanguage: lang, defaultAudioLanguage: lang }, // 20 = Gaming
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

  if (thumbnailPath && existsSync(thumbnailPath)) {
    try { await yt.thumbnails.set({ videoId: id, media: { body: createReadStream(thumbnailPath) } }); } catch (e) { console.log("  thumbnail gagal (abaikan):", e.message); }
  }
  // Playlist per game. Gagal di sini TAK boleh menggagalkan upload yg sudah jadi.
  // `playlistPending` diisi bila gagal (mis. rate-limit playlist YouTube ~10/hari)
  // → orkestrator mengantrikannya utk dicoba lagi di run berikutnya.
  let playlistPending = null;
  if (playlistTitle) {
    const ok = await attachToPlaylist(yt, id, playlistTitle, playlistDescription ?? "", lang);
    if (!ok) playlistPending = { videoId: id, playlistTitle, playlistDescription: playlistDescription ?? "" };
  }
  // Komentar berisi link halaman game — TINGGAL DI-PIN MANUAL di Studio/app,
  // karena API YouTube tak punya endpoint pin. Butuh scope youtube.force-ssl:
  // kalau token lama (upload+youtube saja), akan 403 → jalankan gen-token.mjs lagi.
  if (comment) {
    try {
      await yt.commentThreads.insert({ part: ["snippet"], requestBody: { snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: comment } } } } });
      console.log("  ↳ komentar diposting (pin manual di Studio)");
    } catch (e) {
      const hint = /insufficient|scope|forbidden/i.test(e.message) ? " — token perlu scope youtube.force-ssl, jalankan: node worker/video/gen-token.mjs" : "";
      console.log(`  komentar gagal (abaikan): ${e.message}${hint}`);
    }
  }
  return { id, url: `https://youtu.be/${id}`, playlistPending };
}

/**
 * Tambahkan sebuah video ke playlist game-nya (buat playlist bila belum ada).
 * Return true bila berhasil, false bila gagal (mis. rate-limit playlist YouTube).
 * Dipakai uploadVideo DAN orkestrator utk mengulang antrian playlist tertunda.
 */
export async function attachToPlaylist(ytOrNull, videoId, playlistTitle, playlistDescription = "", lang = "id") {
  const yt = ytOrNull ?? (await client());
  try {
    const { id: pid, baru } = await ensurePlaylist(yt, playlistTitle, playlistDescription, lang);
    // Playlist BARU perlu waktu propagasi sebelum bisa diisi — insert langsung
    // sering ditolak/timeout (kasus nyata: "Zombie Island" kebuat tapi kosong).
    if (baru) await tidur(3);
    const masukkan = () => yt.playlistItems.insert({ part: ["snippet"], requestBody: { snippet: { playlistId: pid, resourceId: { kind: "youtube#video", videoId } } } });
    const sudahMasuk = async () => {
      const isi = await yt.playlistItems.list({ part: ["snippet"], playlistId: pid, maxResults: 50 });
      return (isi.data.items ?? []).some((i) => i.snippet?.resourceId?.videoId === videoId);
    };
    // Playlist YouTube BOLEH memuat video sama berkali-kali — insert TAK gagal
    // meski sudah ada (kasus nyata: retry queue menambah ulang video yg sudah
    // dimasukkan manual → dobel). Jadi cek dulu SEBELUM insert (playlist lama).
    if (!baru && (await sudahMasuk())) { console.log(`  ↳ playlist: ${playlistTitle} (sudah ada)`); return true; }
    for (const jeda of [0, 3, 6]) {
      if (jeda) await tidur(jeda);
      try { await masukkan(); console.log(`  ↳ playlist: ${playlistTitle}${baru ? " (baru)" : ""}`); return true; }
      catch (e) {
        if (await sudahMasuk()) { console.log(`  ↳ playlist: ${playlistTitle} (sudah ada)`); return true; }
        if (jeda === 6) throw e;
      }
    }
    return false;
  } catch (e) {
    const rl = /exhaust|rate|quota/i.test(e.message) ? " (rate-limit playlist — diantrikan utk run berikutnya)" : "";
    console.log(`  playlist gagal (abaikan): ${e.message}${rl}`);
    return false;
  }
}
