// Menggabungkan berkas STATE KUMULATIF dengan versi yang ada di remote, dipakai
// setelah rebase dan sebelum push diulang.
//
// Kenapa perlu. Langkah push di update-codes.yml memakai `git pull --rebase -X
// theirs`, yang saat rebase memenangkan versi LOKAL atas versi remote. Untuk
// roblox-codes.json itu benar dan disengaja: isinya potret hasil tarikan, dan
// tarikan tersegar memang harus menang.
//
// Tapi video-state.json dan video-harian.json bukan potret — keduanya CATATAN
// KUMULATIF. Menimpanya berarti menghapus apa yang run lain sudah kerjakan.
// Terjadi 8 Agu 2026: run A mengunggah 39 video dan menulis todayCount 65, lalu
// run B menimpanya dengan 43 dari state yang sudah basi. Akibatnya berlapis —
// B tak melihat jejak A, mengulang 9 game yang sama, dan batas 65/hari jebol
// jadi 82 unggahan. Kuota "queries per day" YouTube tembus 100% malam itu.
//
// Aturan gabungnya mengikuti sifat tiap field, bukan "yang mana lebih baru":
//   date/todayCount → tanggal terbaru menang; kalau SAMA, ambil hitungan
//                     TERTINGGI (dua run sama-sama mengunggah, keduanya nyata)
//   posted          → gabungan; penanda "sudah divideokan" tak pernah boleh
//                     hilang, karena hilangnya berarti video dibuat ulang
//   log             → gabungan, dedup videoId, urut terbaru, dipotong 300
//   video-harian    → gabungan per jenis+tanggal; entri yang sudah ada menang
//                     (yang lebih dulu tercatat adalah yang benar-benar terbit)
//
//   node worker/gabung-state.mjs <ref-remote>     (mis. origin/main)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ref = process.argv[2] || "origin/main";

