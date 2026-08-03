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

// Spanduk merah di atas tabel kode: syarat/catatan yang bikin kode GAGAL walau
// kodenya benar (wajib follow developer, wajib join komunitas, wajib level N).
// Markup-nya seragam: <div class="notice … notice--important"><p>…</p></div>,
// dan nama akun/komunitas di dalamnya SUDAH berupa <a href> ke roblox.com —
// jadi tautannya ikut terpungut, tak perlu dicari manual.
//
// KELASNYA TAK BISA DIPAKAI MEMBEDAKAN. Disurvei 3 Agu 2026 pada 45 halaman
// terpopuler: 7 punya spanduk, SEMUANYA `notice--important`, tapi 1 di antaranya
// bukan syarat — Shindo Life memakai kotak yang sama untuk catatan batasan
// ("setelah 500 Spins, kode tak menambah Spins lagi"). Pembedanya kata "must":
// 6 spanduk syarat memuatnya, catatan Shindo tidak. Salah label di sini bukan
// sekadar kosmetik — memajang "SYARAT" untuk hal yang bukan syarat menyesatkan.
function parseDenNotice(html) {
  const m = /<div class="notice[^"]*notice--important"[^>]*>\s*<p>([\s\S]*?)<\/p>/i.exec(html);
  if (!m) return null;
  const inner = m[1];
  const en = clean(inner);
  if (en.length < 20) return null;
  const links = [...inner.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((a) => ({ label: clean(a[2]), url: a[1] }))
    .filter((l) => l.label && /^https?:\/\//i.test(l.url));
  return { en, links, kind: /\bmust\b|\brequired?\b|\bneed to\b/i.test(en) ? "syarat" : "catatan" };
}

// Cara redeem spesifik Roblox Den: paragraf di section "How to Use/Claim Codes
// in X" (prosa). Batas = section "About" berikutnya.
//
// Den memakai DUA varian judul. Dulu hanya varian "Use" yang dicari — dan "claim"
// malah dipakai sebagai penanda AKHIR blok, jadi halaman ber-judul "Claim" selalu
// memulangkan kosong. Disurvei 3 Agu 2026 pada 30 halaman terpopuler: 0 memakai
// "Use", 30 memakai "Claim". Artinya fallback howTo Den di fetch-roblox.mjs
// praktis TAK PERNAH terpakai, dan 14 dari 30 game itu tampil dengan langkah
// generik padahal Den punya langkah spesifiknya.
function parseDenHowTo(html) {
  const m0 = /how to (?:use|claim) codes in/i.exec(html);
  if (!m0) return [];
  const rest = html.slice(m0.index + m0[0].length);
  const end = rest.search(/<h2|about\s|case.?sensitive/i);
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
  // class baris ikut ditangkap: Den menandai kode yang BARU ia tambahkan dengan
  // `table__tr--new` (badge "NEW CODE"). Itu satu-satunya sinyal umur yang Den
  // punya — halamannya tak pernah memberi tanggal rilis sama sekali. Dipakai
  // sebagai syarat "kode baru" untuk kode yang tak bertanggal (lihat fetch-roblox).
  const re = /<tr[^>]*class="([^"]*)"[^>]*data-expired="(false|true)"[\s\S]{0,600}?data-copy="([^"]{2,40})"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[3].trim();
    const srcNew = /table__tr--new/.test(m[1] || "");
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
    const check = m[2] === "false" && /badge--check/i.test(after);
    // srcNew = Den menandainya "NEW CODE". Den tak memberi tanggal rilis, jadi
    // penanda ini satu-satunya cara membedakan kode yang baru ia tambahkan dari
    // ratusan kode lama di halaman yang sama.
    const item = { code, reward: reward(rw), date: null, endsAt: null, ...(check ? { check: true } : {}), ...(srcNew ? { srcNew: true } : {}) };
    if (m[2] === "false") active.push(item);
    else archive.push(item);
  }

  const tm = html.match(/<title>(?:Roblox\s+)?([^<]+?)\s+Codes\b/i);
  const pm = html.match(/roblox\.com\/games\/(\d+)/);
  const meta = { name: tm ? clean(tm[1]) : null, placeId: pm ? Number(pm[1]) : null, howTo: parseDenHowTo(html), notice: parseDenNotice(html) };
  if (active.length === 0 && archive.length === 0) throw new Error("0 kode terparse");
  return { active, archive, meta };
}

// Semua slug game di Roblox Den (dari halaman /game-codes) — untuk discovery +
// validasi (game populer yang ada di Den walau tak ada di RoCodes).
export async function fetchRobloxDenSlugs() {
  return new Set((await fetchRobloxDenIndex()).keys());
}

/**
 * Peta slug → waktu <lastmod> (ms) dari SITEMAP Roblox Den.
 *
 * Dulu daftar slug diambil dari SATU halaman /game-codes → hanya ~109 slug,
 * sehingga cuma 35 dari 350 game kita pernah dikaitkan ke sumber primer kedua;
 * sisanya jalan sendirian dg RoCodes tanpa ada yang mengoreksi (mis. kode yang
 * sudah mati tak pernah tertangkap). Sitemap memuat ~4.900 slug → 304 game kita
 * cocok PERSIS, tanpa perlu tebak-tebakan nama.
 *
 * `lastmod` dipakai untuk menarik HALAMAN GAME hanya bila benar-benar berubah
 * (lihat fetch-roblox.mjs). Tanpa itu, memperluas cakupan berarti ~7.300
 * permintaan/hari ke situs kecil ini — tak sopan dan tak perlu.
 */
export async function fetchRobloxDenIndex() {
  const peta = new Map();
  try {
    const res = await fetch("https://robloxden.com/sitemap.xml", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const xml = await res.text();
      for (const blok of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
        const slug = /robloxden\.com\/game-codes\/([a-z0-9-]+)\s*</.exec(blok)?.[1];
        if (!slug) continue;
        const lm = Date.parse(/<lastmod>([^<]+)<\/lastmod>/.exec(blok)?.[1] ?? "") || 0;
        if (lm > (peta.get(slug) ?? 0)) peta.set(slug, lm);
      }
    }
  } catch { /* jatuh ke cadangan di bawah */ }
  if (peta.size) return peta;
  // Cadangan: halaman daftar (cara lama). Tanpa lastmod → 0 = "tak diketahui".
  try {
    const res = await fetch("https://robloxden.com/game-codes", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return peta;
    const html = await res.text();
    for (const m of html.matchAll(/\/game-codes\/([a-z0-9-]+)/g)) peta.set(m[1], 0);
  } catch { /* biarkan kosong */ }
  return peta;
}
