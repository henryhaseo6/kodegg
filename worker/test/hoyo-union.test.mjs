// Gabungan sumber kode: union lengkap, dedup, tahan sumber-mati.
import { test } from "node:test";
import assert from "node:assert/strict";

const UA = "test";

async function withFetch(map, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const key = Object.keys(map).find((k) => String(url).includes(k));
    if (!key) throw new Error(`tak terduga: ${url}`);
    const v = map[key];
    if (v === "DOWN") throw new Error("SIMULASI down");
    return { ok: true, json: async () => v };
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("union: kode gabungan dari kedua penyedia, tanpa duplikat", async () => {
  const { fetchHoyo } = await import(`../src/sources/hoyo.mjs?u=${Date.now()}`);
  const r = await withFetch(
    {
      "game=genshin": { codes: [{ code: "AAA", status: "OK", rewards: "Primogem*60" }] },
      "genshin/codes": { active: [{ code: "AAA", rewards: ["Primogem ×60"] }, { code: "BBB", rewards: ["Mora ×10000"] }] },
      // game lain kosong agar fokus ke gi
      "game=hkrpg": { codes: [] },
      "starrail/codes": { active: [] },
      "game=nap": { codes: [] },
      "zenless/codes": { active: [] },
      "game=honkai3rd": { codes: [] },
    },
    () => fetchHoyo({ userAgent: UA }),
  );
  const gi = r.items.filter((c) => c.game === "gi").map((c) => c.code).sort();
  assert.deepEqual(gi, ["AAA", "BBB"], "AAA (di kedua sumber) tidak dobel, BBB (hanya ennead) ikut");
  assert.ok(r.covered.has("gi"));
});

test("union: seria mati → tetap dapat kode dari ennead, game ter-cover", async () => {
  const { fetchHoyo } = await import(`../src/sources/hoyo.mjs?u=${Date.now()}b`);
  const r = await withFetch(
    {
      "game=genshin": "DOWN",
      "genshin/codes": { active: [{ code: "BBB", rewards: ["Mora ×10000"] }] },
      "game=hkrpg": "DOWN",
      "starrail/codes": { active: [{ code: "HSR1", rewards: ["Stellar Jade ×100"] }] },
      "game=nap": "DOWN",
      "zenless/codes": { active: [{ code: "ZZZ1", rewards: ["Polychrome ×60"] }] },
      "game=honkai3rd": "DOWN", // hi3 hanya seria → semua penyedia mati
      "game=tot": "DOWN", // tot juga hanya seria → gagal total
    },
    () => fetchHoyo({ userAgent: UA }),
  );
  assert.ok(r.covered.has("gi"), "gi ter-cover via ennead");
  assert.ok(!r.covered.has("hi3"), "hi3 TIDAK ter-cover (tak ada fallback) → kode lama aman");
  assert.ok(!r.covered.has("tot"), "tot TIDAK ter-cover (seria-only, mati) → kode lama aman");
  // hi3 & tot = seria-only, keduanya gagal saat seria mati.
  assert.equal(r.failed, 2, "hi3 dan tot yang gagal total");
  assert.ok(r.items.some((c) => c.code === "BBB"));
});
