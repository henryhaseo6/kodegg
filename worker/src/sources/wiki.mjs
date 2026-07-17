// Sumber kode dari wiki Fandom — untuk game live-service TANPA API bersih
// (Wuthering Waves, Reverse:1999, AFK Journey, dst). Dipakai HANYA karena tak
// ada API resmi; HoYo tetap lewat API (lihat hoyo.mjs).
//
// Kenapa ini bisa ANDAL & FULL OTOMATIS meski "scraping":
//  1. Lewat api.php (action=parse) — endpoint resmi MediaWiki, TIDAK diblokir
//     Cloudflare (yang diblokir hanya halaman /wiki/). Bukan scraping HTML rapuh.
//  2. Hanya membaca SECTION aktif (whitelist per game). Section "Expired" &
//     arsip diabaikan total → tak pernah menampilkan kode kadaluarsa sebagai
//     aktif (inilah yang merusak kepercayaan).
//  3. Pola kode KETAT + baris header tabel dibuang → tak ada token sampah.
//  4. LAPISAN AMAN: bila section whitelist hilang (struktur berubah) atau nol
//     kode terparse, game dianggap GAGAL — kode lamanya dipertahankan, bukan
//     dikosongkan. Wiki berubah = kita diam, bukan menyebar sampah.
//
// Menambah game = tambah satu entri WIKI_CONFIGS (host, page, sections aktif,
// dan parser reward yang cocok). Ketiga game di bawah semuanya berupa tabel
// wikitable; yang beda hanya cara reward ditulis.

import { normalizeReward } from "../normalize.mjs";

const CODE_RE = /^[A-Za-z0-9]{4,30}$/;

// GUARD KESEGARAN. "Section Active" hanya sahih bila wiki-nya aktif diurus.
// Wiki yang lama tak disentuh menyimpan kode kadaluarsa sebagai "aktif"
// (kasus nyata: halaman AFK 196 hari basi + "marked for rework", semua kode
// 2024). Jika halaman tak diedit dalam MAX_AGE hari, game di-skip → kodenya
// tak ditampilkan. Self-correcting: begitu wiki diperbarui, game kembali sendiri.
const MAX_AGE_DAYS = 60;
// Kata yang muncul sebagai label kolom / bukan kode — ditolak walau lolos CODE_RE.
const NON_CODE = new Set(["code", "server", "rewards", "reward", "duration", "released", "date", "status", "note", "region"]);

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// Tanggal SUMBER (kolom Date/Released/Discovered di tabel wiki). Hanya diambil
// bila TAHUN eksplisit ada — tanpa tahun ("July 11") ambigu, lebih baik null dan
// jatuh ke firstSeenAt. Mengisi label tanggal kartu menggantikan "hari ini".
function extractDate(text) {
  let m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}|\d{2})\b/i);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2])).toISOString();
  }
  m = text.match(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/); // YYYY/M/D (ToT: "2022/8/01")
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/); // DD/MM/YY
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, +m[2] - 1, +m[1])).toISOString();
  }
  return null;
}

async function fetchWikitext(host, page, ua) {
  const url = `https://${host}/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const wt = (await res.json()).parse?.wikitext?.["*"];
  if (!wt) throw new Error("wikitext kosong");
  return wt;
}

/** Umur (hari) sejak halaman terakhir diedit. Melempar bila tak bisa ditentukan. */
async function pageAgeDays(host, page, ua) {
  const url = `https://${host}/api.php?action=query&prop=revisions&titles=${encodeURIComponent(page)}&rvlimit=1&rvprop=timestamp&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`revisi HTTP ${res.status}`);
  const pages = (await res.json()).query?.pages ?? {};
  const ts = Object.values(pages)[0]?.revisions?.[0]?.timestamp;
  if (!ts) throw new Error("timestamp revisi tak tersedia");
  return (Date.now() - Date.parse(ts)) / 86400000;
}

