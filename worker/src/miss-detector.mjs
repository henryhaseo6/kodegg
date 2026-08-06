// AUDIT KEBENARAN KODE — mengukur apakah yang dibaca pengunjung cocok dengan
// yang sumber katakan SAAT INI.
//
// Empat hal yang dijaga, dan cuma empat karena cuma ini yang bisa menyesatkan
// pembaca secara langsung:
//
//   1. LENGKAP  — kode yang sumber daftarkan tapi tak ada di kita sama sekali
//   2. ARSIP    — sumber bilang expired, kita masih memajangnya aktif
//   3. CHECK    — sumber ragu, kita tak menampilkan keraguan itu
//   4. BARU     — kita cap BARU padahal umurnya sudah lewat jendela
//
// KENAPA PERLU, padahal audit-data.mjs sudah banyak. Audit itu memeriksa
// kesehatan parser dan kebersihan data — entity HTML tersisa, duplikat, counts
// meleset, parser memulangkan nol. Semuanya berguna, tapi tak satu pun bisa
// menangkap kegagalan yang bentuknya "data kita rapi, cuma tidak sesuai
// kenyataan". Semua bug yang ditemukan 6 Agu 2026 jatuh persis di celah itu:
// badge Verified menutupi keraguan sumber; kode mati bangkit oleh sinyal yang
// menyatakannya mati; kode ber-CHECK berdiri di etalase beranda. Data rapi,
// audit bersih, tampilan salah — dan semuanya ketahuan hanya karena user
// membuka halaman kita bersebelahan dengan halaman sumber.
//
// LAG BUKAN BUG, DAN DIBEDAKAN. Data kita menyusul sumber sampai 6 jam (rotasi),
// jadi selisih pada game yang lama tak ditarik itu wajar. Yang dilaporkan
// terpisah adalah pelanggaran pada game yang datanya MASIH SEGAR (<2 jam) —
// di situ selisih tak bisa dijelaskan oleh jadwal, dan berarti aturannya yang
// salah. Tanpa pemisahan ini laporannya akan penuh temuan yang bukan kesalahan,
// lalu berhenti dibaca.
//
// SAMPEL ACAK BERGILIR, bukan game yang paling mungkin bermasalah. Menyampel
// yang mencurigakan membuat angkanya tak bisa dipakai menghitung laju: ia
// memutar, karena kriterianya sama dengan yang sedang diuji.

const JAM = 3600000;

/**
 * @param {object} o
 * @param {Map<string,object>} o.set  katalog game
 * @param {(gid:string)=>{aktif:Map<string,object>, arsip:Set<string>, ditarikMs:number}} o.milik
 * @param {Array<{field:string, nama:string, ambil:(slug:string)=>Promise<object>}>} o.sumber
 * @param {number} [o.jumlah=8]
 * @param {number} [o.jeda=300]
 */
