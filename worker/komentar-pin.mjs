// Teks komentar untuk DI-PIN di video lama yang kodenya sudah kedaluwarsa.
//
// Kenapa komentar, bukan edit deskripsi. Kode tercetak di LAYAR video — tak ada
// suntingan metadata yang bisa memperbaikinya, dan mengganti daftar kode di
// deskripsi justru membuat teks bertengkar dengan gambarnya sendiri (penonton
// membaca kode yang berbeda dari yang dilihatnya, dan itu terbaca seperti
// mengakali). Komentar tidak berpura-pura: ia BERTANGGAL, jadi jujur mengakui
// videonya lama sambil tetap memberi jalan keluar. Metadata video yang sudah
// tayang pun tak tersentuh — sesuai keputusan user 3 Agu 2026.
//
// Data API tak punya endpoint untuk mem-pin komentar, jadi keluaran skrip ini
// disalin manual ke Studio lalu di-pin di sana.
//
// Kode yang disebut disaring dengan uji yang sama seperti video (buang check &
// srcCheck) dan ditandai kalau memang pernah diuji langsung di dalam game —
// komentar yang menjanjikan kode kedaluwarsa lagi justru memperparah keadaan.
//
//   node worker/komentar-pin.mjs <slug>          → evergreen (tak pernah basi)
//   node worker/komentar-pin.mjs <slug> --kode   → sertakan kode + video terbaru

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const baca = (n, k) => (fs.existsSync(path.join(DIR, "data", n)) ? JSON.parse(fs.readFileSync(path.join(DIR, "data", n), "utf8")) : k);

const diragukan = (c) => c.check === true || c.srcCheck === true;
const SITUS = "https://kodegg.com";

async function token() {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(DIR, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, refresh_token: env.YT_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });
  return (await r.json()).access_token;
}

