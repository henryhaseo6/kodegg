// Jalankan: node --test
//
// Fokus: DIAGNOSIS kegagalan, bukan parsing. Pesan gagal yang salah menuduh
// membuang waktu ke tempat yang keliru — 27 Agu 2026 tembok login Diablo
// Immortal dilaporkan sbg "layout redeem-code-tracker berubah" selama 18 jam,
// padahal parsernya sehat dan yang berubah adalah akses halamannya.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchRedeemTracker, SLUGS } from "../src/sources/redeemtracker.mjs";

const GAMES_UJI = Object.fromEntries(Object.keys(SLUGS).map((id) => [id, { name: id.toUpperCase() }]));

// Satu objek kode berbentuk payload RSC Next.js (backslash-escaped seperti aslinya).
const payload = (code) =>
  `x{\\"id\\":\\"1\\",\\"value\\":\\"${code}\\",\\"expiresAt\\":\\"\\",` +
  `\\"createdAt\\":\\"2026-08-01T00:00:00.000Z\\",\\"rewards\\":[{\\"quantity\\":\\"100\\",\\"name\\":\\"Gems\\"}]}`;

/** Ganti global fetch dg jawaban per-slug. balas(slug) → {status, url?, body?} */
async function jalankan(balas) {
  const asli = globalThis.fetch;
  const log = [];
  globalThis.fetch = async (url) => {
    const slug = new URL(url).pathname.replace("/games/", "");
    const r = balas(slug) ?? { status: 200, body: payload("OK1234") };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      url: r.url ?? url, // res.url = URL FINAL (fetch sudah mengikuti redirect)
      text: async () => r.body ?? "",
    };
  };
  try {
    const hasil = await fetchRedeemTracker({ games: GAMES_UJI, userAgent: "uji", log: (m) => log.push(m) });
    return { ...hasil, log };
  } finally {
    globalThis.fetch = asli;
  }
}

test("tembok login (307 → /login) dilaporkan sbg butuh login, bukan layout berubah", async () => {
  const r = await jalankan((slug) =>
    slug === "diablo-immortal"
      ? { status: 200, url: "https://www.redeem-code-tracker.com/login?callbackUrl=%2Fgames%2Fdiablo-immortal", body: "<html>masuk dulu</html>" }
      : null,
  );

  const baris = r.log.find((l) => l.startsWith("[diablo]"));
  assert.match(baris, /butuh login/);
  assert.doesNotMatch(baris, /layout/, "tembok login tak boleh menuduh parser");
  assert.ok(!r.covered.has("diablo"), "game di balik login tidak boleh dihitung ter-cover");
  assert.ok(r.failedGames.some((g) => g.startsWith("diablo ")), "game gagal harus dinamai untuk annotation CI");
  // Game lain tak ikut terseret.
  assert.ok(r.covered.has("afkj"));
});

test("404 dilaporkan sbg game hilang dari katalog — sinyal untuk keputusan pensiun", async () => {
  const r = await jalankan((slug) => (slug === "afk-journey" ? { status: 404, body: "" } : null));

  const baris = r.log.find((l) => l.startsWith("[afkj]"));
  assert.match(baris, /404/);
  assert.match(baris, /hilang dari katalog/);
  assert.doesNotMatch(baris, /layout/);
});

test("SATU game 0 kode → tak boleh mengklaim layout situs berubah", async () => {
  const r = await jalankan((slug) => (slug === "epic-seven" ? { status: 200, body: "<html>kosong</html>" } : null));

  const baris = r.log.find((l) => l.startsWith("[e7]"));
  assert.match(baris, /0 kode terparse/);
  assert.doesNotMatch(baris, /layout/);
  assert.ok(!r.log.some((l) => /layout situs berubah/.test(l)), "kesimpulan sesitus tak boleh ditarik dari 1 game");
});

test("SEMUA game 0 kode → barulah layout situs dinyatakan berubah", async () => {
  const r = await jalankan(() => ({ status: 200, body: "<html>kosong</html>" }));

  assert.ok(
    r.log.some((l) => /SEMUA \d+ game 0 kode - layout situs berubah/.test(l)),
    "kegagalan serentak adalah gejala parser, dan itu harus dikatakan",
  );
  assert.equal(r.covered.size, 0);
});

test("jalur sehat tetap utuh: kode terparse & game masuk covered", async () => {
  const r = await jalankan(() => ({ status: 200, body: payload("HADIAH99") }));

  assert.equal(r.failed, 0);
  assert.equal(r.covered.size, Object.keys(SLUGS).length);
  assert.ok(r.items.every((i) => i.code === "HADIAH99"));
  assert.equal(r.items[0].reward, "Gems ×100");
  assert.ok(!r.log.some((l) => /layout/.test(l)));
});
