// Deret pemain BERGULIR (24 jam sampai saat render).
//
// Yang dijaga di sini terutama JATUH-KEMBALINYA. Endpoint /roblox-series hidup
// di Worker Cloudflare yang di-deploy MANUAL lewat dashboard, jadi akan ada
// jeda antara kode ini mendarat dan Worker-nya diperbarui. Selama jeda itu
// endpoint menjawab 404, dan video HARUS tetap bergrafik lewat jalur lama —
// bukan terbit tanpa grafik sama sekali.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WORKER_URL = "https://contoh.workers.dev";
process.env.TRIGGER_KEY = "kunci-uji";

const { seriesPemainBergulir } = await import("../src/player-series.mjs");

/** Ganti fetch global selama satu panggilan. */
async function dengan(jawab, fn) {
  const asli = globalThis.fetch;
  globalThis.fetch = jawab;
  try { return await fn(); } finally { globalThis.fetch = asli; }
}
const T0 = Date.parse("2026-08-14T03:00:00Z");
const titikPalsu = (n) => Array.from({ length: n }, (_, i) => ({ ms: T0 + i * 600000, v: 1000 + i * 10 }));

test("endpoint 404 (Worker belum di-deploy) → null, supaya pemanggil pakai jalur lama", async () => {
  const hasil = await dengan(async () => ({ ok: false, status: 404 }), () => seriesPemainBergulir(123));
  assert.equal(hasil, null);
});

test("jaringan gagal → null, bukan melempar", async () => {
  const hasil = await dengan(async () => { throw new Error("ECONNRESET"); }, () => seriesPemainBergulir(123));
  assert.equal(hasil, null);
});

test("respons sehat → deret + jam mulai/sampai untuk melabeli sumbu", async () => {
  const titik = titikPalsu(144);
  const hasil = await dengan(
    async (url) => {
      assert.match(String(url), /\/roblox-series\?uid=123&jam=24&key=kunci-uji/);
      return { ok: true, json: async () => ({ uid: "123", titik }) };
    },
    () => seriesPemainBergulir(123),
  );
  assert.equal(hasil.titik, 144);
  assert.equal(hasil.series[0], 1000);
  assert.equal(hasil.puncak, 1000 + 143 * 10);
  assert.equal(hasil.bergulir, true);
  assert.equal(hasil.mulaiMs, T0, "titik pertama — dipakai sbg label sumbu kiri");
  assert.equal(hasil.sampaiMs, T0 + 143 * 600000, "titik terakhir — label sumbu kanan");
});

test("terlalu bolong → null; lebih baik pita statistik hilang daripada menyesatkan", async () => {
  const hasil = await dengan(
    async () => ({ ok: true, json: async () => ({ titik: titikPalsu(8) }) }),
    () => seriesPemainBergulir(123),
  );
  assert.equal(hasil, null, "8 titik (~1,3 jam) tak layak disebut 24 jam");
});

test("titik tanpa angka dibuang, bukan dianggap nol", async () => {
  // Game yang sesaat keluar dari chart tak punya titik — nol akan menciptakan
  // jurang palsu di grafik.
  const titik = [...titikPalsu(20), { ms: T0 + 99e6, v: null }, { ms: T0 + 1e8 }];
  const hasil = await dengan(
    async () => ({ ok: true, json: async () => ({ titik }) }),
    () => seriesPemainBergulir(123),
  );
  assert.equal(hasil.titik, 20);
  assert.ok(hasil.series.every((v) => typeof v === "number"));
});

test("tanpa WORKER_URL → null tanpa menyentuh jaringan", async () => {
  const simpan = process.env.WORKER_URL;
  delete process.env.WORKER_URL;
  try {
    const hasil = await dengan(async () => { throw new Error("tak boleh dipanggil"); }, () => seriesPemainBergulir(123));
    assert.equal(hasil, null);
  } finally { process.env.WORKER_URL = simpan; }
});
