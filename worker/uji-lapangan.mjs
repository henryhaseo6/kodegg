// KEBENARAN LAPANGAN — hasil uji kode langsung di dalam game, dicatat manual.
//
// Kenapa perlu file terpisah. Seluruh sistem badge kita adalah TEBAKAN yang
// disusun dari perilaku agregator: berapa sumber mendaftarkan sebuah kode,
// berapa umurnya, apakah salah satu sumber ragu. Tak satu pun dari itu
// membuktikan kode benar-benar bisa ditukar. Satu-satunya bukti adalah
// memasukkan kodenya ke gamenya, dan itu cuma bisa dilakukan manusia.
//
// Uji semacam itu mahal (menit per game) dan tak bisa diulang: begitu kode
// mati, kesempatan menguji kondisi "hidup"-nya hilang selamanya. Maka tiap
// hasil disimpan permanen di sini, lengkap dengan POTRET KEADAAN BADGE PADA
// DETIK UJI — bukan sekadar vonisnya.
//
// Potret itu bagian terpentingnya. Nilai data ini ada pada pasangan
// (apa yang KITA klaim, apa yang TERNYATA benar). Kalau kita cuma menyimpan
// "kode X mati", lalu minggu depan menariknya lagi dari roblox-codes.json,
// keadaannya sudah bergeser — kode sudah pindah ke arsip, flagnya berubah,
// umurnya bertambah. Yang tersisa cuma vonis tanpa dakwaan. Karena itu badge,
// daftar sumber, umur, dan flag dibekukan di sini saat pencatatan.
//
// Dipakai untuk MENGKALIBRASI ambang, bukan untuk mengubah tampilan situs.
// Sampel masih terlalu kecil untuk dijadikan aturan; ia menumpuk dulu.
//
//   node worker/uji-lapangan.mjs catat <slug> <hidup|mati> KODE [KODE...]
//   node worker/uji-lapangan.mjs lapor

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, "data", "uji-lapangan.json");
const SUMBER = path.join(DIR, "data", "roblox-codes.json");

const baca = (p, kosong) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : kosong);

/** Badge yang DICETAK situs — harus mengikuti urutan di CodeCard.astro:
 *  keraguan diperiksa LEBIH DULU daripada verified, karena kode yang Den
 *  ragukan tapi RoCodes masih daftarkan tetap `verified` di data. */
export const badgeDari = (c) =>
  c.check || c.srcCheck || c.tuaRagu ? "CHECK" : c.verified ? "VERIFIED" : "ACTIVE";

const umurHari = (c, now) => {
  const lahir = Date.parse(c.date ?? "") || 0;
  return lahir ? Math.round((now - lahir) / 864e5) : null;
};

function potret(c, now) {
  return {
    badge: badgeDari(c),
    sources: c.sources ?? [],
    date: c.date ?? null,
    umurHari: umurHari(c, now),
    firstSeenAt: c.firstSeenAt ?? null,
    status: c.status ?? "active",
    flags: [
      c.bulk && "bulk",
      c.check && "check",
      c.srcCheck && "srcCheck",
      c.tuaRagu && "tuaRagu",
      c.srcNew && "srcNew",
      c.verified && "verified",
    ].filter(Boolean),
  };
}

function catat(slug, vonis, kode) {
  if (!["hidup", "mati"].includes(vonis)) throw new Error(`vonis harus "hidup" atau "mati", bukan "${vonis}"`);
  const d = baca(SUMBER, null);
  if (!d) throw new Error("roblox-codes.json tak ditemukan");
  const gid = Object.keys(d.games).find((k) => (d.games[k].slug ?? "") === slug);
  if (!gid) throw new Error(`game dengan slug "${slug}" tak ada`);

  const now = Date.now();
  const tgl = new Date(now).toISOString().slice(0, 10);
  const semua = [...d.active, ...d.archive].filter((c) => c.game === gid);
  const memo = baca(BERKAS, { versi: 1, uji: [] });

  let baru = 0;
  const hilang = [];
  for (const kd of kode) {
    const c = semua.find((x) => String(x.code).toLowerCase() === kd.toLowerCase());
    if (!c) { hilang.push(kd); continue; }
    // Uji ULANG kode yang sama boleh: kode hidup bisa mati kemudian, dan
    // pergantian itu justru datanya. Yang ditolak cuma duplikat persis
    // (kode + tanggal + vonis sama) supaya menjalankan ulang perintah yang
    // sama tak menggandakan sampel dan memiringkan hitungan akurasi.
    const kembar = memo.uji.some(
      (u) => u.game === slug && u.code === c.code && u.diuji === tgl && u.vonis === vonis,
    );
    if (kembar) continue;
    memo.uji.push({
      diuji: tgl,
      game: slug,
      namaGame: d.games[gid].name,
      code: c.code,
      vonis,
      saatUji: potret(c, now),
    });
    baru += 1;
  }

  memo.uji.sort((a, b) => a.diuji.localeCompare(b.diuji) || a.game.localeCompare(b.game) || a.code.localeCompare(b.code));
  fs.writeFileSync(BERKAS, JSON.stringify(memo, null, 1) + "\n");
  console.log(`${d.games[gid].name}: ${baru} hasil "${vonis}" dicatat · total sampel ${memo.uji.length}`);
  if (hilang.length) console.log(`  TAK KETEMU di data (cek ejaan/kapitalisasi): ${hilang.join(", ")}`);
}