function splitSections(wt) {
  const rx = /^(=+)\s*(.+?)\s*=+\s*$/gm;
  const out = [];
  let m,
    last = null,
    idx = 0;
  while ((m = rx.exec(wt))) {
    if (last) last.body = wt.slice(idx, m.index);
    out.push((last = { name: m[2], body: "" }));
    idx = rx.lastIndex;
  }
  if (last) last.body = wt.slice(idx);
  return out;
}

/** Gabung body semua section aktif (whitelist). Melempar bila tak satu pun ada. */
function activeBody(wt, names) {
  const wanted = names.map((s) => s.toLowerCase());
  const hit = splitSections(wt).filter((s) => wanted.includes(s.name.toLowerCase()));
  if (hit.length === 0) throw new Error(`section aktif (${names.join("/")}) tak ditemukan`);
  return hit.map((s) => s.body).join("\n");
}

// Section penanda kode SUDAH kadaluarsa. Dijadikan sinyal OTORITATIF untuk
// membuang kode expired dari sumber yang over-inclusive (mis. seria menyajikan
// 22 kode HI3 lama sebagai "aktif" padahal semua ada di Legacy wiki).
const EXPIRED_SECTION = /expired|legacy|invalid|inactive|past|^20\d\d$/i;

// Ekstraksi kode dari section expired — PERMISIF (tak bergantung struktur tabel):
// cukup ambil token dalam <code>/'''bold'''/<p> yang berbentuk kode. Untuk
// memfilter, kita hanya perlu string kodenya (bukan reward), dan makin lengkap
// makin baik agar kode basi benar-benar terbuang.
// Kembalikan [{code, date}] — date diambil dari baris (kolom Date/Duration atau
// komentar `<!-- Expires: … -->`) agar arsip bisa diurut terbaru→terlama.
function expiredItemsFrom(body) {
  const byCode = new Map();
  const add = (code, date) => {
    if (!code || !CODE_RE.test(code) || NON_CODE.has(code.toLowerCase())) return;
    if (!byCode.has(code)) byCode.set(code, { code, date: date ?? null });
    else if (date && !byCode.get(code).date) byCode.get(code).date = date;
  };
  // Per BARIS tabel: kode dari sel pertama + tanggal dari baris MENTAH (termasuk
  // komentar). Menangani R1999 (`|Objection<!-- Expires: 05/07/26 -->`), HI3
  // Legacy (`|'''CODE'''||Feb 20, 25||…`), WuWa (`<code>` + "Discovered: …").
  for (const row of body.split(/\n\|-/)) {
    if (/^\s*!/.test(row) || row.includes("!!")) continue; // baris header
    const date = extractDate(row);
    const cells = row
      .split(/\n\|/)
      .flatMap((x) => x.split("||"))
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length) add(codeFromCell(cells[0]), date);
    for (const m of row.matchAll(/'''\s*([A-Za-z0-9]{4,30})\s*'''/g)) add(m[1], date);
    for (const m of row.matchAll(/<code>\s*([A-Za-z0-9]{4,30})\s*<\/code>/gi)) add(m[1], date);
  }
  // Token inline lepas (di luar tabel) — jaring aman, tanpa tanggal.
  for (const m of body.matchAll(/<p[^>]*>\s*([A-Za-z0-9]{4,30})\s*<\/p>/gi)) add(m[1], null);
  return [...byCode.values()];
}

// Kumpulkan kode expired dari SEMUA section kadaluarsa. Bila baris tak punya
// tanggal sendiri TAPI section-nya bernama tahun (mis. "===2024==="), pakai
// pertengahan tahun itu sebagai fallback — agar sorting arsip tetap masuk bucket
// tahun yang benar (bukan menumpuk di paling belakang tanpa tanggal).
function expiredItemsAll(wt) {
  const byCode = new Map();
  const put = (code, date) => {
    if (!byCode.has(code)) byCode.set(code, { code, date: date ?? null });
    else if (date && !byCode.get(code).date) byCode.get(code).date = date;
  };
  for (const s of splitSections(wt)) {
    const name = s.name.trim();
    if (!EXPIRED_SECTION.test(name)) continue;
    const ym = name.match(/^20(\d\d)$/);
    const fallback = ym ? new Date(Date.UTC(2000 + +ym[1], 5, 15)).toISOString() : null;
    for (const it of expiredItemsFrom(s.body)) put(it.code, it.date ?? fallback);
  }
  return [...byCode.values()];
}

