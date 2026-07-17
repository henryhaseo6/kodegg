// Tes sumber Tears of Themis (tot.wiki via Wayback). Fokus: klasifikasi
// aktif/expired dari End Date terhadap WAKTU SEKARANG (bukan umur snapshot),
// dan parsing tabel (kode = kolom ke-2).

import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchTotWiki } from "../src/sources/totwiki.mjs";

// Tabel mini: 1 permanen (End 2099), 1 expired (End lampau), 1 aktif (End jauh
// di masa depan tapi bukan 2099). Baris header + baris non-kode diabaikan.
const HTML = `
<p>intro</p>
<table class="wikitable" style="width:100%;"><tbody>
<tr><th>Promo Image</th><th>Redeem Code</th><th>Reward(s)</th><th>Start Date</th><th>End Date</th></tr>
<tr><td style="text-align:center;"></td><td>PERMACODE1</td><td><img alt="x"></td><td>2024-10-25 11:00:00 UTC+9</td><td>2099-12-31 23:59:00 UTC+9</td></tr>
<tr><td></td><td>DEADCODE99</td><td><img></td><td>2026-01-01 11:00:00 UTC+9</td><td>2026-02-01 23:59:00 UTC+9</td></tr>
<tr><td></td><td>ACTIVE2088</td><td><img></td><td>2026-01-05 11:00:00 UTC+9</td><td>2088-01-01 23:59:00 UTC+9</td></tr>
</tbody></table>`;

function stub() {
  return async (url) => {
    const s = String(url);
    if (s.includes("/cdx/")) {
      return { ok: true, json: async () => [["timestamp"], ["20260101000000"], ["20260218133309"]] };
    }
    if (s.includes("web.archive.org/web/")) {
      assert.ok(s.includes("20260218133309"), "harus pakai snapshot 200 TERBARU");
      return { ok: true, text: async () => HTML };
    }
    throw new Error(`tak terduga: ${s}`);
  };
}

const games = { tot: { name: "Tears of Themis" } };
const codesOf = (r) => [...r.items, ...r.expiredItems].map((i) => i.code);

test("tot.wiki: aktif vs expired dari End Date; permanen bila End 2099", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stub();
  try {
    const r = await fetchTotWiki({ games, userAgent: "test" });

    const perma = r.items.find((i) => i.code === "PERMACODE1");
    assert.ok(perma, "End 2099 → aktif");
    assert.equal(perma.perm, true, "End 2099 → permanen");
    assert.equal(perma.date, "2024-10-25T00:00:00.000Z", "date = Start Date");
    assert.ok(r.items.some((i) => i.code === "ACTIVE2088"), "End 2088 → aktif");

    assert.ok(r.expired.has("tot:DEADCODE99"), "kode End lampau → expired");
    const dead = r.expiredItems.find((i) => i.code === "DEADCODE99");
    assert.ok(dead && dead.date === "2026-01-01T00:00:00.000Z");

    // Dataset MANUAL selalu ikut (mis. YESIDO) — aktif ATAU expired tergantung now.
    assert.ok(codesOf(r).includes("YESIDO"), "kode manual harus ikut");
    assert.ok(r.covered.has("tot"));
  } finally {
    globalThis.fetch = real;
  }
});

test("tot.wiki: Wayback gagal → dataset MANUAL tetap jalan (failed=1, tetap covered)", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403 });
  try {
    const r = await fetchTotWiki({ games, userAgent: "test" });
    assert.equal(r.failed, 1, "Wayback gagal ditandai");
    assert.ok(r.covered.has("tot"), "manual menjamin ToT tetap ter-cover");
    assert.ok(codesOf(r).includes("YESIDO"), "kode manual tetap ada meski Wayback mati");
  } finally {
    globalThis.fetch = real;
  }
});
