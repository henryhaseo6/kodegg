// KodeGG — worker EVENT & BANNER → data/events.json (untuk halaman Event).
//
// Sumber: API PENGUMUMAN RESMI HoYoverse (yang dipakai in-game menampilkan
// daftar event). Publik, tanpa login. Jauh lebih lengkap dari agregator:
// judul, subjudul, banner resmi, deskripsi penuh, dan tanggal MULAI + BERAKHIR.
//   getAnnList    → daftar (judul, banner, tanggal, kategori)
//   getAnnContent → isi/deskripsi per ann_id
//
// Cakupan: Genshin, Honkai: Star Rail, Zenless Zone Zero.
// Waktu server HoYo (region Asia) = UTC+8; dikonversi ke ISO.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES as REGISTRY } from "./src/games.mjs";
import { fetchHoyolabEvents } from "./src/sources/hoyolab.mjs";

const evKey = (e) => `${e.game}:${typeof e.title === "object" ? e.title.en : e.title}`;
const ARCHIVE_CAP = 200; // maks item arsip yang disimpan (terbaru menang)
const ARCHIVE_MAX_AGE = 180 * 86400000; // arsip disimpan hingga 180 hari

async function readPrevious(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { events: [], archive: [] };
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/events.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Endpoint per game (getAnnList & getAnnContent beda base per game).
const GAMES = {
  gi: {
    name: "Genshin Impact",
    base: "https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api",
    q: "game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global&platform=pc&region=os_asia&level=60&uid=1",
  },
  hsr: {
    name: "Honkai: Star Rail",
    base: "https://sg-hkrpg-api.hoyoverse.com/common/hkrpg_global/announcement/api",
    q: "game=hkrpg&game_biz=hkrpg_global&lang=en&bundle_id=hkrpg_global&platform=pc&region=prod_official_asia&level=70&uid=1",
  },
  zzz: {
    name: "Zenless Zone Zero",
    base: "https://sg-announcement-api.hoyoverse.com/common/nap_global/announcement/api",
    q: "game=nap&game_biz=nap_global&lang=en&bundle_id=nap_global&platform=pc&region=prod_gf_jp&level=60&uid=1",
  },
};

const BANNER_RE = /wish|warp|banner|convene|signal search|channel|drive|w-engine|exclusive channel/i;

// Bersihkan teks konten HoYo. PENTING: sebagian tag di-encode (&lt;t&gt;),
// jadi entity dibuka DULU agar tag-nya benar-benar terhapus (bukan menyisakan
// 't class="t_gl"'). Baru sisanya di-decode.
const strip = (s) => {
  let x = (s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  x = x
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|t|tr|td|span|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, ""); // hapus semua tag
  x = x
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&\w+;/g, " ");
  return x.replace(/\s+/g, " ").trim();
};

/** "2026-07-01 07:00:00" (server Asia, UTC+8) → ISO. */
const toISO = (s) => {
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T") + "+08:00");
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d.retcode !== 0) throw new Error(`retcode ${d.retcode}`);
  return d.data;
}

