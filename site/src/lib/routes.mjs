// SLUG per bahasa — SATU sumber kebenaran untuk semua tautan internal.
// URL ID pakai kata Indonesia, EN pakai kata Inggris (mis. /id/jelajah vs
// /en/discover). Toggle bahasa memetakan slug↔slug lewat pageFromSlug.

export const SLUGS = {
  discover: { id: "jelajah", en: "discover" },
  codes: { id: "kode-redeem", en: "codes" },
  news: { id: "berita", en: "news" },
  saved: { id: "favorit", en: "saved" },
  about: { id: "tentang", en: "about" },
  contact: { id: "kontak", en: "contact" },
  privacy: { id: "privasi", en: "privacy" },
};

export const PAGE_KEYS = Object.keys(SLUGS);

/** Path lengkap sebuah halaman logis dalam sebuah bahasa. "home" → /{lang}. */
export const route = (page, lang) => (page === "home" ? `/${lang}` : `/${lang}/${SLUGS[page][lang]}`);

/** Pasangan {id,en} path untuk toggle bahasa (dipakai Header). */
export const langPaths = (page) => ({ id: route(page, "id"), en: route(page, "en") });

/** Halaman logis dari slug (untuk resolusi/route balik). */
export const pageFromSlug = (slug, lang) => PAGE_KEYS.find((k) => SLUGS[k][lang] === slug) ?? null;

// Vertikal Roblox: rute dedicated (bukan lewat SLUGS/catch-all). "roblox" nama
// brand → slug sama di ID/EN, jadi path alternate hreflang pakai slug yang sama.
export const robloxHome = (lang) => `/${lang}/roblox`;
export const robloxHomePaths = () => ({ id: "/id/roblox", en: "/en/roblox" });
export const robloxGamePaths = (slug) => ({ id: `/id/roblox/${slug}`, en: `/en/roblox/${slug}` });
