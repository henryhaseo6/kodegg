// Audit konsistensi data (BACA-SAJA, tak pernah menggagalkan run).
//
// Kenapa ada: bug data di proyek ini hampir semuanya jenis yang MENUMPUK DIAM-DIAM
// lintas-run, bukan yang meledak sekali. Contoh nyata 1 Agt 2026 — kode yang
// sempat hilang dari sumber lalu muncul lagi tertinggal di arsip, sehingga satu
// kode tampil AKTIF sekaligus EXPIRED. Waktu ketahuan sudah 521 kode di 45 game
// (Sailor Piece: 162 dari 171 kode aktifnya). Kalau ada yang melapor sejak hari
// pertama, angkanya tak akan sampai segitu.
//
// SENGAJA non-blocking (selalu exit 0). Audit yang membuat pipeline merah malah
// membuat merahnya diabaikan — dan run merah yang "wajar" adalah cara tercepat
// kehilangan kepercayaan pada sinyal.
//
// Pakai: node worker/audit-data.mjs   (dijalankan juga tiap run update-codes)
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// KODEGG_DATA: arahkan ke direktori lain utk MENGUJI audit dg data rusak buatan.
// (Audit yang tak pernah terbukti berbunyi tak ada gunanya.)
const DATA = process.env.KODEGG_DATA || resolve(dirname(fileURLToPath(import.meta.url)), "data");
const baca = (f, d = null) => { try { return existsSync(resolve(DATA, f)) ? JSON.parse(readFileSync(resolve(DATA, f), "utf8")) : d; } catch { return d; } };

const rb = baca("roblox-codes.json", { games: {}, active: [], archive: [] });
const mc = baca("codes.json", { active: [], archive: [] });
const gj = baca("games.json", { games: [] });
const pl = baca("yt-playlists.json", {});
const st = baca("video-state.json", {});

const temuan = [];
const lapor = (parah, judul, detail) => temuan.push({ parah, judul, detail });
const kunciCI = (c) => `${c.game ?? "-"}:${String(c.code ?? "").toLowerCase()}`;
const potong = (arr, n = 8) => arr.slice(0, n).join(", ") + (arr.length > n ? ` (+${arr.length - n} lagi)` : "");

// 1. Entity HTML tersisa. Sumber meng-escape teks di HTML; kalau lolos ke data,
//    Astro meng-escape "&"-nya lagi → pembaca melihat "Soul&#x27;s Crossover X".
const ENT = /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi;
for (const [nama, d] of [["roblox-codes", rb], ["codes", mc], ["games", gj]]) {
  const n = (JSON.stringify(d).match(ENT) ?? []).length;
  if (n) lapor("TINGGI", `entity HTML tersisa di ${nama}.json`, `${n} kemunculan — lihat decodeEntities di src/normalize.mjs`);
}

// 2. Kode AKTIF yang juga ada di ARSIP → halaman game menampilkannya sbg aktif
//    DAN expired sekaligus, plus hitungan arsip menggelembung. Dibandingkan
//    case-insensitive: "UMA" aktif vs "Uma" di arsip tetap menyesatkan.
for (const [nama, d] of [["ROBLOX", rb], ["MOBILE", mc]]) {
  const aktif = new Set((d.active ?? []).map(kunciCI));
  const bentrok = (d.archive ?? []).filter((c) => aktif.has(kunciCI(c)));
  if (bentrok.length) {
    const perGame = {};
    for (const c of bentrok) perGame[c.game] = (perGame[c.game] ?? 0) + 1;
    const top = Object.entries(perGame).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, n]) => `${g}(${n})`);
    lapor("TINGGI", `kode ${nama} tercatat AKTIF sekaligus EXPIRED`, `${bentrok.length} kode di ${Object.keys(perGame).length} game — terbanyak: ${top.join(", ")}`);
  }
}

// 3. Duplikat kapitalisasi. MOBILE harus 0 (dedup case-insensitive di
//    fetch-codes). ROBLOX case-sensitive by design → INFO, perlu mata manusia.
for (const [nama, arr, parah] of [["MOBILE aktif", mc.active ?? [], "TINGGI"], ["ROBLOX aktif", rb.active ?? [], "INFO"]]) {
  const by = new Map();
  for (const c of arr) by.set(kunciCI(c), [...(by.get(kunciCI(c)) ?? []), c.code]);
  // `new Set(v).size > 1` — hanya yang tulisannya BEDA. Kalau sama persis itu
  // duplikat persis, sudah dilaporkan pemeriksaan tersendiri di bawah.
  const dup = [...by.values()].filter((v) => new Set(v).size > 1);
  if (dup.length) lapor(parah, `duplikat kapitalisasi di ${nama}`, potong(dup.map((v) => v.join("/")), 6) + (parah === "INFO" ? " — Roblox memang case-sensitive, cek manual apakah benar-benar kode berbeda" : ""));
}

