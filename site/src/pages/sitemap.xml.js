// Sitemap dinamis — semua halaman × 2 bahasa + per-game, dengan slug per bahasa.
// lastmod PER-HALAMAN dari data aslinya (bukan waktu build seragam) supaya
// sinyal kesegaran "update tiap jam" jujur: halaman kode & game pakai
// codes.updatedAt, berita pakai feed.updatedAt, katalog pakai catalog.updatedAt,
// halaman statis pakai tanggal build.
import { LANGS } from "../lib/i18n.mjs";
import { loadCatalog } from "../lib/catalog.mjs";
import { loadCodes } from "../lib/codes.mjs";
import { loadFeed } from "../lib/feed.mjs";
import { loadRobloxCatalog, loadRobloxHome } from "../lib/roblox.mjs";
import { PAGE_KEYS, route, langPaths } from "../lib/routes.mjs";

const SITE = "https://kodegg.com";
const day = (iso) => (iso ? new Date(iso) : new Date()).toISOString().slice(0, 10);

export async function GET() {
  const [catalog, codes, feed, robloxGames, robloxHome] = await Promise.all([
    loadCatalog(),
    loadCodes(),
    loadFeed("id"),
    loadRobloxCatalog(),
    loadRobloxHome(0),
  ]);
  const gameEntries = catalog.games.filter((g) => g.hasCodes); // { id, slug, ... }

  const build = day();
  const codesMod = day(codes.updatedAt);
  const catMod = day(catalog.updatedAt);
  const newsMod = day(feed.updatedAt);
  const lmFor = (key) => (key === "codes" ? codesMod : key === "discover" ? catMod : key === "news" ? newsMod : build);

  // Tiap entri = { paths:{id,en}, lastmod } agar loc + hreflang alternate benar.
  const entries = [{ paths: langPaths("home"), lastmod: codesMod }];
  // "saved"/favorit di-noindex (isinya localStorage) → tak dimasukkan.
  for (const key of PAGE_KEYS) if (key !== "saved") entries.push({ paths: langPaths(key), lastmod: lmFor(key) });
  for (const g of gameEntries) entries.push({ paths: { id: `/id/game/${g.slug}`, en: `/en/game/${g.slug}` }, lastmod: codesMod });

  // Vertikal Roblox: hub + per-game (lastmod = kesegaran data Roblox).
  const robloxMod = day(robloxHome.updatedAt);
  entries.push({ paths: { id: "/id/roblox", en: "/en/roblox" }, lastmod: robloxMod });
  for (const g of robloxGames) entries.push({ paths: { id: `/id/roblox/${g.slug}`, en: `/en/roblox/${g.slug}` }, lastmod: robloxMod });

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries
      .flatMap((e) =>
        LANGS.map(
          (lang) =>
            `  <url>\n` +
            `    <loc>${SITE}${e.paths[lang]}</loc>\n` +
            `    <lastmod>${e.lastmod}</lastmod>\n` +
            `    <xhtml:link rel="alternate" hreflang="id" href="${SITE}${e.paths.id}"/>\n` +
            `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${e.paths.en}"/>\n` +
            `  </url>`,
        ),
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
