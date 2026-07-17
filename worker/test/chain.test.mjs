// Tes logika rantai fallback. Perilaku ini yang menjamin "kalau A gagal, coba B".

import { test } from "node:test";
import assert from "node:assert/strict";

import { firstOk } from "../src/chain.mjs";

const src = (name, fn) => ({ name, run: fn });

test("pakai sumber pertama yang berhasil", async () => {
  const r = await firstOk([
    src("A", async () => ["a"]),
    src("B", async () => ["b"]),
  ]);
  assert.equal(r.source, "A");
  assert.deepEqual(r.value, ["a"]);
});

test("sumber A melempar error → jatuh ke B", async () => {
  const r = await firstOk([
    src("A", async () => {
      throw new Error("blokir");
    }),
    src("B", async () => ["b"]),
  ]);
  assert.equal(r.source, "B");
  assert.deepEqual(r.value, ["b"]);
  assert.deepEqual(r.tried, ["A", "B"]);
});

test("sumber A kosong → jatuh ke B (kosong dianggap gagal)", async () => {
  const r = await firstOk([
    src("A", async () => []),
    src("B", async () => ["b"]),
  ]);
  assert.equal(r.source, "B");
});

test("semua sumber gagal → source null, value null", async () => {
  const r = await firstOk([
    src("A", async () => {
      throw new Error("x");
    }),
    src("B", async () => []),
  ]);
  assert.equal(r.source, null);
  assert.equal(r.value, null);
  assert.deepEqual(r.tried, ["A", "B"]);
});

test("accept kustom menentukan 'berhasil'", async () => {
  // Terima hanya array berisi >1 elemen.
  const r = await firstOk(
    [src("A", async () => ["cuma-satu"]), src("B", async () => ["dua", "tiga"])],
    { accept: (v) => Array.isArray(v) && v.length > 1 },
  );
  assert.equal(r.source, "B");
});

test("tidak menyentuh sumber setelah yang pertama berhasil", async () => {
  let bCalled = false;
  await firstOk([
    src("A", async () => ["a"]),
    src("B", async () => {
      bCalled = true;
      return ["b"];
    }),
  ]);
  assert.equal(bCalled, false, "B tidak boleh dipanggil bila A sudah berhasil");
});

// --- collectAll: dasar gabungan sumber kode ---
test("collectAll: kumpulkan yang berhasil, pisahkan yang gagal", async () => {
  const { collectAll } = await import("../src/chain.mjs");
  const { ok, failed } = await collectAll([
    src("A", async () => [1, 2]),
    src("B", async () => {
      throw new Error("down");
    }),
    src("C", async () => [3]),
  ]);
  assert.deepEqual(
    ok.map((r) => r.name),
    ["A", "C"],
  );
  assert.equal(failed.length, 1);
  assert.equal(failed[0].name, "B");
  assert.equal(failed[0].error, "down");
});
