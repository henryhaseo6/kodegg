// KodeGG — worker penarik KODE REDEEM (fase 1).
//
// Alur: hoyo-codes + GamerPower → normalisasi → gabung dengan state lama →
//       tulis data/codes.json. Situs membaca JSON ini saat build (SSG).
//
// Jalankan lokal : node fetch-codes.mjs
// Produksi       : cron ~1 jam (lihat Cetak Biru Pipeline).
//
// Aturan yang ditegakkan di sini (CLAUDE.md):
// - Hanya game online/live-service — lihat src/games.mjs.
// - Reward VERBATIM — src/normalize.mjs hanya menyentuh pemisah/jumlah.
// - Kode expired diarsipkan, tidak pernah dihapus — src/archive.mjs.
// - Atribusi GamerPower dibawa di tiap item (`source`).

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES } from "./src/games.mjs";
import { fetchHoyo } from "./src/sources/hoyo.mjs";
import { fetchWiki } from "./src/sources/wiki.mjs";
import { fetchWuwaStatus } from "./src/sources/wuwastatus.mjs";
import { fetchHoyolabCodes } from "./src/sources/hoyolab.mjs";
import { fetchTotWiki } from "./src/sources/totwiki.mjs";
import { fetchCrimsonwitch } from "./src/sources/crimsonwitch.mjs";
import { fetchRedeemTracker } from "./src/sources/redeemtracker.mjs";
import { fetchWhiteout } from "./src/sources/whiteout.mjs";
import { fetchEditorial } from "./src/sources/editorial.mjs";
import { fetchCurated, combineCodes } from "./src/sources/curated.mjs";
import { codeKey } from "./src/normalize.mjs";
// GamerPower (giveaway gift-pack) sengaja TIDAK dipakai di halaman kode: item-nya
// tanpa kode redeem & diklaim via URL eksternal (redirect) — tak cocok dengan
// konsep "Kode Redeem". src/sources/gamerpower.mjs disimpan untuk kemungkinan
// halaman "Giveaway" terpisah nanti.
import { mergeWithPrevious } from "./src/archive.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/codes.json");
const USER_AGENT = "KodeGGBot/1.0 (+https://kodegg.com)";

async function readPrevious(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { active: [], archive: [] }; // run pertama
  }
}

