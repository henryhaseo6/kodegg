// Sitemap dinamis — semua halaman × 2 bahasa + per-game, dengan slug per bahasa.
// lastmod PER-HALAMAN dari data aslinya (bukan waktu build seragam) supaya
// sinyal kesegaran "update tiap jam" jujur:
//   - halaman GAME (mobile & Roblox): kapan kode terakhir masuk/rilis DI GAME
//     ITU SENDIRI — bukan stempel global, lihat catatan di dalam GET();
//   - daftar kode pakai codes.updatedAt, berita feed.updatedAt, katalog
//     catalog.updatedAt, halaman statis tanggal build.
import { LANGS } from "../lib/i18n.mjs";
import { loadCatalog } from "../lib/catalog.mjs";
import { loadCodes } from "../lib/codes.mjs";
import { loadFeed } from "../lib/feed.mjs";
import { loadRobloxCatalog, loadRobloxHome } from "../lib/roblox.mjs";
import { PAGE_KEYS, route, langPaths } from "../lib/routes.mjs";

const SITE = "https://kodegg.com";
// URL kanonik = ber-trailing-slash (CF Pages menyajikan versi ber-slash sbg 200).
const ws = (p) => (p.endsWith("/") ? p : `${p}/`);
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
  // lastmod PER-GAME, bukan satu stempel global. Sebelumnya SEMUA halaman game
  // memakai `codes.updatedAt`/`roblox.updatedAt`, jadi ratusan halaman mengaku
  // "berubah hari ini" tiap hari padahal isinya tak berubah berminggu-minggu
  // (terukur 2 Agu 2026: 180 dari 350 game Roblox terakhir berubah 8-30 hari
  // lalu, tapi semuanya diklaim segar). Google memakai <lastmod> hanya SELAMA
  // ia terbukti jujur — begitu ia merayapi halaman "segar" yang ternyata sama
  // saja, sinyalnya diabaikan untuk seluruh situs.
  const NOW = Date.now();
  const hariDari = (ms, cadangan) => (ms > 0 ? day(new Date(Math.min(ms, NOW)).toISOString()) : cadangan);
  // Mobile: kapan kode terakhir MASUK/rilis per game (item sudah ter-shape).
  const mobileUbah = {};
  for (const c of codes.active ?? []) {
    const ms = Math.max(c.firstSeenMs ?? 0, c.rankMs ?? 0);
    if (ms > (mobileUbah[c.game] ?? 0)) mobileUbah[c.game] = ms;
  }
  const catMod = day(catalog.updatedAt);
  const newsMod = day(feed.updatedAt);
  const lmFor = (key) => (key === "codes" ? codesMod : key === "discover" ? catMod : key === "news" ? newsMod : build);

  // Tiap entri = { paths:{id,en}, lastmod } agar loc + hreflang alternate benar.
  const entries = [{ paths: langPaths("home"), lastmod: codesMod }];
  // "saved"/favorit di-noindex (isinya localStorage) → tak dimasukkan.
  for (const key of PAGE_KEYS) if (key !== "saved") entries.push({ paths: langPaths(key), lastmod: lmFor(key) });
  for (const g of gameEntries) entries.push({ paths: { id: `/id/game/${g.slug}`, en: `/en/game/${g.slug}` }, lastmod: hariDari(mobileUbah[g.id] ?? 0, codesMod) });

  // Vertikal Roblox: hub + per-game (lastmod = kesegaran data Roblox).
  const robloxMod = day(robloxHome.updatedAt);
  entries.push({ paths: { id: "/id/roblox", en: "/en/roblox" }, lastmod: robloxMod });
  entries.push({ paths: { id: "/id/roblox/promo-codes", en: "/en/roblox/promo-codes" }, lastmod: robloxMod });
  // Halaman agregat "kode minggu ini". WAJIB ada di sitemap: seluruh alasan
  // halaman itu dibuat adalah menyasar kueri generik ("roblox game codes this
  // week", 135rb/bln), dan halaman SEO yang tak terdaftar praktis tak ada.
  entries.push({ paths: { id: "/id/roblox/codes-this-week", en: "/en/roblox/codes-this-week" }, lastmod: robloxMod });
  for (const g of robloxGames) entries.push({ paths: { id: `/id/roblox/${g.slug}`, en: `/en/roblox/${g.slug}` }, lastmod: hariDari(g.lastChangeMs ?? 0, robloxMod) });

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries
      .flatMap((e) =>
        LANGS.map(
          (lang) =>
            `  <url>\n` +
            `    <loc>${SITE}${ws(e.paths[lang])}</loc>\n` +
            `    <lastmod>${e.lastmod}</lastmod>\n` +
            `    <xhtml:link rel="alternate" hreflang="id" href="${SITE}${ws(e.paths.id)}"/>\n` +
            `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${ws(e.paths.en)}"/>\n` +
            `  </url>`,
        ),
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
