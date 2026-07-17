// Kode permanen terkurasi: jadi "lantai" tepercaya, dedup dengan sumber live,
// dan sumber live memenangkan reward.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchCurated, combineCodes } from "../src/sources/curated.mjs";

const GAMES = {
  gi: { name: "Genshin Impact", redeemUrl: "x" },
  wuwa: { name: "Wuthering Waves", redeemUrl: "y" },
};

test("fetchCurated: kode permanen ditandai perm & meng-cover gamenya", () => {
  const { items, covered } = fetchCurated({ games: GAMES });
  const gg = items.find((c) => c.code === "GENSHINGIFT");
  assert.ok(gg, "GENSHINGIFT ada");
  assert.equal(gg.perm, true);
  assert.equal(gg.source, "curated");
  assert.ok(covered.has("gi") && covered.has("wuwa"));
});

test("fetchCurated: lewati game yang tak ada di registry", () => {
  const { items } = fetchCurated({ games: { gi: { name: "Genshin Impact" } } });
  assert.ok(items.every((c) => c.game === "gi"), "hanya gi (wuwa/zzz tak diminta)");
});

test("combineCodes: sumber live memenangkan reward, kode ditandai permanen", () => {
  const source = [{ game: "gi", code: "GENSHINGIFT", reward: "REWARD DARI SUMBER", perm: false }];
  const curated = [{ game: "gi", code: "GENSHINGIFT", reward: "reward cadangan", perm: true }];
  const out = combineCodes(source, curated);
  const gg = out.filter((c) => c.code === "GENSHINGIFT");
  assert.equal(gg.length, 1, "tidak duplikat");
  assert.equal(gg[0].reward, "REWARD DARI SUMBER", "reward dari sumber live menang");
  assert.equal(gg[0].perm, true, "tetap ditandai permanen dari daftar kurasi");
});

test("combineCodes: kode terkurasi mengisi yang tak ada di sumber", () => {
  const source = [{ game: "gi", code: "LIVECODE", reward: "x", perm: false }];
  const curated = [{ game: "wuwa", code: "WUTHERINGGIFT", reward: "astrite", perm: true }];
  const out = combineCodes(source, curated);
  assert.ok(out.some((c) => c.code === "WUTHERINGGIFT" && c.perm));
  assert.ok(out.some((c) => c.code === "LIVECODE"));
});

test("combineCodes: kode non-kurasi tidak ditandai permanen", () => {
  const out = combineCodes([{ game: "gi", code: "TEMPCODE", reward: "x", perm: false }], []);
  assert.equal(out[0].perm, false);
});

test("combineCodes CROSS-CHECK: reward terpotong di sumber A diperbaiki sumber B", () => {
  // Kasus nyata ZZZSTEAM: seria memotong ("60 polychrome, two w"), ennead utuh.
  const seria = [{ game: "zzz", code: "ZZZSTEAM", reward: "60 polychrome, two w", source: "hoyo-codes" }];
  const ennead = [{ game: "zzz", code: "ZZZSTEAM", reward: "Polychrome ×60 · Senior Investigator Log ×2 · W-Engine Energy Module ×2 · Denny ×6,666", source: "ennead.cc" }];
  const out = combineCodes([...seria, ...ennead], []);
  const z = out.filter((c) => c.code === "ZZZSTEAM");
  assert.equal(z.length, 1, "tidak duplikat");
  assert.ok(z[0].reward.length > 40, "reward yang menang harus yang UTUH (dari ennead)");
  assert.equal(z[0].source, "hoyo-codes", "identitas/atribusi tetap dari sumber pertama");
});
