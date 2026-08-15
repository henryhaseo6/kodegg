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

// Klien PALSU tak cukup untuk menguji pembungkus: yang bikin celaka justru
// bentuk objek googleapis ASLI — `videos`/`playlists` dipasang sebagai properti
// non-writable & non-configurable, dan mem-Proxy objek layanannya melanggar
// invarian Proxy sehingga AKSES PERTAMA melempar TypeError. 12 Agu 2026 itu
// mematikan seluruh upload ~17 jam. Tes ini menyentuh objek aslinya.
test("pembungkus tak merusak klien googleapis sungguhan", async (t) => {
  let google;
  try { ({ google } = await import("googleapis")); }
  catch { return t.skip("googleapis tak terpasang (dipasang di CI saat perlu)"); }
  const o = new google.auth.OAuth2("x", "y");
  o.setCredentials({ refresh_token: "z" });
  const p = pantau(google.youtube({ version: "v3", auth: o }));
  // Akses properti — persis langkah yang dulu melempar TypeError.
  assert.equal(typeof p.videos.insert, "function");
  assert.equal(typeof p.videos.list, "function");
  assert.equal(typeof p.playlists.list, "function");
  assert.equal(typeof p.playlistItems.insert, "function");
  assert.equal(typeof p.thumbnails.set, "function");
  // Panggilan sungguhan: WAJIB gagal karena kredensial, bukan karena proxy.
  await assert.rejects(() => p.videos.list({ part: ["id"], id: ["x"] }), (e) => !/on proxy/i.test(e.message));
  assert.equal(ringkas().panggilan["videos.list"] >= 1, true, "panggilannya tetap tercatat");
});

test.after(() => { try { rmSync(DATA, { recursive: true, force: true }); } catch {} });

// ── Jatah playlist harian ────────────────────────────────────────────────────
// Batas yang TERPISAH dari kuota unit, dan yang lebih sering mengikat. Borongan
// dulu menahan pembuatan playlist tanpa melihat sisa jatah — 13 Agu 2026 baru 7
// dari 10 terpakai, tapi dua video tetap terbit tanpa playlist dan jadi yatim
// permanen (kodenya sudah ditandai posted, jadi tak pernah diulang).
test("sisaPlaylist: dihitung dari playlists.insert hari ini, tak menyentuh kuota unit", async () => {
  const { catat, sisaPlaylist, PLAYLIST_HARIAN, unitTerpakai } = await import("../video/yt-kuota.mjs?jatah");
  assert.equal(sisaPlaylist(), PLAYLIST_HARIAN, "buku kosong → jatah utuh");

  for (let i = 0; i < 7; i++) catat("playlists.insert");
  assert.equal(sisaPlaylist(), PLAYLIST_HARIAN - 7, "7 terpakai → sisa 3, bukan 0");

  // Panggilan lain TIDAK ikut mengurangi jatah playlist, walau memakan unit.
  const unitSebelum = unitTerpakai();
  for (let i = 0; i < 20; i++) catat("playlistItems.insert");
  assert.equal(sisaPlaylist(), PLAYLIST_HARIAN - 7, "playlistItems bukan playlist baru");
  assert.ok(unitTerpakai() > unitSebelum, "tapi unitnya tetap terhitung");

  for (let i = 0; i < 5; i++) catat("playlists.insert");
  assert.equal(sisaPlaylist(), 0, "tak pernah negatif");
});

// ── Penanda "jatah playlist habis" ───────────────────────────────────────────
// 14 Agu 2026: penanda dipasang pukul 00:59 PT — 59 menit setelah hari PT
// dimulai — lalu memblokir pembuatan playlist selama ~23 jam sisanya. Buku
// kuota hari itu mencatat playlists.insert = 1 dari ~10; empat video terbit
// tanpa playlist padahal jatahnya nyaris utuh.
//
// Sebabnya pola `/exhaust|rate|quota/` ikut menangkap `rateLimitExceeded` —
// batas SESAAT karena menembak terlalu cepat, bukan plafon harian.
test("penanda 'jatah habis' DIABAIKAN bila buku kuota menunjukkan jatah masih ada", async () => {
  const D = mkdtempSync(resolve(tmpdir(), "kodegg-plimit-"));
  process.env.KODEGG_DATA = D;
  const hariPT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  writeFileSync(resolve(D, "playlist-limit.json"), JSON.stringify({ hari: hariPT }));
  writeFileSync(resolve(D, "kuota-yt.json"), JSON.stringify({ hari: hariPT, panggilan: { "playlists.insert": 1 } }));

  const { attachToPlaylist } = await import(`../video/upload.mjs?plimit=${Date.now()}`);
  const yt = ytPalsu({ adaId: false, halaman: 1 });
  const ok = await attachToPlaylist(yt.yt, "VID", "Game Baru Codes — Kode Redeem", "D", "id");

  assert.ok(ok, "pembuatan playlist harus tetap dicoba, bukan ditahan penanda basi");
  assert.ok(yt.jejak.some((j) => j === "insert" || j === "list-mine" || j === "list-by-id"),
    "API playlist memang disentuh");
  rmSync(D, { recursive: true, force: true });
});
