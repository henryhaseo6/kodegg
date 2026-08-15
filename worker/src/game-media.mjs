// Gambar promosi resmi sebuah game Roblox — carousel yang tampil di halaman
// gamenya, bukan ikonnya.
//
// KENAPA PERLU. Renderer landscape memakai IKON sebagai bahan latar, dan ikon
// cuma 128x128 — cukup untuk noda blur, tapi tak lebih. Padahal tiap game punya
// sampai 10 gambar promosi beresolusi 768x432 di halaman Roblox-nya: tangkapan
// gameplay, poster update, banner event. Itu bahan yang jauh lebih kaya, dan
// setiap game punya set yang berbeda-beda sehingga latar tiap video jadi khas.
//
// Dua panggilan, karena Roblox memisahkan "daftar media" dari "URL gambar":
//   1. games.roblox.com/v2/games/<uid>/media   → daftar imageId (10 entri)
//   2. thumbnails.roblox.com/v1/assets         → imageId jadi URL CDN
// Endpoint multiget/thumbnails yang biasa dipakai HANYA memulangkan satu gambar
// (thumbnail utama), jadi ia tak cukup di sini.
//
// Kegagalan tak pernah fatal: memulangkan array kosong, dan renderer jatuh ke
// ikon seperti sebelumnya. Latar adalah hiasan — ia tak boleh menggagalkan video.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const UA = { "User-Agent": "KodeGG/1.0 (+https://kodegg.com)", Accept: "application/json" };

/**
 * @param {number|string} universeId
 * @param {number} [maks]  batas jumlah gambar yang diunduh
 * @returns {Promise<Buffer[]>} isi PNG, siap di-loadImage
 */
export async function gambarGame(universeId, maks = 8) {
  if (!universeId) return [];
  try {
    const m = await fetch(`https://games.roblox.com/v2/games/${universeId}/media`, { headers: UA });
    if (!m.ok) return [];
    // `approved === false` = gambar ditolak moderasi Roblox dan tak boleh
    // ditampilkan; menyaringnya di sini, bukan di renderer, supaya tak ada jalur
    // yang bisa lupa memeriksanya.
    const ids = ((await m.json()).data ?? [])
      .filter((x) => x?.imageId && x.approved !== false)
      .map((x) => x.imageId)
      .slice(0, maks);
    if (!ids.length) return [];

    const t = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=768x432&format=Png`, { headers: UA });
    if (!t.ok) return [];
    const urls = ((await t.json()).data ?? [])
      .filter((x) => x?.state === "Completed" && x.imageUrl)
      .map((x) => x.imageUrl);

    const out = [];
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) out.push(Buffer.from(await r.arrayBuffer()));
      } catch { /* satu gambar gagal ≠ semuanya gagal */ }
    }
    return out;
  } catch { return []; }
}

/** Cover 512px SELURUH game mobile berkode — bahan kolase latar.
 *
 *  Kenapa cover katalog, bukan screenshot App Store: cover sudah tersimpan di
 *  games.json dan sudah dipakai halaman katalog situs, jadi kebenarannya sudah
 *  teruji mata. Pencarian nama ke App Store TIDAK bisa dipercaya — diuji 15 Agu
 *  2026, "Honkai Impact 3rd" memulangkan "Reverse: 1999". Latar yang memajang
 *  art game lain bukan cuma jelek; ia salah.
 *
 *  Ukuran di URL mzstatic boleh diminta: .../256x256bb.jpg → .../512x512bb.jpg
 *  (diuji, 28 dari 28 berhasil).
 *
 *  Dimemo per-proses: satu run merender beberapa video, dan menarik 28 gambar
 *  untuk tiap video adalah pemborosan yang tak menghasilkan apa pun.
 */
let _coverMobile = null;
export async function coverMobile(dataDir) {
  if (_coverMobile) return _coverMobile;
  const out = [];
  try {
    const cat = JSON.parse(readFileSync(resolve(dataDir, "games.json"), "utf8"));
    const kode = JSON.parse(readFileSync(resolve(dataDir, "codes.json"), "utf8"));
    const berkode = new Set((kode.active ?? []).map((c) => c.game));
    const daftar = (cat.games ?? []).filter((g) => berkode.has(g.id));
    let lokal = 0, jaring = 0;
    for (const g of daftar) {
      // BERKAS LOKAL DULU. Disimpan fetch-icons.mjs dari unduhan yang sama yang
      // menghasilkan ikon situs, jadi tak ada permintaan jaringan saat render.
      const berkas = resolve(dataDir, "ikon-besar", `${g.id}.webp`);
      try {
        if (existsSync(berkas)) { out.push(readFileSync(berkas)); lokal += 1; continue; }
      } catch { /* jatuh ke jaringan */ }
      // Cadangan: game yang ikon besarnya belum pernah ditarik (mis. baru masuk
      // katalog sebelum fetch-icons jalan lagi). Sekali `npm run icons` jalan,
      // cabang ini tak terpakai lagi.
      if (!g.cover) continue;
      try {
        const r = await fetch(g.cover.replace(/\/\d+x\d+bb/, "/512x512bb"), { headers: UA });
        if (r.ok) { out.push(Buffer.from(await r.arrayBuffer())); jaring += 1; }
      } catch { /* satu gambar gagal ≠ kolase gagal */ }
    }
    if (jaring) console.log(`  (kolase: ${lokal} dari berkas lokal, ${jaring} ditarik dari CDN — jalankan \`npm run icons\` supaya semuanya lokal)`);
  } catch { /* katalog tak terbaca → kolase dilewati, latar jatuh ke ikon */ }
  _coverMobile = out;
  return out;
}
