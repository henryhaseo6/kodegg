// Sumber kode redeem-code-tracker.com — tracker gacha/RPG multi-game yang
// terstruktur & cepat (near-daily/auto), pengganti wiki Fandom yang sering basi.
// Data ada di payload RSC Next.js (seperti crimsonwitch), objek kode berbentuk:
//   {"id":..,"value":"CODE","expiresAt":"ISO","rewards":[{"quantity","name"}],
//    "createdAt":"ISO","validityScore":..}
// value=kode, expiresAt=kadaluarsa (→ endsAt utk countdown), createdAt=tanggal
// rilis, rewards=[{qty,name}] verbatim. Aktif/expired dihitung dari expiresAt.
//
// Akses: situs 403 ke UA bot tapi 200 ke browser UA — worker kita kirim browser
// UA, jadi lolos. Nambah game = 1 entri SLUGS (slug = path /games/<slug>).

export const SLUGS = {
  afkj: "afk-journey",
  e7: "epic-seven",
  endfield: "arknights-endfield",
  nte: "nte",
  diablo: "diablo-immortal",
  afka: "afk-arena-classic",
  // gtales (Guardian Tales) DICABUT 21 Jul 2026: dihapus dari daftar game
  // redeem-code-tracker → /games/guardian-tales 404 tiap jam. Lihat catatan di
  // editorial.mjs untuk syarat mengaktifkannya kembali.
  mongil: "mongil-star-dive",
  dtrav: "dragon-traveler",
  sxs: "sword-x-staff",
  evernight: "ever-night-reawakening",
  isekai: "isekai-slow-life",
  loe: "legend-of-elements",
  starsail: "star-sailors",
  // Ditemukan bot pemantau sumber 21 Jul 2026 (parser sama, cukup tambah slug).
  // drr (Dragon Raja: ReRise) DIPASANG 12 Agu 2026 — syarat yang ditulis di sini
  // ("pasang bila trackernya sudah berisi") akhirnya terpenuhi: halamannya kini
  // memuat 6 kode ber-reward (GOLDENEYES, DR8888, DR6666, BS6666, SAKURA,
  // DRAGONRAJA). Dipasang sekarang karena pasangan cross-check editorialnya
  // TINGGAL SATU: progameguides membalas 403 ke semua klien (bukan cuma IP
  // GitHub Actions — dari IP rumah dengan UA browser pun 403), jadi drr sudah
  // beku ~10 hari di 1/2 sumber. Tracker adalah sumber PRIMER, tak butuh pasangan.
  drr: "dragon-raja-rerise",
  icre: "illusion-connect-re",
  tlon: "the-legend-of-neverland",
  afkac: "afk-arena-companions",
};
const CODE_RE = /^[A-Za-z0-9]{4,30}$/;

// Ambil nilai string field ter-escape (\"key\":\"value\") dari 1 chunk objek.
function field(chunk, key) {
  const marker = '\\"' + key + '\\":\\"';
  const i = chunk.indexOf(marker);
  if (i < 0) return null;
  const start = i + marker.length;
  const end = chunk.indexOf('\\"', start);
  return end < 0 ? null : chunk.slice(start, end);
}

