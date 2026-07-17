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
 */
export function mergeWithPrevious(freshActive, freshArchive, prev, covered, now) {
  const prevActive = prev.active ?? [];
  const prevArchive = prev.archive ?? [];

  const seenBefore = new Map();
  for (const item of [...prevActive, ...prevArchive]) {
    seenBefore.set(codeKey(item), item.firstSeenAt ?? item.fetchedAt ?? now);
  }

  const active = freshActive.map((item) => ({
    ...item,
    firstSeenAt: seenBefore.get(codeKey(item)) ?? now,
    fetchedAt: now,
  }));

  const activeKeys = new Set(active.map(codeKey));
  const archiveByKey = new Map();
  for (const item of prevArchive) archiveByKey.set(codeKey(item), item);
  let newlyArchived = 0;

  const addToArchive = (item) => {
    const key = codeKey(item);
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
    });
    newlyArchived += 1;
  };

  // (2) Arsip eksplisit dari sumber (section Legacy/Expired).
  for (const item of freshArchive) addToArchive(item);

  // (3) Arsip otomatis: kode aktif sebelumnya yang kini hilang.
  for (const item of prevActive) {
    const key = codeKey(item);
    if (activeKeys.has(key) || archiveByKey.has(key)) continue;
    if (!covered.has(item.game)) {
      // Sumber game ini gagal ditarik → hilangnya tak bermakna. Pertahankan.
      active.push({ ...item, fetchedAt: item.fetchedAt ?? now, stale: true });
      activeKeys.add(key);
      continue;
    }
    addToArchive(item);
  }

  return { active, archive: [...archiveByKey.values()], newlyArchived };
}
