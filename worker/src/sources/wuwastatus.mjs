// Sumber kode Wuthering Waves — wuwastatus.com.
//
// Kenapa perlu & kenapa ANDAL (padahal HTML, bukan API):
//  - WuWa tak punya API bersih; wiki Fandom-nya sering basi berat (pernah
//    tertinggal 2 livestream, masih versi 3.3). wuwastatus adalah tracker
//    KHUSUS WuWa yang dipantau tim editor & update dalam hitungan jam.
//  - Markup-nya sangat terstruktur (bukan prosa): tiap kode punya atribut
//    `data-code`, tag Permanent/Livestream, reward dalam <strong>, dan tanggal
//    "Last updated". Kita ekstrak dari atribut, bukan menebak teks.
//
// LAPISAN AMAN (sama semangat dg wiki.mjs):
//  1. Hanya baca section "Active Codes" — berhenti di "Livestream Code Archive".
//     Kode arsip/expired tak pernah ikut.
//  2. Guard kesegaran dari "Last updated": bila >MAX_AGE hari, sumber di-skip.
//  3. Pola kode ketat; bila 0 kode terparse / struktur hilang → gagal (skip),
//     kode lama dipertahankan. Layout berubah = diam, bukan sampah.
//
// Menangkap kode livestream 48-jam saat jendelanya terbuka (jika wuwastatus
// sudah memuatnya). Kode permanen tetap dijamin oleh curated.mjs.

const URL = "https://wuwastatus.com/codes";
const MAX_AGE_DAYS = 30;
const CODE_RE = /^[A-Za-z0-9]{4,30}$/;

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
}

/** ms sejak "Last updated: <strong>Month DD, YYYY</strong>", atau null. */
function lastUpdatedMs(html) {
  const m = html.match(/updated:\s*<strong>([^<]+)<\/strong>/i);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isNaN(t) ? null : t;
}

/** Isi HTML antara <h2>Active Codes</h2> dan <h2> berikutnya (arsip). */
function activeSection(html) {
  const start = html.search(/<h2>\s*Active Codes\s*<\/h2>/i);
  if (start < 0) throw new Error("section 'Active Codes' tak ditemukan");
  const after = html.slice(start + 4);
  const next = after.search(/<h2>/i);
  return next < 0 ? after : after.slice(0, next);
}

/** Ekstrak kode + reward + status permanen dari kartu di section aktif. */
function parseCards(section) {
  const out = [];
  for (const chunk of section.split(/class="code-card/).slice(1)) {
    const codeM = chunk.match(/data-code="([A-Za-z0-9]{4,30})"/);
    if (!codeM || !CODE_RE.test(codeM[1])) continue;

    const perm = /^\s*permanent/i.test(chunk) || /code-tag permanent/i.test(chunk);

    // Reward: <strong> HANYA di dalam div code-rewards (berhenti di </div>-nya).
    // Jangan pakai sisa chunk — di kartu terakhir, konten halaman setelahnya
    // (status bar, info versi) juga memakai <strong> dan akan mencemari reward.
    const rw = chunk.match(/code-rewards"[^>]*>([\s\S]*?)<\/div>/i);
    const strongs = rw ? [...rw[1].matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1].trim()) : [];
    out.push({ code: codeM[1], reward: strongs.length ? strongs.join(" · ") : null, perm });
  }
  return out;
}

export async function fetchWuwaStatus({ games, userAgent, log = () => {} }) {
  if (!games.wuwa) return { items: [], covered: new Set(), failed: 0 };

  try {
    const res = await fetch(URL, { headers: { "User-Agent": userAgent } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = stripScripts(await res.text());

    const updated = lastUpdatedMs(html);
    if (updated != null) {
      const age = (Date.now() - updated) / 86400000;
      if (age > MAX_AGE_DAYS) throw new Error(`situs basi: ${Math.round(age)} hari (>${MAX_AGE_DAYS})`);
    }

    const raw = parseCards(activeSection(html));
    if (raw.length === 0) throw new Error("0 kode aktif terparse — kemungkinan layout berubah");

    // Dedup dalam sumber.
    const byCode = new Map();
    for (const r of raw) if (!byCode.has(r.code)) byCode.set(r.code, r);

    const items = [...byCode.values()].map((r) => ({
      game: "wuwa",
      gameName: games.wuwa.name,
      code: r.code,
      reward: r.reward,
      status: "active",
      perm: r.perm,
      endsAt: null,
      claimUrl: null,
      source: "wuwastatus",
      sourceUrl: URL,
    }));

    log(`[wuwa] ✓ ${items.length} kode dari wuwastatus`);
    return { items, covered: new Set(["wuwa"]), failed: 0 };
  } catch (err) {
    log(`[wuwa] · wuwastatus gagal: ${err.message} — kode lama dipertahankan`);
    return { items: [], covered: new Set(), failed: 1 };
  }
}
