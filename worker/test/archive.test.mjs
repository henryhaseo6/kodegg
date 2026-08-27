// Jalankan: node --test
//
// Fokus: pengaman arsip. Arsip tidak pernah dihapus (CLAUDE.md), jadi salah
// mengarsipkan bersifat permanen — perilaku di bawah wajib dipertahankan.

import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeWithPrevious } from "../src/archive.mjs";
import { normalizeReward, decodeEntities } from "../src/normalize.mjs";

const NOW = "2026-07-16T10:00:00Z";
const OLD = "2026-07-01T00:00:00Z";

const prevWith = (...active) => ({ active, archive: [] });
const hoyoCode = (game, code) => ({
  game,
  code,
  source: "hoyo-codes",
  firstSeenAt: OLD,
});

test("kode yang hilang dari sumber sehat → diarsipkan sebagai expired", () => {
  const prev = prevWith(hoyoCode("gi", "HILANG"));
  const { active, archive } = mergeWithPrevious([], [], prev, new Set(["gi"]), NOW);

  assert.equal(active.length, 0);
  assert.equal(archive.length, 1);
  assert.equal(archive[0].code, "HILANG");
  assert.equal(archive[0].status, "expired");
  assert.equal(archive[0].expiredAt, NOW);
});

test("game PENSIUN → kodenya diarsipkan, bukan ditahan sbg stale selamanya", () => {
  // Pengaman "sumber gagal → pertahankan" mengasumsikan kegagalan itu SEMENTARA.
  // Untuk game yang sumbernya dicabut permanen asumsi itu salah, dan kodenya
  // dipajang sbg aktif tanpa batas (Guardian Tales: 39 hari). Yang benar bukan
  // menghapusnya — arsip = database (CLAUDE.md) — tapi memindahkannya ke arsip.
  const prev = prevWith(hoyoCode("gtales", "NEMESIS"), hoyoCode("gi", "GI_BEKU"));
  const covered = new Set(["hsr"]); // gtales & gi sama-sama tak tertarik run ini

  const { active, archive } = mergeWithPrevious([], [], prev, covered, NOW, {
    pensiun: new Set(["gtales"]),
  });

  const arsip = archive.find((c) => c.code === "NEMESIS");
  assert.ok(arsip, "kode game pensiun harus pindah ke arsip");
  assert.equal(arsip.expiredBy, "pensiun", "alasannya harus terbaca di audit");
  assert.ok(!active.some((c) => c.code === "NEMESIS"));

  // Game yang sumbernya cuma SEDANG ngadat tak boleh ikut kena.
  const gi = active.find((c) => c.code === "GI_BEKU");
  assert.ok(gi, "game non-pensiun tetap dipertahankan saat sumbernya gagal");
  assert.equal(gi.stale, true);
});
test("sumber gagal ditarik → kodenya DIPERTAHANKAN, bukan diarsipkan", () => {
  // Regresi: tanpa pengaman ini, satu kali sumber down mengarsipkan massal
  // seluruh kode aktif game tersebut — dan arsip tidak bisa dibatalkan.
  const prev = prevWith(hoyoCode("gi", "GI_AKTIF"), hoyoCode("hsr", "HSR_HILANG"));
  const covered = new Set(["hsr"]); // 'gi' gagal ditarik

  const { active, archive } = mergeWithPrevious([], [], prev, covered, NOW);

  const gi = active.find((c) => c.code === "GI_AKTIF");
  assert.ok(gi, "kode dari sumber yang gagal harus tetap aktif");
  assert.equal(gi.stale, true);
  assert.ok(!archive.some((c) => c.code === "GI_AKTIF"));

  assert.ok(
    archive.some((c) => c.code === "HSR_HILANG"),
    "sumber sehat tetap boleh mengarsipkan",
  );
});

test("firstSeenAt dipertahankan lintas-run (mengisi label 'Terpantau sejak')", () => {
  const prev = prevWith(hoyoCode("gi", "TETAP"));
  const fresh = [{ game: "gi", code: "TETAP", source: "hoyo-codes" }];

  const { active } = mergeWithPrevious(fresh, [], prev, new Set(["gi"]), NOW);

  assert.equal(active[0].firstSeenAt, OLD, "tanggal deteksi pertama tidak boleh direset");
  assert.equal(active[0].fetchedAt, NOW);
});

test("kode baru mendapat firstSeenAt = sekarang", () => {
  const fresh = [{ game: "gi", code: "BARU", source: "hoyo-codes" }];
  const { active } = mergeWithPrevious(fresh, [], { active: [], archive: [] }, new Set(["gi"]), NOW);
  assert.equal(active[0].firstSeenAt, NOW);
});

test("kode yang sudah diarsipkan tidak diarsipkan dua kali", () => {
  const prev = { active: [hoyoCode("gi", "DOBEL")], archive: [{ game: "gi", code: "DOBEL", status: "expired" }] };
  const { archive } = mergeWithPrevious([], [], prev, new Set(["gi"]), NOW);
  assert.equal(archive.filter((c) => c.code === "DOBEL").length, 1);
});

test("arsip EKSPLISIT: kode yang sumber tandai expired langsung masuk arsip", () => {
  const freshArchive = [{ game: "hi3", code: "KIANA2025", status: "expired", source: "wiki" }];
  const { active, archive } = mergeWithPrevious([], freshArchive, { active: [], archive: [] }, new Set(["hi3"]), NOW);
  assert.equal(active.length, 0);
  assert.equal(archive.length, 1);
  assert.equal(archive[0].code, "KIANA2025");
  assert.equal(archive[0].status, "expired");
  assert.equal(archive[0].expiredAt, NOW);
});