async function fetchGame(id, meta) {
  const qId = meta.q.replace("lang=en", "lang=id"); // versi Indonesia resmi
  const [list, content, listId, contentId] = await Promise.all([
    getJSON(`${meta.base}/getAnnList?${meta.q}`),
    getJSON(`${meta.base}/getAnnContent?${meta.q}`),
    getJSON(`${meta.base}/getAnnList?${qId}`).catch(() => null),
    getJSON(`${meta.base}/getAnnContent?${qId}`).catch(() => null),
  ]);

  // Peta ann_id → teks (EN & ID resmi).
  const descEn = new Map();
  const descId = new Map();
  for (const c of content.list ?? []) descEn.set(c.ann_id, strip(c.content));
  for (const c of contentId?.list ?? []) descId.set(c.ann_id, strip(c.content));
  const titleId = new Map();
  const subId = new Map();
  for (const group of listId?.list ?? [])
    for (const e of group.list ?? []) {
      titleId.set(e.ann_id, strip(e.title));
      subId.set(e.ann_id, strip(e.subtitle));
    }

  const FAR = Date.now() + 400 * 86400000; // ambang "permanen" (berakhir >400 hari)
  const out = [];
  for (const group of list.list ?? []) {
    // Grup "Game" (khusus Genshin) = notice/info: Version Details, Top-Up Center,
    // Fair Use, Community, Survey, dll — BUKAN event/banner. Game lain (HSR/ZZZ)
    // menaruh semua di satu grup, jadi tak punya grup ini → tak terpengaruh.
    if (/^game$/i.test(group.type_label ?? "")) continue;
    for (const e of group.list ?? []) {
      if (!e.banner) continue; // tanpa banner = notis teks (maintenance dsb) → skip
      // Pengumuman PERMANEN (berakhir 2030/2035) = notice tetap, bukan event.
      const endMs = Date.parse(toISO(e.end_time) ?? "");
      if (Number.isFinite(endMs) && endMs > FAR) continue;
      const title = strip(e.title);
      const sub = strip(e.subtitle);
      const tag = `${e.tag_label ?? ""} ${group.type_label ?? ""}`;
      const isBanner = BANNER_RE.test(title) || BANNER_RE.test(sub) || /卡池/.test(tag);
      out.push({
        game: id,
        gameName: meta.name,
        type: isBanner ? "banner" : "event",
        typeName: group.type_label ?? null,
        title: { en: title, id: titleId.get(e.ann_id) || title },
        subtitle: { en: sub, id: subId.get(e.ann_id) || sub },
        desc: { en: descEn.get(e.ann_id) || sub, id: descId.get(e.ann_id) || descEn.get(e.ann_id) || sub },
        image: e.banner,
        startsAt: toISO(e.start_time),
        endsAt: toISO(e.end_time),
        postedAt: toISO(e.start_time),
        characters: [],
        weapons: [],
        rewards: [],
        source: "HoYoverse",
      });
    }
  }
  return out;
}

async function main() {
  const now = new Date().toISOString();
  const nowMs = Date.now();

  const [apiResults, hoyolabEvents] = await Promise.all([
    Promise.all(
      Object.entries(GAMES).map(async ([id, meta]) => {
        try {
          return await fetchGame(id, meta);
        } catch (err) {
          console.error(`✗ ${id}: ${err.message}`);
          return [];
        }
      }),
    ),
    // Event hi3 & tot dari HoYoLAB (tak ada announcement API resmi).
    fetchHoyolabEvents({ games: REGISTRY, userAgent: UA, log: (m) => console.log(`  ${m}`) }).catch((err) => {
      console.error(`✗ hoyolab events: ${err.message}`);
      return [];
    }),
  ]);

  // Dedup per (game+judul), lalu pisah: BERLANGSUNG → aktif, BERAKHIR → arsip.
  const seen = new Set();
  const all = [...apiResults.flat(), ...hoyolabEvents]
    .filter((e) => e.endsAt)
    .filter((e) => {
      const k = evKey(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  // Aktif = masih berlangsung; urut cepat berakhir dulu (di feed nanti diurut lagi).
  const active = all.filter((e) => Date.parse(e.endsAt) > nowMs).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));

  // Arsip = event yang SUDAH berakhir, DIGABUNG dengan arsip run sebelumnya
  // (tak pernah dihapus sampai lewat 180 hari). Terbaru berakhir di depan.
  const prev = await readPrevious(OUT);
  const archMap = new Map();
  for (const e of prev.archive ?? []) archMap.set(evKey(e), e);
  for (const e of all)
    if (Date.parse(e.endsAt) <= nowMs) {
      const k = evKey(e);
      if (!archMap.has(k)) archMap.set(k, { ...e, archivedAt: now });
    }
  const archive = [...archMap.values()]
    .filter((e) => Date.parse(e.endsAt) > nowMs - ARCHIVE_MAX_AGE)
    .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))
    .slice(0, ARCHIVE_CAP);

  if (active.length === 0 && archive.length === 0) {
    console.error("✗ 0 event — events.json dibiarkan utuh");
    process.exit(1);
  }

  const payload = { updatedAt: now, counts: { active: active.length, archived: archive.length }, events: active, archive };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));
  const banners = active.filter((e) => e.type === "banner").length;
  console.log(`✓ data/events.json — ${active.length} aktif (${banners} banner, ${active.length - banners} event) + ${archive.length} arsip`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
