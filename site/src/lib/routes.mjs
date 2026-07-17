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
};

export const PAGE_KEYS = Object.keys(SLUGS);

/** Path lengkap sebuah halaman logis dalam sebuah bahasa. "home" → /{lang}. */
export const route = (page, lang) => (page === "home" ? `/${lang}` : `/${lang}/${SLUGS[page][lang]}`);

/** Pasangan {id,en} path untuk toggle bahasa (dipakai Header). */
export const langPaths = (page) => ({ id: route(page, "id"), en: route(page, "en") });

/** Halaman logis dari slug (untuk resolusi/route balik). */
export const pageFromSlug = (slug, lang) => PAGE_KEYS.find((k) => SLUGS[k][lang] === slug) ?? null;
