// Wawasan video: fakta yang diturunkan dari arsip kode kita sendiri.
//
// Yang dijaga di sini bukan "angkanya betul" saja, tapi bahwa modul ini DIAM
// ketika buktinya kurang. Aturan itu satu-satunya yang memisahkan "data unik"
// dari "angka yang kita reka" — dan pelanggarannya sudah pernah terjadi sekali
// (synthSeries, dihapus 9 Agu 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { siklusRilis, kodeSekarat, kodeBaru, kedalamanArsip } from "../video/wawasan.mjs";

const NOW = Date.parse("2026-08-13T00:00:00Z");
const hari = (n) => new Date(NOW - n * 86400000).toISOString();
const kode = (code, extra = {}) => ({ code, ...extra });

test("siklus rilis: gelombang dihitung per HARI rilis, bukan per kode", () => {
  // Tiga kode di hari yang sama = satu gelombang (pola livestream). Kalau
  // dihitung per kode, jedanya terbaca 0 hari dan siklusnya jadi omong kosong.
  const riwayat = [
    kode("A", { date: hari(40) }), kode("B", { date: hari(40) }), kode("C", { date: hari(40) }),
    kode("D", { date: hari(30) }), kode("E", { date: hari(20) }),
    kode("F", { date: hari(10) }), kode("G", { date: hari(2) }),
  ];
  const s = siklusRilis(riwayat, { nowMs: NOW });
  assert.equal(s.gelombang, 5, "5 tanggal rilis berbeda");
  assert.equal(s.totalKode, 7);
  assert.equal(s.jedaMedian, 10);
  assert.equal(s.hariSejak, 2);
  assert.equal(s.jatuhTempo, false, "2 hari < jeda 10 hari");
});

test("siklus rilis: sampel terlalu tipis → null, bukan pola karangan", () => {
  const riwayat = [kode("A", { date: hari(20) }), kode("B", { date: hari(10) })];
  assert.equal(siklusRilis(riwayat, { nowMs: NOW }), null);
});

test("siklus rilis: firstSeenAt TIDAK dianggap tanggal rilis", () => {
  // Katalog yang masuk sekaligus: semua firstSeenAt hari yang sama, tak satu pun
  // punya date. Kalau firstSeenAt dipakai, ini akan terbaca sebagai satu
  // gelombang raksasa dan (lebih buruk) sebagai "kode baru".
  const riwayat = Array.from({ length: 30 }, (_, i) => kode(`K${i}`, { firstSeenAt: hari(5) }));
  assert.equal(siklusRilis(riwayat, { nowMs: NOW }), null);
  assert.deepEqual(kodeBaru(riwayat, { nowMs: NOW }), []);
});

test("siklus rilis: kode bulk & tanggal masa depan dibuang", () => {
  // Tanggal masa depan bukan teori: r1999 menyimpan kode ber-date 2026-12-26
  // (salah parse sumber). Satu tanggal liar cukup merusak median.
  const sehat = [hari(45), hari(36), hari(27), hari(18), hari(9)].map((d, i) => kode(`S${i}`, { date: d }));
  const racun = [
    kode("BULK", { date: hari(200), bulk: true }),
    kode("DEPAN", { date: new Date(NOW + 120 * 86400000).toISOString() }),
  ];
  const bersih = siklusRilis(sehat, { nowMs: NOW });
  const kotor = siklusRilis([...sehat, ...racun], { nowMs: NOW });
  assert.deepEqual(kotor, bersih, "data racun tak boleh mengubah hasil sedikit pun");
  assert.equal(bersih.jedaMedian, 9);
});

test("siklus rilis: jatuhTempo saat jeda biasanya sudah terlewat", () => {
  const riwayat = [hari(50), hari(41), hari(32), hari(23), hari(14)].map((d, i) => kode(`W${i}`, { date: d }));
  const s = siklusRilis(riwayat, { nowMs: NOW });
  assert.equal(s.jedaMedian, 9);
  assert.equal(s.hariSejak, 14);
  assert.ok(s.jatuhTempo, "14 hari sejak rilis terakhir, jeda biasanya 9");
});

