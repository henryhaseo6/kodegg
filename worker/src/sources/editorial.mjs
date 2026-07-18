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
const SITES = {
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
const GAMES_CFG = {
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
  // Blue Archive DI-HOLD: sumber melacak region berbeda (Global vs JP) →
  // daftar kodenya disjoint, irisan = 0. Tak bisa cross-check dengan andal.
  // CODM/PUBG/Free Fire DI-HOLD: CODM butuh tag region Garena/Global (sumber tak
  // melabelinya andal); PUBG kode 24-72 jam & cuma 1 sumber fresh; Free Fire kode
  // harian region-locked tanpa sumber fresh yang misahin aktif/expired.
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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
              const parsed = SITES[site].parse(await fetchHtml(SITES[site].url(slug)));
              if (parsed.active.length === 0) throw new Error("0 aktif terparse — layout berubah");
              return { site, slug, ...parsed };
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
        const primaryUrl = SITES[ok[0].site].url(cfg.sources[ok[0].site]);
        let nAct = 0;
        for (const [k, v] of votes) {
          if (v.count < 2) continue; // < mayoritas → buang (kemungkinan mati)
          if (expiredUnion.has(k)) continue; // ada sumber bilang expired → jangan aktif
          const { code, reward: rw } = pickCanonical(v.cands);
          const src = v.cands.find((c) => c.site === "pockettactics") ?? v.cands[0];
          items.push({
            ...base,
            code,
            reward: rw,
            status: "active",
            source: src.site,
            sourceUrl: SITES[src.site].url(cfg.sources[src.site]),
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