test("arsip eksplisit tidak menang atas kode AKTIF (dedup: aktif menang)", () => {
  // Kode yang muncul di daftar aktif DAN ditandai expired eksplisit → tetap
  // aktif, tidak dobel ke arsip. (fetch-codes sudah memfilter, ini jaring aman.)
  const fresh = [{ game: "gi", code: "SAMA", source: "hoyo-codes" }];
  const freshArchive = [{ game: "gi", code: "SAMA", status: "expired", source: "wiki" }];
  const { active, archive } = mergeWithPrevious(fresh, freshArchive, { active: [], archive: [] }, new Set(["gi"]), NOW);
  assert.equal(active.length, 1);
  assert.equal(archive.length, 0, "kode aktif tidak boleh ikut ke arsip");
});

// ── endsAt: waktu berakhir yang SUDAH LEWAT ────────────────────────────────
// Kasus nyata 13 Agu 2026: Wuthering Waves memajang 4 kode aktif padahal cuma 1
// yang hidup. Tiga sisanya mati 9 Agu dan endsAt-nya tersimpan benar — Fandom
// wiki cuma tak pernah menghapus barisnya, jadi pemicu "hilang dari sumber"
// tak pernah menyala.
const wuwaMati = (code) => ({
  game: "wuwa", code, source: "wiki", firstSeenAt: OLD,
  endsAt: "2026-07-10T00:00:00Z", // NOW = 16 Jul → sudah lewat 6 hari
});

test("endsAt sudah lewat → diarsipkan walau sumber masih memajangnya sbg aktif", () => {
  const fresh = [wuwaMati("HEARTOFSWORD"), { game: "wuwa", code: "WUTHERINGGIFT", source: "wiki", endsAt: null }];
  const { active, archive } = mergeWithPrevious(fresh, [], { active: [], archive: [] }, new Set(["wuwa"]), NOW);

  assert.deepEqual(active.map((c) => c.code), ["WUTHERINGGIFT"], "kode tanpa endsAt tetap aktif");
  assert.equal(archive.length, 1);
  assert.equal(archive[0].code, "HEARTOFSWORD");
  assert.equal(archive[0].status, "expired");
  assert.equal(archive[0].expiredBy, "endsAt");
  // Waktu matinya yang sebenarnya, bukan waktu kita menyadarinya.
  assert.equal(archive[0].expiredAt, "2026-07-10T00:00:00Z");
});

test("endsAt masih di masa depan → tetap aktif", () => {
  // Sisi lain ambang. Tanpa tes ini, perbandingan yang kebalik (< vs >) tetap
  // hijau di tes atas sambil mengarsipkan MASSAL kode yang masih hidup — dan
  // arsip itu permanen.
  const fresh = [{ game: "gi", code: "MASIHHIDUP", source: "hoyo-codes", endsAt: "2026-08-01T00:00:00Z" }];
  const { active, archive } = mergeWithPrevious(fresh, [], { active: [], archive: [] }, new Set(["gi"]), NOW);
  assert.deepEqual(active.map((c) => c.code), ["MASIHHIDUP"]);
  assert.equal(archive.length, 0);
});

test("endsAt lewat menembus pengaman 'sumber gagal ditarik'", () => {
  // Pengaman itu melindungi kode yang nasibnya TAK DIKETAHUI. Kode ber-endsAt
  // lewat justru satu-satunya yang kita tahu pasti sudah mati.
  const prev = prevWith(wuwaMati("THEANSWER"), hoyoCode("gi", "NASIBTAKJELAS"));
  const { active, archive } = mergeWithPrevious([], [], prev, new Set(), NOW); // tak ada game yang sukses

  assert.ok(active.some((c) => c.code === "NASIBTAKJELAS" && c.stale === true), "yang tanpa endsAt dipertahankan");
  assert.ok(archive.some((c) => c.code === "THEANSWER" && c.expiredBy === "endsAt"));
});

test("normalizeReward: gaya terstruktur dirapikan, nama item utuh", () => {
  assert.equal(
    normalizeReward("Primogem*60;Adventurer's Experience*5"),
    "Primogem ×60 · Adventurer's Experience ×5",
  );
  assert.equal(normalizeReward("Denny*6,666"), "Denny ×6,666"); // koma ribuan
});

test("normalizeReward: gaya prosa dibiarkan VERBATIM", () => {
  const prosa = "30 stellar jade, three traveler's guides, and 20k credits";
  assert.equal(normalizeReward(prosa), prosa);
});

test("decodeEntities: &times; jadi ×, dan entity tak dikenal berteriak", () => {
  // `&times;` luput dari tabel NAMED berbulan-bulan dan baru ketahuan saat
  // terbaca di layar video sample: "Primogem &times;60" (Genshin, 13 Agu 2026).
  // Tak ada satu pun log yang menyebutkannya — itu bagian yang diperbaiki.
  assert.equal(decodeEntities("Primogem &times;60"), "Primogem ×60");
  assert.equal(decodeEntities("A &middot; B"), "A · B");

  const log = [];
  const asli = console.log;
  console.log = (...a) => log.push(a.join(" "));
  let hasil;
  try { hasil = decodeEntities("Setengah &frac12; porsi"); } finally { console.log = asli; }
  assert.equal(hasil, "Setengah &frac12; porsi", "yang tak dikenal dibiarkan utuh, bukan dirusak");
  assert.match(log.join("\n"), /entity HTML tak dikenal: &frac12;/);
});

test("normalizeReward: sumber kosong → null, bukan karangan", () => {
  assert.equal(normalizeReward(""), null);
  assert.equal(normalizeReward(null), null);
  assert.equal(normalizeReward(undefined), null);
});
