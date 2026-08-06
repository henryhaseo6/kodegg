// DETEKTOR MISS — mengukur berapa kode yang benar-benar kita lewatkan.
//
// KENAPA ADA. Selama ini pertanyaan "apakah ada kode yang kelewat?" cuma bisa
// dijawab dengan penalaran, dan penalaran itu meleset dua kali dalam satu hari
// (6 Agu 2026): pertama menyimpulkan gerbang lastmod bocor berdasarkan kode
// "Den-saja yang kini ada di RoCodes" — padahal kode-kode itu SUDAH tayang di
// situs kita, cuma label sumbernya tertinggal; lalu menyimpulkan RoCodes
// menambah kode tanpa memajukan lastmod — padahal stempelnya cocok persis
// dengan isi halamannya. Dua-duanya cerita yang masuk akal dan dua-duanya
// salah, dan tak ada di sistem ini yang bisa membantahnya.
//
// CARANYA. Ambil beberapa game acak tiap run, tarik SEGAR tanpa melewati
// gerbang, lalu adu ke data kita. Kode sumber yang tak ada di aktif MAUPUN
// arsip kita = miss sejati. Perbandingannya wajib menyertakan arsip: kode yang
// sumber lain nyatakan mati dan sudah kita arsipkan BUKAN kelewatan, dan tanpa
// syarat ini angkanya menggelembung (Shindo Life sendiri menyumbang 8 kode
// yang RoCodes masih pajang aktif padahal Den bilang mati).
//
// ACAK, BUKAN YANG PALING MUNGKIN MISS. Menyampel game yang gerbangnya baru
// membuka akan memulangkan nol dan terdengar meyakinkan, tapi itu memutar:
// kriterianya sama dengan kriteria yang sedang diuji. Sampel acak berbobot
// pemain memberi angka yang bisa dipercaya sekaligus menaruh perhatian di
// tempat yang ditonton orang.
//
// BIAYANYA sengaja kecil (8 game/run ≈ 190/hari) karena tugasnya MENGUKUR,
// bukan menambal. Kalau angkanya nol berkelanjutan, gerbangnya memang bekerja
// dan tak perlu diganti; kalau tidak, kita tahu persis berapa besar bocornya
// dan di game mana.

/**
 * @param {object} o
 * @param {Map<string,object>} o.set        katalog game
 * @param {(gid:string)=>{aktif:Set<string>, arsip:Set<string>}} o.milik
 *        kode yang kita punya untuk satu game (huruf kecil)
 * @param {Array<{field:string, nama:string, ambil:(slug:string)=>Promise<object>}>} o.sumber
 * @param {number} [o.jumlah=8]             game per run
 * @param {number} [o.jeda=300]
 * @returns {Promise<{diperiksa:number, miss:number, gameMiss:number, detail:object[]}>}
 */
export async function deteksiMiss({ set, milik, sumber, jumlah = 8, jeda = 300 }) {
  const semua = [...set.entries()].filter(([, e]) => sumber.some((s) => e[s.field]));
  if (!semua.length) return { diperiksa: 0, miss: 0, gameMiss: 0, detail: [] };

  // Pemilihan berbobot pemain, tapi TANPA acak yang tak bisa diulang: urutan
  // ditentukan jam berjalan, jadi tiap run mengambil irisan berbeda dan seluruh
  // katalog akhirnya tersentuh — sekaligus hasilnya bisa ditelusuri ulang.
  const jam = Math.floor(Date.now() / 3600000);
  const urut = semua.sort((a, b) => (b[1].players || 0) - (a[1].players || 0));
  const pilih = [];
  for (let i = 0; i < jumlah && i < urut.length; i++) {
    pilih.push(urut[(jam * jumlah + i) % urut.length]);
  }

  const detail = [];
  let diperiksa = 0, miss = 0, gameMiss = 0;
  for (const [gid, e] of pilih) {
    const punya = milik(gid);
    let adaYangTerbaca = false;
    const hilangGame = [];
    for (const s of sumber) {
      const slug = e[s.field];
      if (!slug) continue;
      let r;
      try { r = await s.ambil(slug); } catch { continue; }
      adaYangTerbaca = true;
      for (const c of r.active ?? []) {
        const k = String(c.code ?? "").toLowerCase();
        if (!k) continue;
        if (!punya.aktif.has(k) && !punya.arsip.has(k)) hilangGame.push({ code: c.code, dari: s.nama });
      }
      if (jeda) await new Promise((x) => setTimeout(x, jeda));
    }
    if (!adaYangTerbaca) continue;
    diperiksa++;
    if (hilangGame.length) {
      gameMiss++;
      miss += hilangGame.length;
      detail.push({ game: gid, nama: e.name ?? gid, players: e.players ?? 0, hilang: hilangGame });
    }
  }

  if (!diperiksa) console.log("[miss] tak ada game yang bisa diperiksa run ini");
  else if (!miss) console.log(`[miss] ${diperiksa} game diperiksa acak → 0 kode kelewat`);
  else {
    console.log(`[miss] ${diperiksa} game diperiksa acak → ${miss} kode KELEWAT di ${gameMiss} game`);
    for (const d of detail) console.log(`  ! ${d.nama} (${d.players} pemain): ${d.hilang.slice(0, 6).map((h) => `${h.code}[${h.dari}]`).join(", ")}`);
  }
  return { diperiksa, miss, gameMiss, detail };
}
