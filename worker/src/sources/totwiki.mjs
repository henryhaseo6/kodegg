// Sumber kode Tears of Themis — tot.wiki (wiki khusus ToT, JAUH lebih lengkap &
// segar dari seria yang mandek 2024).
//
// Masalah: tot.wiki LIVE diblokir Cloudflare "managed challenge" total — Node
// fetch, WebFetch, bahkan headless Chromium tak tembus. TAPI arsip Wayback
// (web.archive.org) TIDAK diblokir. Kita tarik snapshot 200 terbaru dari Wayback.
//
// Kenapa tetap sahih meski snapshot bisa berumur:
//  - Tiap kode punya kolom Start & End Date eksplisit. Aktif/expired dihitung
//    dari End Date terhadap WAKTU SEKARANG (bukan dari umur snapshot). Jadi kode
//    yang End-nya sudah lewat tetap benar-benar expired walau snapshot lama.
//  - Batasnya: kode BARU yang terbit setelah snapshot tak akan terlihat. Itu
//    diterima — lebih baik akurat-tapi-mungkin-kurang daripada salah menandai
//    kode mati sebagai aktif (kelemahan seria yang ditinggalkan di sini).

const PAGE = "https://tot.wiki/wiki/Redeem_Code";
// CDX: daftar tangkapan sukses (200) — ambil timestamp TERBARU.
const CDX = `http://web.archive.org/cdx/search/cdx?url=tot.wiki/wiki/Redeem_Code&filter=statuscode:200&fl=timestamp&limit=-5&output=json`;

// DATASET MANUAL dari tot.wiki LIVE (disalin user; snapshot Wayback mandek Feb
// 2026, tot.wiki live diblokir CF). Ini melengkapi kode PASCA-Feb yang tak
// terlihat Wayback. Aman krn tiap kode punya End Date → aktif/expired dihitung
// otomatis (kode kedaluwarsa pindah sendiri ke arsip, tak pernah stuck aktif).
// PEMELIHARAAN: tempel baris terbaru dari https://tot.wiki/wiki/Redeem_Code.
// Reward VERBATIM (nama item apa adanya, hanya "xN" → "×N").
const MANUAL = [
  // Kode PERMANEN (selalu aktif) — dijamin ada walau Wayback gagal. Reward
  // dibiarkan null (belum terverifikasi; jangan mengarang — akan diisi sumber lain).
  { code: "6APSZ5YWKFMX", start: "2024-10-25", end: "2099-12-31", reward: null },
  { code: "YESIDO", start: "2026-07-15", end: "2026-08-15", reward: "S-Chip ×180" },
  { code: "HBDMarius2026", start: "2026-06-21", end: "2026-07-20", reward: "S-Chip ×20 · Stellin ×10000 · Energy Drink Family Pack ×1" },
  { code: "BQKT35HYED", start: "2026-06-16", end: "2026-07-16", reward: "S-Chip ×80 · Oracle of Justice III ×30" },
  { code: "SIYHZ1G08B", start: "2026-06-15", end: "2026-07-16", reward: "S-Chip ×80 · Energy Drink Family Pack ×1 · Stellin ×30000" },
  { code: "AmoraeEnsnare3", start: "2026-05-05", end: "2026-06-01", reward: "S-Chip ×60 · Stellin ×10000" },
  { code: "AmoraeEnsnare4", start: "2026-05-04", end: "2026-06-01", reward: "S-Chip ×60 · Skill Selection Bundle II ×3" },
  { code: "AmoraeEnsnare2", start: "2026-05-02", end: "2026-06-01", reward: "S-Chip ×60 · Oracle of Justice IV ×5" },
  { code: "AmoraeEnsnare1", start: "2026-05-01", end: "2026-06-01", reward: "S-Chip ×60 · Energy Drink Family Pack ×1" },
  { code: "AmoraeEnsnare", start: "2026-04-28", end: "2026-05-05", reward: "S-Chip ×180" },
  { code: "HBDArtem2026", start: "2026-04-26", end: "2026-05-10", reward: "S-Chip ×20 · Stellin ×10000 · Energy Drink Family Pack ×1" },
  { code: "NJET65QA1C", start: "2026-04-19", end: "2026-05-18", reward: "S-Chip ×80 · Energy Drink Family Pack ×1 · Stellin ×30000" },
  { code: "979RARIB1Q", start: "2026-04-19", end: "2026-05-18", reward: "S-Chip ×80 · Oracle of Justice III ×30" },
  { code: "GNHRYRJJ8J", start: "2026-03-16", end: "2026-04-14", reward: "S-Chip ×80 · Oracle of Justice III ×30" },
  { code: "VQ1VHJKR6V", start: "2026-03-15", end: "2026-04-14", reward: "S-Chip ×80 · Energy Drink Family Pack ×1 · Stellin ×30000" },
  { code: "HAPPYWOMENSDAY2026", start: "2026-03-08", end: "2026-03-31", reward: "S-Chip ×60 · Energy Drink Basic Pack ×3 · Skill Selection Bundle I ×8" },
];

