// levelupplay.my — sumber KODE EXPIRED saja.
//
// Kenapa hanya expired: diukur 5 Agu 2026 atas 25 game teratas yang slug-nya
// cocok, situs ini mendaftarkan 359 kode aktif kita dan menyatakan 9 di
// antaranya expired (3%) — 5 sudah kita ragukan sendiri lewat badge CEK DULU,
// 4 tampil bersih padahal mati. Kecil, tapi searah: ia hanya bisa MEMBERSIHKAN.
//
// Daftar AKTIF-nya sengaja DIABAIKAN. Untuk Knockout mereka mendaftarkan 31
// kode aktif / 2 expired, sementara Roblox Den bilang 5 aktif / 36 expired —
// mereka jauh lebih longgar menandai kematian. Memakai daftar aktifnya berarti
// menghidupkan kembali kode yang sumber primer kita sudah nyatakan mati. Jadi
// yang dipakai HANYA vonis expired-nya, tak pernah ketiadaannya: diamnya situs
// ini tentang sebuah kode tidak berarti kode itu hidup.
//
// ROTASI 24 JAM. Sitemap mereka tak punya <lastmod>, jadi tak ada cara tahu
// halaman mana yang berubah — satu-satunya jalan adalah memeriksa semuanya
// bergiliran. Jatah per run dihitung dari jumlah halaman dibagi 24, jadi tiap
// halaman tersentuh sekali sehari dan jatahnya menyesuaikan sendiri saat
// katalog mereka tumbuh (326 halaman → 14/run; kalau jadi 480 → 20/run).
const UA = "Mozilla/5.0 (compatible; KodeGGBot/1.0; +https://kodegg.com)";
const BASE = "https://levelupplay.my";
const SITEMAP = `${BASE}/sitemap-0.xml`;
// Batas atas pengaman: kalau katalog mereka meledak, jangan sampai satu run
// menembak ratusan halaman dan memakan seluruh waktu runner.
const MAX_PER_RUN = Number(process.env.LEVELUP_MAX_PER_RUN || 40);

const ambil = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};

/** Semua slug halaman /codes/ dari sitemap mereka. */
export async function levelupSlugs() {
  const xml = await ambil(SITEMAP);
  return [...xml.matchAll(/<loc>[^<]*\/codes\/([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, ""));
}

/**
 * Kode EXPIRED dari satu halaman. Penandanya kelas `line-through` pada <code> —
 * situs ini mencoret kode mati, dan itu penanda yang eksplisit (bukan tebakan
 * posisi/urutan), jadi parser tak ikut rusak saat tata letaknya berubah.
 */
export async function levelupExpired(slug) {
  const h = await ambil(`${BASE}/codes/${slug}`);
  const kode = [...h.matchAll(/<code[^>]*line-through[^>]*>([^<]{2,60})<\/code>/g)].map((m) => m[1].trim()).filter(Boolean);
  return [...new Set(kode)];
}

/** Normalisasi slug untuk mencocokkan slug mereka dengan slug kita. */
export const normSlug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Satu putaran rotasi: periksa jatah halaman yang PALING LAMA tak diperiksa.
 *
 * @param {object} memo  isi data/levelup-expired.json — { slug: {at, codes[]} }
 * @returns {Promise<{memoBaru: object, diperiksa: number, jatah: number, total: number}>}
 */
export async function scanLevelup(memo = {}) {
  let slugs = [];
  try { slugs = await levelupSlugs(); } catch (e) { console.log(`[levelup] sitemap gagal: ${e.message}`); return { memoBaru: memo, diperiksa: 0, jatah: 0, total: 0 }; }
  if (!slugs.length) return { memoBaru: memo, diperiksa: 0, jatah: 0, total: 0 };

  const jatah = Math.min(MAX_PER_RUN, Math.ceil(slugs.length / 24));
  // Yang belum pernah diperiksa didahulukan (at = 0), lalu yang paling lama.
  const urut = [...slugs].sort((a, b) => (memo[a]?.at ?? 0) - (memo[b]?.at ?? 0)).slice(0, jatah);

  const memoBaru = { ...memo };
  const now = Date.now();
  let ok = 0, gagal = 0, totalKode = 0;
  for (const slug of urut) {
    try {
      const codes = await levelupExpired(slug);
      memoBaru[slug] = { at: now, codes };
      totalKode += codes.length;
      ok++;
    } catch {
      // Halaman hilang/berubah bukan alasan menahan rotasi. Stempel waktunya
      // TETAP diperbarui supaya slug rusak tak menyumbat antrean tiap jam;
      // kode lamanya dipertahankan agar vonis yang sudah kita punya tak hilang
      // hanya karena satu tarikan gagal.
      memoBaru[slug] = { at: now, codes: memo[slug]?.codes ?? [] };
      gagal++;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  // Slug yang lenyap dari sitemap dibuang, supaya memo tak menggelembung selamanya.
  const hidup = new Set(slugs);
  for (const k of Object.keys(memoBaru)) if (!hidup.has(k)) delete memoBaru[k];

  console.log(`[levelup] ${ok}/${jatah} halaman diperiksa (${gagal} gagal) · ${totalKode} kode expired terbaca · katalog ${slugs.length} halaman → jatah ${jatah}/run`);
  return { memoBaru, diperiksa: ok, jatah, total: slugs.length };
}

/**
 * Peta slug-ternormalisasi → Set kode expired (huruf kecil), siap diadu ke kode
 * aktif kita. Dibaca dari memo, jadi tak menembak jaringan sama sekali.
 */
export function petaExpired(memo = {}) {
  const peta = new Map();
  for (const [slug, v] of Object.entries(memo)) {
    if (!v?.codes?.length) continue;
    peta.set(normSlug(slug), new Set(v.codes.map((c) => String(c).toLowerCase())));
  }
  return peta;
}
