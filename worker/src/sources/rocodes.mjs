// Sumber kode ROBLOX — RoCodes.gg (tracker khusus Roblox, real-time, ribuan game).
//
// Data ada di payload Nuxt `__NUXT_DATA__` = array DATAR ber-referensi indeks
// (devalue). Tiap objek game punya { codes:{active,expired}, universeId, placeId,
// verified, howTo, ... }; tiap objek kode { key, reward, expiration, published }.
// Kita resolve referensi indeks → objek nyata. JAUH lebih andal dari scrape HTML
// (yang cuma menaruh reward generik di SSR).
//
// Akses: butuh browser-UA (bot-UA bisa 403). Menambah game = tambah slug di
// roblox-games.mjs; adapter ini generik untuk semua game.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// key kode Roblox: huruf/angka/underscore/!/-/titik/spasi (sebagian kode berspasi).
const CODE_OK = /^[\w!.\- ]{3,40}$/;

// Resolver devalue: nilai di objek/array = INDEKS ke `data`. Kembalikan nilai nyata.
function makeResolver(data) {
  return function R(i, depth = 0, seen = new Set()) {
    if (typeof i !== "number" || i < 0 || i >= data.length) return i;
    if (depth > 8 || seen.has(i)) return null;
    const s2 = new Set(seen).add(i);
    const v = data[i];
    if (Array.isArray(v)) return v.map((x) => R(x, depth + 1, s2));
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) o[k] = R(v[k], depth + 1, s2);
      return o;
    }
    return v;
  };
}

// <ol><li>langkah</li>…</ol> → array langkah teks bersih. Substitusi placeholder
// {{game_name}} dg nama game asli (RoCodes menaruhnya sbg mention di teks).
function parseHowTo(html, name) {
  if (!html || typeof html !== "string") return [];
  const steps = [];
  for (const m of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#8217;|&rsquo;/g, "'")
      .replace(/\{\{\s*game_name\s*\}\}/gi, name || "the game")
      .replace(/\s+/g, " ")
      .trim();
    if (t) steps.push(t);
  }
  return steps;
}

function shapeCode(c) {
  if (!c || typeof c !== "object") return null;
  const code = (c.key ?? "").trim();
  if (!code || !CODE_OK.test(code)) return null;
  const reward = typeof c.reward === "string" && c.reward.trim() ? c.reward.trim() : null;
  const date = typeof c.published === "string" ? c.published : null; // ISO rilis
  const endsAt = typeof c.expiration === "string" ? c.expiration : null; // ISO / false
  return { code, reward, date, endsAt };
}

/**
 * Tarik kode 1 game dari RoCodes.
 * @returns {Promise<{active,archive,meta}>} meta: {universeId,placeId,verified,howTo[]}
 */
export async function fetchRoCodes(slug) {
  const res = await fetch(`https://rocodes.gg/codes/${slug}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("payload __NUXT_DATA__ tak ditemukan");
  const data = JSON.parse(m[1]);
  const R = makeResolver(data);

  // Objek game = dict yang punya `codes` DAN `universeId`. Bila >1 (game terkait),
  // pilih yang jumlah kode aktif+expired-nya terbanyak (itu game halaman ini).
  let best = null;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    if (!("codes" in v) || !("universeId" in v)) continue;
    const codes = R(v.codes) || {};
    const active = Array.isArray(codes.active) ? codes.active : [];
    const expired = Array.isArray(codes.expired) ? codes.expired : [];
    const total = active.length + expired.length;
    if (!best || total > best.total) best = { v, active, expired, total };
  }
  if (!best) throw new Error("objek game tak ditemukan di payload");

  const active = best.active.map(shapeCode).filter(Boolean);
  const archive = best.expired.map(shapeCode).filter(Boolean);
  // Nama game BERSIH dari <title> ("Blox Fruits Codes | ..." → "Blox Fruits") —
  // lebih rapi dari nama Roblox yang berdekorasi ([UPD], emoji, dll).
  const tm = html.match(/<title>([^<]+?)\s+Codes\b/i);
  const name = tm ? tm[1].trim() : null;
  // Cara redeem SPESIFIK per-game: coba field `howTo`, lalu section "How do I
  // redeem" di `content` (sebagian game menaruh langkahnya di sana, mis. Island
  // of Move: "walk over to the TV…"). Substitusi {{game_name}}. Kosong → situs
  // pakai langkah standar bilingual.
  let howTo = parseHowTo(R(best.v.howTo)?.body, name);
  if (howTo.length === 0 && best.v.content !== undefined) {
    const content = R(best.v.content);
    const om = typeof content === "string" ? content.match(/how do i redeem[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/i) : null;
    if (om) howTo = parseHowTo(om[1], name);
  }
  const meta = {
    name,
    universeId: R(best.v.universeId) ?? null,
    placeId: R(best.v.placeId) ?? null,
    verified: R(best.v.verified) === true,
    howTo,
  };
  if (active.length === 0 && archive.length === 0) throw new Error("0 kode terparse");
  return { active, archive, meta };
}
