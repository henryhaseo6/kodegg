// Pembaca cache news.json untuk halaman Berita (SSG).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CACHE = process.env.KODEGG_NEWS ?? resolve(process.cwd(), "../worker/data/news.json");

// Ambil teks sesuai bahasa (field bisa {en,id} atau string lama).
export const pick = (v, lang) => (v && typeof v === "object" ? v[lang] ?? v.en ?? "" : v ?? "");
// Tautan HoYoLAB versi bahasa halaman (id-id / en-us).
export const withLang = (url, lang) =>
  url ? `${url}${url.includes("?") ? "&" : "?"}lang=${lang === "id" ? "id-id" : "en-us"}` : url;

export async function loadNews(lang = "en") {
  let raw;
  try {
    raw = JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return { updatedAt: null, articles: [], archive: [], games: [] };
  }

  const shape = (a) => {
    const title = pick(a.title, lang);
    return {
      ...a,
      title,
      excerpt: pick(a.excerpt, lang),
      url: withLang(a.url, lang),
      publishedMs: a.publishedAt ? Date.parse(a.publishedAt) : 0,
      search: `${title} ${a.gameName}`.toLowerCase(),
    };
  };
  const articles = (raw.articles ?? []).map(shape);
  const archive = (raw.archive ?? []).map(shape);

  // Daftar game yang punya berita (untuk dropdown filter) — aktif + arsip.
  const seen = new Map();
  for (const a of [...articles, ...archive]) if (a.game && !seen.has(a.game)) seen.set(a.game, a.gameName);
  const games = [...seen.entries()].map(([id, name]) => ({ id, name }));

  return { updatedAt: raw.updatedAt ?? null, articles, archive, games };
}

/** Tanggal POST asli, format absolut ("16 Jul 2026"). Dipakai kartu berita.
 * Sengaja absolut (bukan "hari ini/kemarin"): menampilkan tanggal publikasi
 * sebenarnya, urutan jadi jelas, dan tak basi antar-build (SSG). */
export function newsDate(ms, lang) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

// Alias lama agar pemanggil tidak perlu diubah semua.
export const relDate = newsDate;