// 4. Duplikat PERSIS — dua entri identik dalam satu daftar.
for (const [nama, arr] of [["mobile aktif", mc.active ?? []], ["roblox aktif", rb.active ?? []]]) {
  const seen = new Set(), dup = [];
  for (const c of arr) { const k = `${c.game}:${c.code}`; if (seen.has(k)) dup.push(k); seen.add(k); }
  if (dup.length) lapor("TINGGI", `duplikat PERSIS di ${nama}`, potong(dup));
}

// 5. Nama game masih kotor: tag "[UPD]" nyangkut di `name` (bukan rawName),
//    entity, atau spasi ganda. `name` dipakai judul halaman, video, & playlist.
const namaAneh = Object.entries(rb.games ?? {}).filter(([, g]) => /^\[|&#|\s{2,}/.test(g.name ?? "")).map(([id, g]) => `${id}="${g.name}"`);
if (namaAneh.length) lapor("SEDANG", "nama game kotor (tag/entity/spasi ganda)", potong(namaAneh, 6));

// 6. Peta playlist menunjuk game yang tak ada di registry mana pun → tombol
//    "Video di YouTube" menaut ke game hantu.
const idRoblox = new Set(Object.keys(rb.games ?? {}));
const idMobile = new Set((gj.games ?? []).map((g) => g.id));
const yatim = Object.keys(pl).filter((k) => k !== "roblox-promo" && !idRoblox.has(k) && !idMobile.has(k));
if (yatim.length) lapor("SEDANG", "entri yt-playlists.json menunjuk game tak dikenal", yatim.join(", "));

// 7. Tanggal rilis di MASA DEPAN (>1 hari) — biasanya salah parse sumber, dan
//    kode begini melompat ke puncak sort "Terbaru".
const masaDepan = [...(mc.active ?? []), ...(rb.active ?? [])].filter((c) => { const t = Date.parse(c.date ?? ""); return t && t > Date.now() + 864e5; });
if (masaDepan.length) lapor("SEDANG", "kode bertanggal di MASA DEPAN", potong(masaDepan.map((c) => `${c.game}:${c.code}=${String(c.date).slice(0, 10)}`), 6));

// 8. counts di file tak cocok dg isi sebenarnya → angka di situs meleset.
for (const [nama, d] of [["roblox-codes", rb], ["codes", mc]]) {
  if (!d.counts) continue;
  const a = (d.active ?? []).length, r = (d.archive ?? []).length;
  if ((d.counts.active ?? a) !== a || (d.counts.archived ?? r) !== r) lapor("SEDANG", `counts ${nama}.json meleset`, `tertulis ${d.counts.active}/${d.counts.archived}, sebenarnya ${a}/${r}`);
}

// 8b. Komposisi ALASAN arsip (expiredBy). Bukan cacat — tapi pergeseran tajam
//     berarti ada yang berubah: mis. lonjakan "editorial" bisa berarti parsing
//     satu situs rusak & membunuh kode yang masih hidup; lonjakan "hilang"
//     berarti sumber berhenti mendaftarkan kode secara massal.
for (const [nama, d] of [["ROBLOX", rb], ["MOBILE", mc]]) {
  const arc = (d.archive ?? []).filter((c) => c.expiredBy);
  if (!arc.length) continue;
  const per = {};
  for (const c of arc) per[c.expiredBy] = (per[c.expiredBy] ?? 0) + 1;
  const rinci = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${Math.round((v / arc.length) * 100)}%)`).join(" · ");
  lapor("INFO", `alasan arsip ${nama}`, `${arc.length} tercatat — ${rinci}`);
}

// 8c. Slug sumber yang 404 permanen (ditulis fetch-roblox). Kegagalan penarikan
//     per-game DIAM, jadi tanpa laporan ini sebuah game bisa menyajikan data beku
//     berbulan-bulan. Yang TANPA sumber lain = benar-benar mati, harus ditangani.
const mati = baca("slug-404.json", []);
if (mati.length) {
  const buta = mati.filter((m) => !m.denSlug);
  const besar = mati.filter((m) => (m.players ?? 0) >= 10000).map((m) => `${m.game}(${m.players})`);
  if (buta.length) lapor("TINGGI", "game TANPA sumber hidup (slug RoCodes 404 & tak ada di Den)", potong(buta.map((m) => m.game)));
  lapor(besar.length ? "SEDANG" : "INFO", "slug RoCodes 404 (masih tertutup Roblox Den)",
    `${mati.length} game${besar.length ? ` — besar: ${potong(besar, 6)}` : ""}`);
}

// 8d. MOBILE BEKU — game yang sumbernya gagal ditarik berturut-turut.
//
// Kegagalan penarikan per-game DIAM: mergeWithPrevious mempertahankan kode lama
// dengan `stale: true` (benar — hilangnya kode saat sumber gagal tak bermakna),
// tapi tak ada satu pun yang melapor. Terbukti 12 Agu 2026: crimsonwitch —
// SATU-SATUNYA sumber Infinity Nikki — gagal sejak 7 Agu 12.21 dan baru pulih 11
// Agu. Empat hari game itu menyajikan daftar beku, dan yang akhirnya menyadari
// bukan pipeline melainkan pemilik situs yang curiga badge BARU tak muncul.
// Saat sumber pulih, 3 kode masuk sekaligus → video menandai semuanya baru.
//
// SENGAJA hanya MOBILE. Di Roblox, `stale` adalah keadaan NORMAL: penarikan
// dirotasi per-pemain (MAX_GAMES < jumlah game), jadi mayoritas game memang tak
// disentuh tiap run dan pemeriksaan ini akan berbunyi ratusan kali tanpa arti.
// Sumber Roblox yang benar-benar mati sudah ditangani 8c (slug-404.json).
//
// BUTA TERHADAP: game yang SELURUH kode aktifnya keburu terarsip — tak ada baris
// tersisa yang membawa `fetchedAt`, jadi kebekuannya tak terlihat di sini.
let bekuJamMax = 0; // dipakai lagi di blok KESEHATAN PARSER (disimpan ke health.json)
let bekuGame = 0;
{
  const perGame = new Map();
  for (const c of mc.active ?? []) {
    if (!c.game) continue;
    const g = perGame.get(c.game) ?? { beku: 0, terakhir: 0, sumber: new Set(), nama: c.gameName ?? c.game };
    if (c.stale) g.beku += 1;
    const t = Date.parse(c.fetchedAt ?? "") || 0;
    if (t > g.terakhir) g.terakhir = t; // penarikan SUKSES terakhir utk game ini
    for (const s of (c.sources?.length ? c.sources : [c.source])) if (s) g.sumber.add(s);
    perGame.set(c.game, g);
  }
  // `stale` dipasang saat TAK ADA satu pun sumber yang meng-cover game itu, jadi
  // satu kode beku = seluruh game beku. Umur dihitung dari fetchedAt TERBARU.
  const beku = [...perGame.entries()]
    .filter(([, g]) => g.beku > 0 && g.terakhir > 0)
    .map(([id, g]) => ({ id, ...g, jam: Math.round((Date.now() - g.terakhir) / 36e5) }))
    .sort((a, b) => b.jam - a.jam);
  // Cron mobile jalan tiap jam. Satu-dua run meleset itu wajar (sumber ngadat
  // sesaat, rate-limit) → jangan berbunyi. Yang tak wajar adalah kebekuan yang
  // BERTAHAN: 6 jam = sudah ~6 run gagal beruntun, 24 jam = sumbernya mati.
  const mati = beku.filter((g) => g.jam >= 24);
  const goyah = beku.filter((g) => g.jam >= 6 && g.jam < 24);
  const sebut = (arr) => potong(arr.map((g) => `${g.nama} ${g.jam}j (${[...g.sumber].join("+") || "?"})`), 6);
  if (mati.length) lapor("TINGGI", "game MOBILE beku ≥24 jam", `${sebut(mati)} — sumbernya gagal ditarik berturut-turut; kode baru tak akan masuk & daftarnya menyesatkan`);
  if (goyah.length) lapor("SEDANG", "game MOBILE beku ≥6 jam", `${sebut(goyah)} — pantau, kalau tembus 24 jam berarti sumbernya mati`);
  // Sumber yang SEMUA gamenya beku = sumbernya yang mati, bukan game-nya. Beda
  // penanganan: satu game beku bisa jadi slug berubah; satu sumber beku total
  // berarti markup/akses berubah (crimsonwitch 403, host memblokir, dst).
  const perSumber = new Map();
  for (const [, g] of perGame) for (const s of g.sumber) {
    const v = perSumber.get(s) ?? { n: 0, beku: 0 };
    v.n += 1; if (g.beku > 0) v.beku += 1;
    perSumber.set(s, v);
  }
  const sumberMati = [...perSumber.entries()].filter(([, v]) => v.n >= 2 && v.beku === v.n).map(([s, v]) => `${s} (${v.n} game)`);
  if (sumberMati.length) lapor("TINGGI", "sumber MOBILE tak menghasilkan apa pun", `${sumberMati.join(", ")} — seluruh game yang bergantung padanya beku`);
  bekuJamMax = beku[0]?.jam ?? 0;
  bekuGame = beku.filter((g) => g.jam >= 6).length;
}

// 9. Antrian tertunda — kalau bertahan berhari-hari berarti pengurasnya macet.
const pv = baca("pending-videos.json", []), pp = baca("pending-playlists.json", []);
if (pp.length) lapor("SEDANG", "antrian playlist tertunda", `${pp.length} video sudah naik tapi belum masuk playlist`);
if (pv.length) lapor("INFO", "antrian video tertunda", `${pv.length} kandidat menunggu run berikutnya`);

// 10. Gerbang rekap promo: promoMonth harus = bulan WIB begitu rekap bulan ini
//     dibuat. Beda = normal di awal bulan, MENCURIGAKAN kalau bertahan lama.
const bulanWIB = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
if (st?.promoMonth && st.promoMonth !== bulanWIB) lapor("INFO", "promoMonth belum menyusul bulan WIB", `${st.promoMonth} vs ${bulanWIB} — wajar bila rekap bulan ini memang belum dibuat`);

// 11. KESEHATAN PARSER — pemeriksaan yang membandingkan run ini dengan RIWAYAT.
//
// Kelas bug paling berbahaya di proyek ini bukan yang meledak, tapi yang DIAM:
// sumber mengubah markupnya, parser kita memulangkan kosong, dan tak ada yang
// menjerit. Dua kali dalam dua hari dari sumber yang sama (4 Agu 2026):
//   - parser howTo Den kelewat judul "How to CLAIM" → 30 dari 30 halaman kosong
//   - parser reward Den kelewat kelas <td search-term> → 3.435 kode tanpa reward
// Keduanya ketahuan hanya karena user kebetulan membuka halaman dan curiga.
//
// Pemeriksaan berbasis AMBANG TETAP tak cukup: nilai wajar tiap metrik berbeda
// dan bergeser seiring katalog tumbuh. Yang dipakai di sini adalah PERBANDINGAN
// DENGAN DIRI SENDIRI — median beberapa run terakhir. Anjlok mendadak = sesuatu
// rusak, apa pun angka absolutnya.
{
  const HFILE = resolve(DATA, "health.json");
  const dariDen = (c) => (c.sources?.length ? c.sources : [c.source]).some((x) => /Den/i.test(x || ""));
  const dariRo = (c) => (c.sources?.length ? c.sources : [c.source]).some((x) => /RoCodes/i.test(x || ""));
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const aktif = rb.active ?? [];
  const den = aktif.filter(dariDen), ro = aktif.filter(dariRo);
  const gDen = Object.values(rb.games ?? {}).filter((g) => g.denSlug);

  const kini = {
    at: new Date().toISOString(),
    aktif: aktif.length,
    denKode: den.length,
    roKode: ro.length,
    denRewardPct: pct(den.filter((c) => c.reward).length, den.length),
    roRewardPct: pct(ro.filter((c) => c.reward).length, ro.length),
    howToPct: pct(gDen.filter((g) => (g.howTo ?? []).length).length, gDen.length),
    // Sinyal-sinyal yang SEBELUMNYA tak dipantau sama sekali, padahal tiap satu
    // dari mereka rusak diam-diam akan mematikan satu fitur tanpa jejak:
    //   srcNew  → badge BARU & pemicu video "kode baru" berhenti
    //   notice  → syarat redeem (mis. RIVALS wajib follow) hilang dari situs+video
    //   denSlug → cakupan sumber kedua menyusut
    srcNewPct: pct(den.filter((c) => c.srcNew).length, den.length),
    noticeGame: Object.values(rb.games ?? {}).filter((g) => g.redeemNote).length,
    denSlugGame: gDen.length,
    cekDuluPct: pct(aktif.filter((c) => c.check).length, aktif.length),
    game: Object.keys(rb.games ?? {}).length,
    // Kebekuan MOBILE (lihat 8d). Disimpan walau sudah dilaporkan, karena yang
    // dicari justru POLANYA: sumber yang tiap hari beku 3-4 jam lalu pulih tak
    // pernah memicu ambang 6 jam, tapi riwayatnya menunjukkan ia rapuh.
    mobileBekuJam: bekuJamMax,
    mobileBekuGame: bekuGame,
  };

  let riwayat = baca("health.json", []);
  if (!Array.isArray(riwayat)) riwayat = [];
  const med = (kunci) => {
    const v = riwayat.map((r) => r[kunci]).filter((x) => typeof x === "number").sort((a, b) => a - b);
    return v.length >= 3 ? v[Math.floor(v.length / 2)] : null; // <3 sampel = belum ada dasar
  };
  // Anjlok >50% dari median = curiga rusak. Ambang longgar supaya fluktuasi
  // wajar (katalog bertambah/berkurang) tak berbunyi.
  for (const [kunci, nama] of [
    ["denRewardPct", "% kode Den punya reward"],
    ["roRewardPct", "% kode RoCodes punya reward"],
    ["howToPct", "% game punya cara redeem"],
    ["denKode", "jumlah kode dari Roblox Den"],
    ["roKode", "jumlah kode dari RoCodes"],
    ["aktif", "jumlah kode aktif"],
    ["srcNewPct", "% kode Den ber-penanda NEW"],
    ["noticeGame", "game punya syarat redeem"],
    ["denSlugGame", "game terhubung ke Roblox Den"],
  ]) {
    const dasar = med(kunci), skr = kini[kunci];
    if (dasar == null || skr == null || dasar <= 0) continue;
    if (skr < dasar * 0.5) lapor("TINGGI", `ANJLOK: ${nama}`, `${skr} sekarang vs ${dasar} (median ${riwayat.length} run terakhir) — kemungkinan parser sumbernya rusak / markup berubah`);
  }
  // Jaring tanpa riwayat: nol mutlak padahal datanya banyak = pasti rusak.
  // Ini yang akan menangkap kasus 4 Agu bahkan di pemasangan yang masih bersih.
  if (den.length > 200 && kini.denRewardPct === 0) lapor("TINGGI", "parser reward Roblox Den memulangkan NOL", `${den.length} kode dari Den, tak satu pun punya reward`);
  if (gDen.length > 50 && kini.howToPct === 0) lapor("TINGGI", "parser cara-redeem Roblox Den memulangkan NOL", `${gDen.length} game punya halaman Den, tak satu pun punya langkah redeem`);
  if (den.length > 500 && kini.srcNewPct === 0) lapor("TINGGI", "penanda NEW Roblox Den memulangkan NOL", `${den.length} kode dari Den, tak satu pun ber-penanda — badge BARU & video "kode baru" akan berhenti`);
  if (gDen.length > 100 && kini.noticeGame === 0) lapor("TINGGI", "spanduk syarat redeem Roblox Den memulangkan NOL", "tak satu pun game punya syarat redeem — parser spanduk kemungkinan rusak");
  // CEK DULU menumpuk = sapuan cek-mandek macet atau sumber membanjiri kode ragu.
  if (kini.cekDuluPct != null && kini.cekDuluPct > 25) lapor("SEDANG", "kode CEK DULU menumpuk", `${kini.cekDuluPct}% kode aktif berstatus ragu`);

  // Simpan snapshot (maks 72 ≈ 3 hari). Ini SATU-SATUNYA berkas yang ditulis
  // audit — data sumber tak pernah disentuh.
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(HFILE, JSON.stringify([kini, ...riwayat].slice(0, 72), null, 1) + "\n");
  } catch { /* jangan pernah menggagalkan audit */ }
}

// ── keluaran ────────────────────────────────────────────────────────────────
const urut = { TINGGI: 0, SEDANG: 1, INFO: 2 };
temuan.sort((a, b) => urut[a.parah] - urut[b.parah]);
const n = (p) => temuan.filter((t) => t.parah === p).length;
console.log(`AUDIT DATA — ${n("TINGGI")} TINGGI · ${n("SEDANG")} SEDANG · ${n("INFO")} INFO`);
console.log(`  skala: ${(rb.active ?? []).length} kode roblox · ${(mc.active ?? []).length} kode mobile · ${Object.keys(rb.games ?? {}).length} game roblox · ${Object.keys(pl).length} playlist`);
for (const t of temuan) console.log(`\n[${t.parah}] ${t.judul}\n        ${t.detail}`);
if (!temuan.length) console.log("  bersih — tak ada temuan.");
// SELALU 0: lihat catatan non-blocking di kepala berkas.
process.exit(0);