async function latestSnapshot(ua) {
  const res = await fetch(CDX, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`CDX HTTP ${res.status}`);
  const rows = await res.json();
  const ts = rows
    .slice(1)
    .map((r) => r[0])
    .sort()
    .pop();
  if (!ts) throw new Error("tak ada snapshot 200 di Wayback");
  return ts;
}

/** "2026-02-13 11:00:00 UTC+9" → ISO tanggal (jam/zona diabaikan; cukup harian). */
function parseDate(s) {
  const m = String(s ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString() : null;
}

// Tabel: Promo Image | Redeem Code | Reward(s) | Start Date | End Date.
function parseTable(html) {
  const ti = html.indexOf('<table class="wikitable"');
  if (ti < 0) return [];
  const table = html.slice(ti, html.indexOf("</table>", ti));
  const strip = (s) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const out = [];
  for (const row of table.split("<tr").slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    if (cells.length < 2) continue;
    const code = cells[1];
    if (!/^[A-Za-z0-9]{4,20}$/.test(code)) continue; // sel kode = kolom ke-2
    out.push({ code, start: parseDate(cells[3]), end: parseDate(cells[4]) });
  }
  return out;
}

/** Tarik baris tabel dari snapshot Wayback terbaru. Melempar bila gagal. */
async function fetchWaybackRows(ua) {
  const ts = await latestSnapshot(ua);
  const res = await fetch(`http://web.archive.org/web/${ts}id_/${PAGE}`, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  const rows = parseTable(await res.text());
  if (rows.length === 0) throw new Error("0 kode terparse — layout Wayback berubah");
  return { rows, ts };
}

export async function fetchTotWiki({ games, userAgent, log = () => {} }) {
  if (!games.tot) return { items: [], expiredItems: [], expired: new Set(), covered: new Set(), failed: 0 };

  // MULAI dari dataset manual (paling baru). Wayback jadi PELENGKAP untuk kode
  // lama yang tak ada di daftar manual (dedup by code, manual menang).
  const rows = MANUAL.map((r) => ({ code: r.code, start: parseDate(r.start), end: parseDate(r.end), reward: r.reward }));
  const seen = new Set(rows.map((r) => r.code));
  let failed = 0;

  try {
    const { rows: wb, ts } = await fetchWaybackRows(userAgent);
    for (const r of wb) if (!seen.has(r.code)) (rows.push(r), seen.add(r.code));
    log(`[tot] ✓ ${MANUAL.length} manual + ${wb.length} Wayback (${ts.slice(0, 8)}) → ${rows.length} kode ToT`);
  } catch (err) {
    failed = 1; // Wayback opsional — dataset manual tetap jalan.
    log(`[tot] · Wayback gagal: ${err.message} — pakai ${MANUAL.length} kode manual saja`);
  }

  const now = Date.now();
  const base = { game: "tot", gameName: games.tot.name, source: "tot.wiki", sourceUrl: PAGE, endsAt: null, claimUrl: null };

  const items = [];
  const expiredItems = [];
  const expired = new Set();
  for (const r of rows) {
    // Expired bila End Date sudah lewat (+1 hari margin akhir-hari). Tanpa End
    // Date = aktif; End jauh (mis. 2099) = permanen ("Tanpa batas").
    const isExpired = r.end && Date.parse(r.end) + 86400000 <= now;
    if (isExpired) {
      expiredItems.push({ ...base, code: r.code, reward: r.reward ?? null, date: r.start ?? r.end, status: "expired", perm: false });
      expired.add(`tot:${r.code}`);
    } else {
      const perm = !r.end || Date.parse(r.end) >= Date.parse("2090-01-01T00:00:00Z");
      items.push({ ...base, code: r.code, reward: r.reward ?? null, date: r.start, status: "active", perm });
    }
  }

  return { items, expiredItems, expired, covered: new Set(["tot"]), failed };
}
