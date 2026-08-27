// LAPORAN HARIAN — satu perintah, satu gambaran utuh.
//
// Kenapa ada: pemeriksaan proyek ini tersebar di banyak tempat (audit-data,
// health.json, antrean video/playlist/thumbnail, slug-404, identitas-beda,
// YouTube Analytics). Masing-masing berguna, tapi tak ada yang MENYATUKAN —
// jadi masalah baru ketahuan kalau kebetulan ada yang membuka tempat yang tepat.
// Hampir semua bug besar 2-4 Agu 2026 ditemukan begitu: user membuka satu
// halaman dan merasa ada yang janggal.
//
// Ini menariknya jadi satu laporan yang bisa dibaca sekali duduk, dan
// menyimpannya sebagai riwayat supaya TREN kelihatan (bukan cuma nilai hari ini).
//
// Pakai:
//   node worker/laporan-harian.mjs              (lengkap, termasuk YouTube)
//   node worker/laporan-harian.mjs --tanpa-yt   (data lokal saja, tanpa API)
//   node worker/laporan-harian.mjs --json       (keluaran mesin)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ringkas as ringkasKuota, KUOTA_HARIAN } from "./video/yt-kuota.mjs";
// Cap game Roblox diimpor, tak disalin: pernah ditulis 600 di sini sementara
// fetch-roblox sudah 800, jadi laporan berbunyi "705 / 600" — seolah tembus
// batas padahal aman. Angka salinan akan basi lagi pada kenaikan berikutnya.
import { MAX_GAMES } from "./src/roblox-games.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// KODEGG_DATA: samakan dengan audit-data.mjs — laporan ini MEMANGGIL audit lewat
// execFileSync yang mewarisi env, jadi kalau hanya audit yang menghormati env-nya,
// dua bagian dari laporan yang sama membaca dua direktori data berbeda.
const DATA = process.env.KODEGG_DATA || resolve(HERE, "data");
const ARG = new Set(process.argv.slice(2));
const TANPA_YT = ARG.has("--tanpa-yt");
const JSON_ONLY = ARG.has("--json");

const baca = (f, d = null) => { try { return JSON.parse(readFileSync(resolve(DATA, f), "utf8")); } catch { return d; } };
const angka = (n) => Number(n ?? 0).toLocaleString("id-ID");
const persen = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