test("siklus rilis: rilis berdekatan (≤2 hari) = SATU gelombang", () => {
  // Livestream yang kodenya menyusul besoknya adalah satu peristiwa dipecah dua
  // baris di sumber. Dihitung terpisah, "jarak antar-rilis" tertarik ke bawah
  // oleh jeda satu hari yang sebenarnya bukan jeda.
  const riwayat = [hari(50), hari(40), hari(39), hari(30), hari(20), hari(10), hari(9)].map((d, i) => kode(`G${i}`, { date: d }));
  const s = siklusRilis(riwayat, { nowMs: NOW });
  assert.equal(s.gelombang, 5, "7 tanggal → 5 gelombang (40+39 dan 10+9 masing-masing satu)");
  // Wakil tiap gelombang = tanggal TERAKHIRNYA, jadi jeda diukur 39→30→20→9.
  assert.equal(s.jedaMedian, 11, "jeda 11, 9, 10, 11 → median 10,5 dibulatkan 11 — bukan 1 hari");
  assert.equal(s.hariSejak, 9, "dihitung dari rilis TERAKHIR");
  assert.equal(s.hari.at(-1).slice(0, 10), hari(9).slice(0, 10), "tanggal terakhir yang dipajang = rilis terbaru");
});

test("siklus rilis: tanggal terpajang & 'sejak terakhir' TAK BOLEH beda definisi", () => {
  // Genshin 13 Agu 2026: layar memajang "SEJAK TERAKHIR: 0 hari" tepat di atas
  // deretan tanggal yang berakhir "10 Agu". Sebabnya wakil gelombang dulu
  // tanggal AWAL sementara hariSejak dari rilis TERBARU. Rilis 10, 12, 13 Agu
  // juga menyatu jadi satu gelombang tiga hari karena jaraknya diukur dari
  // tanggal sebelumnya, bukan dari awal gelombang — rantai yang bisa memanjang
  // tanpa batas.
  const riwayat = [30, 20, 12, 10, 3, 1, 0].map((d, i) => kode(`H${i}`, { date: hari(d) }));
  const s = siklusRilis(riwayat, { nowMs: NOW });
  assert.equal(s.hariSejak, 0);
  assert.equal(s.hari.at(-1).slice(0, 10), hari(0).slice(0, 10), "chip terakhir = hari ini, sama dengan hariSejak 0");
  // 3 & 1 hari lalu berjarak 2 hari dari awal gelombang → satu gelombang;
  // hari ini berjarak 3 hari dari awal itu → gelombang BARU, bukan sambungan.
  assert.equal(s.gelombang, 5, "30 · 20 · 12+10 · 3+1 · 0");
});

test("siklus rilis: riwayat purba tak boleh mencemari 'biasanya'", () => {
  // Kasus nyata AFK Journey 13 Agu 2026: dua kode dari 2024 ikut terhitung,
  // rentang grafik jadi 864 hari, dan seluruh siklus 2026 tergencet di 14%
  // kanan layar dengan sumbu berlabel "28 Mar" tanpa tahun. Jendela gelombang
  // terakhir membuang keduanya tanpa menghapus apa pun dari arsip.
  const purba = [kode("P1", { date: hari(800) }), kode("P2", { date: hari(775) })];
  const baru = [60, 51, 42, 33, 24, 15, 6].map((d, i) => kode(`B${i}`, { date: hari(d) }));
  const s = siklusRilis([...purba, ...baru], { nowMs: NOW, maksGelombang: 7 });
  assert.equal(s.gelombang, 7, "hanya 7 gelombang terakhir yang dipakai");
  assert.equal(s.gelombangTotal, 9, "totalnya tetap dilaporkan apa adanya");
  assert.equal(s.jedaMedian, 9, "jeda 775 hari tak ikut hitungan");
  assert.equal(Date.parse(s.hari[0]), Date.parse(hari(60).slice(0, 10)), "jendela mulai dari gelombang ke-3");
  assert.deepEqual(s.jedaTerakhir, [9, 9, 9, 9, 9, 9]);
});

