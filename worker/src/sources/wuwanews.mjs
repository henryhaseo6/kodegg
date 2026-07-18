// Sumber BERITA resmi Wuthering Waves — API website Kuro Games (publik, JSON,
// tanpa login). Situs HTML-nya JS-SPA, tapi datanya di CDN JSON:
//   ArticleMenu.json          → daftar artikel (id, judul, tipe, createTime)
//   article/<id>.json         → isi penuh per artikel (HTML)
// articleType: 57=News (basi sejak 2024), 58=Notice (feed hidup). Kita pakai
// Notice sebagai berita resmi (event preview, update versi, profil karakter/
// musuh, dll), buang notis rutin (maintenance/FAQ/kompensasi) yang bukan berita.
//
// Hanya locale `en` yang tersedia di CDN ini (id/ja 404) → judul/cuplikan EN
// dipakai untuk kedua bahasa (tak ada versi ID resmi; nama event/karakter pun
// tetap dibiarkan verbatim sesuai CLAUDE.md). Tanggal = createTime (server Kuro,
// UTC+8). Kode redeem TIDAK ada di sini (diumumkan via livestream/social →
// sudah ditangani sources/wuwastatus.mjs), jadi modul ini murni berita.

const BASE = "https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en";
const LIST_URL = `${BASE}/ArticleMenu.json`;
const article = (id) => `${BASE}/article/${id}.json`;
const ARTICLE_URL = (id) => `https://wutheringwaves.kurogames.com/en/main/news/detail/${id}`;

const CUTOFF = 60 * 86400000; // ambil ~60 hari; fetch-news terapkan cutoff aktif/arsipnya sendiri
const CAP = 40; // batas fetch isi per-artikel (idempoten, per-jam)
// Notis rutin yang BUKAN berita — dibuang biar feed bersih.
const DENY = /maintenance|compensation|top-?up|refund|FAQ|survey|known issues?/i;

const strip = (s) => {
  let x = (s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  x = x
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|span|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "");
  x = x
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&\w+;/g, " ");
  return x.replace(/\s+/g, " ").trim();
};

const firstImg = (html) => {
  const m = (html ?? "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
};

/** "2026-07-15 17:48:36" (server Kuro, UTC+8) → ISO. */
const toISO = (s) => {
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T") + "+08:00");
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

async function getJSON(url, ua) {
  const r = await fetch(url, { headers: { "User-Agent": ua } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchWuwaNews({ games, userAgent, log = () => {} }) {
  if (!games?.wuwa) return [];
  let list;
  try {
    list = await getJSON(LIST_URL, userAgent);
  } catch (err) {
    log(`[wuwa] · berita Kuro gagal: ${err.message}`);
    return [];
  }

  const now = Date.now();
  const recent = (Array.isArray(list) ? list : [])
    .filter((a) => a.articleType === 58 || a.articleType === 57)
    .filter((a) => a.articleTitle && !DENY.test(a.articleTitle))
    .map((a) => ({ ...a, ms: Date.parse((a.createTime ?? "").replace(" ", "T") + "+08:00") || 0 }))
    .filter((a) => a.ms && now - a.ms <= CUTOFF)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, CAP);

  const items = await Promise.all(
    recent.map(async (a) => {
      let html = a.articleContent ?? "";
      try {
        const d = await getJSON(article(a.articleId), userAgent);
        html = d.articleContent ?? html;
      } catch {
        /* pakai preview dari list bila detail gagal */
      }
      const text = strip(html);
      const title = strip(a.articleTitle);
      return {
        game: "wuwa",
        gameName: games.wuwa.name,
        title: { en: title, id: title },
        excerpt: { en: text.slice(0, 180), id: text.slice(0, 180) },
        image: firstImg(html) || a.suggestCover || null,
        url: ARTICLE_URL(a.articleId),
        source: "Wuthering Waves",
        publishedAt: toISO(a.createTime),
      };
    }),
  );

  log(`[wuwa] ✓ ${items.length} berita resmi dari Kuro Games`);
  return items;
}
