// Penggabungan hasil tarikan baru dengan state sebelumnya.
//
// Tiga tanggung jawab:
//  1. firstSeenAt — kapan worker PERTAMA melihat kode ini. Nilai lama selalu
//     dipertahankan; mengisi label "Terpantau sejak" untuk kode tanpa tanggal
//     sumber.
//  2. Arsip EKSPLISIT — kode yang sumber tandai kadaluarsa (mis. section Legacy
//     wiki) langsung dimasukkan ke arsip → database arsip terisi dari awal.
//  3. Arsip OTOMATIS — kode aktif yang hilang dari sumber dianggap expired dan
//     DIPINDAH ke arsip. Tidak pernah dihapus (arsip = database).
//
// Pengaman: hanya kode milik game yang tarikannya SUKSES yang boleh diarsipkan
// otomatis (biar sumber down tak mengarsipkan massal). Arsip eksplisit tidak
// kena pengaman ini karena memang ditandai kadaluarsa oleh sumber.

import { codeKey } from "./normalize.mjs";

/**
 * @param {object[]} freshActive   kode aktif run ini (sudah dedup & difilter)
 * @param {object[]} freshArchive  kode yang sumber tandai kadaluarsa (eksplisit)
 * @param {object}   prev          isi codes.json run sebelumnya
 * @param {Set<string>} covered    id game yang sukses ditarik
 * @param {string}   now           ISO timestamp run ini
 * @param {{ci?: boolean}} opt       ci=true → kunci kode case-INsensitive (jalur
 *   mobile/gacha: sumber menulis kode sama dg kapitalisasi beda). JANGAN untuk
 *   Roblox — di sana kapitalisasi bagian dari kode. Lihat codeKey di normalize.
 */
