// Sumber kode ROBLOX PRIMER #2 — Roblox Den (robloxden.com/game-codes/<slug>).
//
// Seperti RoCodes: situs kode Roblox DEDICATED (bukan editorial). Dipakai
// berdampingan dg RoCodes → saling melengkapi (game/kode yang tak ada di satu
// sumber) DAN saling cross-check (kode yang ada di keduanya = terverifikasi).
//
// (decode entity via normalize.mjs — lihat clean()).
// Markup: tiap kode `data-copy="CODE"`, status di container `data-expired`,
// reward di `<p class="codes-list__description">`. Nama dari <title>, placeId
// dari link play (roblox.com/games/<placeId>) → bisa di-resolve ke universeId.

import { decodeEntities } from "../normalize.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CODE_OK = /^[\w!.\- ]{2,40}$/;

function clean(s) {
  // decodeEntities menggantikan daftar entity ad-hoc: dulu &#x27; / &#x2F; lolos
  // dan tersimpan mentah di data (lihat catatan di normalize.mjs).
  return decodeEntities((s || "").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// Cara redeem spesifik Roblox Den: paragraf di section "How to Use Codes in X"
// (prosa, mis. MMV: "click the INVENTORY button… enter code in EnterCode box…
// click Redeem"). Batas = section "About" berikutnya.
function parseDenHowTo(html) {
  const i = html.search(/how to use codes in/i);
  if (i < 0) return [];
  const rest = html.slice(i + 20);
  const end = rest.search(/<h2|about\s|how to claim|case.?sensitive/i);
  const body = rest.slice(0, end > 40 ? end : 2500);
  const steps = [];
  for (const m of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = clean(m[1]).replace(/:$/, "");
    if (t.length > 15) steps.push(t);
  }
  return steps;
}

// Rapikan reward Roblox Den yang verbose → esensinya.
function reward(raw) {
  let r = clean(raw)
    .replace(/^(redeem this code (to get|for)|this code (credits your account with|grants you|gives you|will grant you))\s*/i, "")
    .replace(/[.\s]+$/, "")
    .trim();
  return r || null;
}

/**
 * Tarik kode 1 game dari Roblox Den.
 * @returns {Promise<{active,archive,meta}>} meta: {name, placeId}
 */
export async function fetchRobloxDen(slug) {
  const res = await fetch(`https://robloxden.com/game-codes/${slug}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const active = [];
  const archive = [];
  const seen = new Set();
  // Tiap item: data-expired="false|true" … data-copy="CODE"; reward di <p
  // class="codes-list__description"> tepat setelahnya (diambil dari slice).
  const re = /data-expired="(false|true)"[\s\S]{0,500}?data-copy="([^"]{2,40})"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[2].trim();
    if (!CODE_OK.test(code)) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const start = m.index + m[0].length;
    // Window sampai kode BERIKUTNYA (maks 1600) → hanya markup item INI, biar
    // status badge & reward tak nyasar ke kode lain.
    const nextIdx = html.indexOf('data-copy="', start);
    const after = html.slice(start, nextIdx > 0 ? Math.min(nextIdx, start + 1600) : start + 1600);
    const rw = (after.match(/codes-list__description[^"]*">([\s\S]*?)<\/p>/i) || [])[1];
    // "CHECK" = Roblox Den menandai kode AKTIF tapi belum dikonfirmasi-ulang
    // works (class badge--check, beda dari badge--active). BUKAN expired — kode
    // tetap aktif, tapi kita bawa flag `check` supaya bisa ditandai "cek dulu".
    const check = m[1] === "false" && /badge--check/i.test(after);
    const item = { code, reward: reward(rw), date: null, endsAt: null, ...(check ? { check: true } : {}) };
    if (m[1] === "false") active.push(item);
    else archive.push(item);
  }

  const tm = html.match(/<title>(?:Roblox\s+)?([^<]+?)\s+Codes\b/i);
  const pm = html.match(/roblox\.com\/games\/(\d+)/);
  const meta = { name: tm ? clean(tm[1]) : null, placeId: pm ? Number(pm[1]) : null, howTo: parseDenHowTo(html) };
  if (active.length === 0 && archive.length === 0) throw new Error("0 kode terparse");
  return { active, archive, meta };
}

// Semua slug game di Roblox Den (dari halaman /game-codes) — untuk discovery +
// validasi (game populer yang ada di Den walau tak ada di RoCodes).
export async function fetchRobloxDenSlugs() {
  try {
    const res = await fetch("https://robloxden.com/game-codes", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return new Set();
    const html = await res.text();
    return new Set([...html.matchAll(/\/game-codes\/([a-z0-9-]+)/g)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}