// .env untuk kredensial YouTube saat dijalankan lokal (di CI dari secrets).
if (existsSync(resolve(HERE, ".env"))) {
  for (const line of readFileSync(resolve(HERE, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const L = []; // baris laporan
const bagian = (judul) => L.push("", `## ${judul}`);
const baris = (k, v) => L.push(`- ${k}: ${v}`);
const perhatian = (t) => L.push(`- ⚠️ ${t}`);

const rb = baca("roblox-codes.json", { games: {}, active: [], archive: [] });
const mc = baca("codes.json", { active: [], archive: [] });
const pl = baca("yt-playlists.json", {});
const vs = baca("video-state.json", { log: [] });
const ringkas = { pada: new Date().toISOString() };

// ── 1. SKALA ────────────────────────────────────────────────────────────────
bagian("Skala");
const nGame = Object.keys(rb.games ?? {}).length;
baris("Kode Roblox aktif", `${angka(rb.active.length)} (arsip ${angka((rb.archive ?? []).length)})`);
baris("Kode mobile aktif", angka(mc.active.length));
baris("Game Roblox dipantau", `${angka(nGame)} / cap ${angka(MAX_GAMES)}`);
baris("Playlist tersinkron", angka(Object.keys(pl).length));
Object.assign(ringkas, { aktif: rb.active.length, game: nGame, playlist: Object.keys(pl).length });

// ── 2. AUDIT DATA (dipanggil apa adanya — satu sumber kebenaran) ────────────
bagian("Audit data");
try {
  const out = execFileSync(process.execPath, [resolve(HERE, "audit-data.mjs")], { encoding: "utf8" });
  const kepala = out.split("\n")[0] ?? "";
  baris("Ringkasan", kepala.replace("AUDIT DATA — ", ""));
  for (const blok of out.split("\n\n").slice(1)) {
    const judul = blok.trim().split("\n")[0];
    if (/^\[TINGGI\]/.test(judul)) perhatian(judul.replace(/^\[TINGGI\]\s*/, "TINGGI: "));
    else if (/^\[SEDANG\]/.test(judul)) baris("SEDANG", judul.replace(/^\[SEDANG\]\s*/, ""));
  }
  ringkas.auditTinggi = (out.match(/^\[TINGGI\]/gm) ?? []).length;
} catch (e) { perhatian(`audit-data gagal: ${e.message.slice(0, 80)}`); }

// ── 3. KESEHATAN PARSER (tren, bukan nilai sesaat) ─────────────────────────
bagian("Kesehatan parser");
const h = baca("health.json", []);
if (!Array.isArray(h) || h.length < 2) baris("Riwayat", `${h?.length ?? 0} potret — belum cukup untuk tren`);
else {
  const kini = h[0], lalu = h[Math.min(h.length - 1, 23)]; // ~24 run ke belakang
  const tren = (k, nama, suffix = "%") => {
    const a = kini[k], b = lalu[k];
    if (a == null || b == null) return;
    const arah = a > b ? "naik" : a < b ? "TURUN" : "tetap";
    baris(nama, `${a}${suffix} (${arah} dari ${b}${suffix})`);
    if (b > 0 && a < b * 0.5) perhatian(`${nama} ANJLOK — kemungkinan parser sumbernya rusak`);
  };
  tren("denRewardPct", "Kode Den punya reward");
  tren("roRewardPct", "Kode RoCodes punya reward");
  tren("howToPct", "Game punya cara redeem");
  tren("denKode", "Kode dari Den", "");
  tren("roKode", "Kode dari RoCodes", "");
  // Kesegaran sumber MOBILE. Ditampilkan walau nol: yang ingin dilihat pemilik
  // situs bukan cuma "ada yang mati" tapi juga "hari ini semua sumber hidup" —
  // laporan yang cuma bicara saat rusak tak bisa dibedakan dari laporan yang mogok.
  if (kini.mobileBekuJam != null) {
    baris("Sumber mobile beku", kini.mobileBekuGame > 0
      ? `${kini.mobileBekuGame} game ≥6 jam (terlama ${kini.mobileBekuJam} jam)`
      : "tak ada — semua game mobile tertarik segar");
  }
}

// ── 3b. KUOTA YOUTUBE (dari catatan panggilan, bukan tebakan) ──────────────
{
  // Tarif TIDAK ditulis ulang di sini — diambil dari yt-kuota.mjs. Dua salinan
  // tabel harga akan berpisah diam-diam begitu salah satunya dikalibrasi ulang,
  // dan laporan yang angkanya beda dari rem produksinya lebih buruk daripada
  // tak ada laporan.
  const k = baca("kuota-yt.json", null)?.panggilan ? ringkasKuota() : null;
  if (k) {
    bagian("Kuota YouTube");
    baris("Hari PT", `${k.hari} — ~${angka(k.unit)} unit dari ${angka(KUOTA_HARIAN)} (${persen(k.unit, KUOTA_HARIAN)}), sisa ~${angka(k.sisa)}`);
    // Rincian per metode: ini yang membedakan "banyak upload" dari "antrean
    // playlist/thumbnail menguras". Dua-duanya tampak sama di angka total.
    baris("Rincian", k.rinci || "—");
    if (k.unit > KUOTA_HARIAN * 0.9) perhatian("kuota YouTube >90% — upload berikutnya ditolak & antreannya menumpuk ke besok");
  }
}

// ── 4. ANTREAN (yang menumpuk = ada yang macet) ────────────────────────────
bagian("Antrean");
const pv = baca("pending-videos.json", []), pp = baca("pending-playlists.json", []), pt = baca("pending-thumbs.json", []);
baris("Video menunggu render/upload", angka(pv.length));
baris("Playlist menunggu dibuat", angka(pp.length) + (pp.length >= 10 ? " — jatah harian YouTube ~10, wajar menumpuk" : ""));
baris("Thumbnail menunggu dipasang", angka(pt.length));
if (pv.length > 30) perhatian(`antrean video ${pv.length} — cek apakah upload macet`);
Object.assign(ringkas, { antreVideo: pv.length, antrePlaylist: pp.length, antreThumb: pt.length });

// ── 5. PIPELINE VIDEO ──────────────────────────────────────────────────────
bagian("Video");
const log = vs.log ?? [];
const perHari = {};
for (const l of log.filter((x) => x.mode === "upload")) perHari[l.at.slice(0, 10)] = (perHari[l.at.slice(0, 10)] ?? 0) + 1;
const hari = Object.keys(perHari).sort().slice(-7);
baris("Upload 7 hari terakhir", hari.map((d) => `${d.slice(5)}:${perHari[d]}`).join("  "));
// Angka pembanding dibaca dari make-videos.mjs, bukan disalin ke sini. Dulu
// 65 ditulis langsung dan jadi usang begitu batasnya diturunkan ke 46 saat
// kanal beralih ke landscape — laporan melaporkan "46/65" alias masih longgar,
// padahal jatahnya persis habis.
const capHarian = Number(process.env.VIDEO_MAX_PER_DAY)
  || Number(/VIDEO_MAX_PER_DAY \|\| (\d+)/.exec(readFileSync(resolve(HERE, "make-videos.mjs"), "utf8"))?.[1])
  || 46;
baris("Jatah hari ini", `${vs.todayCount ?? 0}/${capHarian} (hari kuota ${vs.date ?? "—"})`);
const gagal = log.filter((l) => l.mode === "manual" && (l.at ?? "").slice(0, 10) === new Date().toISOString().slice(0, 10));
// PISAHKAN MENURUT ALASAN. Terbukti 5 Agu 2026: konsol Google menunjukkan
// 11.919/10.000 (119%) sementara YouTube tetap melayani setiap panggilan —
// angka di konsol itu metrik yang tertinggal, bukan gerbangnya. Satu-satunya
// tanda kuota benar-benar habis adalah error quotaExceeded dari API sendiri
// (diklasifikasikan di upload.mjs). Tanpa pemisahan ini, "28 video jatuh ke
// jalur manual" terbaca seperti krisis kuota padahal sebabnya lain sama sekali.
const perAlasan = {};
for (const g of gagal) perAlasan[g.alasan ?? "?"] = (perAlasan[g.alasan ?? "?"] ?? 0) + 1;
const kenaKuota = Object.entries(perAlasan).filter(([a]) => /kuota|quota/i.test(a)).reduce((n, [, v]) => n + v, 0);
if (gagal.length) baris("Jatuh ke jalur manual", `${gagal.length} — ${Object.entries(perAlasan).map(([a, v]) => `${a}: ${v}`).join(", ")}`);
if (kenaKuota) perhatian(`${kenaKuota} upload DITOLAK kuota YouTube hari ini — ini sinyal batas yang sebenarnya, bukan angka di konsol`);
else baris("Ditolak kuota YouTube", "0 (batas nyata belum tersentuh)");

// ── 5b. VIDEO HARIAN YANG SEHARUSNYA ADA ───────────────────────────────────
// Satu-satunya kelas kegagalan di proyek ini yang benar-benar TAK BERSUARA.
//
// Kalau workflow gagal, ia meninggalkan run merah yang bisa dilihat. Tapi kalau
// GitHub Actions sedang penuh, workflow TERJADWAL bisa dijatuhkan begitu saja —
// tak ada run sama sekali, tak ada yang merah, tak ada notifikasi. Terjadi 6 Agu
// 2026: enam run kode dibatalkan setelah menunggu runner 15 menit dengan NOL
// langkah terjalan, dan top50-video serta codes-roundup pada 17:30/17:35 UTC
// tak pernah dibuat. Data kode pulih sendiri lewat rotasi; dua video harian itu
// tidak, dan bolongnya baru ketahuan karena user kebetulan membuka halaman
// Actions.
//
// Diperiksa lewat API Actions, bukan YouTube: yang ingin dijawab adalah "apakah
// pekerjaannya berjalan", dan itu gratis. Butuh izin actions:read.
if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  bagian("Video harian");
  const HARIAN = [
    { file: "top50-video.yml", nama: "Top 50" },
    { file: "codes-roundup.yml", nama: "Roundup kode" },
  ];
  // Ambangnya 30 jam, bukan 24: cron GitHub kerap tertunda berjam-jam (terukur
  // pada seri ini — jadwal 17:30 UTC sering baru jalan 20:30-22:00). Ambang 24
  // jam akan mengeluh tiap kali tertunda wajar, dan peringatan yang sering
  // salah akan diabaikan justru saat benar.
  const BATAS_MS = 30 * 3600 * 1000;
  for (const w of HARIAN) {
    try {
      const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${w.file}/runs?per_page=5`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
      if (!res.ok) { baris(w.nama, `tak bisa diperiksa (HTTP ${res.status})`); continue; }
      const runs = (await res.json()).workflow_runs ?? [];
      const sukses = runs.find((r) => r.conclusion === "success");
      if (!sukses) { perhatian(`${w.nama}: tak ada run sukses sama sekali di 5 run terakhir`); continue; }
      const jam = (Date.now() - Date.parse(sukses.created_at)) / 3600000;
      if (jam > BATAS_MS / 3600000) perhatian(`${w.nama}: video terakhir ${jam.toFixed(1)} jam lalu — jadwal harian kemungkinan DIJATUHKAN GitHub, susulkan manual dg input date`);
      else baris(w.nama, `terakhir sukses ${jam.toFixed(1)} jam lalu`);
    } catch (e) { baris(w.nama, `gagal diperiksa: ${String(e.message).slice(0, 50)}`); }
  }
}

// ── 6. SUMBER YANG BERMASALAH ──────────────────────────────────────────────
bagian("Sumber");
const s404 = baca("slug-404.json", []);
const buta = s404.filter((x) => !x.denSlug);
baris("Slug RoCodes 404", `${s404.length} game` + (buta.length ? ` — ${buta.length} TANPA sumber cadangan` : " (semua masih tertutup Den)"));
if (buta.length) perhatian(`${buta.length} game tak punya sumber hidup sama sekali`);
const idb = baca("identitas-beda.json", []);
// Sebut NAMA gamenya, bukan cuma jumlah: identitas keliru bisa menarik kode
// game lain ke halaman yang salah (Fighting Simulator, 4 Agu 2026), dan yang
// bisa ditindaklanjuti adalah namanya — angka telanjang cuma bikin cemas.
if (idb.length) perhatian(`${idb.length} game universeId-nya beda dari placeId Den — perlu ditinjau: ${idb.slice(0, 5).map((x) => `${x.nama ?? x.game} (${x.players ?? 0} pemain)`).join(", ")}${idb.length > 5 ? ", …" : ""}`);
else baris("Audit identitas", "cocok semua");
// Lapis kedua: game TANPA placeId tak bisa diadu ke Den, jadi diadu ke nama
// universe Roblox. Dipisah menurut ambang video — game di bawah 2.000 pemain
// tak pernah dibuatkan video, jadi namanya meleset pun tak menyentuh penonton.
// Tanpa pemisahan ini, alarm bernilai rendah (judul Mandarin, singkatan) ikut
// berteriak setiap pagi dan bagian ini berhenti dibaca.
const nmb = baca("nama-beda.json", []);
const nmbPenting = nmb.filter((x) => (x.players ?? 0) >= 2000);
if (nmbPenting.length) perhatian(`${nmbPenting.length} game bisa-jadi-video namanya jauh beda dari nama Roblox: ${nmbPenting.slice(0, 4).map((x) => `${x.nama} → ${x.namaRoblox}`).join(" · ")}`);
else if (nmb.length) baris("Audit nama", `${nmb.length} selisih, semuanya <2rb pemain (tak masuk video)`);

// ── 7. YOUTUBE (butuh kredensial + Analytics API aktif) ────────────────────
if (!TANPA_YT && process.env.YT_REFRESH_TOKEN) {
  bagian("YouTube");
  try {
    const { google } = await import("googleapis");
    const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
    o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });
    const ytA = google.youtubeAnalytics({ version: "v2", auth: o });
    const ymd = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    const rentang = (dari, sampai) => ({ startDate: ymd(new Date(now - dari * 864e5)), endDate: ymd(new Date(now - sampai * 864e5)) });

    // Sumber trafik: 7 hari ini vs 7 hari sebelumnya. SENGAJA bukan 30 hari —
    // rata-rata panjang masih memuat ledakan feed di masa awal channel dan
    // menyembunyikan pergeseran yang sedang terjadi (terbukti 4 Agu 2026:
    // 30 hari bilang feed 59%, 3 hari terakhir bilang search 80%).
    const src = async (r) => {
      const q = await ytA.reports.query({ ids: "channel==MINE", ...r, metrics: "views", dimensions: "insightTrafficSourceType", sort: "-views" });
      const m = Object.fromEntries((q.data.rows ?? []).map((x) => [x[0], x[1]]));
      const tot = (q.data.rows ?? []).reduce((a, x) => a + x[1], 0);
      return { feed: m.SHORTS ?? 0, cari: m.YT_SEARCH ?? 0, tot };
    };
    const a = await src(rentang(7, 0)), b = await src(rentang(14, 7));
    baris("Tayangan 7 hari", `${angka(a.tot)} (sebelumnya ${angka(b.tot)})`);
    baris("Dari Shorts feed", `${angka(a.feed)} · ${persen(a.feed, a.tot)} (sebelumnya ${persen(b.feed, b.tot)})`);
    baris("Dari YouTube Search", `${angka(a.cari)} · ${persen(a.cari, a.tot)} (sebelumnya ${persen(b.cari, b.tot)})`);
    Object.assign(ringkas, { view7: a.tot, feed7: a.feed, cari7: a.cari });

    // Kata kunci: yang BENAR-BENAR membawa penonton. maxResults dibatasi 25 —
    // di atas itu API membalas "Internal error" (lihat yt-search-terms.mjs).
    const kw = await ytA.reports.query({
      ids: "channel==MINE", ...rentang(7, 0), metrics: "views",
      dimensions: "insightTrafficSourceDetail", filters: "insightTrafficSourceType==YT_SEARCH",
      sort: "-views", maxResults: 25,
    });
    const rows = kw.data.rows ?? [];
    L.push("", "**Kata kunci teratas (7 hari):**");
    for (const [q, v] of rows.slice(0, 10)) L.push(`  - ${String(v).padStart(4)}  ${q}`);

    // Kueri yang BELUM tertampung alias — kandidat untuk ROBLOX_ALIAS.
    const { ROBLOX_ALIAS } = await import("./src/roblox-games.mjs");
    // Normalisasi DUA SISI (buang tanda baca) sebelum membandingkan. Tanpa itu
    // "ever night reawakening" dianggap tak dikenal padahal nama kita
    // "Ever Night: Reawakening" — titik duanya bikin includes() meleset, dan
    // daftar saran jadi penuh game yang sebenarnya sudah kita punya. Saran yang
    // berisik = saran yang berhenti dibaca.
    // Jamak dipangkas: kueri nyata datang dalam bentuk TUNGGAL ("capybara vs
  // plant") sedangkan nama resminya jamak ("Capybaras VS Plants") — tanpa ini
  // game yang jelas-jelas kita punya muncul sebagai "kandidat alias baru", dan
  // saran yang keliru bikin daftar ini berhenti dipercaya.
  const rapi = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)).join(" ");
    const semuaAlias = Object.values(ROBLOX_ALIAS).flat().map(rapi);
    // Katalog MOBILE ikut dipakai — Ever Night: Reawakening & Genshin Impact ada
    // di games.json, bukan di roblox-codes.json, jadi tanpa ini keduanya selalu
    // dikira kueri asing.
    const gj = baca("games.json", { games: [] });
    const namaGame = [
      ...Object.values(rb.games ?? {}).map((g) => g.name ?? ""),
      ...(gj.games ?? []).map((g) => g.name ?? ""),
    ].map(rapi).filter(Boolean);
    // Cocokkan juga lewat DUA KATA PERTAMA nama game: orang menyingkat nama
    // panjang ("code iron soul" untuk "Iron Soul: Dungeon"). Tanpa ini, nama
    // bersubjudul selalu lolos jadi "kandidat alias" padahal sudah kita punya.
    const kunci = new Set();
    for (const n of namaGame) {
      if (n.length > 3) kunci.add(n);
      const kata = n.split(" ");
      if (kata.length >= 3) kunci.add(kata.slice(0, 2).join(" "));
    }
    const asing = rows.filter(([q]) => {
      const s = rapi(q);
      const tanpaSpasi = s.replace(/ /g, "");
      return !semuaAlias.some((a2) => a2 && s.includes(a2))
        && ![...kunci].some((n) => n.length > 5 && (s.includes(n) || tanpaSpasi.includes(n.replace(/ /g, ""))));
    });
    if (asing.length) {
      L.push("", "**Kueri yang belum dikenali (kandidat alias baru):**");
      for (const [q, v] of asing.slice(0, 8)) L.push(`  - ${String(v).padStart(4)}  ${q}`);
    }

    // PERMINTAAN PER GAME — kueri dicocokkan ke game lalu dijumlahkan. Kata kunci
    // mentah di atas menjawab "orang mengetik apa"; ini menjawab "game mana yang
    // dicari", dan itu pertanyaan yang menentukan game mana yang layak digarap
    // lebih serius. Sumbernya 25 kueri teratas (batas keras API), jadi bacalah
    // sebagai peringkat, bukan jumlah mutlak.
    // ALIAS ikut dicocokkan — dan ini bukan detail kecil: pencocokan lewat nama
    // game saja membuat "kode dds" tak jatuh ke mana pun, padahal itu justru
    // kueri yang alias-nya sengaja kita pasang.
    const plMap = baca("yt-playlists.json", {});
    const daftarGame = Object.entries(rb.games ?? {}).map(([id, g]) => ({
      nama: g.name ?? id,
      punyaVideo: !!plMap[g.slug],
      kunci: [rapi(g.name ?? id), ...(ROBLOX_ALIAS[g.slug] ?? []).map(rapi)].filter((x) => x.length > 2),
    }));
    const skor = new Map();
    for (const [q, v] of rows) {
      const nq = rapi(q);
      // Kecocokan TERPANJANG menang supaya "blox fruits" tak tersedot ke "fruits".
      let best = null, panjang = 0;
      for (const g of daftarGame) for (const k of g.kunci) {
        // Alias pendek ("dds", "tds") dicocokkan sebagai KATA UTUH — kalau tidak,
        // ia menyedot tiap kueri yang kebetulan memuat huruf itu di tengah kata.
        const cocok = k.length <= 4 ? new RegExp(`(^| )${k}( |$)`).test(nq) : nq.includes(k);
        if (cocok && k.length > panjang) { best = g; panjang = k.length; }
      }
      if (best) skor.set(best.nama, { ...best, views: (skor.get(best.nama)?.views ?? 0) + (v ?? 0) });
    }
    const rank = [...skor.values()].sort((a, b) => b.views - a.views);
    if (rank.length) {
      L.push("", "**Permintaan pencarian per game (7 hari):**");
      for (const g of rank.slice(0, 12)) L.push(`  - ${String(g.views).padStart(4)}  ${g.punyaVideo ? "" : "[BELUM ADA VIDEO] "}${g.nama}`);
      const belum = rank.filter((g) => !g.punyaVideo);
      if (belum.length) perhatian(`${belum.length} game dicari orang tapi belum punya video: ${belum.slice(0, 3).map((g) => g.nama).join(", ")}`);
    }
  } catch (e) {
    const m = String(e.message);
    perhatian(/has not been used|is disabled/i.test(m) ? "YouTube Analytics API belum aktif" : `YouTube gagal: ${m.slice(0, 70)}`);
  }
} else if (!TANPA_YT) {
  bagian("YouTube");
  baris("Dilewati", "kredensial YT tak tersedia");
}

// ── 8. SISI CHANNEL YOUTUBE ────────────────────────────────────────────────
// Pemeriksaan ini (playlist yatim/kosong, video kembar, lokalisasi basi, video
// tak publik) selama ini TERPISAH dan hanya jalan kalau seseorang ingat
// men-dispatch-nya manual. Itu persis pola yang bikin masalah bertahan lama:
// pemeriksaannya ada, tapi tak ada yang menjalankannya. Disatukan ke sini.
if (!TANPA_YT && process.env.YT_REFRESH_TOKEN) {
  bagian("Channel YouTube");
  try {
    const out = execFileSync(process.execPath, [resolve(HERE, "video/yt-maintenance.mjs"), "--mode=audit"], { encoding: "utf8", timeout: 180000 });
    const skala = out.split("\n").find((l) => /^channel:/.test(l));
    if (skala) baris("Skala", skala.replace("channel: ", ""));
    let ada = 0;
    for (const blok of out.split("\n\n")) {
      const judul = blok.trim().split("\n")[0];
      if (/^\[TINGGI\]/.test(judul)) { perhatian(judul.replace(/^\[TINGGI\]\s*/, "TINGGI: ")); ada++; }
      else if (/^\[SEDANG\]/.test(judul)) { baris("SEDANG", judul.replace(/^\[SEDANG\]\s*/, "")); ada++; }
    }
    if (!ada) baris("Temuan", "bersih");
    ringkas.channelTinggi = (out.match(/^\[TINGGI\]/gm) ?? []).length;
  } catch (e) { perhatian(`audit channel gagal: ${String(e.message).slice(0, 70)}`); }
}

// ── keluaran ───────────────────────────────────────────────────────────────
const teks = [`# Laporan harian KodeGG — ${new Date().toISOString().slice(0, 10)}`, ...L].join("\n");
if (JSON_ONLY) console.log(JSON.stringify(ringkas, null, 1));
else console.log(teks);

// Riwayat ringkas → tren bisa dibaca lintas hari tanpa menyimpan teks penuh.
try {
  const riwayat = baca("laporan-riwayat.json", []);
  writeFileSync(resolve(DATA, "laporan-riwayat.json"), JSON.stringify([ringkas, ...(Array.isArray(riwayat) ? riwayat : [])].slice(0, 60), null, 1) + "\n");
} catch { /* jangan pernah menggagalkan laporan */ }
if (process.env.GITHUB_STEP_SUMMARY) { try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, teks + "\n", { flag: "a" }); } catch {} }
