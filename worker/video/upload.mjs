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
async function ensurePlaylist(yt, title, description) {
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
    const hit = (r.data.items ?? []).find((p) => p.snippet?.title === title);
    if (hit) return hit.id;
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  const made = await yt.playlists.insert({
    part: ["snippet", "status"],
    requestBody: { snippet: { title, description, defaultLanguage: "id" }, status: { privacyStatus: "public" } },
  });
  return made.data.id;
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
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try { await yt.thumbnails.set({ videoId: id, media: { body: createReadStream(thumbnailPath) } }); } catch (e) { console.log("  thumbnail gagal (abaikan):", e.message); }
  }
  // Playlist per game. Gagal di sini TAK boleh menggagalkan upload yg sudah jadi.
  // Biaya kuota kecil: list 1 unit, insert playlist/item 50 unit (upload = 1600).
  if (playlistTitle) {
    try {
      const pid = await ensurePlaylist(yt, playlistTitle, playlistDescription ?? "");
      await yt.playlistItems.insert({ part: ["snippet"], requestBody: { snippet: { playlistId: pid, resourceId: { kind: "youtube#video", videoId: id } } } });
      console.log(`  ↳ playlist: ${playlistTitle}`);
    } catch (e) { console.log("  playlist gagal (abaikan):", e.message); }
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
  return { id, url: `https://youtu.be/${id}` };
}