export function mergeWithPrevious(freshActive, freshArchive, prev, covered, now, { ci = false } = {}) {
  const K = (item) => codeKey(item, ci);
  const prevActive = prev.active ?? [];
  const prevArchive = prev.archive ?? [];

  const prevByKey = new Map();
  const prevGames = new Set();
  for (const item of [...prevActive, ...prevArchive]) {
    prevByKey.set(K(item), item);
    if (item.game) prevGames.add(item.game);
  }
  const seenBefore = new Map(
    [...prevByKey].map(([k, v]) => [k, v.firstSeenAt ?? v.fetchedAt ?? now]),
  );

  // JEMBATAN KAPITALISASI. Kunci Roblox sengaja case-sensitive — di sana
  // kapitalisasi bagian dari kodenya, dan menyamakan "Farm" dengan "FARM" saat
  // MENUKAR kode bisa keliru. Tapi untuk MEWARISI RIWAYAT, aturan itu justru
  // merusak: sumber menulis kode yang sama dengan kapitalisasi berbeda
  // (RoCodes "FARM", Roblox Den "Farm"), sehingga entri arsip tak ketemu dan
  // kode dianggap belum pernah dilihat.
  //
  // Akibatnya berantai dan tak terlihat: firstSeenAt diisi `now` → kode
  // terhitung "fresh <=48 jam" → grace membuatnya kebal aturan expired → kode
  // yang sudah mati sejak Juli muncul lagi sebagai kode terbaru di beranda.
  // Terjadi 5 Agu 2026 pada Knockout: "FARM" diarsipkan 19 Jul (expiredBy
  // primer), lalu hidup kembali sebagai "Farm".
  //
  // Peta ini HANYA dipakai sebagai cadangan saat kunci persis tak ketemu, dan
  // HANYA untuk mewarisi firstSeenAt/bulk — identitas kode tetap case-sensitive,
  // jadi tak ada kode berbeda yang tergabung karenanya.
  const prevByKeyCI = new Map();
  for (const [k, v] of prevByKey) {
    const kci = k.toLowerCase();
    const lama = prevByKeyCI.get(kci);
    // Yang PALING TUA menang: itulah kapan kode ini benar-benar pertama dilihat.
    if (!lama || (Date.parse(v.firstSeenAt ?? "") || Infinity) < (Date.parse(lama.firstSeenAt ?? "") || Infinity)) prevByKeyCI.set(kci, v);
  }

  // `bulk` = kode yang umurnya TAK DIKETAHUI: bagian dari IMPORT PERTAMA sebuah
  // game (worker baru mulai memantau game ini). Dibedakan dari kode yang baru
  // dirilis di game yang SUDAH dipantau — yang itu genuine baru dan boleh nongol
  // paling atas di sort "Terbaru". Untuk kode tanpa tanggal-rilis sumber, flag
  // ini yang mencegah seluruh katalog game baru membanjiri puncak (lihat
  // site/src/lib/codes.mjs). Sekali di-set, dipertahankan antar-run.
  const active = freshActive.map((item) => {
    const prior = prevByKey.get(K(item)) ?? prevByKeyCI.get(K(item).toLowerCase());
    const bulk = prior ? prior.bulk === true : !prevGames.has(item.game);
    // PENULISAN ALTERNATIF, dikumpulkan LINTAS-RUN. mergeCodes hanya melihat
    // ejaan dari sumber yang benar-benar ditarik pada run itu — dan karena
    // gating, kedua primer jarang tertarik bersamaan (Blox Fruits 5 Agu 2026:
    // Den 0,6 jam lalu, RoCodes 29,6 jam lalu). Akibatnya varian nyaris tak
    // pernah terekam, dan yang telanjur terekam hilang di run berikutnya.
    //
    // Tiga sumber varian digabung di sini, tempat riwayat memang dipegang:
    //   item.altCode  — dua sumber terbaca di run yang SAMA
    //   prior.altCode — pernah terekam sebelumnya, jangan sampai hilang
    //   prior.code    — ejaan berubah ANTAR-RUN (ini yang menangkap kasus
    //                   gating: run lalu "FARM", run ini "Farm")
    // `prior` sendiri sudah ditemukan lintas-kapitalisasi lewat prevByKeyCI,
    // jadi perubahan ejaan tak lagi terbaca sebagai kode yang berbeda.
    const dariPrior = prior?.code && prior.code !== item.code ? prior.code : null;
    const alt = item.altCode ?? prior?.altCode ?? dariPrior ?? null;
    return {
      ...item,
      firstSeenAt: prior?.firstSeenAt ?? prior?.fetchedAt ?? now,
      fetchedAt: now,
      ...(alt && alt !== item.code ? { altCode: alt } : {}),
      ...(bulk ? { bulk: true } : {}),
    };
  });

  const activeKeys = new Set(active.map(K));
  const archiveByKey = new Map();
  for (const item of prevArchive) archiveByKey.set(K(item), item);
  let newlyArchived = 0;

  const addToArchive = (item) => {
    const key = K(item);
    if (activeKeys.has(key)) return; // aktif menang
    const existing = archiveByKey.get(key);
    if (existing) {
      // Backfill data yang dulu kosong (mis. tanggal/reward baru bisa diekstrak
      // di versi worker lebih baru) — entri arsip lama ikut diperkaya, tak beku.
      if (!existing.date && item.date) existing.date = item.date;
      if (!existing.reward && item.reward) existing.reward = item.reward;
      return;
    }
    archiveByKey.set(key, {
      ...item,
      status: "expired",
      expiredAt: item.expiredAt ?? now,
      firstSeenAt: seenBefore.get(key) ?? item.firstSeenAt ?? now,
      // Alasan diarsipkan. Sumber sudah menetapkannya (endsAt/primer/editorial);
      // yang sampai sini tanpa alasan berarti kode HILANG dari sumber — lenyap
      // begitu saja tanpa ada yang menyatakannya expired.
      expiredBy: item.expiredBy ?? "hilang",
    });
    newlyArchived += 1;
  };

  // (2) Arsip eksplisit dari sumber (section Legacy/Expired).
  for (const item of freshArchive) addToArchive(item);

  // (3) Arsip otomatis: kode aktif sebelumnya yang kini hilang.
  for (const item of prevActive) {
    const key = K(item);
    if (activeKeys.has(key) || archiveByKey.has(key)) continue;
    if (!covered.has(item.game)) {
      // Sumber game ini gagal ditarik → hilangnya tak bermakna. Pertahankan.
      active.push({ ...item, fetchedAt: item.fetchedAt ?? now, stale: true });
      activeKeys.add(key);
      continue;
    }
    addToArchive(item);
  }

  // Kode yang HIDUP LAGI: sempat diarsipkan (hilang dari sumber), lalu muncul
  // kembali di run berikutnya. Entrinya tetap tertinggal di arsip karena arsip
  // di-seed dari prevArchive dan addToArchive cuma menolak MENAMBAH yg aktif —
  // bukan membuang yg sudah telanjur ada. Akibatnya satu kode tampil sbg AKTIF
  // sekaligus EXPIRED di halaman game (situs tak menyaring arsip thd aktif), dan
  // hitungan "N di arsip" ikut menggelembung. Kejadian 1 Agt 2026: 521 kode
  // Roblox di 45 game (Sailor Piece: 162 dari 171 kode aktifnya juga di arsip).
  // Ini BUKAN menghapus riwayat — kodenya tetap ada, statusnya saja yang benar.
  // Saat nanti benar-benar expired, ia diarsipkan lagi lewat jalur normal.
  // Perbandingan di sini SELALU case-insensitive, termasuk untuk Roblox yang
  // identitas kodenya case-sensitive. Alasannya beda: ini bukan menggabungkan
  // dua kode aktif (yg memang harus dibedakan), tapi mencegah arsip mengklaim
  // "expired" untuk kode yang huruf-hurufnya SAMA dg yg sedang aktif — mis.
  // gakuran "UMA" (aktif, RoCodes) vs "Uma" (arsip, sumber lain). Kodenya jelas
  // berfungsi; melabelinya expired menyesatkan visitor.
  const aktifCI = new Set(active.map((it) => `${it.game ?? "-"}:${String(it.code ?? "").toLowerCase()}`));
  const arsip = [...archiveByKey.values()].filter((it) => !aktifCI.has(`${it.game ?? "-"}:${String(it.code ?? "").toLowerCase()}`));
  return { active, archive: arsip, newlyArchived };
}
