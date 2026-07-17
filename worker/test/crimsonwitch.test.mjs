// Tes sumber crimsonwitch (parse payload RSC Next.js). Fokus: reward terstruktur,
// filter placeholder "LIVESTREAM CODE" & kode CN, klasifikasi expired dari
// `expires`, skip kode yang belum mulai (start_date masa depan).

import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchCrimsonwitch } from "../src/sources/crimsonwitch.mjs";

// Fixture RSC: quote di-escape sebagai \" (di template literal ditulis \\").
const HTML = `x{\\"id\\":1,\\"code\\":\\"GENSHINGIFT\\",\\"code_variants\\":null,\\"added\\":\\"2026-01-01T00:00:00+00:00\\",\\"start_date\\":null,\\"expires\\":null,\\"rewards\\":[{\\"item\\":\\"Primogem\\",\\"qty\\":60},{\\"item\\":\\"Mora\\",\\"qty\\":10000}],\\"region_locked\\":null}` +
  `y{\\"id\\":2,\\"code\\":\\"LIVESTREAM CODE\\",\\"added\\":\\"2026-07-13T00:00:00+00:00\\",\\"start_date\\":\\"2099-01-01T00:00:00+00:00\\",\\"expires\\":null,\\"rewards\\":[],\\"region_locked\\":null}` +
  `z{\\"id\\":3,\\"code\\":\\"DEADONE1\\",\\"added\\":\\"2025-01-01T00:00:00+00:00\\",\\"start_date\\":null,\\"expires\\":\\"2025-02-01T00:00:00+00:00\\",\\"rewards\\":[{\\"item\\":\\"Mora\\",\\"qty\\":5000}],\\"region_locked\\":null}` +
  `w{\\"id\\":4,\\"code\\":\\"CNONLY99\\",\\"added\\":null,\\"start_date\\":null,\\"expires\\":null,\\"rewards\\":[],\\"region_locked\\":\\"CN\\"}`;

const games = { gi: { name: "Genshin Impact" } };

function stub(html, status = 200) {
  return async () => ({ ok: status === 200, status, text: async () => html });
}

test("crimsonwitch: reward terstruktur, tanggal, filter placeholder/CN, expired via `expires`", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stub(HTML);
  try {
    const r = await fetchCrimsonwitch({ games, userAgent: "test" });

    const active = r.items.map((i) => i.code);
    assert.deepEqual(active, ["GENSHINGIFT"], "hanya GENSHINGIFT aktif (LIVESTREAM=placeholder, CNONLY=CN, DEADONE=expired)");
    assert.equal(r.items[0].reward, "Primogem ×60 · Mora ×10000", "reward item+qty verbatim");
    assert.equal(r.items[0].date, "2026-01-01T00:00:00.000Z", "date = added (start_date null)");

    assert.ok(r.expired.has("gi:DEADONE1"), "expires lampau → expired");
    assert.equal(r.expiredItems.find((i) => i.code === "DEADONE1")?.reward, "Mora ×5000");

    assert.ok(!active.includes("LIVESTREAM CODE"), "placeholder livestream ditolak");
    assert.ok(!active.includes("CNONLY99"), "kode CN dilewati");
    assert.ok(r.covered.has("gi"));
  } finally {
    globalThis.fetch = real;
  }
});

test("crimsonwitch: HTTP gagal → covered kosong & failed, tidak melempar", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stub("", 403);
  try {
    const r = await fetchCrimsonwitch({ games, userAgent: "test" });
    assert.equal(r.items.length, 0);
    assert.equal(r.failed, 1);
    assert.ok(!r.covered.has("gi"));
  } finally {
    globalThis.fetch = real;
  }
});
