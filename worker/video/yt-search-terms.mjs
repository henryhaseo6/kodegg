// Kata kunci pencarian YouTube yang BENAR-BENAR membawa penonton ke channel.
//
// Kenapa ini penting melebihi metrik lain: terukur 3 Agu 2026, ~90% tayangan
// datang dari YouTube Search (91,7% / 90,6% / 89,5% pada tiga video contoh),
// Shorts feed cuma 7-9%. Artinya yang menentukan sebuah video berhasil bukan
// seberapa sering kita posting, melainkan APAKAH ADA ORANG MENCARINYA.
//
// Selama ini pemilihan game memakai PROKSI — jumlah pemain dan aktivitas kode
// (lihat src/den-scout.mjs). Proksi itu sudah terbukti lebih baik daripada
// jumlah pemain saja (Drag Drive Simulator 63K pemain dapat 4,5K view karena
// kodenya aktif; Tower of Hell yang pemainnya mirip cuma puluhan karena kodenya
// mati). Tapi proksi tetap tebakan. Ini menggantinya dengan pengukuran.
//
// BUTUH scope `yt-analytics.readonly` (BACA-SAJA). Token lama tak punya itu →
// jalankan `node worker/video/gen-token.mjs` lalu perbarui secret YT_REFRESH_TOKEN.
// Tanpa scope itu API memulangkan 403 dan skrip ini berhenti dengan pesan jelas.
//
// Pakai:
//   node worker/video/yt-search-terms.mjs                 (30 hari terakhir)
//   node worker/video/yt-search-terms.mjs --days=7
//   node worker/video/yt-search-terms.mjs --days=90 --top=100
//   ... --json=path.json   (simpan mentah, utk dipakai skrip lain)
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (n, d = "") => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=") || d;

// .env sederhana — sama seperti upload-manual.mjs, biar bisa dijalankan lokal.
function loadEnvFile() {
  const p = resolve(ROOT, "worker/.env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvFile();

const DAYS = Math.max(1, Number(arg("days", "30")));
const TOP = Math.max(1, Number(arg("top", "60")));
const OUT = arg("json");

if (!process.env.YT_REFRESH_TOKEN) {
  console.error("kredensial YouTube belum di-set (YT_CLIENT_ID/SECRET/REFRESH_TOKEN).");
  process.exit(1);
}

const { google } = await import("googleapis");
const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });
const ytA = google.youtubeAnalytics({ version: "v2", auth: o });

const ymd = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const sejak = new Date(now.getTime() - DAYS * 864e5);

let rows;
try {
  const r = await ytA.reports.query({
    ids: "channel==MINE",
    startDate: ymd(sejak),
    endDate: ymd(now),
    metrics: "views,estimatedMinutesWatched",
    dimensions: "insightTrafficSourceDetail",
    filters: "insightTrafficSourceType==YT_SEARCH",
    sort: "-views",
    // BATAS KERAS 25. Dimensi insightTrafficSourceDetail menolak maxResults di
    // atas itu dengan "Internal error encountered" — pesan generik yang terbaca
    // seperti gangguan Google, padahal salah parameter kita. Diuji 4 Agu 2026:
    // 25 berhasil, 100 dan 200 gagal.
    maxResults: Math.min(25, TOP),
  });
  rows = r.data.rows ?? [];
} catch (e) {
  const msg = String(e?.message || e);
  // API BELUM DIAKTIFKAN — beda dari masalah scope, dan gampang tertukar karena
  // dua-duanya "gagal izin". YouTube Analytics API adalah layanan TERPISAH dari
  // YouTube Data API yang dipakai pipeline upload; mengaktifkan satu tak
  // mengaktifkan yang lain.
  const proyek = /project (\d+)/.exec(msg)?.[1];
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(msg)) {
    console.error("YouTube Analytics API belum diaktifkan di project Google Cloud.");
    console.error(`Aktifkan di: https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview${proyek ? `?project=${proyek}` : ""}`);
    console.error("Tunggu ~1-2 menit setelah Enable, lalu jalankan lagi.");
    process.exit(3);
  }
  if (/insufficient|scope|forbidden|403/i.test(msg)) {
    console.error("403 — token belum punya scope yt-analytics.readonly.");
    console.error("Perbaiki: node worker/video/gen-token.mjs  → perbarui secret YT_REFRESH_TOKEN di GitHub.");
    process.exit(2);
  }
  console.error("gagal menarik analytics:", msg);
  process.exit(1);
}

if (!rows.length) {
  console.log(`tak ada data pencarian ${DAYS} hari terakhir (channel terlalu baru, atau YouTube belum mengagregasi).`);
  process.exit(0);
}

const total = rows.reduce((a, r) => a + (r[1] || 0), 0);
console.log(`KATA KUNCI PENCARIAN — ${DAYS} hari terakhir · ${rows.length} kueri · ${total} tayangan\n`);
console.log("tayangan  menit    kueri");
for (const [q, views, mins] of rows.slice(0, TOP)) {
  console.log(String(views).padStart(8), String(Math.round(mins || 0)).padStart(7), "  " + q);
}

// Cocokkan kueri ke game yang kita pantau → game mana yang PERMINTAANNYA nyata,
// dan game mana yang dicari orang padahal kita belum punya videonya.
try {
  const rb = JSON.parse(readFileSync(resolve(ROOT, "worker/data/roblox-codes.json"), "utf8"));
  const pl = JSON.parse(readFileSync(resolve(ROOT, "worker/data/yt-playlists.json"), "utf8"));
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const games = Object.entries(rb.games).map(([id, g]) => ({ id, nama: g.name || id, n: norm(g.name || id), punyaVideo: !!pl[id] }));
  const skor = new Map();
  for (const [q, views] of rows) {
    const nq = norm(q);
    // Pilih kecocokan TERPANJANG supaya "blox fruits" tak tersedot ke "fruits".
    let best = null;
    for (const g of games) if (g.n.length > 3 && nq.includes(g.n) && (!best || g.n.length > best.n.length)) best = g;
    if (best) skor.set(best.id, (skor.get(best.id) || 0) + (views || 0));
  }
  const rank = [...skor].map(([id, v]) => ({ ...games.find((g) => g.id === id), views: v })).sort((a, b) => b.views - a.views);
  const belum = rank.filter((g) => !g.punyaVideo);
  console.log(`\nPERMINTAAN PER GAME (dicocokkan dari kueri): ${rank.length} game`);
  for (const g of rank.slice(0, 25)) console.log(String(g.views).padStart(8), (g.punyaVideo ? "  " : " !") + " " + g.nama);
  if (belum.length) {
    console.log(`\n! ${belum.length} game DICARI tapi belum punya video — kandidat terkuat:`);
    for (const g of belum.slice(0, 15)) console.log(String(g.views).padStart(8), "  " + g.nama, `(--game=${g.id})`);
  }
} catch {
  /* data repo tak ada — tabel kueri di atas tetap berguna */
}

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ days: DAYS, generatedAt: now.toISOString(), rows }, null, 1));
  console.log(`\ndisimpan → ${OUT}`);
}
