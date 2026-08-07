// PERBAIKAN SEKALI-JALAN: mengembalikan kode yang bangkit dari arsip pada
// gelombang 7 Agu 2026.
//
// Duduk perkaranya. RoCodes.gg memindahkan hampir seluruh katalog expired-nya
// kembali ke daftar aktif (Clover Retribution 245 arsip → 7, Heavyweight
// Fishing 73 → 1, Race Clicker 57 → 1). Pipeline mengikutinya dan 994 kode yang
// sudah kita arsipkan atas vonis primer hidup kembali dalam satu run. Uji
// lapangan hari itu memastikan arahnya: tiga kode Brainblast a Lucky Block yang
// berbadge ACTIVE dari RoCodes, tiga-tiganya ditolak game.
//
// Penguncian kebangkitan di fetch-roblox.mjs (`bangkitPrimer`) mencegah ini
// terulang, TAPI tak bisa menyembuhkan yang telanjur: `mergeWithPrevious`
// menganut "aktif menang", sehingga entri arsip lamanya sudah dibuang. Tanpa
// entri itu `arsipPrimer` tak lagi mengenali mereka, dan penguncian tak punya
// apa-apa untuk dipegang. Karena itu daftarnya diambil dari GIT — commit data
// terakhir sebelum gelombang.
//
// Kode yang uji lapangan buktikan HIDUP dikecualikan. Itu satu-satunya bukti
// yang lebih kuat dari vonis primer, dan aturannya harus sama di sini seperti
// di worker.
//
//   node worker/pulihkan-bangkit.mjs <sha-commit-sebelum-gelombang> [--tulis]
//
// Tanpa --tulis hanya melaporkan. Dijalankan sekali; disimpan di repo supaya
// angkanya bisa diperiksa ulang, bukan untuk dijalankan rutin.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vonisHidup } from "./src/uji-vonis.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BERKAS = path.join(DIR, "data", "roblox-codes.json");
const K = (c) => `${c.game}:${String(c.code).toLowerCase()}`;

const sha = process.argv[2];
const tulis = process.argv.includes("--tulis");
if (!sha) { console.error("butuh sha commit data sebelum gelombang"); process.exit(1); }

const lama = JSON.parse(
  execFileSync("git", ["show", `${sha}:worker/data/roblox-codes.json`], {
    cwd: path.join(DIR, ".."), maxBuffer: 1024 * 1024 * 512, encoding: "utf8",
  }),
);
const kini = JSON.parse(fs.readFileSync(BERKAS, "utf8"));
const hidup = vonisHidup(kini.games ?? {});

// Hanya `primer` yang dipulihkan. Alasan arsip lain (endsAt, cek-mandek,
// hilang) tidak: masing-masing punya jalannya sendiri untuk kembali menyala,
// dan yang sedang diperbaiki di sini khusus vonis sumber primer yang dianulir
// oleh sumber itu sendiri.
const arsipLama = new Map(lama.archive.filter((c) => c.expiredBy === "primer").map((c) => [K(c), c]));

const balik = [], dikecualikan = [];
const sisaAktif = kini.active.filter((c) => {
  const entri = arsipLama.get(K(c));
  if (!entri) return true;
  if (hidup.has(K(c))) { dikecualikan.push(c.code); return true; }
  // Entri arsip LAMA yang dipakai, bukan versi aktifnya: ia membawa expiredAt
  // dan firstSeenAt asli, jadi riwayatnya tidak dikarang ulang.
  balik.push({ ...entri, expiredBy: "primer" });
  return false;
});

const adaDiArsip = new Set(kini.archive.map(K));
const tambah = balik.filter((c) => !adaDiArsip.has(K(c)));

const perGame = {};
for (const c of tambah) perGame[c.game] = (perGame[c.game] ?? 0) + 1;
console.log(`Kode aktif yang cocok dengan arsip-primer ${sha.slice(0, 7)}: ${balik.length}`);
console.log(`  dikembalikan ke arsip : ${tambah.length}`);
console.log(`  dikecualikan (uji lapangan bilang HIDUP): ${dikecualikan.length}${dikecualikan.length ? ` — ${dikecualikan.join(", ")}` : ""}`);
console.log(`  aktif: ${kini.active.length} → ${sisaAktif.length}`);
for (const [g, n] of Object.entries(perGame).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`     ${(kini.games[g]?.name ?? g).padEnd(32)}${n}`);
}

if (!tulis) { console.log("\n(mode laporan — tambahkan --tulis untuk menerapkan)"); process.exit(0); }

kini.active = sisaAktif;
kini.archive = [...kini.archive, ...tambah];
kini.counts = { ...kini.counts, active: kini.active.length, archived: kini.archive.length };
fs.writeFileSync(BERKAS, JSON.stringify(kini, null, 2));
console.log(`\n✓ ditulis — ${kini.active.length} aktif, ${kini.archive.length} arsip`);