export async function deteksiMiss({ set, milik, sumber, jumlah = 8, jeda = 300 }) {
  const semua = [...set.entries()].filter(([, e]) => sumber.some((s) => e[s.field]));
  if (!semua.length) return { diperiksa: 0, miss: 0, gameMiss: 0, detail: [] };

  // Urutan ditentukan jam berjalan: tiap run mengambil irisan berbeda sehingga
  // seluruh katalog akhirnya tersentuh, dan hasilnya tetap bisa ditelusuri ulang.
  const jam = Math.floor(Date.now() / JAM);
  const urut = semua.sort((a, b) => (b[1].players || 0) - (a[1].players || 0));
  const pilih = [];
  for (let i = 0; i < jumlah && i < urut.length; i++) pilih.push(urut[(jam * jumlah + i) % urut.length]);

  const langgar = { lengkap: [], arsip: [], check: [] };
  const segar = { lengkap: 0, arsip: 0, check: 0 };
  let diperiksa = 0;

  for (const [gid, e] of pilih) {
    const punya = milik(gid);
    const umurJam = punya.ditarikMs ? (Date.now() - punya.ditarikMs) / JAM : Infinity;
    const masihSegar = umurJam <= 2;
    let terbaca = false;

    for (const s of sumber) {
      const slug = e[s.field];
      if (!slug) continue;
      let r;
      try { r = await s.ambil(slug); } catch { continue; }
      terbaca = true;

      for (const c of r.active ?? []) {
        const k = String(c.code ?? "").toLowerCase();
        if (!k) continue;
        const kita = punya.aktif.get(k);
        if (!kita && !punya.arsip.has(k)) {
          langgar.lengkap.push({ game: e.name ?? gid, code: c.code, dari: s.nama, umurJam });
          if (masihSegar) segar.lengkap++;
          continue;
        }
        // Sumber ragu tapi kita tak menampilkan keraguan itu.
        if (c.check && kita && !kita.check && !kita.srcCheck) {
          langgar.check.push({ game: e.name ?? gid, code: c.code, dari: s.nama, umurJam });
          if (masihSegar) segar.check++;
        }
      }
      // Sumber menyatakan expired, kita masih memajangnya aktif.
      for (const c of r.archive ?? []) {
        const k = String(c.code ?? "").toLowerCase();
        if (k && punya.aktif.has(k)) {
          langgar.arsip.push({ game: e.name ?? gid, code: c.code, dari: s.nama, umurJam });
          if (masihSegar) segar.arsip++;
        }
      }
      if (jeda) await new Promise((x) => setTimeout(x, jeda));
    }
    if (terbaca) diperiksa++;
  }

  const n = (a) => a.length;
  const total = n(langgar.lengkap) + n(langgar.arsip) + n(langgar.check);
  if (!diperiksa) { console.log("[audit-kode] tak ada game yang bisa diperiksa run ini"); return { diperiksa: 0, miss: 0, gameMiss: 0, detail: [] }; }

  console.log(
    `[audit-kode] ${diperiksa} game acak · kurang ${n(langgar.lengkap)} · telat-arsip ${n(langgar.arsip)} · ragu-tak-tampil ${n(langgar.check)}`
    + (total ? ` — dari data MASIH SEGAR (<2j): ${segar.lengkap}/${segar.arsip}/${segar.check}` : ""),
  );
  // Yang dicetak rinci hanya pelanggaran pada data segar: sisanya lag jadwal,
  // dan mencetaknya tiap jam cuma melatih orang mengabaikan laporan ini.
  for (const [jenis, arr] of Object.entries(langgar)) {
    for (const v of arr.filter((x) => x.umurJam <= 2).slice(0, 4)) {
      console.log(`  ! ${jenis}: ${v.code} (${v.game}) — ${v.dari}, data baru ${v.umurJam.toFixed(1)} jam`);
    }
  }
  return { diperiksa, miss: n(langgar.lengkap), gameMiss: new Set(langgar.lengkap.map((v) => v.game)).size, detail: langgar, segar };
}

/**
 * Badge BARU: dihitung dari data kita sendiri, jadi bisa memeriksa SELURUH
 * katalog tanpa satu pun tarikan jaringan. Aturannya disalin dari
 * site/src/lib/roblox.mjs — kalau keduanya berbeda, itu sendiri temuan.
 *
 * @param {object[]} active
 * @param {number} [jendelaJam=24]
 */
export function auditBadgeBaru(active, jendelaJam = 24) {
  const now = Date.now();
  let baru = 0;
  const lewat = [];
  const depan = [];
  for (const c of active) {
    const d = Date.parse(c.date ?? "") || 0;
    const s = Number(c.srcNewAt) || 0;
    const f = Date.parse(c.firstSeenAt ?? "") || 0;
    const bukti = s && f ? Math.min(s, f) : s || f;
    const ms = d || (c.bulk || !c.srcNew ? 0 : bukti);
    if (!ms) continue;
    const umur = (now - ms) / JAM;
    // Stempel di masa depan = BARU selamanya. Diam, dan hanya terlihat kalau
    // seseorang kebetulan memeriksa umurnya.
    if (umur < 0) depan.push({ code: c.code, game: c.game, jam: umur });
    else if (umur <= jendelaJam) baru++;
    else if (umur <= jendelaJam + 1) lewat.push(c.code); // di ambang, wajar
  }
  console.log(`[audit-baru] ${baru} kode berbadge BARU · stempel masa depan: ${depan.length}`);
  for (const d of depan.slice(0, 5)) console.log(`  ! ${d.code} (${d.game}) — bertanggal ${Math.abs(d.jam / 24).toFixed(1)} hari di DEPAN, akan BARU selamanya`);
  return { baru, depan: depan.length };
}
