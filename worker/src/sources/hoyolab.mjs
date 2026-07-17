// Sumber HoYoLAB — post RESMI HoYoverse via API backend web-nya (publik, tanpa
// login). Menutup game yang API-nya tak ada (HI3, Tears of Themis) dan menambah
// berita resmi untuk semua game HoYo.
//
// DUA keluaran:
//  1. Berita resmi (fetchHoyolabNews) — judul, cuplikan, cover, tautan ke
//     HoYoLAB, tanggal post. Post TIDAK punya tanggal berakhir terstruktur →
//     disajikan sebagai berita (bukan event-countdown), jujur apa adanya.
//  2. Kode redeem hasil mining (fetchHoyolabCodes) — sebagian post memuat kode
//     (mis. HI3 [TimeAlbum]). Diekstrak dg pola KETAT dari post BARU saja
//     (<=14 hari), sehingga otomatis lepas (terarsip) saat sudah lama.

const API = "https://bbs-api-os.hoyolab.com/community/post/wapi/getNewsList";
const HEADERS = (ua, lang = "en-us") => ({ "User-Agent": ua, "x-rpc-language": lang, Referer: "https://www.hoyolab.com/" });

// game id kita → gid HoYoLAB
const GID = { gi: 2, hsr: 6, zzz: 8, hi3: 1, tot: 4 };

const strip = (s) => {
  let x = (s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  x = x.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
  x = x.replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/&\w+;/g, " ");
  return x.replace(/\s+/g, " ").trim();
};

