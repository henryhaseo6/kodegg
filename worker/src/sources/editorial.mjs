// Sumber kode EDITORIAL dengan CROSS-CHECK ≥2 sumber.
//
// Untuk game yang TAK punya tracker cepat/terstruktur (mis. NIKKE) satu-satunya
// sumber adalah situs guide editorial. Masalahnya: tiap situs menyimpan kode
// LAMA di daftar "aktif"-nya (telat memindah ke Expired) → over-list kode mati.
// Yang penting: situs BERBEDA menyimpan kode mati yang BERBEDA.
//
// Solusi (aturan CLAUDE.md — akurasi): sebuah kode dianggap AKTIF hanya bila
// ≥2 sumber independen sama-sama melistnya sebagai aktif (mayoritas suara).
// Dengan 2 sumber = irisan. Kode mati yang nyangkut di satu sumber otomatis
// kefilter karena sumber lain sudah memindahnya ke Expired. Kode yang muncul di
// section Expired sumber MANA PUN → diarsipkan, tak pernah jadi aktif.
//
// Reward VERBATIM dari sumber; yang paling lengkap (bukan generik "free rewards")
// menang. Casing kode diambil dari pockettactics (selalu salah satu sumber →
// stabil lintas-run untuk codeKey). Situs editorial 403 ke bot-UA → pakai
// browser-UA. Tanpa tanggal per-kode → firstSeenAt diisi worker.
//
// Menambah game: tambah entri di GAMES_CFG dengan ≥2 slug situs. Menambah situs:
// tambah adapter di SITES (harus punya pemisah section aktif/expired yang jelas).

import { fetchAsBrowser } from "../http.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CODE_RE = /^[A-Za-z0-9]{4,30}$/;
// Kata umum yang sering ter-bold di artikel (bukan kode). Difilter agar tak
// terhitung sebagai kandidat kode. Aman untuk kode asli (nama kode game bukan
// kata kamus generik). Cross-check ≥2 sumber sudah menangkis kebanyakan noise;
// ini pengaman tambahan untuk kata yang kebetulan ter-bold di dua sumber.
const NOISE = /^(redeem|redeemed|redeeming|send|copy|active|expired|code|codes|new|note|settings|reward|rewards|click|here|open|enter|update|updated|free|gift|gifts|latest|working|valid|invalid|error|step|steps|tap|press|select|confirm|claim|login|account|server|region|global|garena)$/i;