test("siklus rilis: rentang jeda, dan 'telat' diukur dari jarak TERPANJANG", () => {
  // Satu angka rata-rata menyiratkan jadwal yang tak kita ketahui. Dengan
  // rentang, game berjarak 3-30 hari tak dicap "telat" pada hari ke-8 hanya
  // karena mediannya 7 — jarak 30 hari sudah pernah terjadi dan tak aneh.
  const riwayat = [45, 42, 32, 25, 17, 8].map((d, i) => kode(`R${i}`, { date: hari(d) }));
  const s = siklusRilis(riwayat, { nowMs: NOW });
  assert.deepEqual([s.jedaMin, s.jedaMaks], [3, 10], "jeda: 3, 10, 7, 8, 9");
  assert.equal(s.hariSejak, 8);
  assert.ok(s.dalamRentang, "8 hari ada di dalam 3-10");
  assert.ok(!s.jatuhTempo, "belum lewat 10 hari, jadi belum telat");

  // Hari ke-11 baru terhitung lewat.
  const lewat = siklusRilis(riwayat, { nowMs: NOW + 3 * 86400000 });
  assert.equal(lewat.hariSejak, 11);
  assert.ok(lewat.jatuhTempo);
  assert.ok(!lewat.dalamRentang);
});

test("kedalaman arsip: 'sejak' dari firstSeenAt SAJA, tak boleh jatuh ke tanggal rilis", () => {
  // Layar menulis "DIARSIPKAN SEJAK …", jadi jawabannya kapan WORKER pertama
  // melihat kode — bukan kapan developer merilisnya. Versi pertama memakai
  // keduanya dan langsung berbohong: AFK Journey menyimpan kode ber-date Maret
  // 2024, jadi video memajang "DIARSIPKAN SEJAK 28 Mar 2024" — dua tahun
  // sebelum worker ini ada.
  const aktif = [
    kode("A", { date: "2024-03-28T00:00:00Z", firstSeenAt: "2026-07-17T00:00:00Z" }),
    kode("B", { firstSeenAt: "2026-08-01T00:00:00Z" }),
  ];
  const arsip = [kode("C", { firstSeenAt: "2026-07-20T00:00:00Z" })];
  const a = kedalamanArsip(aktif, arsip);
  assert.deepEqual([a.aktif, a.mati, a.total], [2, 1, 3]);
  assert.equal(new Date(a.sejakMs).toISOString().slice(0, 10), "2026-07-17");
});

test("kedalaman arsip: tanpa firstSeenAt sama sekali → sejak null, bukan ditambal", () => {
  const a = kedalamanArsip([kode("A", { date: "2026-01-01T00:00:00Z" })], []);
  assert.equal(a.total, 1);
  assert.equal(a.sejakMs, null, "lebih baik tanggalnya tak muncul daripada muncul salah");
  assert.equal(kedalamanArsip([], []), null, "game tanpa kode sama sekali → adegannya dilewati");
});

test("kode sekarat: hanya yang punya endsAt di masa depan & dekat", () => {
  const codes = [
    kode("SEGERA", { endsAt: new Date(NOW + 2 * 86400000).toISOString() }),
    kode("NANTI", { endsAt: new Date(NOW + 60 * 86400000).toISOString() }),
    kode("PERMANEN", { endsAt: null }),
    // Sudah lewat = bug (sejak 13 Agu archive.mjs memindahkannya otomatis).
    // Menampilkannya sbg "hampir habis" akan menyembunyikan bug itu.
    kode("HARUSNYA_ARSIP", { endsAt: new Date(NOW - 86400000).toISOString() }),
  ];
  const s = kodeSekarat(codes, { nowMs: NOW });
  assert.deepEqual(s.map((x) => x.code), ["SEGERA"]);
  assert.equal(s[0].sisaHari, 2);
});

test("kode baru: umur dibuktikan tanggal rilis, bukan kapan kita melihatnya", () => {
  const codes = [
    kode("BARUBGT", { date: hari(0) }),
    kode("KEMARIN", { date: hari(1) }),
    kode("LAMA", { date: hari(30) }),
    kode("MENYAMAR", { firstSeenAt: hari(0) }), // tak punya date → bukan bukti
  ];
  assert.deepEqual(kodeBaru(codes, { nowMs: NOW }).map((x) => x.code), ["BARUBGT", "KEMARIN"]);
});
