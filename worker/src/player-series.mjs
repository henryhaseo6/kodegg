// Riwayat pemain 24 jam per-game, DARI PENGUKURAN NYATA.
//
// Sumbernya database R2 yang sudah kita isi sejak 26 Jul 2026: cron Cloudflare
// mencatat player-count tiap 10 menit dari 26 kategori Roblox Charts, lalu tiap
// pergantian hari WIB dipadatkan jadi `daily/<tanggal>.json` berisi 144 titik
// per game. make-top50.mjs sudah membacanya lewat jalur yang sama.
//
// KENAPA MODUL INI ADA. Renderer video sebelumnya memakai `synthSeries` — kurva
// harian umum yang diskalakan ke jumlah pemain sekarang. Untuk BENTUK grafik itu
// tak apa; tapi begitu di layar tertulis "PEAK PLAYERS 53.7K", angka karangan
// disajikan sebagai fakta. Video kode kita sudah punya aturan keras soal itu
// (kode yang terbukti mati diarsipkan, langkah redeem diverifikasi manual), dan
// statistik tak boleh jadi pengecualian.
//
// Kalau data nyata tak tersedia — kunci R2 tak di-set, game belum masuk 760
// besar Roblox Charts, atau harinya belum dipadatkan — modul ini memulangkan
// null, dan PEMANGGIL WAJIB menyembunyikan pita statistik. Lebih baik ruang
// kosong daripada angka yang kita karang.

/**
 * @param {number|string} universeId  identitas game di Roblox
 * @param {string} [tanggal]          YYYY-MM-DD (WIB); bawaan = kemarin
 * @returns {Promise<{series:number[], puncak:number, rata:number, rendah:number, titik:number, tanggal:string}|null>}
 */
/**
 * Deret pemain BERGULIR: 24 jam terakhir sampai saat render, bukan hari kalender
 * kemarin.
 *
 * Kenapa ini ada terpisah dari seriesPemain: berkas harian R2 baru terbentuk
 * setelah harinya lewat, jadi ia SELALU memulangkan kemarin. Untuk video yang
 * terbit jam 13:00, itu berarti data berumur 13-37 jam di bawah label "24 JAM
 * TERAKHIR". Endpoint /roblox-series membacanya dari buffer KV yang memuat hari
 * berjalan.
 *
 * MEMULANGKAN null BILA ENDPOINT-NYA BELUM ADA (Worker versi lama menjawab 404).
 * Pemanggil wajib jatuh ke seriesPemain — dengan begitu perubahan ini bisa
 * mendarat sebelum Worker-nya di-deploy tanpa mematikan grafik siapa pun.
 * Worker di-deploy manual lewat dashboard (lihat DEPLOY-CRON.md), jadi jeda
 * antara kode mendarat dan Worker diperbarui itu normal, bukan kecelakaan.
 */
export async function seriesPemainBergulir(universeId, { jam = 24, minTitik = 12 } = {}) {
  const base = process.env.WORKER_URL, key = process.env.TRIGGER_KEY;
  if (!base || !key || !universeId) return null;
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/roblox-series?uid=${encodeURIComponent(universeId)}&jam=${jam}&key=${encodeURIComponent(key)}`, { headers: { accept: "application/json" } });
    if (!r.ok) return null; // 404 = Worker belum diperbarui → pemanggil pakai jalur lama
    const j = await r.json();
    const titik = Array.isArray(j?.titik) ? j.titik.filter((p) => typeof p?.v === "number") : [];
    if (titik.length < minTitik) return null; // terlalu bolong untuk disebut "24 jam"
    const isi = titik.map((p) => p.v);
    return {
      series: isi,
      puncak: Math.max(...isi),
      rendah: Math.min(...isi),
      rata: Math.round(isi.reduce((a, b) => a + b, 0) / isi.length),
      titik: isi.length,
      // Dipakai renderer untuk melabeli sumbu dengan JAM SEBENARNYA. Tanpa ini
      // sumbunya akan tetap tertulis 00:00-24:00 — label hari kalender pada
      // data yang bukan hari kalender.
      mulaiMs: titik[0].ms,
      sampaiMs: titik[titik.length - 1].ms,
      bergulir: true,
    };
  } catch { return null; }
}

export async function seriesPemain(universeId, tanggal = null) {
  const base = process.env.WORKER_URL, key = process.env.TRIGGER_KEY;
  if (!base || !key || !universeId) return null;
  // Batas hari mengikuti WIB, sama dengan pemadatan di cron worker — memakai UTC
  // akan meleset 7 jam dan pada dini hari mengambil berkas yang belum ada.
  const tgl = tanggal || new Date(Date.now() + 7 * 3600e3 - 864e5).toISOString().slice(0, 10);
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/roblox-db?date=${tgl}&key=${encodeURIComponent(key)}`, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const mentah = j.series?.[String(universeId)];
    if (!Array.isArray(mentah)) return null;
    // `null` = game tak muncul di snapshot itu (keluar dari chart sesaat), bukan
    // nol pemain. Membiarkannya jadi 0 akan menciptakan jurang palsu di grafik,
    // jadi titik kosong dibuang — bukan diisi.
    const isi = mentah.filter((v) => typeof v === "number" && v >= 0);
    if (isi.length < 12) return null; // terlalu bolong untuk disebut "24 jam"
    return {
      series: isi,
      puncak: Math.max(...isi),
      rendah: Math.min(...isi),
      rata: Math.round(isi.reduce((a, b) => a + b, 0) / isi.length),
      titik: isi.length,
      tanggal: tgl,
    };
  } catch { return null; }
}
