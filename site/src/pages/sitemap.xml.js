// Sitemap dinamis — semua halaman × 2 bahasa + per-game, dengan slug per bahasa.
import { LANGS } from "../lib/i18n.mjs";
import { loadCatalog } from "../lib/catalog.mjs";
import { PAGE_KEYS, route, langPaths } from "../lib/routes.mjs";

const SITE = "https://kodegg.com";

export async function GET() {
  const catalog = await loadCatalog();
  const gameIds = catalog.games.filter((g) => g.hasCodes).map((g) => g.id);

  // Tiap entri = pasangan {id, en} agar loc + hreflang alternate saling benar
  // (mis. /id/jelajah ↔ /en/discover).
  const entries = [{ id: route("home", "id"), en: route("home", "en") }];
  for (const key of PAGE_KEYS) entries.push(langPaths(key));
  for (const gid of gameIds) entries.push({ id: `/id/game/${gid}`, en: `/en/game/${gid}` });

  const now = new Date().toISOString().slice(0, 10);
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries
      .flatMap((e) =>
        LANGS.map(
          (lang) =>
            `  <url>\n` +
            `    <loc>${SITE}${e[lang]}</loc>\n` +
            `    <lastmod>${now}</lastmod>\n` +
            `    <xhtml:link rel="alternate" hreflang="id" href="${SITE}${e.id}"/>\n` +
            `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${e.en}"/>\n` +
            `  </url>`,
        ),
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
