// Terjemahan metadata video LONG (Top 50 & Roundup) ke bahasa Indonesia.
//
// Kenapa ada: Shorts kita berbahasa Indonesia dan YouTube MENERJEMAHKANNYA
// otomatis ke en-US. Video long berbahasa Inggris — dan YouTube MENOLAK
// menerjemahkannya ("This video cannot be automatically translated"). Jadi
// penonton Indonesia tak akan pernah melihat judul berbahasa Indonesia untuk
// video harian ini kecuali kita yang memasangnya.
//
// Yang diterjemahkan HANYA judul & deskripsi (localizations.id). Isi video,
// subtitle, dan audio tidak disentuh — judul EN tetap jadi judul utama karena
// sasarannya memang global.
//
// Satu implementasi dipakai DUA jalur — upload harian & backfill video lama —
// supaya hasilnya tak mungkin berbeda antara keduanya.

const MON_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const MON_ID = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

/** "JULY 31, 2026" → "31 JULI 2026". Tak cocok → dikembalikan apa adanya. */
export function tanggalID(lbl) {
  const m = /^([A-Z]+) (\d{1,2}), (\d{4})$/.exec((lbl ?? "").trim().toUpperCase());
  if (!m) return lbl;
  const i = MON_EN.indexOf(m[1]);
  return i < 0 ? lbl : `${Number(m[2])} ${MON_ID[i]} ${m[3]}`;
}

// Frasa tetap dari template kita sendiri (make-top50.mjs & make-codes-roundup.mjs).
// Urutan penting: yang lebih panjang/spesifik didahulukan. Yang tak terdaftar
// dibiarkan berbahasa Inggris — lebih baik sebagian daripada salah terjemah.
const FRASA = [
  // ── Top 50
  [/^The (\d+) most played Roblox games on (.+), ranked by peak concurrent players \(CCU\)\./m,
    (_, n, d) => `${n} game Roblox paling ramai dimainkan pada ${tanggalID(d)}, diurutkan berdasarkan puncak pemain bersamaan (CCU).`],
  [/^Peak, average & lowest player counts \+ 24-hour player graph for each game\.$/m,
    () => "Jumlah pemain tertinggi, rata-rata & terendah + grafik pemain 24 jam untuk tiap game."],
  ["⏱️ RANKING & TIMELINE (tap to jump):", "⏱️ PERINGKAT & TIMELINE (ketuk untuk lompat):"],
  [/^Data: Roblox charts \(logged every 10 minutes\)\./m, () => "Data: chart Roblox (dicatat tiap 10 menit)."],
  // ── Roundup
  [/^All the NEW Roblox codes added on (.+), grouped by game — copy & redeem before they expire\.$/m,
    (_, d) => `Semua kode Roblox BARU yang masuk pada ${tanggalID(d)}, dikelompokkan per game — salin & tukarkan sebelum kedaluwarsa.`],
  ["⚡ Want codes the moment they drop? New codes EVERY HOUR on our Shorts.",
    "⚡ Mau kode begitu rilis? Kode baru TIAP JAM di Shorts kami."],
  ["⏱️ TIMELINE (tap to jump):", "⏱️ TIMELINE (ketuk untuk lompat):"],
  ["🎁 ALL CODES:", "🎁 SEMUA KODE:"],
  [/^(▶ .+) — (\d+) new$/gm, (_, g, n) => `${g} — ${n} baru`],
  [/^(\d+:\d+) (.+) — (\d+) codes?$/gm, (_, t, g, n) => `${t} ${g} — ${n} kode`], // baris timeline roundup
  [/… \+ more — full code list at/g, () => "… + lainnya — daftar kode lengkap di"],
  // ── penutup (dipakai kedua jenis)
  ["🎮 Free Roblox & game redeem codes, updated hourly →", "🎮 Kode redeem Roblox & game gratis, diperbarui tiap jam →"],
  ["🎮 All codes + how to redeem (updated hourly) →", "🎮 Semua kode + cara redeem (diperbarui tiap jam) →"],
  [/^(\d+:\d+) Intro$/gm, (_, t) => `${t} Intro`], // tetap — "Intro" sama di kedua bahasa
];

/**
 * Judul & deskripsi versi Indonesia dari metadata Inggris video long.
 * @returns {{title,description}|null} null bila judulnya bukan pola video long.
 */
export function localisasiID({ title, description }) {
  let t = null;
  const top50 = /^Top (\d+) Most Played Roblox Games — (.+) \(Daily Player Count\)$/.exec(title ?? "");
  if (top50) t = `${top50[1]} Game Roblox Terpopuler — ${tanggalID(top50[2])} (Jumlah Pemain Harian)`;
  const round = /^New Roblox Codes — (.+) \((\d+) Codes?, (\d+) Games?\)$/.exec(title ?? "");
  if (round) t = `Kode Roblox Terbaru — ${tanggalID(round[1])} (${round[2]} Kode, ${round[3]} Game)`;
  if (!t) return null; // bukan video long → jangan diapa-apakan

  let d = description ?? "";
  for (const [cari, ganti] of FRASA) d = typeof cari === "string" ? d.split(cari).join(ganti) : d.replace(cari, ganti);
  return { title: t.slice(0, 100), description: d.slice(0, 4950) };
}