// --- Parser reward per gaya wiki ---
// Menerima SEMUA sel baris (indeks 0 = sel kode). Kolom reward beda posisi antar
// wiki (mis. WuWa menyisipkan kolom "Server"), jadi parser bertemplate mencari
// sel yang cocok, bukan mengandalkan indeks tetap.
const REWARD = {
  // WuWa: {{Card List|Astrite*50;...|delim=;}} — sama seperti format HoYo.
  cardList(cells) {
    const cell = cells.find((c) => /\{\{Card List\|/i.test(c));
    const m = cell?.match(/\{\{Card List\|([^|}]*)/i);
    return m ? normalizeReward(m[1]) : null;
  },
  // R1999: {{Item Box|qty|Nama|rarity}} (qty di depan).
  itemBox(cells) {
    const cell = cells.find((c) => /\{\{Item Box\|/i.test(c));
    const boxes = [...(cell?.matchAll(/\{\{Item Box\|(\d[\d,]*)\|([^|}]+)\|/gi) ?? [])];
    return boxes.length ? boxes.map((b) => `${b[2].trim()} ×${b[1].trim()}`).join(" · ") : null;
  },
  // Honkai Impact 3rd: {{Item|Nama|rarity=..|size=..|quantity=N}}.
  itemTemplate(cells) {
    const cell = cells.find((c) => /\{\{Item\|/i.test(c));
    if (!cell) return null;
    const items = [...cell.matchAll(/\{\{Item\|([^|}]+)((?:\|[^{}]*)?)\}\}/gi)].map((m) => {
      const name = m[1].trim();
      const q = m[2].match(/quantity=(\d[\d,]*)/i);
      return q ? `${name} ×${q[1]}` : name;
    });
    return items.length ? items.join(" · ") : null;
  },
  // AFK Journey: {{Diamonds|1000}} + wikilink + teks bebas. Reward = sel tepat
  // setelah kode (indeks 1); sel setelahnya berisi tanggal, jangan ikut.
  templates(cells) {
    const out = (cells[1] ?? "")
      .replace(/\{\{([A-Za-z ]+)\|([\d.,kKmM]+)\}\}/g, (_, n, q) => `${n.trim()} ×${q}`)
      .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/<br\s*\/?>/gi, " · ")
      .replace(/<[^>]+>/g, "")
      .replace(/'''?/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*·\s*(·\s*)+/g, " · ")
      .trim()
      .replace(/^·\s*|\s*·$/g, "")
      .trim();
    return out || null;
  },
};

/** Ambil token kode dari sel pertama (lepas <code>, <p>, komentar, wikilink, tag). */
function codeFromCell(cell) {
  const token = cell
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<code>([\s\S]*?)<\/code>/gi, "$1")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1")
    .replace(/\[\[|\]\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'''?/g, "")
    .trim();
  if (!CODE_RE.test(token)) return null;
  if (NON_CODE.has(token.toLowerCase())) return null;
  return token;
}

// --- Parser gaya TEMPLATE (wiki HoYo: gi/hsr/zzz) ---
// Kode ditulis sebagai template, bukan baris wikitable:
//   gi : {{Code Row|CODE|SERVER|Name*qty;…|DISCOVERY|EXPIRY}}
//   hsr: {{Redemption Code Row|CODE|ref=…|SERVER|{{Item List|Name*qty;…|mode=br}}|DISCOVERY|EXPIRY}}
// Reward bisa berisi {{Item List|…}} bersarang → param dipisah dengan
// brace-balancing (bukan split "|" polos). Tanggal = ISO (YYYY-MM-DD).

/** Ambil isi tiap blok {{Name …}} dengan penyeimbangan kurung ganda. */
function extractTemplates(text, name) {
  const out = [];
  const start = new RegExp(`\\{\\{\\s*${name}\\b`, "gi");
  let m;
  while ((m = start.exec(text))) {
    let depth = 0,
      i = m.index;
    while (i < text.length) {
      if (text[i] === "{" && text[i + 1] === "{") {
        depth++;
        i += 2;
      } else if (text[i] === "}" && text[i + 1] === "}") {
        depth--;
        i += 2;
        if (depth === 0) break;
      } else i++;
    }
    out.push(text.slice(m.index + 2, i - 2)); // isi antara {{ dan }}
    start.lastIndex = i;
  }
  return out;
}

/** Pisah param template dengan "|" tingkat-atas (abaikan "|" di dalam {{}}/[[]]). */
function splitTemplateParams(inner) {
  const parts = [];
  let depth = 0,
    buf = "",
    i = 0;
  while (i < inner.length) {
    const two = inner.substr(i, 2);
    if (two === "{{" || two === "[[") {
      depth++;
      buf += two;
      i += 2;
    } else if (two === "}}" || two === "]]") {
      depth = Math.max(0, depth - 1);
      buf += two;
      i += 2;
    } else if (inner[i] === "|" && depth === 0) {
      parts.push(buf);
      buf = "";
      i++;
    } else {
      buf += inner[i];
      i++;
    }
  }
  parts.push(buf);
  return parts;
}

/** Reward template: {{Item List|Name*qty;…|mode=br}} (hsr/zzz) atau plain "Name*qty;…" (gi). */
function templateReward(cell) {
  if (!cell) return null;
  const m = cell.match(/\{\{Item List\|([^|}]*)/i);
  if (m) return normalizeReward(m[1]);
  if (/\*/.test(cell)) return normalizeReward(cell);
  return null;
}

// Tanggal wiki HoYo LONGGAR: "2026-02-12", "2025-08-03 23:59" (ada jam),
// "2025-04-8" (hari 1-digit). Ambil prefix Y-M-D; abaikan sisanya. Non-tanggal
// (exp/indef/unknown/kosong) → null.
function parseWikiDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();
}

// Kata penanda expiry SUDAH lewat (bukan tanggal): "exp", "expired", "invalid".
const EXPIRY_KEYWORD = /^(exp|expired|invalid|past|no)\b/i;

/** Baris template → {code, reward, discovery(ISO|null), expiry(ISO|null), expiredKw(bool)}.
 *  Deteksi kolom dari ISI (bukan indeks tetap) supaya satu parser melayani semua
 *  tata-letak: gi {CODE|SERVER|reward|disc|exp}, hsr {CODE|ref=|SERVER|{{Item List}}|disc|exp},
 *  nikki {CODE|reward|disc|exp|notes}. reward = param ber-"*"/Item List; discovery
 *  = tanggal ISO pertama; expiry = param TEPAT setelah discovery. */
function parseTemplateRows(body, templateName) {
  const clean = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ""); // buang sitasi (bisa mengandung "|")
  const out = [];
  for (const inner of extractTemplates(clean, templateName)) {
    const parts = splitTemplateParams(inner).map((s) => s.trim());
    // parts[0] = nama template. Buang param BERNAMA (ref=, notacode=, mode=…).
    const pos = parts.slice(1).filter((p) => !/^[A-Za-z_ ]+=/.test(p));
    const code = codeFromCell(pos[0] ?? "");
    if (!code) continue;
    // Lewati kode KHUSUS CHINA (server "CN") — tak bisa di-redeem internasional.
    // (Untuk wiki tanpa kolom server spt Nikki, pos[1]=reward → tak pernah "CN".)
    if (/^(cn|china)$/i.test((pos[1] ?? "").trim())) continue;

    const params = pos.slice(1);
    const reward = templateReward(params.find((p) => /\*|\{\{Item List/i.test(p)) ?? "");
    const discIdx = params.findIndex((p) => parseWikiDate(p)); // tanggal ISO pertama
    const expiryStr = discIdx >= 0 ? (params[discIdx + 1] ?? "") : "";
    out.push({
      code,
      reward,
      discovery: discIdx >= 0 ? parseWikiDate(params[discIdx]) : null,
      expiry: parseWikiDate(expiryStr),
      expiredKw: EXPIRY_KEYWORD.test(expiryStr.trim()),
    });
  }
  return out;
}

/** Parser tabel terpadu untuk semua wiki: baris <code>/<p>/teks + sel reward. */
function parseTable(body, rewardParser) {
  const out = [];
  for (const row of body.split(/\n\|-/)) {
    if (/^\s*!/.test(row) || row.includes("!!")) continue; // baris header
    const cells = row
      .split(/\n\|/)
      .flatMap((x) => x.split("||"))
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 1) continue;
    const code = codeFromCell(cells[0]);
    if (!code) continue;
    // Tanggal dicari di sel selain kode/reward (posisi kolom beda antar wiki).
    const date = extractDate(cells.slice(1).join(" "));
    out.push({ code, reward: REWARD[rewardParser](cells), date });
  }
  return out;
}

const WIKI_CONFIGS = {
  wuwa: { host: "wutheringwaves.fandom.com", page: "Redemption Code", sections: ["Active"], reward: "cardList" },
  r1999: { host: "reverse1999.fandom.com", page: "Promotional Code", sections: ["Current", "Permanent"], reward: "itemBox" },
  afkj: { host: "afk-journey.fandom.com", page: "Redemption Code", sections: ["Active"], reward: "templates" },
  // HI3: sumber KEDUA di atas API seria (game ini sebelumnya sumber-tunggal).
  hi3: { host: "honkaiimpact3.fandom.com", page: "Exchange Rewards", sections: ["Active"], reward: "itemTemplate" },
  // Wiki HoYo (gi/hsr/zzz): pelengkap TANGGAL & arsip di atas API. API tak punya
  // tanggal; wiki ini menyimpan discovery + expiry per kode (format template).
  // Aktif/expired dibedakan dari tanggal EXPIRY, bukan section.
  gi: { host: "genshin-impact.fandom.com", page: "Promotional Code", sections: ["Active Codes"], parser: "template", template: "Code Row" },
  hsr: { host: "honkai-star-rail.fandom.com", page: "Redemption Code", sections: ["All Codes"], parser: "template", template: "Redemption Code Row" },
  zzz: { host: "zenless-zone-zero.fandom.com", page: "Redemption Code", sections: ["All Codes"], parser: "template", template: "Redemption Code Row" },
  // Infinity Nikki (bukan HoYo): {{Code Row|CODE|reward|discovery|expiry|notes}}.
  // Dua section (Active + Expired) diproses bersama; aktif/expired dari tgl EXPIRY.
  nikki: { host: "infinity-nikki.fandom.com", page: "Redeem_Code", sections: ["Active Codes", "Expired Codes"], parser: "template", template: "Code Row" },
  // ToT: DIPINDAH ke src/sources/totwiki.mjs (tot.wiki via Wayback) — jauh lebih
  // lengkap & bertanggal daripada arsip Fandom 2022. Lihat modul itu.
};

export const WIKI_IDS = Object.keys(WIKI_CONFIGS);

/** Parser wiki HoYo (template): pisah aktif/expired dari tanggal EXPIRY.
 *  Tanpa tanggal expiry (indefinite/unknown) → dianggap aktif. */
function fetchTemplate(cfg, base, body) {
  const rows = parseTemplateRows(body, cfg.template);
  if (rows.length === 0) {
    throw new Error("0 baris template terparse — kemungkinan format wiki berubah");
  }

  const now = Date.now();
  const byCode = new Map(); // aktif
  const expiredRows = new Map(); // code → row (simpan discovery utk arsip)
  for (const r of rows) {
    // Expired bila: ditandai kata "exp/expired", ATAU tanggal expiry-nya sudah
    // lewat (+1 hari margin, karena kode habis di akhir hari & jam tak selalu ada).
    const isExpired = r.expiredKw || (r.expiry && Date.parse(r.expiry) + 86400000 <= now);
    if (isExpired) {
      if (!expiredRows.has(r.code)) expiredRows.set(r.code, r);
    } else if (!byCode.has(r.code)) byCode.set(r.code, r);
  }

  const items = [...byCode.values()].map((r) => ({
    ...base,
    code: r.code,
    reward: r.reward,
    date: r.discovery ?? null, // tanggal "Discovered" dari wiki
    status: "active",
    perm: false,
  }));

  const expiredItems = [...expiredRows.values()]
    .filter((r) => !byCode.has(r.code)) // kode aktif menang
    .map((r) => ({ ...base, code: r.code, reward: null, date: r.discovery ?? null, status: "expired", perm: false }));

  return { items, expiredItems };
}

async function fetchOne(id, meta, ua) {
  const cfg = WIKI_CONFIGS[id];

  const age = await pageAgeDays(cfg.host, cfg.page, ua);
  const stale = age > MAX_AGE_DAYS; // basi → jangan percaya AKTIF (tapi arsip tetap)
  const wt = await fetchWikitext(cfg.host, cfg.page, ua);
  const sourceUrl = `https://${cfg.host}/wiki/${encodeURIComponent(cfg.page)}`;
  const base = { game: id, gameName: meta.name, source: "wiki", sourceUrl, endsAt: null, claimUrl: null };

  // Wiki HoYo format template: aktif vs expired dibedakan dari tanggal EXPIRY.
  if (cfg.parser === "template") {
    const { items, expiredItems } = fetchTemplate(cfg, base, activeBody(wt, cfg.sections));
    return { items: stale ? [] : items, expiredItems, stale };
  }

  // Arsip diambil SELALU (bahkan bila wiki basi) — kode expired tetap expired.
  const expiredRaw = expiredItemsAll(wt);

  let items = [];
  let activeCodes = new Set();
  if (!stale) {
    const body = activeBody(wt, cfg.sections); // melempar bila section hilang
    const raw = parseTable(body, cfg.reward);
    const byCode = new Map();
    for (const r of raw) if (!byCode.has(r.code)) byCode.set(r.code, r);
    if (byCode.size === 0) {
      // Section ada tapi 0 kode → anggap format berubah. Gagalkan agar kode lama
      // dipertahankan (jangan tebak, jangan kosongkan diam-diam).
      throw new Error("0 kode terparse — kemungkinan format wiki berubah");
    }
    items = [...byCode.values()].map((r) => ({
      ...base,
      code: r.code,
      reward: r.reward,
      date: r.date ?? null, // tanggal sumber (kolom Date/Released), bila ada
      status: "active",
      perm: false,
    }));
    activeCodes = new Set(byCode.keys());
  }

  // Kode expired (Legacy/tahun/section Expired) → arsip, dg tanggal utk sorting.
  // Buang yang kebetulan masih aktif (aktif menang).
  const expiredItems = expiredRaw
    .filter((e) => !activeCodes.has(e.code))
    .map((e) => ({ ...base, code: e.code, reward: null, date: e.date ?? null, status: "expired", perm: false }));

  return { items, expiredItems, stale };
}

export async function fetchWiki({ games, userAgent, log = () => {} }) {
  const covered = new Set();
  const items = [];
  const expiredItems = []; // objek kode kadaluarsa → mengisi arsip
  const expired = new Set(); // "game:code" kadaluarsa → memfilter dari aktif
  let failed = 0;

  await Promise.all(
    WIKI_IDS.filter((id) => games[id]).map(async (id) => {
      try {
        const { items: rows, expiredItems: dead, stale } = await fetchOne(id, games[id], userAgent);
        // Hanya wiki SEGAR yang "cover" (aman auto-arsip kode aktif yang hilang).
        // Wiki basi tetap menyumbang ARSIP, tapi tak dianggap otoritas aktif.
        if (!stale) covered.add(id);
        items.push(...rows);
        for (const it of dead) {
          expiredItems.push(it);
          expired.add(`${id}:${it.code}`);
        }
        if (stale) {
          log(`[${id}] · wiki basi — aktif di-skip, ${dead.length} kode arsip tetap diambil`);
        } else {
          log(`[${id}] ✓ ${rows.length} kode dari wiki (+${dead.length} ditandai expired → arsip)`);
        }
      } catch (err) {
        failed += 1;
        log(`[${id}] · wiki gagal: ${err.message} — kode lama dipertahankan`);
      }
    }),
  );

  return { items, covered, failed, expired, expiredItems };
}
