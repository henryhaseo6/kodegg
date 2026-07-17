// Feed GABUNGAN: event + berita/pengumuman jadi satu, diurut dari postingan
// TERBARU. Aturan pemilahan (dari worker): item BER-masa-waktu (start/end) =
// event; tanpa masa waktu = berita. AKTIF (event berlangsung + berita ≤30 hari)
// vs ARSIP (event berakhir + berita >30 hari) — arsip tak dihapus (≤180 hari).

import { loadEvents } from "./events.mjs";
import { loadNews } from "./news.mjs";

const ms = (s) => (s ? Date.parse(s) || 0 : 0);
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

const asEvent = (e) => ({
  kind: "event",
  ...e,
  sortMs: ms(e.postedAt) || ms(e.startsAt),
  search: `${e.title} ${e.gameName}`.toLowerCase(),
});
const asNews = (a) => ({
  kind: "news",
  ...a,
  desc: a.excerpt ?? "",
  sortMs: a.publishedMs || ms(a.publishedAt),
  search: a.search ?? `${a.title} ${a.gameName}`.toLowerCase(),
});

// Dedup lintas event↔berita per (game + judul), EVENT menang, lalu urut terbaru.
function merge(events, news) {
  const byKey = new Map();
  for (const it of [...events, ...news]) {
    const key = `${it.game}:${norm(it.title)}`;
    if (!byKey.has(key)) byKey.set(key, it);
  }
  return [...byKey.values()].sort((a, b) => b.sortMs - a.sortMs);
}

export async function loadFeed(lang = "en") {
  const [ev, nw] = await Promise.all([loadEvents(lang), loadNews(lang)]);

  const items = merge((ev.events ?? []).map(asEvent), (nw.articles ?? []).map(asNews));
  const archive = merge((ev.archive ?? []).map(asEvent), (nw.archive ?? []).map(asNews));

  // Daftar game untuk filter (dari aktif + arsip).
  const seen = new Map();
  for (const it of [...items, ...archive]) if (it.game && !seen.has(it.game)) seen.set(it.game, it.gameName);

  return {
    updatedAt: ev.updatedAt || nw.updatedAt || null,
    items,
    archive,
    games: [...seen.entries()].map(([id, name]) => ({ id, name })),
    counts: {
      total: items.length,
      events: items.filter((it) => it.kind === "event").length,
      news: items.filter((it) => it.kind === "news").length,
      archived: archive.length,
    },
  };
}
