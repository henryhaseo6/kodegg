// Upload video ke YouTube via Data API v3 (OAuth refresh token).
// Env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// googleapis di-import LAZY (dynamic) → render/DRY_RUN tak butuh paket ini.
import { createReadStream, existsSync } from "node:fs";

export function ytConfigured() {
  return !!(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN);
}

async function client() {
  const { google } = await import("googleapis");
  const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
  o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });
  return google.youtube({ version: "v3", auth: o });
}

/** Cari playlist milik channel berdasarkan JUDUL; kalau belum ada, bikin. */
const tidur = (detik) => new Promise((r) => setTimeout(r, detik * 1000));

// Kunci pencocokan playlist = nama GAME saja (buang "— Kode Redeem" & "Codes").
// Cegah duplikat saat format judul bergeser: playlist lama "X — Kode Redeem"
// (batch manual awal) dan baru "X Codes — Kode Redeem" (auto) dianggap sama.
const plKey = (t) => (t || "").toLowerCase().replace(/\s*—\s*kode redeem\s*$/i, "").replace(/\s+codes$/i, "").trim();

/** Cari playlist by nama game; kalau belum ada, bikin. `baru` = true bila baru dibuat. */
async function ensurePlaylist(yt, title, description) {
  const want = plKey(title);
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
    const hit = (r.data.items ?? []).find((p) => plKey(p.snippet?.title) === want);
    if (hit) return { id: hit.id, baru: false };
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  const made = await yt.playlists.insert({
    part: ["snippet", "status"],
    requestBody: { snippet: { title, description, defaultLanguage: "id" }, status: { privacyStatus: "public" } },
  });
  return { id: made.data.id, baru: true };
}

/** Upload 1 video. privacy: 'unlisted'|'public'|'private'. */
export async function uploadVideo({ videoPath, title, description, tags, privacy = "unlisted", thumbnailPath, playlistTitle, playlistDescription, comment }) {
  const yt = await client();
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title, description, tags, categoryId: "20", defaultLanguage: "id", defaultAudioLanguage: "id" }, // 20 = Gaming
      // containsSyntheticMedia: narasi video pakai TTS neural (suara sintetis).
      // Visualnya grafis buatan sendiri (bukan orang/tempat nyata), tapi YouTube
      // minta disclosure utk "realistic sounds ... made with AI" → deklarasikan.
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    },
    media: { body: createReadStream(videoPath) },
  }, { maxContentLength: Infinity, maxBodyLength: Infinity });
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
    const ok = await attachToPlaylist(yt, id, playlistTitle, playlistDescription ?? "");
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
export async function attachToPlaylist(ytOrNull, videoId, playlistTitle, playlistDescription = "") {
  const yt = ytOrNull ?? (await client());
  try {
    const { id: pid, baru } = await ensurePlaylist(yt, playlistTitle, playlistDescription);
    // Playlist BARU perlu waktu propagasi sebelum bisa diisi — insert langsung
    // sering ditolak/timeout (kasus nyata: "Zombie Island" kebuat tapi kosong).
    if (baru) await tidur(3);
    const masukkan = () => yt.playlistItems.insert({ part: ["snippet"], requestBody: { snippet: { playlistId: pid, resourceId: { kind: "youtube#video", videoId } } } });
    const sudahMasuk = async () => {
      const isi = await yt.playlistItems.list({ part: ["snippet"], playlistId: pid, maxResults: 50 });
      return (isi.data.items ?? []).some((i) => i.snippet?.resourceId?.videoId === videoId);
    };
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
