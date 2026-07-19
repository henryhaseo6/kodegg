// Kode PROMO Roblox PLATFORM (bukan per-game) — ditukar di roblox.com/promocodes
// untuk item avatar. Beda dari kode game.
//
// Sumber (dual-primary + editorial cross-check, seperti kode game):
//   - RoCodes.gg /promo-codes  → payload Nuxt: {code, name(item), imageUrl, status}
//   - Roblox Den /promo-codes  → data-copy (kode)
//   - fossbytes / thespike     → cross-check editorial
//
// Roblox sudah lama menghentikan promo code baru → aktif biasanya sangat sedikit;
// sisanya arsip (database). Verified = dikonfirmasi ≥2 sumber.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CODE_OK = /^[A-Za-z0-9]{4,30}$/;

async function get(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// RoCodes promo: resolve payload Nuxt → [{code, item, status}].
function parseRoCodes(html) {
  const m = html.match(/id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const R = (i, d = 0, seen = new Set()) => {
    if (typeof i !== "number" || i < 0 || i >= data.length) return i;
    if (d > 6 || seen.has(i)) return null;
    const s2 = new Set(seen).add(i);
    const v = data[i];
    if (Array.isArray(v)) return v.map((x) => R(x, d + 1, s2));
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) o[k] = R(v[k], d + 1, s2);
      return o;
    }
    return v;
  };
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!v || typeof v !== "object" || Array.isArray(v) || !("code" in v) || !("status" in v)) continue;
    const o = R(i);
    const code = (o.code ?? "").trim();
    if (!CODE_OK.test(code)) continue;
    out.push({ code, item: typeof o.name === "string" ? o.name : null, status: o.status });
  }
  return out;
}

// Kode ter-bold (editorial) atau data-copy (Den) di bagian AKTIF.
function parseSimple(html, denStyle) {
  const set = new Set();
  const re = denStyle ? /data-copy="([A-Za-z0-9]{4,30})"/gi : /<strong>([A-Za-z0-9]{4,30})<\/strong>/gi;
  const cut = html.search(/expired/i);
  const seg = denStyle ? html : cut > 0 ? html.slice(0, cut) : html;
  for (const m of seg.matchAll(re)) if (CODE_OK.test(m[1])) set.add(m[1].toLowerCase());
  return set;
}

/**
 * Kode promo Roblox platform: aktif + arsip, dg atribusi & verified.
 * @returns {Promise<{active,archive}>}
 */
export async function fetchPromoCodes() {
  const [roHtml, denHtml, fbHtml, tsHtml] = await Promise.all([
    get("https://rocodes.gg/promo-codes"),
    get("https://robloxden.com/promo-codes"),
    get("https://fossbytes.com/latest-free-robux-codes/"),
    get("https://www.thespike.gg/roblox/game-codes/promo-codes"),
  ]);

  const ro = roHtml ? parseRoCodes(roHtml) : [];
  const den = denHtml ? parseSimple(denHtml, true) : new Set();
  const editorial = [
    { name: "Fossbytes", set: fbHtml ? parseSimple(fbHtml, false) : new Set() },
    { name: "TheSpike", set: tsHtml ? parseSimple(tsHtml, false) : new Set() },
  ];

  // Peta kode → data. RoCodes = otoritas status + nama item.
  const map = new Map();
  const put = (code, item, sourceName, sourceUrl, active) => {
    const key = code.toLowerCase();
    let it = map.get(key);
    if (!it) {
      it = { code, item: null, sources: [], sourceUrls: {}, active: false, seenActive: false };
      map.set(key, it);
    }
    if (item && !it.item) it.item = item;
    if (!it.sources.includes(sourceName)) it.sources.push(sourceName);
    if (sourceUrl) it.sourceUrls[sourceName] = sourceUrl;
    if (active) it.seenActive = true;
  };

  const RO_URL = "https://rocodes.gg/promo-codes";
  const DEN_URL = "https://robloxden.com/promo-codes";
  // RoCodes = OTORITAS status aktif/expired (punya field status yg dirawat).
  for (const c of ro) put(c.code, c.item, "RoCodes.gg", RO_URL, c.status === "active");
  // Den promo tak memisah aktif/expired dg jelas → hanya KONFIRMASI keberadaan
  // (untuk badge verified), TIDAK menentukan status aktif (hindari expired bocor).
  for (const key of den) put(key.toUpperCase(), null, "Roblox Den", DEN_URL, false);

  const activeKeys = new Set();
  for (const it of map.values()) if (it.seenActive) activeKeys.add(it.code.toLowerCase());

  // Cross-check editorial (untuk badge verified pada kode aktif).
  const build = (it) => {
    let corr = it.sources.length;
    const cross = [];
    for (const e of editorial)
      if (e.set.has(it.code.toLowerCase())) {
        corr += 1;
        cross.push(e.name);
      }
    return {
      code: it.code,
      reward: it.item, // "reward" = item avatar
      sources: it.sources,
      sourceUrls: it.sourceUrls,
      crossCheck: cross,
      verified: corr >= 2,
    };
  };

  const active = [];
  const archive = [];
  for (const it of map.values()) {
    const shaped = build(it);
    if (it.seenActive) active.push(shaped);
    else archive.push({ code: it.code, reward: it.item, sources: it.sources, sourceUrls: it.sourceUrls, status: "expired" });
  }
  return { active, archive };
}
