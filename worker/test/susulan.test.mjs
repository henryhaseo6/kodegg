// Saringan anti-dobel jalur kode-baru vs jalur susulan (borongan).
//
// Tes ini ada karena saringannya pernah lolos review dalam keadaan MATI TOTAL:
// mencocokkan field `game` yang tak pernah dimiliki objek kandidat. Yang dijaga
// di sini bukan cuma "buang yang dobel", tapi juga bahwa kegagalan sejenis
// (field identitas berganti nama) TIDAK LAGI SENYAP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { saringSusulan } from "../video/susulan.mjs";

/** Kandidat jalur kode-baru: game yang serentak baru masuk katalog DAN membawa
 *  kode baru — satu-satunya bentuk yang memenuhi syarat kedua jalur sekaligus. */
const kandidat = (id, extra = {}) => ({ platform: "ROBLOX", id, name: id, slug: id, newCodes: [{ code: "X" }], ...extra });
/** Item susulan: lahir dengan newCodes kosong + allMode/backlog. */
const susul = (id, extra = {}) => ({ platform: "ROBLOX", id, name: id, slug: id, newCodes: [], allMode: true, backlog: true, ...extra });

test("game yang sudah jadi kandidat tidak boleh ikut jalur susulan", () => {
  const hasil = saringSusulan(
    [susul("chicken-farm"), susul("berry-avenue")],
    [kandidat("chicken-farm")],
  );
  assert.deepEqual(hasil.map((c) => c.id), ["berry-avenue"]);
});

test("versi lama (cocokkan .game) memang meloloskan dobelnya — tes di atas bukan tes kosong", () => {
  // Persis kode yang dipakai 8–13 Agu 2026. Dibiarkan di sini sebagai bukti
  // bahwa kasus di atas benar-benar lolos sebelum perbaikan; kalau suatu saat
  // seseorang "menyederhanakan" saringan kembali ke bentuk ini, tes pertama
  // langsung merah.
  const susulan = [susul("chicken-farm")];
  const kand = [kandidat("chicken-farm")];
  const kunciLama = new Set(kand.map((c) => c.game).filter(Boolean));
  assert.equal(kunciLama.size, 0, "kandidat memang tak punya field .game");
  assert.equal(susulan.filter((c) => !kunciLama.has(c.game)).length, 1, "versi lama meloloskan dobel");
});

test("id berganti tapi slug tetap (flip-flop nama di sumber) tetap terjaring", () => {
  const hasil = saringSusulan(
    [susul("roblox-dog-race", { slug: "dog-race" })],
    [kandidat("dog-race", { slug: "dog-race" })],
  );
  assert.deepEqual(hasil, []);
});

test("id sama di platform berbeda bukan game yang sama", () => {
  // Ruang id ROBLOX & MOBILE terpisah; menyamakannya akan membuang susulan yang sah.
  const hasil = saringSusulan([susul("drr")], [kandidat("drr", { platform: "MOBILE" })]);
  assert.deepEqual(hasil.map((c) => c.id), ["drr"]);
});

test("tanpa kandidat, seluruh susulan lewat", () => {
  const hasil = saringSusulan([susul("a"), susul("b")], []);
  assert.equal(hasil.length, 2);
});

test("kandidat tanpa field identitas → saringan berteriak, bukan diam", () => {
  const log = [];
  const asli = console.log;
  console.log = (...a) => log.push(a.join(" "));
  try {
    saringSusulan([susul("chicken-farm")], [{ platform: "ROBLOX", nama: "field diganti nama" }]);
  } finally {
    console.log = asli;
  }
  assert.match(log.join("\n"), /saringSusulan.*0 kunci identitas/);
});

test("masukan kosong/null tidak melempar (dipanggil di jalur upload)", () => {
  assert.deepEqual(saringSusulan(null, null), []);
  assert.deepEqual(saringSusulan(undefined, [kandidat("a")]), []);
});
