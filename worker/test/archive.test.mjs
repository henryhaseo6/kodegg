// Jalankan: node --test
//
// Fokus: pengaman arsip. Arsip tidak pernah dihapus (CLAUDE.md), jadi salah
// mengarsipkan bersifat permanen — perilaku di bawah wajib dipertahankan.

import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeWithPrevious } from "../src/archive.mjs";
import { normalizeReward } from "../src/normalize.mjs";

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

test("normalizeReward: sumber kosong → null, bukan karangan", () => {
  assert.equal(normalizeReward(""), null);
  assert.equal(normalizeReward(null), null);
  assert.equal(normalizeReward(undefined), null);
});
