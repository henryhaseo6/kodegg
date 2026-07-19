// Cross-check kode Roblox dengan situs editorial besar (Fase 2 "trust").
//
// Model 2-lapis: RoCodes = sumber KECEPATAN (semua kode tampil cepat). Cross-check
// = lapisan VERIFIKASI: kode RoCodes yang JUGA dilisting AKTIF oleh ≥1 situs
// editorial → badge "Verified". Ini TIDAK menahan/menyembunyikan kode (beda dari
// cross-check editorial game mobile yang jadi gerbang) — cuma menaikkan kepercayaan.
//
// Karena kita hanya mengambil IRISAN dengan kode RoCodes, parser boleh longgar:
// kata ter-bold yang bukan kode tak akan cocok dg key RoCodes → aman.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CODE_RE = /^[A-Za-z0-9_!.\- ]{3,40}$/;

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Ambil bagian AKTIF (sebelum heading "Expired codes") lalu ekstrak kode ter-bold.
function activeStrongs(html, requireLi) {
  const cut = html.search(/expired\s+codes/i);
  const seg = cut > 0 ? html.slice(0, cut) : html;
  const re = requireLi
    ? /<li>\s*<strong>([^<]{3,40})<\/strong>/gi // pockettactics: kode dalam <li>
    : /<strong>([^<]{3,40})<\/strong>/gi; // pcgamesn: kode bold (bisa di tabel)
  const out = [];
  for (const m of seg.matchAll(re)) {
    const c = m[1].trim();
    if (CODE_RE.test(c)) out.push(c);
  }
  return out;
}

const SITES = [
  { name: "Pocket Tactics", url: (s) => `https://www.pockettactics.com/${s}/codes`, li: true },
  { name: "PCGamesN", url: (s) => `https://www.pcgamesn.com/${s}/codes`, li: false },
];

/**
 * Kumpulan kode AKTIF menurut situs editorial untuk 1 game.
 * @returns {Promise<{set:Set<string>, sources:string[]}>} set = key kode lowercase.
 */
export async function crossCheckActive(slug) {
  const set = new Set();
  const sources = [];
  await Promise.all(
    SITES.map(async (site) => {
      try {
        const codes = activeStrongs(await fetchHtml(site.url(slug)), site.li);
        if (codes.length) {
          for (const c of codes) set.add(c.toLowerCase());
          sources.push(site.name);
        }
      } catch {
        /* situs gagal/tak punya game → lewati (kode cukup tak ter-verify) */
      }
    }),
  );
  return { set, sources };
}