/** Pisah objek kode dari payload RSC & ekstrak field + reward terstruktur. */
function parseCodes(html) {
  const out = [];
  for (const c of html.split('{\\"id\\":\\"').slice(1)) {
    const code = field(c, "value");
    if (!code || !CODE_RE.test(code)) continue;
    const rwMatch = c.match(/\\"rewards\\":\[([\s\S]*?)\]/);
    const rw = rwMatch ? rwMatch[1] : "";
    // `quantity` di sumber ini BUKAN angka murni — sebagiannya sudah membawa
    // penanda kalinya sendiri ("x20"), sebagian tidak ("20"). Menempelkan "×" ke
    // dua-duanya menghasilkan "Invite Letters ×x20": tanda kali dobel yang
    // tampil apa adanya di kartu situs DAN di layar video.
    //
    // Terhitung 13 Agu 2026: 110 kode di 14 game (Star Sailors 24, Isekai 16,
    // Mongil 13, Dragon Traveler 13, AFK Journey 8). Ketahuan justru saat naskah
    // VO membacakannya — "Diamonds kali x seribu" — karena teks yang dibaca
    // keras memaksa kita memperhatikan teks yang selama ini cuma dilewati mata.
    const rewards = [...rw.matchAll(/\\"quantity\\":\\"([^\\"]*)\\",\\"name\\":\\"([^\\"]*)\\"/g)].map(
      (m) => `${m[2]} ×${m[1].replace(/^\s*[×x]\s*/i, "")}`,
    );
    out.push({
      code,
      expiresAt: field(c, "expiresAt"),
      createdAt: field(c, "createdAt"),
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
  const url = `https://www.redeem-code-tracker.com/games/${slug}`;
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  // TEMBOK LOGIN. Tracker mulai menutup halaman game satu per satu: 307 ke
  // /login?callbackUrl=... . fetch() mengikuti redirect, jadi tanpa cek ini yang
  // diparse adalah halaman login — 0 kode, dan gejalanya menyamar sempurna jadi
  // "layout berubah". 27 Agu 2026 Diablo Immortal terbaca begitu selama 18 jam,
  // mengirim orang mencari parser rusak yang sebenarnya sehat.
  const tujuan = (() => { try { return new URL(res.url).pathname; } catch { return ""; } })();
  if (/^\/login(\/|$)/.test(tujuan)) throw new Error(`butuh login — dialihkan ke ${tujuan}`);
  // 404 = game DIHAPUS dari katalog tracker, bukan gangguan sesaat. Bedakan:
  // yang ini tak akan pulih sendiri & ujungnya keputusan pensiun (lihat
  // GAMES.pensiun di src/games.mjs), sementara 5xx cukup ditunggu.
  if (res.status === 404) throw new Error("HTTP 404 — game hilang dari katalog tracker");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = parseCodes(await res.text());
  // JANGAN klaim "layout berubah" dari satu game. Layout itu milik SITUS: kalau
  // benar berubah, semua game gagal bersamaan. Satu game 0 kode jauh lebih sering
  // berarti trackernya memang sedang tak punya kode aktif untuk game itu.
  // Kesimpulan sesitus ditarik di fetchRedeemTracker, setelah semua hasil masuk.
  if (rows.length === 0) throw new Error("0 kode terparse");

  const base = { game: id, gameName: meta.name, source: "redeem-code-tracker", sourceUrl: url, claimUrl: null, perm: false };
  const items = [];
  const expiredItems = [];
  for (const r of rows) {
    const expMs = r.expiresAt ? Date.parse(r.expiresAt) : null;
    const date = iso(r.createdAt);
    const endsAt = iso(r.expiresAt);
    if (Number.isFinite(expMs) && expMs <= now) {
      expiredItems.push({ ...base, code: r.code, reward: r.reward, date, endsAt, status: "expired" });
    } else {
      // Kode tanpa expiresAt → aktif tanpa endsAt (tak diketahui). endsAt hanya
      // di-set bila ada — biar countdown cuma untuk kode yg jelas berbatas waktu.
      items.push({ ...base, code: r.code, reward: r.reward, date, endsAt, status: "active" });
    }
  }
  return { items, expiredItems };
}

/** Tarik semua game yang di-cover redeem-code-tracker & ada di registry. */
export async function fetchRedeemTracker({ games, userAgent, log = () => {} }) {
  const items = [];
  const expiredItems = [];
  const expired = new Set();
  const covered = new Set();
  let failed = 0;
  const failedGames = []; // dinamai di annotation CI - "rct(1)" saja bikin harus menebak
  let nolParse = 0;       // gagal khusus "0 kode terparse" (kandidat gejala layout)
  let dicoba = 0;
  const now = Date.now();

  await Promise.all(
    Object.entries(SLUGS)
      .filter(([id]) => games[id])
      .map(async ([id, slug]) => {
        dicoba += 1;
        try {
          const { items: act, expiredItems: exp } = await fetchOne(id, slug, games[id], userAgent, now);
          covered.add(id);
          items.push(...act);
          for (const it of exp) {
            expiredItems.push(it);
            expired.add(`${id}:${it.code}`);
          }
          log(`[${id}] ✓ ${act.length} aktif + ${exp.length} expired dari redeem-code-tracker`);
        } catch (err) {
          failed += 1;
          failedGames.push(`${id} (${err.message})`);
          if (err.message === "0 kode terparse") nolParse += 1;
          log(`[${id}] · redeem-code-tracker gagal: ${err.message}`);
        }
      }),
  );

  // Kesimpulan yang HANYA boleh ditarik sesitus: kalau setiap game yang dicoba
  // pulang dengan 0 kode, yang rusak parsernya - bukan 17 game sekaligus
  // kehabisan kode di jam yang sama.
  if (dicoba > 1 && nolParse === dicoba) {
    log(`[redeem-code-tracker] ⚠ SEMUA ${dicoba} game 0 kode - layout situs berubah, parser perlu diperbarui`);
  }

  return { items, expiredItems, expired, covered, failed, failedGames };
}
