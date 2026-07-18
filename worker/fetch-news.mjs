// KodeGG — worker BERITA → data/news.json (untuk halaman Berita).
//
// Sumber: HoYoLAB — post RESMI HoYoverse (bbs-api-os). PocketTactics DIHAPUS:
// berita & event kini diprioritaskan dari sumber RESMI. Cakupan otomatis semua
// game HoYo (gi/hsr/zzz/hi3/tot). Post yang sebenarnya EVENT (tab Events /
// ber-"Event Period") tidak masuk sini — ditangani fetch-events.mjs.
//
// Kita AGREGATOR: simpan judul + cuplikan + tautan ke post asli, atribusi
// "HoYoLAB" wajib tampil. Tanggal = tanggal POST asli (bukan waktu tarik).

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES } from "./src/games.mjs";
import { fetchHoyolabNews } from "./src/sources/hoyolab.mjs";
import { fetchWuwaNews } from "./src/sources/wuwanews.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/news.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const CUTOFF = 30 * 86400000; // ≤30 hari = aktif; lebih lama → arsip
const ARCHIVE_CAP = 200; // maks item arsip disimpan (terbaru menang)
const ARCHIVE_MAX_AGE = 180 * 86400000; // arsip disimpan hingga 180 hari

async function readPrevious(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { articles: [], archive: [] };
  }
}

async function main() {
  const now = new Date().toISOString();
  const nowMs = Date.now();

  const log = (m) => console.log(`  ${m}`);
  const [hoyo, wuwa] = await Promise.all([
    fetchHoyolabNews({ games: GAMES, userAgent: UA, log }).catch((err) => {
      console.error(`[hoyolab] berita: ${err.message}`);
      return [];
    }),
    fetchWuwaNews({ games: GAMES, userAgent: UA, log }).catch((err) => {
      console.error(`[wuwa] berita: ${err.message}`);
      return [];
    }),
  ]);
  const all = [...hoyo, ...wuwa];
  all.sort((a, b) => Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0));

  const ageOf = (a) => nowMs - Date.parse(a.publishedAt ?? 0);
  const active = all.filter((a) => a.publishedAt && ageOf(a) <= CUTOFF);

  // Arsip = berita >30 hari, DIGABUNG dengan arsip run sebelumnya (tak dihapus
  // sampai lewat 180 hari). Sumber hanya menyediakan ~45 hari, jadi merge inilah
  // yang membuat berita lama tetap tersimpan meski sudah lepas dari sumber.
  const prev = await readPrevious(OUT);
  const archMap = new Map();
  for (const a of prev.archive ?? []) archMap.set(a.url, a);
  for (const a of all) if (a.publishedAt && ageOf(a) > CUTOFF && !archMap.has(a.url)) archMap.set(a.url, { ...a, archivedAt: now });
  const archive = [...archMap.values()]
    .filter((a) => a.publishedAt && ageOf(a) <= ARCHIVE_MAX_AGE)
    .sort((a, b) => Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0))
    .slice(0, ARCHIVE_CAP);

  if (active.length === 0 && archive.length === 0) {
    console.error("✗ 0 berita — news.json dibiarkan utuh");
    process.exit(1);
  }

  const payload = { updatedAt: now, counts: { active: active.length, archived: archive.length }, articles: active, archive };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));
  console.log(`✓ data/news.json — ${active.length} berita + ${archive.length} arsip`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
