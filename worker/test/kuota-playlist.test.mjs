// Peta ID playlist + pencatat kuota YouTube.
//
// Yang dijaga di sini persis dua hal yang membuat kuota terbakar diam-diam:
//  1. ensurePlaylist TAK BOLEH menyisir seluruh playlist (mine:true) kalau ID-nya
//     sudah ada di peta — itu 9 unit vs 1 unit, tiap video.
//  2. ID basi (playlist dihapus di Studio) TIDAK BOLEH dipercaya buta; harus
//     jatuh ke penyisiran penuh, bukan memasukkan video ke playlist hantu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const DATA = mkdtempSync(resolve(tmpdir(), "kodegg-kuota-"));
process.env.KODEGG_DATA = DATA;
writeFileSync(resolve(DATA, "playlist-id.json"), JSON.stringify({ "whiteout survival": "PLknown" }));

const { attachToPlaylist } = await import("../video/upload.mjs");
const { pantau, ringkas } = await import("../video/yt-kuota.mjs");

const JUDUL = "Whiteout Survival Codes — Kode Redeem";
/** Klien palsu. `halaman` = jumlah halaman yang dipulangkan penyisiran mine:true. */
function ytPalsu({ adaId = true, halaman = 9 } = {}) {
  const jejak = [];
  const snippet = { title: JUDUL, description: "D", defaultLanguage: "id" };
  const yt = {
    playlists: {
      list: async (p) => {
        jejak.push(p.id ? "list-by-id" : "list-mine");
        if (p.id) return { data: { items: adaId ? [{ id: "PLknown", snippet }] : [] } };
        const ke = p.pageToken ? Number(p.pageToken) : 1;
        return {
          data: {
            items: ke === halaman ? [{ id: "PLscan", snippet }] : [],
            nextPageToken: ke < halaman ? String(ke + 1) : undefined,
          },
        };
      },
      insert: async () => ({ data: { id: "PLbaru" } }),
      update: async () => ({}),
    },
    playlistItems: {
      list: async () => ({ data: { items: [] } }),
      insert: async () => ({}),
    },
  };
  return { yt, jejak };
}

test("ID playlist dikenal → cukup 1 panggilan by-id, tak menyisir mine:true", async () => {
  const { yt, jejak } = ytPalsu();
  const pid = await attachToPlaylist(yt, "vid1", JUDUL, "D", "id");
  assert.equal(pid, "PLknown");
  assert.deepEqual(jejak, ["list-by-id"], "tak boleh ada list-mine sama sekali");
});

test("ID tersimpan basi (playlist dihapus) → jatuh ke penyisiran penuh", async () => {
  const { yt, jejak } = ytPalsu({ adaId: false, halaman: 3 });
  const pid = await attachToPlaylist(yt, "vid2", JUDUL, "D", "id");
  assert.equal(pid, "PLscan");
  assert.equal(jejak[0], "list-by-id");
  assert.equal(jejak.filter((x) => x === "list-mine").length, 3, "menyisir sampai ketemu");
});

test("pencatat menghitung tiap panggilan & memberi harga tulis 50 / baca 1", () => {
  const { yt } = ytPalsu();
  const dipantau = pantau(yt);
  return (async () => {
    await dipantau.playlists.list({ id: ["PLknown"] }); // 1
    await dipantau.playlistItems.insert({});            // 50
    const k = ringkas();
    assert.equal(k.panggilan["playlists.list"] >= 1, true);
    assert.equal(k.panggilan["playlistItems.insert"], 1);
    // Dua panggilan di atas saja sudah 51 unit; sisanya milik tes lain di berkas
    // ini (yang juga lewat modul yang sama), jadi diperiksa sebagai batas bawah.
    assert.equal(k.unit >= 51, true);
    assert.equal(k.sisa, 10000 - k.unit);
  })();
});

test.after(() => { try { rmSync(DATA, { recursive: true, force: true }); } catch {} });
