// Tes parser "Event Period" HoYoLAB — dipakai mining event hi3/tot (game tanpa
// announcement API resmi). Fokus: variasi format tanggal & zona waktu.

import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePeriod } from "../src/sources/hoyolab.mjs";

test("format standar: tanggal+jam+UTC penuh", () => {
  const r = parsePeriod("Event Period: 2026/7/17 11:00 - 8/21 04:00 (UTC+9)");
  assert.equal(r.start, "2026-07-17T02:00:00.000Z"); // 11:00 UTC+9 = 02:00 UTC
  assert.equal(r.end, "2026-08-20T19:00:00.000Z"); // 8/21 04:00 UTC+9, tahun di-wrap dari start
});

test("tahun END diomit & bulan < start → wrap ke tahun berikutnya", () => {
  const r = parsePeriod("Event Period: 2025/12/20 00:00 - 1/5 23:59 (UTC+8)");
  assert.equal(r.start.slice(0, 10), "2025-12-19"); // 00:00 UTC+8 = 2025-12-19T16:00Z
  assert.equal(r.end.slice(0, 4), "2026"); // Januari → tahun +1
});

test("tanpa jam & tanpa UTC → default 00:00–23:59, UTC+8", () => {
  const r = parsePeriod("Event Period: 2026/7/18 - 8/16");
  assert.ok(r && r.start && r.end);
  assert.equal(r.start.slice(0, 10), "2026-07-17"); // 00:00 UTC+8 mundur 8 jam
});

test("kurung full-width （UTC+8） tetap terbaca", () => {
  const r = parsePeriod("Event Period: 2025/9/28 00:00 - 2025/10/12 23:59（UTC+8）");
  assert.ok(r);
  assert.equal(r.end.slice(0, 10), "2025-10-12");
});

test("teks tanpa Event Period → null (bukan event)", () => {
  assert.equal(parsePeriod("Server maintenance notice at 7/6"), null);
  assert.equal(parsePeriod(""), null);
});