const bacaRemote = (rel) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${ref}:${rel}`], {
      cwd: path.join(DIR, ".."), encoding: "utf8", maxBuffer: 1024 * 1024 * 256,
    }));
  } catch { return null; } // belum ada di remote → tak ada yang perlu digabung
};
const bacaLokal = (abs) => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return null; } };

let berubah = [];

// ── video-state.json ────────────────────────────────────────────────────────
{
  const rel = "worker/data/video-state.json";
  const abs = path.join(DIR, "data", "video-state.json");
  const a = bacaLokal(abs), b = bacaRemote(rel);
  if (a && b) {
    const sebelum = { d: a.date, c: a.todayCount, p: Object.keys(a.posted ?? {}).length };
    // Hari yang lebih baru menang. Hari SAMA → hitungan tertinggi, karena dua
    // run yang bertabrakan sama-sama benar-benar mengunggah.
    if (String(b.date) > String(a.date)) { a.date = b.date; a.todayCount = b.todayCount ?? 0; }
    else if (String(b.date) === String(a.date)) a.todayCount = Math.max(a.todayCount ?? 0, b.todayCount ?? 0);
    // PLAFON UPLOAD (batas channel yang dipelajari). Kalau kedua sisi punya,
    // yang TERENDAH menang: satu-satunya cara plafon turun adalah YouTube benar
    // -benar menolak, jadi angka lebih rendah selalu berarti bukti yang lebih
    // baru. Kalau cuma remote yang punya, ambil — tanpa ini penolakan yang
    // dipelajari run lain lenyap, dan run ini kembali menabrak batas yang sama.
    if (b.plafon && (!a.plafon || (b.plafon.nilai ?? Infinity) < (a.plafon.nilai ?? Infinity))) a.plafon = b.plafon;
    a.posted = { ...(b.posted ?? {}), ...(a.posted ?? {}) };
    // Cap 4000 dipertahankan: buang yang paling lama DISISIPKAN (urutan kunci
    // objek = urutan sisip), bukan acak.
    const kunci = Object.keys(a.posted);
    if (kunci.length > 4000) { const buang = kunci.slice(0, kunci.length - 4000); for (const k of buang) delete a.posted[k]; }
    const gab = [...(b.log ?? []), ...(a.log ?? [])];
    const lihat = new Set();
    a.log = gab.filter((e) => { const k = e.videoId ?? `${e.at}|${e.game}`; return !lihat.has(k) && lihat.add(k); })
      .sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-300);
    fs.writeFileSync(abs, JSON.stringify(a, null, 1) + "\n");
    berubah.push(`video-state: ${sebelum.d}/${sebelum.c} + remote ${b.date}/${b.todayCount} → ${a.date}/${a.todayCount} · posted ${sebelum.p}→${Object.keys(a.posted).length} · log ${a.log.length}`);
  }
}

// ── video-harian.json ───────────────────────────────────────────────────────
{
  const rel = "worker/data/video-harian.json";
  const abs = path.join(DIR, "data", "video-harian.json");
  const a = bacaLokal(abs), b = bacaRemote(rel);
  if (a && b) {
    let tambah = 0;
    for (const jenis of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!b[jenis] || typeof b[jenis] !== "object") continue;
      a[jenis] = a[jenis] ?? {};
      for (const [tgl, v] of Object.entries(b[jenis])) if (!a[jenis][tgl]) { a[jenis][tgl] = v; tambah += 1; }
    }
    if (tambah) { fs.writeFileSync(abs, JSON.stringify(a, null, 1) + "\n"); berubah.push(`video-harian: +${tambah} entri dari remote`); }
  }
}

// ── kuota-yt.json ───────────────────────────────────────────────────────────
// Catatan pemakaian kuota YouTube — kumulatif per hari PT, jadi kena masalah yang
// PERSIS sama dengan video-state: `-X theirs` akan membuang hitungan run lain,
// dan rem unit di make-videos.mjs lalu mengira kuotanya masih longgar.
//
// Digabung pakai MAX per metode, bukan penjumlahan: keduanya berisi total sejak
// awal hari, bukan selisih, jadi menjumlahkan akan menghitung dobel bagian yang
// sama. MAX memang MENGHITUNG TERLALU SEDIKIT bila dua run benar-benar barengan
// — tapi arah salahnya bisa dipilih, dan kehilangan seluruh catatan run lain
// jauh lebih berbahaya daripada meremehkan selisih beberapa panggilan.
{
  const rel = "worker/data/kuota-yt.json";
  const abs = path.join(DIR, "data", "kuota-yt.json");
  const a = bacaLokal(abs), b = bacaRemote(rel);
  if (a && b && a.hari === b.hari) {
    let naik = 0;
    a.panggilan = a.panggilan ?? {};
    for (const [m, n] of Object.entries(b.panggilan ?? {})) {
      if ((a.panggilan[m] ?? 0) < n) { a.panggilan[m] = n; naik += 1; }
    }
    if (naik) { fs.writeFileSync(abs, JSON.stringify(a, null, 1) + "\n"); berubah.push(`kuota-yt: ${naik} metode diambil dari remote (lebih tinggi)`); }
  } else if (a && b && String(b.hari) > String(a.hari)) {
    // Remote sudah menyeberang ke hari PT baru: catatan lokal milik hari kemarin
    // dan tak boleh menimpanya (kalau ditimpa, kuota hari baru terlihat terpakai).
    fs.writeFileSync(abs, JSON.stringify(b, null, 1) + "\n");
    berubah.push(`kuota-yt: hari remote ${b.hari} lebih baru → pakai catatan remote`);
  }
}

// ── pending-thumbs.json ─────────────────────────────────────────────────────
// Antrean thumbnail. Ditambahkan 20 Agu 2026 setelah run top50-video 19 Agu
// GAGAL persis di sini: `git pull --rebase` bentrok di berkas ini (run per jam
// menguras antrean sementara run harian menambahinya), `|| true` menelan
// kegagalannya, dan `git push` berikutnya jalan di HEAD terlepas → exit 128.
// Videonya sendiri sudah terbit; yang hilang justru catatannya — termasuk
// thumbnail video itu, yang jadi tak pernah terpasang.
//
// Digabung sebagai HIMPUNAN (union by videoId), bukan pilih-satu-menang: kedua
// sisi hanya MENGHAPUS entri saat thumbnail benar-benar terpasang, jadi entri
// yang cuma ada di satu sisi hampir selalu berarti "baru ditambahkan di sana".
//
// Risikonya jujur disebut: bila remote menghapus entri (berhasil dipasang) tepat
// saat lokal masih memegangnya, union MENGHIDUPKANNYA kembali. Ongkosnya satu
// pemasangan ulang (50 unit) yang mubazir, lalu entrinya hilang sendiri. Arah
// salah itu sengaja dipilih — kebalikannya berarti thumbnail yang belum
// terpasang lenyap diam-diam, dan videonya selamanya memakai frame acak.
{
  const rel = "worker/data/pending-thumbs.json";
  const abs = path.join(DIR, "data", "pending-thumbs.json");
  const a = bacaLokal(abs), b = bacaRemote(rel);
  if (Array.isArray(a) && Array.isArray(b)) {
    const peta = new Map();
    // Lokal dimasukkan belakangan supaya menang saat videoId-nya sama: dialah
    // yang baru saja mencoba, jadi jeda & hitungan gagalnya yang paling segar.
    for (const x of [...b, ...a]) if (x?.videoId) peta.set(x.videoId, x);
    const gab = [...peta.values()]
      .sort((x, y) => String(y.gagalPada ?? "").localeCompare(String(x.gagalPada ?? "")))
      .slice(0, 50); // batas sama dengan simpanPending()
    if (gab.length !== a.length) {
      fs.writeFileSync(abs, JSON.stringify(gab, null, 1) + "\n");
      berubah.push(`pending-thumbs: ${a.length} lokal + ${b.length} remote → ${gab.length}`);
    }
  }
}

if (berubah.length) { console.log("  gabung state:"); for (const b of berubah) console.log(`    ${b}`); }
else console.log("  gabung state: tak ada yang perlu digabung");