async function main() {
  const now = new Date().toISOString();

  const log = (m) => console.log(`  ${m}`);
  const [hoyo, wiki, wuwa, hylab, totw, cw, rct, wos, edi] = await Promise.all([
    fetchHoyo({ userAgent: USER_AGENT, log }),
    fetchWiki({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchWuwaStatus({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchHoyolabCodes({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchTotWiki({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchCrimsonwitch({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchRedeemTracker({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchWhiteout({ games: GAMES, userAgent: USER_AGENT, log }),
    fetchEditorial({ games: GAMES, log }),
  ]);

  const curated = fetchCurated({ games: GAMES });

  // Semua sumber gagal → jangan tulis apa pun. Menimpa cache bagus dengan
  // hasil kosong akan mengosongkan situs DAN mengarsipkan seluruh kode aktif.
  // (Kode terkurasi tidak dihitung "sumber hidup" di sini.)
  if (hoyo.items.length === 0 && wiki.items.length === 0 && wuwa.items.length === 0) {
    console.error("✗ semua sumber gagal / kosong — data/codes.json dibiarkan utuh");
    process.exit(1);
  }

  // covered = game yang sukses ditarik dari SUMBER MANA PUN (aman diarsipkan).
  // Kode terkurasi selalu meng-cover gamenya (kode permanen harus tetap tampil).
  const covered = new Set([
    ...hoyo.covered,
    ...wiki.covered,
    ...wuwa.covered,
    ...hylab.covered,
    ...totw.covered,
    ...cw.covered,
    ...rct.covered,
    ...wos.covered,
    ...edi.covered,
    ...curated.covered,
  ]);

  // Urutan penting untuk dedup reward: sumber resmi/live menang atas curated.
  // crimsonwitch tepat setelah API HoYo — reward terstruktur & tanggalnya
  // memperkaya/mengoreksi. HoYoLAB (mining) paling belakang — pelengkap saja.
  let freshItems = combineCodes(
    [...hoyo.items, ...cw.items, ...rct.items, ...wos.items, ...edi.items, ...wuwa.items, ...wiki.items, ...totw.items, ...hylab.items],
    curated.items,
  );

  // PINDAHKAN kode yang sumber otoritatif tandai EXPIRED dari aktif ke arsip:
  //  - wiki (Legacy/Expired) → mis. seria menyajikan kode HI3 lama sebagai aktif.
  //  - tot.wiki (End Date lewat) → seria ToT mandek 2024, 24 dari 25 kodenya mati.
  //  - crimsonwitch (expires lewat) → cross-check tambahan untuk game HoYo.
  // expiredItems (objek lengkap, bertanggal) mengisi arsip langsung.
  const expiredKeys = new Set([...wiki.expired, ...totw.expired, ...cw.expired, ...rct.expired, ...wos.expired, ...edi.expired]);
  const freshArchive = [...wiki.expiredItems, ...totw.expiredItems, ...cw.expiredItems, ...rct.expiredItems, ...wos.expiredItems, ...edi.expiredItems];
  const beforeExpiryFilter = freshItems.length;
  freshItems = freshItems.filter((item) => !expiredKeys.has(codeKey(item)));

  // ToT: seria mandek 2024 & tak bisa dipercaya untuk status aktif. Jadikan
  // tot.wiki OTORITAS TUNGGAL kode aktif ToT — kode ToT hanya lolos bila tot.wiki
  // mengonfirmasinya aktif. (seria tetap boleh memperkaya reward via combineCodes,
  // tapi tak bisa menyatakan sebuah kode ToT aktif sendirian.) Tanpa ini, saat
  // Wayback tot.wiki gagal sesaat, 24 kode seria yang mati bocor jadi "aktif".
  if (totw.covered.has("tot")) {
    const totActive = new Set(totw.items.map((i) => i.code));
    freshItems = freshItems.filter((item) => item.game !== "tot" || totActive.has(item.code));
  }

  const removed = beforeExpiryFilter - freshItems.length;
  if (removed > 0) console.log(`  ✂ ${removed} kode dipindah ke arsip / dibuang (expired atau tak terverifikasi)`);

  const prev = await readPrevious(OUT);
  const { active, archive, newlyArchived } = mergeWithPrevious(
    freshItems,
    freshArchive,
    prev,
    covered,
    now,
  );

  const payload = {
    updatedAt: now,
    counts: { active: active.length, archived: archive.length },
    active,
    archive,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));

  // Kode BARU pada run ini (firstSeenAt === now) → dipakai worker push-notify
  // untuk kirim notifikasi. Non-permanen saja (kode evergreen bukan "berita").
  const newlyAdded = active
    .filter((c) => c.firstSeenAt === now && c.code && !c.perm && !c.bulk)
    .map((c) => ({ code: c.code, game: c.game, gameName: c.gameName ?? c.game, reward: c.reward ?? "" }));
  await writeFile(resolve(dirname(OUT), "new-codes.json"), JSON.stringify({ generatedAt: now, codes: newlyAdded }, null, 2));

  console.log(
    `✓ data/codes.json — ${payload.counts.active} aktif, ` +
      `${payload.counts.archived} arsip (+${newlyArchived} baru diarsipkan)` +
      (newlyAdded.length ? `, ${newlyAdded.length} kode baru → notifikasi` : ""),
  );
  // Kegagalan per-sumber HARUS terlihat: kalau senyap, data game itu beku diam-diam
  // (kasus nyata: whiteout 403 dari IP Actions selama 3 hari, tak ada yang sadar).
  // Di GitHub Actions, ::warning:: muncul di ringkasan run, bukan cuma di log.
  const perSource = { hoyo, wiki, wuwa, totw, cw, rct, wos, edi };
  const totalFailed = Object.values(perSource).reduce((n, r) => n + (r.failed ?? 0), 0);
  if (totalFailed) {
    // Sebut GAME-nya bila sumber bisa merinci (editorial) — "edi(4)" saja bikin
    // harus buka log & menebak; nama game langsung menunjuk lubangnya.
    const names = Object.entries(perSource)
      .filter(([, r]) => r.failed)
      .map(([k, r]) => (r.failedGames?.length ? `${k}: ${r.failedGames.join(", ")}` : `${k}(${r.failed})`))
      .join(" | ");
    console.warn(`⚠ ${totalFailed} sumber/game gagal — kodenya dipertahankan: ${names}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Sumber kode gagal::${names} — data lama dipertahankan, cek log baris [nama]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
