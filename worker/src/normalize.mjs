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

/** Kunci unik sebuah kode lintas-run. */
export function codeKey(item) {
  return `${item.game ?? "-"}:${item.code ?? item.claimUrl ?? item.gameName}`;
}