function clean(s) {
  return (s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#8216;|&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Buang penanda pembuka & tag "(New)" lalu rapikan → reward siap-banding.
function reward(raw) {
  return clean(raw).replace(/\(new\)/gi, "").replace(/^[\s\-–—:]+/, "").trim();
}

// Reward "kosong makna" (tak menyebut item spesifik) → jangan dipakai kalau ada
// yang lebih lengkap; kalau semua generik → null (jangan mengarang isi).
function isGeneric(r) {
  return !r || /^(redeem[^.]*?for\s+)?(free\s+)?(in-?game\s+)?(rewards?|gifts?|goodies)$/i.test(r.trim());
}

// --- Adapter per situs. parse(html) → { active:[{code,reward}], expired:[code] } ---
// Tiap situs WAJIB punya batas section aktif↔expired yang jelas.
export const SITES = {
  pockettactics: {
    url: (slug) => `https://www.pockettactics.com/${slug}/codes`,
    parse(html) {
      const cut = html.search(/Expired codes/i);
      const aHtml = cut > 0 ? html.slice(0, cut) : html;
      const eHtml = cut > 0 ? html.slice(cut) : "";
      const active = [];
      for (const m of aHtml.matchAll(/<li>\s*<strong>([A-Za-z0-9]{4,30})<\/strong>([^<]*)/g)) {
        active.push({ code: m[1], reward: reward(m[2]) });
      }
      const expired = [];
      for (const m of eHtml.matchAll(/<li>\s*(?:<strong>)?([A-Za-z0-9]{4,30})(?:<\/strong>)?[^<]*<\/li>/g)) {
        expired.push(m[1]);
      }
      return { active, expired };
    },
  },
  progameguides: {
    url: (slug) => `https://progameguides.com/${slug}/`,
    parse(html) {
      const cut = html.search(/Codes\s*\(Expired\)/i);
      const aHtml = cut > 0 ? html.slice(0, cut) : html;
      const eHtml = cut > 0 ? html.slice(cut) : "";
      const grab = (h) => {
        const out = [];
        for (const m of h.matchAll(/<li><strong>([A-Za-z0-9]{4,30})<\/strong>([^<]*)/g)) {
          out.push({ code: m[1], reward: reward(m[2]) });
        }
        return out;
      };
      return { active: grab(aHtml), expired: grab(eHtml).map((x) => x.code) };
    },
  },
  pocketgamer: {
    // Struktur sama pockettactics: <li><strong>CODE</strong> - reward</li>,
    // batas section = heading "Expired codes".
    url: (slug) => `https://www.pocketgamer.com/${slug}/`,
    parse(html) {
      const cut = html.search(/Expired codes/i);
      const aHtml = cut > 0 ? html.slice(0, cut) : html;
      const eHtml = cut > 0 ? html.slice(cut) : "";
      const grab = (h) => {
        const out = [];
        for (const m of h.matchAll(/<li>\s*<strong>([A-Za-z0-9]{4,30})<\/strong>([^<]*)/g)) {
          out.push({ code: m[1], reward: reward(m[2]) });
        }
        return out;
      };
      return { active: grab(aHtml), expired: grab(eHtml).map((x) => x.code) };
    },
  },
  game8: {
    // URL artikelnya pakai id angka (/archives/304759) yang tak bisa ditebak dari
    // nama game → resolve() cari dulu artikel kode dari halaman hub. Judul artikel
    // diberi skor: daftar kode utama menang, halaman kode acara (livestream/
    // special program/collab) DIBUANG — isinya cuma kode sesaat, bukan daftar.
    //
    // Markup-nya paling enak dari semua situs editorial: kode ada di atribut
    // value input clipboard (bukan tebak-tebakan teks), reward di kolom sebelah,
    // dan section aktif↔expired dipisah heading. Kutipnya campur ' dan " → regex
    // menerima dua-duanya.
    resolve: async (slug) => {
      const hub = await fetchHtml(`https://game8.co/games/${slug}`);
      const skor = (t) => {
        const s = t.toLowerCase();
        if (/livestream|special program|collab|version \d/.test(s)) return 0;
        if (/all .*redeem codes|redeem codes list|codes list/.test(s)) return 3;
        if (/all codes|redeem codes/.test(s)) return 2;
        return /\bcodes\b/.test(s) ? 1 : 0;
      };
      const pilih = [...hub.matchAll(/href=["'](\/games\/[^"']+\/archives\/\d+)["'][^>]*>([^<]{0,70})/g)]
        .map((m) => ({ url: m[1], skor: skor(m[2]) }))
        .filter((k) => k.skor > 0)
        .sort((a, b) => b.skor - a.skor)[0];
      if (!pilih) throw new Error("artikel kode tak ditemukan di hub game8");
      return `https://game8.co${pilih.url}`;
    },
    parse(html) {
      const heads = [...html.matchAll(/<h[23][^>]*>([\s\S]{0,90}?)<\/h[23]>/g)];
      const mulai = heads.find((h) => /active/i.test(h[1]) && /code/i.test(h[1])) ?? heads.find((h) => /redeem codes?/i.test(h[1]));
      if (!mulai) return { active: [], expired: [] };
      const akhir = heads.find((h) => h.index > mulai.index && /expired/i.test(h[1]));
      const sec = html.slice(mulai.index, akhir ? akhir.index : mulai.index + 20000);
      const active = [];
      for (const m of sec.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const kode = /a-clipboard__textInput[^>]*value=["']([A-Za-z0-9]{4,30})["']/.exec(m[1]);
        if (!kode) continue;
        const td = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => clean(x[1].replace(/<input[^>]*>/g, "")));
        active.push({ code: kode[1], reward: reward(td[1] ?? "") || null });
      }
      const expSec = akhir ? html.slice(akhir.index, akhir.index + 20000) : "";
      const expired = [...expSec.matchAll(/a-clipboard__textInput[^>]*value=["']([A-Za-z0-9]{4,30})["']/g)].map((m) => m[1]);
      return { active, expired };
    },
  },
  dexerto: {
    // Tabel: <td>…<strong>CODE</strong>…</td>. Reward di kolom terpisah
    // (diabaikan; diambil dari sumber lain berformat "CODE - reward"). Heading
    // "Active/Expired codes" muncul BERKALI-KALI (nav/intro) → tak bisa slice
    // pakai kemunculan pertama. Strategi: kumpulkan semua <strong>CODE</strong>
    // berposisi; batas = heading "expired codes" PERTAMA setelah kode pertama.
    url: (slug) => `https://www.dexerto.com/${slug}/`,
    parse(html) {
      const codes = [...html.matchAll(/<strong>([A-Za-z0-9]{4,30})<\/strong>/g)].map((m) => ({ code: m[1], pos: m.index }));
      if (codes.length === 0) return { active: [], expired: [] };
      const expHeads = [...html.matchAll(/expired\s+codes/gi)].map((m) => m.index);
      const boundary = expHeads.find((p) => p > codes[0].pos) ?? Infinity;
      return {
        active: codes.filter((c) => c.pos < boundary).map((c) => ({ code: c.code, reward: null })),
        expired: codes.filter((c) => c.pos >= boundary).map((c) => c.code),
      };
    },
  },
};

// --- Registry game editorial: id → slug per situs (butuh ≥2). ---
export const GAMES_CFG = {
  gov: {
    // Goddess of Victory: NIKKE (id "nikke" sudah dipakai Infinity Nikki)
    sources: {
      pockettactics: "nikke",
      progameguides: "nikke-goddess-of-victory/goddess-of-victory-nikke-codes",
    },
  },
  mlbb: {
    // Mobile Legends — kode claim-limited (umur panjang). PocketGamer + Dexerto
    // dua-duanya fresh & misahin aktif/expired; irisan = kode yang dua-duanya
    // sepakat aktif (mencegah kode yang mati karena cap-redeem penuh bocor).
    sources: {
      pocketgamer: "mobile-legends-bang-bang/redeem-codes",
      dexerto: "gaming/mobile-legends-bang-bang-codes-ml-diamonds-magic-dust-1740586",
    },
  },
  sdsgc: {
    // 7DS: Grand Cross — punya portal coupon Netmarble; daftar kode dari dua situs
    // editorial (validity panjang). HATI-HATI beda dari "7DS: Origin".
    sources: { pocketgamer: "the-seven-deadly-sins-grand-cross/codes", pockettactics: "seven-deadly-sins-grand-cross" },
  },
  wuwa: {
    // Wuthering Waves — sudah punya wuwastatus (tracker khusus), ini lapis kedua:
    // saat wuwastatus 403/berubah layout, kode tetap masuk lewat cross-check.
    sources: { progameguides: "wuthering-waves/wuthering-waves-codes", pocketgamer: "wuthering-waves/codes", game8: "Wuthering-Waves" },
  },
  nte: {
    // Neverness to Everness — pendamping redeem-code-tracker. game8 & pocketgamer
    // sama-sama menyertakan reward, jadi datanya lebih kaya dari tracker.
    sources: { game8: "Neverness-to-Everness", pocketgamer: "neverness-to-everness/codes" },
  },
  // HoYo (gi/hsr/zzz): API resmi tetap sumber utama & paling tepercaya. Pasangan
  // editorial ini lapis tambahan supaya kode livestream/acara yang belum masuk API
  // tetap tertangkap — tetap wajib ≥2 sumber sepakat, jadi tak menurunkan akurasi.
  gi: { sources: { game8: "Genshin-Impact", pocketgamer: "genshin-impact/codes" } },
  hsr: { sources: { game8: "Honkai-Star-Rail", progameguides: "honkai-star-rail/honkai-star-rail-codes" } },
  zzz: { sources: { game8: "Zenless-Zone-Zero", pocketgamer: "zenless-zone-zero/codes" } },
  drr: {
    // Dragon Raja: ReRise — cross-check pendamping redeem-code-tracker.
    sources: { progameguides: "dragon-raja-rerise/dragon-raja-rerise-codes", pocketgamer: "dragon-raja-rerise/codes" },
  },
  // Guardian Tales (gtales) DI-HOLD: dihapus dari redeem-code-tracker (404 sejak
  // ~21 Jul 2026) dan tak ada 2 sumber editorial yang bisa dipakai — progameguides
  // OK, tapi pocketgamer/guardian-tales/codes terparse 0 (layoutnya beda) dan
  // pockettactics tak punya halaman kode (cuma hub game). Cross-check butuh ≥2,
  // jadi gamenya sementara tanpa sumber hidup. Aktifkan lagi bila ada sumber kedua.
  // Blue Archive DI-HOLD: sumber melacak region berbeda (Global vs JP) →
  // daftar kodenya disjoint, irisan = 0. Tak bisa cross-check dengan andal.
  // CODM/PUBG/Free Fire DI-HOLD: CODM butuh tag region Garena/Global (sumber tak
  // melabelinya andal); PUBG kode 24-72 jam & cuma 1 sumber fresh; Free Fire kode
  // harian region-locked tanpa sumber fresh yang misahin aktif/expired.
};

// fetchAsBrowser: header ala browser + retry lewat proxy Cloudflare bila 403/429
// (beberapa situs editorial memblokir rentang IP GitHub Actions — lihat http.mjs).
async function fetchHtml(url) {
  const res = await fetchAsBrowser(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Casing kanonik + reward VERBATIM. pockettactics diutamakan (tracker utama,
// frasa reward paling konsisten/detail); baru fallback ke reward terpanjang
// non-generik dari sumber lain. Semua kandidat sama-sama verbatim dari sumbernya.
function pickCanonical(cands) {
  const pt = cands.find((c) => c.site === "pockettactics");
  const code = (pt || cands[0]).code;
  if (pt && pt.reward && !isGeneric(pt.reward)) return { code, reward: pt.reward };
  const rewards = cands
    .map((c) => c.reward)
    .filter((r) => r && !isGeneric(r))
    .sort((a, b) => b.length - a.length);
  return { code, reward: rewards[0] || null };
}

export async function fetchEditorial({ games, log = () => {} }) {
  const items = [];
  const expiredItems = [];
  const expired = new Set();
  const covered = new Set();
  let failed = 0;

  await Promise.all(
    Object.entries(GAMES_CFG)
      .filter(([id]) => games[id])
      .map(async ([id, cfg]) => {
        const meta = games[id];
        const results = await Promise.all(
          Object.entries(cfg.sources).map(async ([site, slug]) => {
            try {
              // Situs dengan URL artikel tak-tertebak (game8: /archives/<id>)
              // menyediakan resolve() async utk mencari halaman kodenya dulu.
              const url = SITES[site].resolve ? await SITES[site].resolve(slug) : SITES[site].url(slug);
              const parsed = SITES[site].parse(await fetchHtml(url));
              if (parsed.active.length === 0) throw new Error("0 aktif terparse — layout berubah");
              return { site, slug, url, ...parsed };
            } catch (err) {
              log(`[${id}] · ${site} gagal: ${err.message}`);
              return null;
            }
          }),
        );
        const ok = results.filter(Boolean);
        // Butuh ≥2 sumber agar cross-check bermakna. <2 → jangan tegaskan aktif
        // dari satu sumber (over-list bocor). Game tak di-cover → kode lama
        // dipertahankan worker, tidak diarsipkan massal.
        if (ok.length < 2) {
          failed += 1;
          log(`[${id}] · cross-check batal — hanya ${ok.length} sumber OK (butuh ≥2)`);
          return;
        }

        // Hitung suara "aktif" per kode + kumpulkan section expired (union).
        const votes = new Map(); // UPPER → { count, cands:[{code,reward,site}] }
        for (const r of ok) {
          for (const { code, reward: rw } of r.active) {
            if (!CODE_RE.test(code) || NOISE.test(code)) continue;
            const k = code.toUpperCase();
            const v = votes.get(k) || { count: 0, cands: [] };
            v.count += 1;
            v.cands.push({ code, reward: rw, site: r.site });
            votes.set(k, v);
          }
        }
        const expiredUnion = new Set();
        for (const r of ok) for (const c of r.expired) if (CODE_RE.test(c)) expiredUnion.add(c.toUpperCase());

        const base = { game: id, gameName: meta.name, claimUrl: meta.redeemUrl ?? null, perm: false };
        // URL dipakai dari hasil fetch (game8 URL-nya di-resolve, tak bisa dihitung ulang).
        const urlOf = (site) => ok.find((r) => r.site === site)?.url ?? SITES[site].url?.(cfg.sources[site]) ?? null;
        const primaryUrl = urlOf(ok[0].site);
        let nAct = 0;
        for (const [k, v] of votes) {
          if (v.count < 2) continue; // < mayoritas → buang (kemungkinan mati)
          if (expiredUnion.has(k)) continue; // ada sumber bilang expired → jangan aktif
          const { code, reward: rw } = pickCanonical(v.cands);
          const src = v.cands.find((c) => c.site === "pockettactics") ?? v.cands[0];
          // Kredit SEMUA sumber yang ikut menyuarakan kode ini aktif (bukan cuma
          // pemenang reward) — atribusi cross-check jujur & footer auto-list lengkap.
          const sites = [...new Set(v.cands.map((c) => c.site))];
          items.push({
            ...base,
            code,
            reward: rw,
            status: "active",
            source: src.site,
            sourceUrl: urlOf(src.site),
            sources: sites,
            sourceUrls: Object.fromEntries(sites.map((s) => [s, urlOf(s)])),
          });
          nAct += 1;
        }
        // Kode di section Expired sumber mana pun → arsip (database kode mati).
        for (const k of expiredUnion) {
          expiredItems.push({ ...base, code: k, reward: null, status: "expired", source: "editorial", sourceUrl: primaryUrl });
          expired.add(`${id}:${k}`);
        }

        covered.add(id);
        log(`[${id}] ✓ ${nAct} aktif (cross-check ${ok.length} sumber: ${ok.map((r) => r.site).join("+")}), ${expiredUnion.size} arsip`);
      }),
  );

  return { items, expiredItems, expired, covered, failed };
}
