// Sumber kode Whiteout Survival — whiteoutsurvival-community.com. HTML statis
// terstruktur, refresh ~tiap jam. Tiap tile kode punya:
//   aria-label="Gift code <CODE>, active|expired"
// Kode + status dari aria-label itu (paling andal). Sumber ini TIDAK menyertakan
// reward per-kode maupun tanggal (kode WOS reward-nya kecil/generik) → reward
// null, tanggal via firstSeenAt di worker. Aktif/expired langsung dari status.
// Single-game (wos).

import { fetchAsBrowser } from "../http.mjs";

const URL = "https://www.whiteoutsurvival-community.com/en/gift-codes.html";
const CODE_RE = /^[A-Za-z0-9]{4,30}$/;

function parseCodes(html) {
  const out = [];
  for (const m of html.matchAll(/aria-label="Gift code ([^,"]+), (active|expired)"/g)) {
    const code = m[1].trim();
    if (!CODE_RE.test(code)) continue;
    out.push({ code, status: m[2] });
  }
  return out;
}

async function fetchOne(id, meta, ua) {
  // Sumber ini menolak UA bot dari IP Actions (HTTP 403) → header ala browser.
  const res = await fetchAsBrowser(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = parseCodes(await res.text());
  if (rows.length === 0) throw new Error("0 kode terparse — layout whiteoutsurvival-community berubah");

  const base = { game: id, gameName: meta.name, source: "whiteoutsurvival-community", sourceUrl: URL, claimUrl: null, perm: false, reward: null };
  const items = [];
  const expiredItems = [];
  for (const r of rows) {
    if (r.status === "expired") expiredItems.push({ ...base, code: r.code, status: "expired" });
    else items.push({ ...base, code: r.code, status: "active" });
  }
  return { items, expiredItems };
}

export async function fetchWhiteout({ games, userAgent, log = () => {} }) {
  const items = [];
  const expiredItems = [];
  const expired = new Set();
  const covered = new Set();
  let failed = 0;

  const meta = games.wos;
  if (!meta) return { items, expiredItems, expired, covered, failed };
  try {
    const { items: act, expiredItems: exp } = await fetchOne("wos", meta, userAgent);
    covered.add("wos");
    items.push(...act);
    for (const it of exp) {
      expiredItems.push(it);
      expired.add(`wos:${it.code}`);
    }
    log(`[wos] ✓ ${act.length} aktif + ${exp.length} expired dari whiteoutsurvival-community`);
  } catch (err) {
    failed = 1;
    log(`[wos] · whiteoutsurvival-community gagal: ${err.message}`);
  }
  return { items, expiredItems, expired, covered, failed };
}
