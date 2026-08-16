// Daftar video yang belum punya playlist — siap tempel ke YouTube Studio.
//
// Jalankan: node worker/daftar-playlist-manual.mjs
//
// Hasilnya ditulis ke _video-review/playlist-manual.txt (folder itu di-gitignore)
// selain dicetak ke layar — menyalin dari terminal Windows menyakitkan, dan
// deskripsi bilingualnya panjang.
//
// KENAPA ADA. Video BORONGAN yang gagal dapat playlist tidak diantrekan ulang
// (keputusan: daftar borongan disusun ulang tiap malam, jadi antrean dianggap
// mubazir). Konsekuensinya, begitu videonya terbit dan kodenya ditandai posted,
// game itu tak pernah masuk daftar borongan lagi — playlistnya TAK AKAN PERNAH
// datang sendiri. Satu-satunya jalan memang manual.
//
// Pemilik kanal memilih tetap manual untuk sekarang (16 Agu 2026), jadi yang
// bisa diperbaiki adalah ONGKOS manualnya: judul, tautan, dan deskripsi
// bilingual disusun di sini persis seperti yang dipakai pipeline — supaya
// playlist buatan tangan langsung dikenali sebagai milik game itu di run
// berikutnya, bukan malah melahirkan playlist kembar.
//
// Video kode-baru TIDAK ikut daftar ini: yang itu sudah diantrekan ke
// pending-playlists.json dan terpasang sendiri saat jatah harian pulih.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.KODEGG_DATA || resolve(HERE, "data");
const KELUARAN = process.env.KODEGG_KELUARAN || resolve(HERE, "..", "_video-review", "playlist-manual.txt");

const baris = [];
const tulis = (s = "") => { baris.push(s); console.log(s); };
/** Menyimpan gagal (folder read-only, disk penuh) tak boleh membatalkan daftarnya
 *  — isinya sudah tercetak ke layar. */
function simpan() {
  try {
    mkdirSync(dirname(KELUARAN), { recursive: true });
    writeFileSync(KELUARAN, baris.join("\n") + "\n");
    console.log(`\n→ tersimpan: ${KELUARAN}`);
  } catch (e) { console.log(`\n(gagal menyimpan ke ${KELUARAN}: ${e.message})`); }
}
const baca = (n, d) => { try { return JSON.parse(readFileSync(resolve(DATA, n), "utf8")); } catch { return d; } };

const st = baca("video-state.json", { log: [] });
const pl = baca("yt-playlists.json", {});
const rb = baca("roblox-codes.json", { games: {} });
const mob = baca("codes.json", { active: [] });
const antre = new Set((baca("pending-playlists.json", []) ?? []).map((x) => x.videoId));

const namaMobile = {};
for (const c of mob.active ?? []) if (c.gameName) namaMobile[c.game] = c.gameName;

const punyaPlaylist = (g) => !!(pl[g] || pl[rb.games?.[g]?.slug ?? g]);

const kurang = (st.log ?? [])
  .filter((e) => e.mode === "upload" && !punyaPlaylist(e.game) && !antre.has(e.videoId))
  .sort((a, b) => (rb.games?.[b.game]?.players ?? 0) - (rb.games?.[a.game]?.players ?? 0));

if (!kurang.length) {
  tulis("Semua video sudah punya playlist — tak ada yang perlu dibuat manual.");
  simpan();
  process.exit(0);
}

tulis(`PLAYLIST YANG PERLU DIBUAT MANUAL — ${kurang.length} video`);
tulis("Urut dari pemain terbanyak. Video yang sudah masuk antrean otomatis TIDAK ikut.");
tulis("Judul JANGAN diubah — itu satu-satunya penanda milik game mana, meleset satu");
tulis("karakter dan run berikutnya akan membuat playlist kedua untuk game yang sama.\n");

kurang.forEach((e, i) => {
  const g = rb.games?.[e.game];
  const nama = g?.name ?? namaMobile[e.game] ?? e.game;
  const slug = g?.slug ?? e.game;
  const jalur = g ? "roblox/" : "game/";
  const urlId = `https://kodegg.com/id/${jalur}${slug}/`;
  const urlEn = `https://kodegg.com/en/${jalur}${slug}/`;
  tulis(`${i + 1}. ${nama} Codes — Kode Redeem`);
  tulis(`   Video     : https://youtu.be/${e.videoId}`);
  tulis(`   Deskripsi :`);
  tulis(`Semua kode redeem ${nama} dari KodeGG, diupdate tiap ada kode baru. Full list + cara redeem: ${urlId}`);
  tulis("");
  tulis(`All ${nama} redeem codes from KodeGG, updated whenever new codes drop. Full list + how to redeem: ${urlEn}`);
  tulis("");
});

simpan();