async function getPosts(gid, type, ua, lang = "en-us") {
  const r = await fetch(`${API}?gids=${gid}&page_size=15&type=${type}`, { headers: HEADERS(ua, lang) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d.retcode !== 0) throw new Error(`retcode ${d.retcode}`);
  return d.data?.list ?? [];
}

// Peta post_id → post versi Indonesia (untuk melengkapi judul/isi ID resmi).
async function idIndex(gid, types, ua) {
  const lists = await Promise.all(types.map((t) => getPosts(gid, t, ua, "id-id").catch(() => [])));
  const map = new Map();
  for (const it of lists.flat()) if (it.post?.post_id) map.set(it.post.post_id, it.post);
  return map;
}

const cover = (it) => it.cover?.url || it.image_list?.[0]?.url || it.cover_list?.[0]?.url || null;
const postUrl = (p) => `https://www.hoyolab.com/article/${p.post_id}`;
const pad = (n) => String(n).padStart(2, "0");

// Parse baris "Event Period: 2026/7/17 11:00 - 8/21 04:00 (UTC+9)" → {start,end}
// ISO. Toleran: jam & UTC opsional (default 00:00–23:59, UTC+8), tahun END
// kadang diomit (di-wrap dari start), tanda kurung bisa full-width.
export function parsePeriod(text) {
  const m = (text ?? "").match(
    /event\s*(?:period|duration|time)[^\d]{0,10}(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\s*[-–—~]\s*(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\s*[（(]?\s*(?:UTC\s*([+-]?\d{1,2}))?/i,
  );
  if (!m) return null;
  const [, sy, sM, sD, sh, sm, ey0, eM, eD, eh, em, tz] = m;
  let ey = ey0 ? +ey0 : +sy;
  if (!ey0 && (+eM < +sM || (+eM === +sM && +eD < +sD))) ey = +sy + 1; // tahun end diomit
  const off = (tz && tz[0] === "-" ? "-" : "+") + pad(Math.abs(tz ? +tz : 8)) + ":00";
  const iso = (y, mo, d, h, mi) => {
    const t = Date.parse(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00${off}`);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  };
  const start = iso(sy, sM, sD, sh ?? 0, sm ?? 0);
  const end = iso(ey, eM, eD, eh ?? 23, em ?? 59);
  return start && end ? { start, end } : null;
}

const cleanTitle = (s) =>
  strip(s)
    .replace(/[✦✧🎁🎂🎉🎊🎈│|【】]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// ---------- BERITA ----------
// type 1 (info/versi) + type 3 (notice/video) = BERITA. type 2 = tab "Events"
// HoYoLAB → ditangani sebagai EVENT (bukan berita). Post ber-"Event Period" yang
// nyasar ke type 1/3 juga dibuang dari berita (jadi event).
export async function fetchHoyolabNews({ games, userAgent, log = () => {} }) {
  const MAX_AGE = 45 * 86400000; // post <=45 hari
  const nowMs = Date.now();
  const byUrl = new Map();

  await Promise.all(
    Object.entries(GID)
      .filter(([id]) => games[id])
      .map(async ([id, gid]) => {
        try {
          const [en1, en3, idMap] = await Promise.all([
            getPosts(gid, 1, userAgent),
            getPosts(gid, 3, userAgent),
            idIndex(gid, [1, 3], userAgent), // versi Indonesia resmi
          ]);
          for (const it of [...en1, ...en3]) {
            const p = it.post;
            if (!p?.subject || !p.post_id) continue;
            const ts = (p.created_at ?? 0) * 1000;
            if (!ts || nowMs - ts > MAX_AGE) continue;
            if (parsePeriod(strip(p.content))) continue; // event → halaman Event
            const url = postUrl(p);
            if (byUrl.has(url)) continue;
            const idp = idMap.get(p.post_id);
            byUrl.set(url, {
              game: id,
              gameName: games[id].name,
              // Bilingual: judul/cuplikan ID resmi bila ada, kalau tidak pakai EN.
              title: { en: strip(p.subject), id: strip(idp?.subject) || strip(p.subject) },
              excerpt: {
                en: strip(p.content).slice(0, 180),
                id: (strip(idp?.content) || strip(p.content)).slice(0, 180),
              },
              image: cover(it),
              url, // situs menambah ?lang= sesuai bahasa halaman
              source: "HoYoLAB",
              publishedAt: new Date(ts).toISOString(),
            });
          }
          log(`[${id}] ✓ berita HoYoLAB (EN+ID)`);
        } catch (err) {
          log(`[${id}] · HoYoLAB berita gagal: ${err.message}`);
        }
      }),
  );
  return [...byUrl.values()];
}

// Detail post — SATU-SATUNYA tempat event_start_date/event_end_date terisi
// (di getNewsList selalu 0). Timestamp Unix (detik).
async function getPostFull(pid, ua) {
  const r = await fetch(`https://bbs-api-os.hoyolab.com/community/post/wapi/getPostFull?post_id=${pid}`, { headers: HEADERS(ua) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).data?.post?.post ?? null;
}

// ---------- EVENT ----------
// Semua game HoYo. DUA sinyal digabung karena tak ada yang lengkap sendiri:
//  1. type 2 = tab "Events" HoYoLAB → tanggal TERSTRUKTUR via getPostFull
//     (mis. ZZZ "Prize Event" — kontennya tak menulis "Event Period").
//  2. Post ber-"Event Period" di konten (type berapa pun) → mis. ToT "Splash
//     Reveries" yang tak punya tanggal terstruktur.
// fetch-events.mjs menyaring yang masih berlangsung (endsAt > now).
export async function fetchHoyolabEvents({ games, userAgent, log = () => {} }) {
  const out = [];
  await Promise.all(
    Object.entries(GID)
      .filter(([id]) => games[id])
      .map(async ([id, gid]) => {
        try {
          const [type2, info, idMap] = await Promise.all([
            getPosts(gid, 2, userAgent),
            Promise.all([getPosts(gid, 1, userAgent), getPosts(gid, 3, userAgent)]).then((a) => a.flat()),
            idIndex(gid, [1, 2, 3], userAgent), // versi Indonesia resmi
          ]);
          const byTitle = new Map();
          const add = (it, start, end) => {
            const p = it.post;
            const title = cleanTitle(p.subject);
            if (!title || !end || byTitle.has(title)) return;
            const ts = (p.created_at ?? 0) * 1000;
            const idp = idMap.get(p.post_id);
            byTitle.set(title, {
              game: id,
              gameName: games[id].name,
              type: "event",
              typeName: null,
              // Bilingual: judul/deskripsi ID resmi bila ada.
              title: { en: title, id: cleanTitle(idp?.subject) || title },
              subtitle: "",
              desc: {
                en: strip(p.content).slice(0, 240),
                id: (strip(idp?.content) || strip(p.content)).slice(0, 240),
              },
              image: cover(it),
              startsAt: start,
              endsAt: end,
              postedAt: ts ? new Date(ts).toISOString() : start, // tanggal POST (untuk urut feed)
              characters: [],
              weapons: [],
              rewards: [],
              source: "HoYoLAB",
              url: postUrl(p),
            });
          };

          // (1) type 2 → tanggal terstruktur, fallback "Event Period".
          await Promise.all(
            type2.map(async (it) => {
              const p = it.post;
              if (!p?.subject || !p.post_id) return;
              let start = null;
              let end = null;
              try {
                const f = await getPostFull(p.post_id, userAgent);
                const s = Number(f?.event_start_date) || 0;
                const e = Number(f?.event_end_date) || 0;
                if (e > 0) {
                  start = new Date(s * 1000).toISOString();
                  end = new Date(e * 1000).toISOString();
                }
              } catch {
                /* fallback ke konten di bawah */
              }
              if (!end) {
                const per = parsePeriod(strip(p.content));
                if (per) ({ start, end } = per);
              }
              add(it, start, end);
            }),
          );

          // (2) type 1/3 dengan "Event Period" (event yang nyasar ke info/notice).
          for (const it of info) {
            const p = it.post;
            if (!p?.subject) continue;
            const per = parsePeriod(strip(p.content));
            if (per) add(it, per.start, per.end);
          }

          out.push(...byTitle.values());
          log(`[${id}] ✓ ${byTitle.size} event dari HoYoLAB`);
        } catch (err) {
          log(`[${id}] · HoYoLAB event gagal: ${err.message}`);
        }
      }),
  );
  return out;
}

// ---------- MINING KODE ----------
// KETAT & konservatif: token dalam [kurung]/"kutip" yang di DEKATNYA (≤40 char
// sebelumnya) ada kata "code/redeem/gift". Kurung + konteks-kode = sinyal kuat,
// false-positive rendah. Case-insensitive (kode HoYo bisa mixed-case, mis. TimeAlbum).
const RE_ENCLOSED = /[\[「"']([A-Za-z0-9]{6,20})[\]」"']/g;
const RE_REWARD = /(\d[\d,]*\s+(?:crystals?|stellar jade|primogems?|polychromes?|asterite|jades?))/i;

export function mineCodes(text) {
  const out = new Map();
  for (const m of text.matchAll(RE_ENCLOSED)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!/\b(code|redeem|redemption|gift)\b/i.test(before)) continue;
    const code = m[1];
    if (out.has(code)) continue;
    const rewardM = text.match(RE_REWARD);
    out.set(code, { code, reward: rewardM ? rewardM[1] : null });
  }
  return out;
}

export async function fetchHoyolabCodes({ games, userAgent, log = () => {} }) {
  const MAX_AGE = 14 * 86400000; // hanya post SANGAT baru (proxy "masih aktif")
  const nowMs = Date.now();
  const covered = new Set();
  const items = [];

  await Promise.all(
    Object.entries(GID)
      .filter(([id]) => games[id])
      .map(async ([id, gid]) => {
        try {
          const posts = (await Promise.all([getPosts(gid, 1, userAgent), getPosts(gid, 2, userAgent)])).flat();
          const byCode = new Map();
          for (const it of posts) {
            const p = it.post;
            const ts = (p?.created_at ?? 0) * 1000;
            if (!ts || nowMs - ts > MAX_AGE) continue;
            for (const [code, r] of mineCodes(strip(p.content))) {
              if (!byCode.has(code)) byCode.set(code, r);
            }
          }
          // Sumber ini SUKSES (posts terbaca) → covered, meski 0 kode.
          covered.add(id);
          for (const r of byCode.values()) {
            items.push({
              game: id,
              gameName: games[id].name,
              code: r.code,
              reward: r.reward,
              status: "active",
              perm: false,
              endsAt: null,
              claimUrl: null,
              source: "HoYoLAB",
              sourceUrl: "https://www.hoyolab.com/",
            });
          }
          if (byCode.size) log(`[${id}] ✓ ${byCode.size} kode dari HoYoLAB`);
        } catch (err) {
          log(`[${id}] · HoYoLAB kode gagal: ${err.message}`);
        }
      }),
  );
  return { items, covered, failed: 0 };
}