async function main(slug, penuh) {
  const d = baca("roblox-codes.json", null);
  const gid = Object.keys(d.games).find((k) => (d.games[k].slug ?? "") === slug);
  if (!gid) throw new Error(`slug "${slug}" tak ada`);
  const nama = d.games[gid].name;

  const uji = baca("uji-lapangan.json", { uji: [] });
  const terbukti = new Set(uji.uji.filter((u) => u.game === slug && u.vonis === "hidup").map((u) => u.code.toLowerCase()));
  // Kode yang uji lapangan buktikan MATI dibuang, sekeras apa pun sumber masih
  // mendaftarkannya aktif. Di sinilah bukti langsung mengalahkan agregator: filter
  // `diragukan` cuma tahu apa kata sumber, dan untuk DRAGDRIVEDANGCAP kedua
  // sumber salah — kode itu lolos semua saringan otomatis namun ditolak game.
  // Komentar ini dipasang justru untuk menambal kepercayaan; menyebut kode yang
  // kita sendiri sudah tahu mati akan membalik tujuannya.
  const mati = new Set(uji.uji.filter((u) => u.game === slug && u.vonis === "mati").map((u) => u.code.toLowerCase()));

  const aktif = d.active.filter((c) => c.game === gid && !diragukan(c) && !mati.has(c.code.toLowerCase()));
  // Yang TERBUKTI hidup naik ke atas: itu satu-satunya kode yang benar-benar
  // bisa kita pertanggungjawabkan, sisanya cuma "menurut sumber".
  aktif.sort((a, b) => (terbukti.has(b.code.toLowerCase()) ? 1 : 0) - (terbukti.has(a.code.toLowerCase()) ? 1 : 0));

  const plId = baca("yt-playlists.json", {})[slug] ?? null;
  // Video terbaru cuma diperlukan bentuk --kode. Bentuk bawaan tak menautkan
  // video sama sekali, jadi panggilan API-nya dilewati — evergreen berarti nol
  // kuota dan bisa dijalankan untuk ratusan game tanpa memikirkan biaya.
  let terbaru = null;
  if (plId && penuh) {
    const tok = await token();
    const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet&playlistId=${plId}&maxResults=50`, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.ok) {
      const items = (await r.json()).items ?? [];
      // Diambil dari PLAYLIST, bukan dari video-state.json: log pernah menyimpan
      // ID yang videonya tak ada (VZAG44vSPnA utk Drag Drive 3 Agu), sehingga
      // komentar bisa menautkan video hantu. Playlist dibaca langsung dari
      // YouTube, jadi ia tak mungkin menyebut video yang tak tayang.
      items.sort((a, b) => String(b.contentDetails.videoPublishedAt ?? "").localeCompare(String(a.contentDetails.videoPublishedAt ?? "")));
      terbaru = items[0] ?? null;
    }
  }

  const tgl = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  const baris = aktif.slice(0, 8).map((c) => `• ${c.code}${c.reward ? ` — ${c.reward}` : ""}`).join("\n");

  // DUA BENTUK, dan yang bawaan sengaja yang paling miskin isinya.
  //
  // Bentuk --kode mencantumkan daftar kode dan menautkan video terbaru. Itu
  // paling menolong HARI INI, tapi ia mewarisi persis penyakit yang hendak
  // diobatinya: kodenya hangus, dan video "terbaru" yang ditautkan akan jadi
  // video lama juga. Komentar begitu harus dirawat selamanya, dan dengan 300+
  // video itu utang yang tak akan pernah terbayar.
  //
  // Bentuk bawaan tidak menyebut satu pun kode dan tidak menautkan satu pun
  // video. Cuma dua tautan yang isinya berganti sendiri: halaman game (ditarik
  // ulang tiap jam) dan playlist game. Playlist aman karena upload.mjs
  // menyisipkan di position 0 — diperiksa 7 Agu 2026 pada 5 playlist berisi >1
  // video, kelimanya menaruh yang terbaru di paling atas. Ditulis sekali,
  // tak pernah perlu disentuh lagi, dan tetap benar bertahun-tahun kemudian.
  //
  // Situs didahulukan atas playlist karena komentar ini menolong orang yang
  // kodenya BARU SAJA ditolak game: satu klik langsung ke jawabannya, bukan
  // menonton video lain dulu.
  const teks = penuh
    ? `📌 Video ini sudah lama — sebagian kodenya kemungkinan kedaluwarsa.\n\n` +
      `✅ Kode ${nama} yang masih jalan per ${tgl}:\n${baris}\n\n` +
      (terbaru ? `🎬 Video terbaru: https://youtube.com/shorts/${terbaru.contentDetails.videoId}\n` : "") +
      (plId ? `📂 Semua video ${nama}: https://youtube.com/playlist?list=${plId}\n` : "") +
      `🌐 Daftar lengkap & selalu update tiap jam:\n${SITUS}/id/roblox/${slug}/\n\n` +
      `— Codes expire fast. Always-current list: ${SITUS}/en/roblox/${slug}/`
    : `📌 Kode di video ini bisa saja sudah kedaluwarsa — kode redeem cepat hangus.\n\n` +
      `🌐 Daftar kode ${nama} terbaru, update otomatis tiap jam:\n${SITUS}/id/roblox/${slug}/\n\n` +
      (plId ? `📂 Video terbaru game ini selalu paling atas di playlist:\nhttps://youtube.com/playlist?list=${plId}\n\n` : "") +
      `— Codes expire fast. Always-current list: ${SITUS}/en/roblox/${slug}/`;

  console.log(teks);
  console.log("\n" + "─".repeat(60));
  console.log(
    `${teks.length} karakter · ` +
      (penuh
        ? `${aktif.length} kode lolos filter · ${aktif.filter((c) => terbukti.has(c.code.toLowerCase())).length} terbukti hidup lewat uji lapangan · PERLU DIPERBARUI kalau kodenya berganti`
        : "evergreen — tak pernah perlu diperbarui"),
  );
  if (terbaru) console.log(`video terbaru: ${terbaru.snippet.title.slice(0, 60)} (${(terbaru.contentDetails.videoPublishedAt ?? "").slice(0, 10)})`);
}

const argv = process.argv.slice(2);
main(argv.find((a) => !a.startsWith("--")) ?? "", argv.includes("--kode"))
  .catch((e) => { console.error(String(e.message || e)); process.exit(1); });
