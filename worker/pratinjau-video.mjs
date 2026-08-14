// Pratinjau video SATU game — render lengkap, TANPA upload.
//
// Jalankan: node worker/pratinjau-video.mjs [idGame]     (bawaan: afkj)
// Hasil:    _video-review/pratinjau-<id>.mp4
//
// KENAPA ADA. Perubahan bentuk video selama ini cuma bisa dilihat setelah
// ter-upload, atau dengan menjalankan seluruh make-videos (yang menuntut data
// kode baru, kuota, dan token YouTube). Akibatnya adegan baru diuji langsung di
// kanal — dan yang salah bentuk baru ketahuan sesudah tayang, padahal video yang
// sudah tayang sengaja tak pernah kita edit.
//
// Harness ini merakit masukan DENGAN CARA YANG SAMA seperti make-videos akan
// merakitnya, supaya yang terlihat di sini benar-benar yang akan terbit nanti.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderWide } from "./video/render-wide.mjs";
import { makeVO, muxAudio } from "./video/make-audio.mjs";
import { susunNaskah, perkiraanDetik } from "./video/naskah.mjs";
import { siklusRilis, kodeSekarat, kodeBaru, kedalamanArsip, ringkasWawasan } from "./video/wawasan.mjs";
import { gambarGame } from "./src/game-media.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const OUT = resolve(HERE, "../_video-review");
const baca = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

const id = process.argv[2] || "afkj";
const nowMs = Date.now();

// ── data game ────────────────────────────────────────────────────────────────
const mob = baca(resolve(DATA, "codes.json"), { active: [], archive: [] });
const rob = baca(resolve(DATA, "roblox-codes.json"), { games: {}, active: [], archive: [] });
const platform = rob.games?.[id] ? "ROBLOX" : "MOBILE";
const src = platform === "ROBLOX" ? rob : mob;
const aktif = (src.active ?? []).filter((c) => c.game === id);
const riwayat = [...aktif, ...(src.archive ?? []).filter((c) => c.game === id)];
if (!aktif.length) { console.error(`Tak ada kode aktif untuk "${id}".`); process.exit(1); }
const nama = rob.games?.[id]?.name || aktif[0].gameName || id;

// ── wawasan (video/wawasan.mjs) ──────────────────────────────────────────────
const wawasan = {
  siklus: siklusRilis(riwayat, { nowMs }),
  sekarat: kodeSekarat(aktif, { nowMs }),
  baru: kodeBaru(aktif, { nowMs }),
  arsip: kedalamanArsip(aktif, (src.archive ?? []).filter((c) => c.game === id)),
};

// ── langkah redeem terverifikasi (registry situs) ────────────────────────────
let redeem = null;
try {
  const { REDEEM } = await import(pathToFileURL(resolve(HERE, "../site/src/lib/redeem.mjs")).href);
  const r = REDEEM?.[id];
  // Dua bahasa dikirim sekaligus: registry memang menyimpan keduanya, dan situs
  // sudah bilingual — video yang cuma Indonesia membuang separuh penonton yang
  // justru paling mungkin datang dari pencarian berbahasa Inggris.
  if (r?.ingame?.id?.length) {
    redeem = { req: r.req?.id ?? null, reqEn: r.req?.en ?? null, steps: r.ingame.id, stepsEn: r.ingame.en ?? [] };
  }
} catch (e) {
  console.log(`  (registry redeem dilewati: ${e.message})`);
}

// ── kode yang dipajang ───────────────────────────────────────────────────────
// Terbaru dulu, dan kode yang terbukti baru diberi penanda — sama seperti jalur
// produksi. Dibatasi 8 supaya durasinya wajar untuk pratinjau.
const baruSet = new Set(wawasan.baru.map((b) => b.code));
const display = [...aktif]
  .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
  .slice(0, 8)
  .map((c) => ({ code: c.code, reward: c.reward || "", isNew: baruSet.has(c.code) }));

// ── naskah ───────────────────────────────────────────────────────────────────
const { teks, dipakai } = susunNaskah({
  name: nama, activeCount: aktif.length, codes: display, wawasan, redeem,
});

console.log(`game     : ${nama} (${id}, ${platform})`);
console.log(`kode     : ${aktif.length} aktif · ${riwayat.length} termasuk arsip · ${display.length} dipajang`);
console.log(`wawasan  : ${ringkasWawasan(wawasan)}`);
console.log(`redeem   : ${redeem ? `${redeem.steps.length} langkah${redeem.req ? " + syarat" : ""}` : "tak ada di registry"}`);
console.log(`naskah   : ${dipakai.length} kalimat (${dipakai.join(", ")}) · ~${perkiraanDetik(teks).toFixed(1)} dtk`);
console.log(`\n"${teks}"\n`);

// ── render ───────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const namaDasar = process.env.PRATINJAU_NAMA || `pratinjau-${id}`;
const fin = resolve(OUT, `${namaDasar}.mp4`);
const bisu = resolve(OUT, `${namaDasar}.base.mp4`);
const vo = resolve(OUT, `${namaDasar}.vo.mp3`);

if (process.env.TANPA_VO === "1") { console.log("VO dilewati (TANPA_VO=1)."); }
else { await makeVO({ outPath: vo, text: teks }); console.log("VO dibuat."); }
const adaVO = existsSync(vo) && process.env.TANPA_VO !== "1";

const ikon = resolve(HERE, `../site/public/assets/${platform === "ROBLOX" ? "roblox" : "games"}/${id}.png`);
// LATAR_VIDEO=<path> → klip dipakai sebagai latar (uji). Kosong = latar biasa.
const latarVideo = process.env.LATAR_VIDEO || null;
// Gambar promosi game — SAMA seperti yang ditarik make-videos. Harness ini dulu
// tak menariknya sama sekali, jadi latarnya cuma memakai ikon; untuk menilai
// mode "klip + gambar promosi" itu tak cukup mewakili.
const uid = platform === "ROBLOX" ? rob.games?.[id]?.universeId : null;
const media = uid ? await gambarGame(uid, 8) : [];
if (latarVideo) console.log(`latar    : video ${latarVideo}${process.env.LATAR_ART > 0 ? ` + ${media.length} gambar promosi (alpha ${process.env.LATAR_ART})` : " (polos)"}`);
const hasil = await renderWide({
  game: { name: nama, slug: id, players: rob.games?.[id]?.players ?? 0 },
  codes: display, activeCount: aktif.length, fetchedAt: new Date().toISOString(),
  iconPath: existsSync(ikon) ? ikon : null,
  outPath: adaVO ? bisu : fin, voPath: adaVO ? vo : null,
  wawasan, redeem, latarVideo, media,
});
if (adaVO) await muxAudio({ videoPath: bisu, voPath: vo, outPath: fin });
console.log(`\n✓ ${fin}`);
console.log(`  ${hasil.durasi.toFixed(1)} dtk · ${hasil.adegan} adegan kode · ${(hasil.ukuran / 1048576).toFixed(1)} MB`);