function lapor() {
  const memo = baca(BERKAS, { versi: 1, uji: [] });
  if (!memo.uji.length) return console.log("belum ada sampel");

  const N = memo.uji.length;
  const game = new Set(memo.uji.map((u) => u.game));
  console.log(`SAMPEL: ${N} kode dari ${game.size} game · ${memo.uji.filter((u) => u.vonis === "hidup").length} hidup, ${memo.uji.filter((u) => u.vonis === "mati").length} mati\n`);

  const tabel = (judul, kunci) => {
    const ct = new Map();
    for (const u of memo.uji) {
      const k = kunci(u);
      if (k == null) continue;
      const v = ct.get(k) ?? [0, 0];
      v[u.vonis === "mati" ? 1 : 0] += 1;
      ct.set(k, v);
    }
    console.log(judul);
    for (const [k, [h, m]] of [...ct].sort()) {
      const pct = ((100 * m) / (h + m)).toFixed(0);
      console.log(`  ${String(k).padEnd(16)}${String(h).padStart(3)} hidup · ${String(m).padStart(3)} mati  → ${pct.padStart(3)}% mati`);
    }
    console.log();
  };

  tabel("Menurut BADGE yang kita cetak:", (u) => u.saatUji.badge);
  tabel("Menurut jumlah SUMBER:", (u) => (u.saatUji.sources.length > 1 ? "2 sumber" : "sendirian"));
  tabel("Menurut UMUR kode:", (u) => {
    const d = u.saatUji.umurHari;
    if (d == null) return "tanpa tanggal";
    return d < 7 ? "a. <7 hari" : d < 14 ? "b. 7-14 hari" : d < 30 ? "c. 14-30 hari" : d < 90 ? "d. 30-90 hari" : "e. 90+ hari";
  });

  // Akurasi badge = seberapa sering tampilan kita sesuai kenyataan. VERIFIED
  // dan ACTIVE mengklaim kode bisa dipakai; CHECK mengklaim ragu. Kita hitung
  // dua kesalahan itu terpisah karena harganya beda jauh bagi visitor:
  // menyodorkan kode mati sebagai Verified merusak kepercayaan, sedangkan
  // meragukan kode yang hidup cuma bikin ragu-ragu sesaat.
  const janjiHidup = memo.uji.filter((u) => u.saatUji.badge !== "CHECK");
  const janjiRagu = memo.uji.filter((u) => u.saatUji.badge === "CHECK");
  const salahJanji = janjiHidup.filter((u) => u.vonis === "mati");
  const raguKeliru = janjiRagu.filter((u) => u.vonis === "hidup");
  console.log("AKURASI:");
  console.log(`  kita bilang bisa dipakai (VERIFIED/ACTIVE): ${janjiHidup.length} kode → ${salahJanji.length} ternyata mati`);
  if (salahJanji.length) for (const u of salahJanji) console.log(`     ! ${u.code} (${u.namaGame}) — ${u.saatUji.badge}, ${u.saatUji.sources.length} sumber, umur ${u.saatUji.umurHari ?? "?"} hari`);
  console.log(`  kita bilang ragu (CHECK):                   ${janjiRagu.length} kode → ${raguKeliru.length} ternyata masih hidup`);
  if (raguKeliru.length) for (const u of raguKeliru) console.log(`     ? ${u.code} (${u.namaGame}) — ${u.saatUji.sources.length} sumber, umur ${u.saatUji.umurHari ?? "?"} hari`);
}

const [cmd, ...arg] = process.argv.slice(2);
if (cmd === "catat") catat(arg[0], arg[1], arg.slice(2));
else if (cmd === "lapor") lapor();
else {
  console.log("node worker/uji-lapangan.mjs catat <slug> <hidup|mati> KODE [KODE...]");
  console.log("node worker/uji-lapangan.mjs lapor");
}
