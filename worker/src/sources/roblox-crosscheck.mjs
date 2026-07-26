// Cross-check kode Roblox dengan situs editorial besar (Fase 2 "trust").
//
// Model 2-lapis: RoCodes = sumber KECEPATAN (semua kode tampil cepat). Cross-check
// = lapisan VERIFIKASI: kode RoCodes yang JUGA dilisting AKTIF oleh ≥1 situs
// editorial → badge "Verified". TIDAK menahan/menyembunyikan kode (beda dari
// cross-check editorial game mobile yang jadi gerbang) — hanya menaikkan kepercayaan.
//
// Karena kita hanya mengambil IRISAN dengan kode RoCodes, extractor boleh LONGGAR
// (union <strong>/<code>/<td>): token ter-bold yang bukan kode tak akan cocok dg
// key RoCodes → aman. Lebih banyak sumber = lebih banyak kode terkonfirmasi.
//
// Menambah situs: tambah entri di SITES (name + url(slug)). Slug = slug game
// Roblox (mis. "blox-fruits"); tiap situs menyusun path-nya sendiri.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CODE_RE = /^[A-Za-z0-9_!.\- ]{3,40}$/;
const EXTRACTORS = [
  /<strong>([^<]{3,40})<\/strong>/gi, // pockettactics/gamerant/tryhardguides
  /<code[^>]*>([^<]{3,40})<\/code>/gi, // sebagian situs pakai <code>
  /<td[^>]*>([^<]{3,40})<\/td>/gi, // tabel (pcgamesn)
];

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Kode di bagian AKTIF (sebelum heading "Expired codes"), union beberapa pola.
function activeCodes(html) {
  const cut = html.search(/expired\s*codes/i);
  const seg = cut > 0 ? html.slice(0, cut) : html;
  return extractSeg(seg);
}

// Kode di bagian EXPIRED (setelah heading "Expired codes"). Dipakai sbg SUARA
// expiry: kode aktif kita yang dilisting kadaluarsa oleh editorial → kandidat
// diarsipkan (dgn grace fresh di fetch-roblox, krn editorial sering telat).
function expiredCodes(html) {
  const cut = html.search(/expired\s*codes/i);
  if (cut < 0) return new Set();
  return extractSeg(html.slice(cut));
}

function extractSeg(seg) {
  const out = new Set();
  for (const re of EXTRACTORS) {
    for (const m of seg.matchAll(re)) {
      const c = m[1].trim();
      if (CODE_RE.test(c)) out.add(c.toLowerCase());
    }
  }
  return out;
}

// Roblox Den: tiap kode punya `data-copy="CODE"`, status di parent
// `data-expired="false|true"`. Ambil hanya yang false (aktif).
function robloxDenActive(html) {
  const out = new Set();
  for (const m of html.matchAll(/data-expired="(false|true)"[\s\S]{0,600}?data-copy="([^"]{2,40})"/gi)) {
    if (m[1] !== "false") continue;
    const c = m[2].trim();
    if (CODE_RE.test(c)) out.add(c.toLowerCase());
  }
  return out;
}

// Situs cross-check. Tiap fetch di-timeout & try/catch → satu gagal tak jatuhkan
// yang lain. Diverifikasi cocok dg kode RoCodes (lihat probe): tryhardguides &
// gamerant paling lengkap; pockettactics stabil; pcgamesn/progameguides parsial.
const SITES = [
  { name: "Pocket Tactics", url: (s) => `https://www.pockettactics.com/${s}/codes` },
  { name: "Try Hard Guides", url: (s) => `https://tryhardguides.com/${s}-codes/` },
  { name: "Game Rant", url: (s) => `https://gamerant.com/${s}-codes/` },
  { name: "PCGamesN", url: (s) => `https://www.pcgamesn.com/${s}/codes` },
  { name: "Pro Game Guides", url: (s) => `https://progameguides.com/roblox/${s}-codes/` },
];

/**
 * Kode AKTIF & EXPIRED menurut situs editorial untuk 1 game.
 * @returns {Promise<{set:Set<string>, bySite:{name:string,set:Set<string>}[], expiredSet:Set<string>}>}
 *   set = gabungan kode aktif (lowercase); bySite = per-situs (atribusi Verified);
 *   expiredSet = gabungan kode yg dilisting kadaluarsa (suara expiry).
 */
export async function crossCheckActive(slug) {
  const set = new Set();
  const expiredSet = new Set();
  const bySite = [];
  await Promise.all(
    SITES.map(async (site) => {
      try {
        const html = await fetchHtml(site.url(slug));
        const codes = (site.extract ?? activeCodes)(html);
        if (codes.size) {
          for (const c of codes) set.add(c);
          bySite.push({ name: site.name, set: codes });
        }
        for (const c of expiredCodes(html)) expiredSet.add(c);
      } catch {
        /* situs gagal/tak punya game → lewati */
      }
    }),
  );
  return { set, bySite, expiredSet };
}
