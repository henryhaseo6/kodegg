// Normalisasi teks reward.
//
// Aturan CLAUDE.md: data faktual VERBATIM, jargon game JANGAN diterjemahkan.
// Karena itu fungsi di sini HANYA menyentuh pemisah dan penanda jumlah —
// nama item ("Primogem", "Stellar Jade", "Denny") tidak pernah diubah,
// tidak di-Title Case-kan, dan tidak diterjemahkan.
//
// hoyo-codes memulangkan dua gaya yang tidak konsisten:
//   terstruktur : "Primogem*60;Adventurer's Experience*5"
//   prosa       : "30 stellar jade, three traveler's guides, and 20k credits"
// Gaya prosa dibiarkan apa adanya — merapikannya berarti menulis ulang kalimat
// sumber, dan itu parafrase.

const QTY = /^(.*?)\*([\d.,]+)$/;

/** Gaya terstruktur bila ada penanda jumlah `*` dan/atau pemisah `;`. */
function isStructured(raw) {
  return raw.includes("*") || raw.includes(";");
}

/**
 * @param {string|null|undefined} raw teks reward mentah dari sumber
 * @returns {string|null} teks siap tampil, atau null bila sumber tidak menyediakan
 */
export function normalizeReward(raw) {
  const text = (raw ?? "").trim();
  if (!text) return null; // mis. honkai3rd sering kosong — jangan mengarang

  if (!isStructured(text)) return text; // prosa: biarkan verbatim

  return text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(QTY);
      if (!m) return part; // tanpa jumlah: biarkan apa adanya
      const [, name, qty] = m;
      return `${name.trim()} ×${qty}`;
    })
    .join(" · ");
}

// Entity bernama yang benar-benar muncul di sumber (HTML biasa). Sisanya
// ditangani jalur numerik &#NN; / &#xNN; — itu yang dipakai Next.js/Nuxt saat
// meng-escape teks ke dalam <title> & payload JSON.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", eacute: "é" };

/**
 * Decode entity HTML jadi karakter aslinya.
 *
 * WAJIB dipakai untuk teks yang diambil dari HTML mentah (judul halaman, nama
 * game, langkah how-to). Kalau tidak, entity-nya ikut TERSIMPAN di data lalu
 * Astro meng-escape `&`-nya lagi → pembaca melihat "Soul&#x27;s Crossover X"
 * di judul halaman, kartu kode, judul video YouTube, sampai nama playlist.
 * (Kejadian 1 Agt 2026: souls-crossover-x, chainsaw-man-devils-heart, ghoul-re.)
 *
 * Dijalankan dua putaran: sumber kadang meng-escape ganda (`&amp;#x27;`).
 */
export function decodeEntities(s) {
  if (typeof s !== "string" || !s.includes("&")) return s;
  const sekali = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
  return sekali(sekali(s));
}

/** Kunci unik sebuah kode lintas-run. */
export function codeKey(item) {
  return `${item.game ?? "-"}:${item.code ?? item.claimUrl ?? item.gameName}`;
}
