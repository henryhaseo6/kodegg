// Peta gameId → URL playlist YouTube, dari worker/data/yt-playlists.json (di-sync
// worker, di-commit — build Cloudflare tak punya kredensial YouTube). Dipakai
// halaman game untuk menautkan playlist kode-nya di YouTube. Tanpa file/entri →
// tak ada tautan (fitur opsional, tak menggagalkan build).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PATH = resolve(process.cwd(), "../worker/data/yt-playlists.json");

let cache;
async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(PATH, "utf8"));
  } catch {
    cache = {};
  }
  return cache;
}

/** URL playlist YouTube untuk sebuah gameId, atau null bila belum ada. */
export async function ytPlaylistUrl(gameId) {
  const map = await load();
  const pid = map[gameId];
  return pid ? `https://www.youtube.com/playlist?list=${pid}` : null;
}
