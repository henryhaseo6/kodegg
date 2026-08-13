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
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", eacute: "é", times: "×", middot: "·", bull: "•" };

// Entity bernama yang TAK ada di tabel di atas lolos apa adanya — dan diamnya
// itu masalahnya. `&times;` luput berbulan-bulan lalu terbaca di layar video
// sebagai "Primogem &times;60" (Genshin, ketahuan 13 Agu 2026 saat meninjau
// frame sample, bukan dari log mana pun). Sekali per entity per proses supaya
// log tak banjir, tapi cukup untuk muncul di run CI berikutnya.
const entityTakDikenal = new Set();
function laporEntity(e) {
  const k = e.toLowerCase();
  if (entityTakDikenal.has(k)) return;
  entityTakDikenal.add(k);
  console.log(`  [!] entity HTML tak dikenal: &${k}; — tambahkan ke NAMED di src/normalize.mjs`);
}

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
  // `[a-z][a-z0-9]*`, bukan `[a-z]+`: entity bernama boleh memuat angka
  // (&frac12;, &sup2;). Dengan pola lama entity semacam itu tak cocok sama
  // sekali — bukan cuma gagal di-decode, tapi juga tak terlihat oleh alarm
  // di bawah, jadi kebocorannya tetap senyap persis seperti &times; dulu.
  const sekali = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    const tahu = NAMED[e.toLowerCase()];
    if (tahu === undefined) { laporEntity(e); return m; }
    return tahu;
  });
  return sekali(sekali(s));
}

/**
 * Kunci unik sebuah kode lintas-run.
 *
 * `ci` (case-insensitive) dipakai jalur MOBILE/gacha saja. Alasannya: sumber
 * merender kapitalisasi berbeda untuk kode yang SAMA — hoyo-codes memulangkan
 * semuanya HURUF BESAR ("ONTOSNEZHNAYA") sementara crimsonwitch & wiki memakai
 * kapitalisasi resmi dari pengumuman HoYo ("OntoSnezhnaya"). Tanpa `ci`, satu
 * kode jadi DUA kartu di halaman game (kejadian 1 Agt 2026: Genshin, 3 kode).
 *
 * JANGAN nyalakan `ci` untuk ROBLOX: di sana kapitalisasi bagian dari kode
 * (situs sendiri memberi tahu "salin persis"), jadi dua varian huruf memang
 * dianggap dua kode berbeda.
 */
export function codeKey(item, ci = false) {
  const c = item.code ?? item.claimUrl ?? item.gameName;
  return `${item.game ?? "-"}:${ci && typeof c === "string" ? c.toLowerCase() : c}`;
}

/**
 * Dari dua penulisan kode yang sama (beda kapitalisasi), pilih yang paling
 * mungkin ASLI. Kode yang memuat huruf kecil pasti berasal dari sumber yang
 * MEMPERTAHANKAN kapitalisasi; yang HURUF BESAR SEMUA bisa jadi hasil
 * normalisasi sumber (hoyo-codes meng-uppercase semuanya). Kalau dua-duanya
 * huruf besar semua (mis. "2BJ64QRZ7RT8"), tak ada bedanya → pertahankan yg ada.
 */
/**
 * Bentuk INTI sebuah kode: buang perintah chat yang ikut terbawa sumber.
 *
 * Banyak game Roblox menukar kode lewat chat ("!redeem CODE"), dan sumber tak
 * sepakat berapa banyak dari perintah itu yang ikut dicatat. RoCodes.gg — sedang
 * dirombak per 7 Agu 2026 — membubuhkan "!" di depan hampir semua kode Asura dan
 * bahkan menuliskan perintah lengkapnya ("!redeem 15klikes"), sementara Roblox
 * Den mencatat kodenya bersih ("15klikes"). Karena kunci pencocokan kita adalah
 * teks kodenya, keduanya jadi DUA kode berbeda — dan vonis expired Den tak
 * pernah sampai ke versi RoCodes. Akibatnya nyata: "!redeem 15klikes" terpampang
 * AKTIF padahal "15klikes" sudah kita arsipkan.
 *
 * HANYA UNTUK MENCOCOKKAN, tak pernah untuk mengubah kode yang ditampilkan.
 * Prefiks "!" TIDAK BOLEH dibuang sembarangan: Den sendiri mendaftarkan 160 kode
 * berawalan "!" yang RoCodes tak punya (mis. "!FIXEDABUG!", "!Shutdown"), jadi
 * pada sebagian game tanda itu memang bagian kodenya. Pemakainya wajib menuntut
 * bukti bahwa kedua bentuk hidup berdampingan di game yang sama sebelum
 * menyamakannya — lihat cara primExpired memakai fungsi ini.
 */
export function kodeInti(raw) {
  const s = String(raw ?? "").trim();
  return s.replace(/^!redeem\s+/i, "").replace(/^!/, "");
}

export function preferCasing(current, candidate) {
  if (typeof current !== "string" || typeof candidate !== "string") return current;
  const mixed = (s) => s !== s.toUpperCase();
  return !mixed(current) && mixed(candidate) ? candidate : current;
}
