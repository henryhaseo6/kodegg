// Sumber kode crimsonwitch.com — tracker HoYo yang terurus rapi. Berguna untuk
// TIGA hal di atas seria/ennead:
//  1. CROSS-CHECK: sumber ke-3 untuk gi/hsr/zzz/hi3 (saling verifikasi).
//  2. TANGGAL: tiap kode punya start_date/added + expires → kode HoYo dapat
//     tanggal "Rilis" (API seria/ennead tak menyediakannya).
//  3. LIVESTREAM: slot kode livestream didaftarkan lebih dulu (code sementara
//     "LIVESTREAM CODE") lalu diisi kode asli saat siaran. Cron ~1 jam akan
//     menangkapnya otomatis; placeholder ber-spasi ditolak CODE_RE sampai terisi.
//
// Data ada sebagai JSON terstruktur di payload RSC Next.js (bukan HTML rapuh):
//   {"id":..,"code":"..","added":"..","start_date":"..","expires":"..",
//    "rewards":[{"item":"..","qty":N}],"region_locked":".."}
// Reward VERBATIM dari sini (item + qty apa adanya).

const SLUGS = {
  gi: "Genshin_Impact",
  hsr: "Honkai_Star_Rail",
  zzz: "Zenless_Zone_Zero",
  hi3: "Honkai_Impact_3rd",
  nikki: "Infinity_Nikki",
};
const CODE_RE = /^[A-Za-z0-9]{4,30}$/;

const field = (chunk, key) => chunk.match(new RegExp(`\\\\"${key}\\\\":\\\\"([^\\\\"]*)\\\\"`))?.[1] || null;

/** Pisah objek kode dari payload RSC & ekstrak field + reward terstruktur. */
function parseCodes(html) {
  const out = [];
  for (const chunk of html.split(/\{\\"id\\":/).slice(1)) {
    const code = field(chunk, "code");
    if (!code || !CODE_RE.test(code)) continue; // tolak "LIVESTREAM CODE" (spasi) dst
    const rw = chunk.match(/\\"rewards\\":\[([\s\S]*?)\](?=,\\"region_locked)/)?.[1] || "";
    const rewards = [...rw.matchAll(/\\"item\\":\\"([^\\"]*)\\",\\"qty\\":(\d+)/g)].map((m) => `${m[1]} ×${m[2]}`);
    out.push({
      code,
      start: field(chunk, "start_date") || field(chunk, "added"),
      expires: field(chunk, "expires"),
      region: field(chunk, "region_locked"),
      reward: rewards.join(" · ") || null,
    });
  }
  return out;
}

const iso = (s) => {
  const t = Date.parse(s ?? "");
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

async function fetchOne(id, slug, meta, ua, now) {
  const url = `https://www.crimsonwitch.com/codes/${slug}`;
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = parseCodes(await res.text());
  if (rows.length === 0) throw new Error("0 kode terparse — layout crimsonwitch berubah");

  const base = { game: id, gameName: meta.name, source: "crimsonwitch", sourceUrl: url, endsAt: null, claimUrl: null, perm: false };
  const items = [];
  const expiredItems = [];
  for (const r of rows) {
    if (/^(cn|china)$/i.test((r.region ?? "").trim())) continue; // khusus China → lewati
    const start = iso(r.start);
    if (start && Date.parse(start) > now) continue; // belum mulai (mis. livestream) → skip
    // `expires` crimsonwitch = timestamp PRESISI (dg jam+zona) → bandingkan
    // langsung, TANPA margin akhir-hari (margin hanya perlu utk tanggal tanpa jam).
    const expMs = r.expires ? Date.parse(r.expires) : null;
    const date = start;
    if (Number.isFinite(expMs) && expMs <= now) {
      expiredItems.push({ ...base, code: r.code, reward: r.reward, date, status: "expired" });
    } else {
      // Simpan endsAt (waktu kedaluwarsa presisi) utk kode berbatas waktu, mis.
      // kode livestream (~48 jam) → situs bisa tampilkan countdown "kadaluarsa
      // dalam". Kode tanpa expires (permanen/tak diketahui) tetap endsAt null.
      items.push({ ...base, code: r.code, reward: r.reward, date, endsAt: iso(r.expires), status: "active" });
    }
  }
  return { items, expiredItems };
}

export async function fetchCrimsonwitch({ games, userAgent, log = () => {} }) {
  const items = [];
  const expiredItems = [];
  const expired = new Set();
  const covered = new Set();
  let failed = 0;
  const now = Date.now();

  await Promise.all(
    Object.entries(SLUGS)
      .filter(([id]) => games[id])
      .map(async ([id, slug]) => {
        try {
          const { items: act, expiredItems: exp } = await fetchOne(id, slug, games[id], userAgent, now);
          covered.add(id);
          items.push(...act);
          for (const it of exp) {
            expiredItems.push(it);
            expired.add(`${id}:${it.code}`);
          }
          log(`[${id}] ✓ ${act.length} aktif + ${exp.length} expired dari crimsonwitch`);
        } catch (err) {
          failed += 1;
          log(`[${id}] · crimsonwitch gagal: ${err.message}`);
        }
      }),
  );

  return { items, expiredItems, expired, covered, failed };
}
