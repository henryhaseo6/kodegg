// Perawatan video YouTube yang sudah terlanjur naik (retitle massal / hapus
// duplikat). Dijalankan lewat workflow `yt-maintenance` — TIDAK bisa lokal,
// karena refresh token yang hidup cuma ada di GitHub Secrets (token di
// worker/.env gampang mati: sisa era OAuth "Testing" 7 hari).
//
// DEFAULT DRY-RUN. Tanpa --apply, tak ada satu pun panggilan yang mengubah data.
//
// Pakai:
//   node worker/video/yt-maintenance.mjs --mode=retitle --ids=a,b --from="July 2026" --to="August 2026"
//   node worker/video/yt-maintenance.mjs --mode=delete --ids=a,b --require-title="Roblox Promo Codes" --apply
const arg = (n, d = "") => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=") || d;
const APPLY = process.argv.includes("--apply");
const MODE = arg("mode");
const IDS = arg("ids").split(",").map((s) => s.trim()).filter(Boolean);
const FROM = arg("from"), TO = arg("to");
const REQ = arg("require-title"); // palang pengaman hapus: judul WAJIB memuat teks ini

if (!["retitle", "delete", "playlist", "audit", "show", "addloc", "playlistadd"].includes(MODE)) { console.error("--mode wajib: retitle | delete | playlist | audit | show | addloc | playlistadd"); process.exit(1); }
if (!["audit", "addloc"].includes(MODE) && IDS.length === 0) { console.error("--ids kosong"); process.exit(1); }
if (!["delete", "audit", "show", "addloc", "playlistadd"].includes(MODE) && (!FROM || !TO)) { console.error(`mode ${MODE} butuh --from dan --to`); process.exit(1); }
if (MODE === "delete" && !REQ) { console.error("mode delete WAJIB pakai --require-title (palang pengaman)"); process.exit(1); }
if (!process.env.YT_REFRESH_TOKEN) { console.error("kredensial YouTube belum di-set"); process.exit(1); }

const { google } = await import("googleapis");
const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });
const yt = google.youtube({ version: "v3", auth: o });

console.log(APPLY ? `=== APPLY · mode=${MODE} · ${IDS.length} video ===` : `=== DRY-RUN · mode=${MODE} · ${IDS.length} video (tak mengubah apa pun) ===`);

// ── mode audit: BACA-SAJA, cocokkan kondisi YouTube dg data repo ───────────
// Tak butuh --ids. Cari cacat yang tak kelihatan dari sisi data: playlist yang
// tak tercocokkan ke game (tombol di halaman game jadi hilang), playlist KOSONG
// (situs menaut ke halaman hampa), sisa entity HTML / bulan salah di judul, dan
// video yang privasinya tak publik.
if (MODE === "audit") {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
  const baca = (f, d) => { try { return JSON.parse(readFileSync(resolve(DATA, f), "utf8")); } catch { return d; } };
  const pl = baca("yt-playlists.json", {}), rb = baca("roblox-codes.json", { games: {} }), gj = baca("games.json", { games: [] });

  // nama game → id (sama persis dg fetch-yt-playlists.mjs, biar hasilnya sepadan)
  const normal = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const namaKe = new Map();
  for (const g of gj.games ?? []) if (g?.name) namaKe.set(normal(g.name), g.id);
  for (const [id, g] of Object.entries(rb.games ?? {})) if (g?.name) namaKe.set(normal(g.name), id);
  const judulKeNama = (t) => t.replace(/\s*—\s*Kode Redeem\s*$/i, "").replace(/\s+Codes$/i, "").trim();

  const daftar = [];
  let token;
  do {
    const r = await yt.playlists.list({ part: ["snippet", "contentDetails", "localizations"], mine: true, maxResults: 50, pageToken: token });
    daftar.push(...(r.data.items ?? [])); token = r.data.nextPageToken;
  } while (token);

  // semua video channel via playlist "uploads"
  const ch = await yt.channels.list({ part: ["contentDetails"], mine: true });
  const up = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const vidIds = [];
  token = undefined;
  do {
    const r = await yt.playlistItems.list({ part: ["contentDetails"], playlistId: up, maxResults: 50, pageToken: token });
    vidIds.push(...(r.data.items ?? []).map((i) => i.contentDetails.videoId)); token = r.data.nextPageToken;
  } while (token);
  const vids = [];
  for (let i = 0; i < vidIds.length; i += 50) {
    const r = await yt.videos.list({ part: ["snippet", "status", "localizations"], id: vidIds.slice(i, i + 50) });
    vids.push(...(r.data.items ?? []));
  }

  const ENT = /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/i;
  const bulanWIB = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
  const BULAN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const temuan = [];
  const T = (parah, judul, detail) => temuan.push(`[${parah}] ${judul}\n        ${detail}`);

  console.log(`channel: ${vids.length} video · ${daftar.length} playlist\n`);

  const tanpaGame = daftar.filter((p) => !/roblox promo|top 50|roundup/i.test(p.snippet.title) && !namaKe.has(normal(judulKeNama(p.snippet.title))));
  if (tanpaGame.length) T("TINGGI", "playlist tak tercocokkan ke game (tombol YouTube TAK muncul di halaman)", tanpaGame.map((p) => `${p.snippet.title} [${p.id}]`).join("; "));

  // Bahasa playlist. Studio ("Title and description language") TERBUKTI tak
  // andal menampilkannya — playlist yang API-nya jelas `id` bisa tampil "Select"
  // di UI. Jadi jangan menilai dari Studio; ini sumber kebenarannya.
  const noLang = daftar.filter((p) => !p.snippet?.defaultLanguage);
  const noLoc = daftar.filter((p) => !Object.keys(p.localizations ?? {}).length);
  console.log(`bahasa playlist: ${daftar.length - noLang.length}/${daftar.length} punya defaultLanguage · ${daftar.length - noLoc.length}/${daftar.length} punya localizations`);
  if (noLang.length) T("SEDANG", "playlist TANPA defaultLanguage di API (bukan sekadar tampilan Studio)", noLang.slice(0, 10).map((p) => p.snippet.title).join("; ") + (noLang.length > 10 ? ` (+${noLang.length - 10})` : ""));

  const kosong = daftar.filter((p) => (p.contentDetails?.itemCount ?? 0) === 0);
  if (kosong.length) T("TINGGI", "playlist KOSONG (situs menaut ke halaman hampa)", kosong.map((p) => `${p.snippet.title} [${p.id}]`).join("; "));

  const entJudul = [...vids.filter((v) => ENT.test(v.snippet.title) || ENT.test(v.snippet.description ?? "")).map((v) => `video ${v.id}: ${v.snippet.title.slice(0, 50)}`),
    ...daftar.filter((p) => ENT.test(p.snippet.title)).map((p) => `playlist ${p.id}: ${p.snippet.title.slice(0, 50)}`)];
  if (entJudul.length) T("TINGGI", "entity HTML tersisa di judul/deskripsi", entJudul.join("; "));

  const bulanSalah = vids.filter((v) => {
    const m = /\((January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\)/.exec(v.snippet.title);
    if (!m) return false;
    const [, mon, thn] = m, w = bulanWIB(v.snippet.publishedAt);
    return `${thn}-${String(BULAN.indexOf(mon) + 1).padStart(2, "0")}` !== w;
  });
  if (bulanSalah.length) T("SEDANG", "bulan di judul ≠ bulan terbit (WIB)", bulanSalah.map((v) => `${v.id}: ${v.snippet.title.slice(0, 55)} (terbit ${bulanWIB(v.snippet.publishedAt)})`).join("; "));

  // Lokalisasi basi: terjemahan otomatis YouTube dibuat dari teks SAAT ITU, jadi
  // perbaikan judul yg hanya menyentuh snippet meninggalkan versi asing tetap
  // salah — penonton en-US melihat bulan lama / entity HTML.
  const locBasi = vids.filter((v) => Object.entries(v.localizations ?? {}).some(([k, x]) => {
    if (k === v.snippet.defaultLanguage) return false;
    const m = /\((January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\)/.exec(x.title ?? "");
    const salahBulan = m && `${m[2]}-${String(BULAN.indexOf(m[1]) + 1).padStart(2, "0")}` !== bulanWIB(v.snippet.publishedAt);
    return salahBulan || ENT.test(x.title ?? "") || ENT.test(x.description ?? "");
  }));
  if (locBasi.length) T("TINGGI", "LOKALISASI basi (penonton bahasa lain masih lihat teks lama)", locBasi.map((v) => `${v.id}: ${Object.entries(v.localizations).filter(([k]) => k !== v.snippet.defaultLanguage).map(([k, x]) => `${k}="${(x.title ?? "").slice(0, 45)}"`).join(" ")}`).join("; "));

  const takPublik = vids.filter((v) => v.status?.privacyStatus !== "public");
  if (takPublik.length) T("SEDANG", "video tidak publik", takPublik.map((v) => `${v.id} [${v.status?.privacyStatus}] ${v.snippet.title.slice(0, 45)}`).join("; "));

  const idPl = new Set(Object.values(pl));
  const belumTerpetakan = daftar.filter((p) => !idPl.has(p.id) && namaKe.has(normal(judulKeNama(p.snippet.title))));
  if (belumTerpetakan.length) T("INFO", "playlist cocok ke game tapi belum masuk yt-playlists.json (nunggu sync run berikutnya)", belumTerpetakan.map((p) => p.snippet.title).join("; "));

  const hilang = Object.entries(pl).filter(([, id]) => !daftar.some((p) => p.id === id));
  if (hilang.length) T("TINGGI", "entri yt-playlists.json menunjuk playlist yang SUDAH TAK ADA", hilang.map(([g, id]) => `${g}=${id}`).join("; "));

  console.log(temuan.length ? temuan.join("\n\n") : "bersih — tak ada temuan.");
  process.exit(0);
}

// ── mode playlistadd: masukkan video ke playlist game-nya ──────────────────
// Untuk video yang playlist-nya GAGAL saat upload (rate-limit ~10 playlist baru
// per hari). Jalur `manual-video` tak punya antrian retry seperti pipeline
// otomatis — workspace CI-nya sekali pakai, jadi tak ada tempat menyimpan
// antrian. Mode ini penggantinya: jalankan besok saat kuota playlist pulih.
// Judul playlist diturunkan dari judul video ("X Codes (...)" → "X Codes —
// Kode Redeem"), sama dengan yang dipakai metadata.mjs.
if (MODE === "playlistadd") {
  const { attachToPlaylist } = await import("./upload.mjs");
  const r = await yt.videos.list({ part: ["snippet"], id: IDS });
  for (const v of r.data.items ?? []) {
    const m = /^(.+?) Codes \(/.exec(v.snippet.title);
    if (!m) { console.log(`-      ${v.id} · judul bukan pola video game — lewati · ${v.snippet.title}`); continue; }
    const judul = `${m[1]} Codes — Kode Redeem`;
    console.log(`MASUK  ${v.id} → "${judul}"`);
    if (APPLY) {
      const ok = await attachToPlaylist(yt, v.id, judul, "");
      console.log(ok ? "       ✓ masuk playlist" : "       ✗ gagal (kemungkinan rate-limit lagi — coba besok)");
    }
  }
  console.log(`\n${APPLY ? "selesai" : "DRY-RUN selesai"}.`);
  process.exit(0);
}

// ── mode addloc: pasang terjemahan ID pada video LONG yang belum punya ─────
// Video long berbahasa Inggris & YouTube menolak menerjemahkannya otomatis,
// jadi backfill ini yang memasangnya. Memakai localisasiID() — modul yang SAMA
// dengan jalur upload harian, supaya hasil backfill & video baru tak berbeda.
// Tak butuh --ids: seluruh channel disisir, yang bukan video long dilewati.
if (MODE === "addloc") {
  const { localisasiID } = await import("./meta-long.mjs");
  const ch = await yt.channels.list({ part: ["contentDetails"], mine: true });
  const up = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const ids = [];
  let tok;
  do {
    const r = await yt.playlistItems.list({ part: ["contentDetails"], playlistId: up, maxResults: 50, pageToken: tok });
    ids.push(...(r.data.items ?? []).map((i) => i.contentDetails.videoId)); tok = r.data.nextPageToken;
  } while (tok);
  const vids = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt.videos.list({ part: ["snippet", "localizations"], id: ids.slice(i, i + 50) });
    vids.push(...(r.data.items ?? []));
  }
  let pasang = 0, punya = 0, bukan = 0;
  for (const v of vids) {
    const id = localisasiID({ title: v.snippet.title, description: v.snippet.description });
    if (!id) { bukan++; continue; } // Shorts / bukan pola video long
    if (v.localizations?.id) { punya++; continue; }
    console.log(`PASANG ${v.id}\n       EN: ${v.snippet.title}\n       ID: ${id.title}`);
    if (APPLY) {
      // localizations dikirim UTUH (yang lama + id baru) — bahasa yang tak
      // disertakan akan TERHAPUS. snippet ikut dikirim karena part diganti.
      await yt.videos.update({
        part: ["snippet", "localizations"],
        requestBody: {
          id: v.id,
          snippet: { title: v.snippet.title, description: v.snippet.description, tags: v.snippet.tags, categoryId: v.snippet.categoryId, defaultLanguage: v.snippet.defaultLanguage, defaultAudioLanguage: v.snippet.defaultAudioLanguage },
          localizations: { ...(v.localizations ?? {}), id },
        },
      });
      console.log("       ✓ terpasang");
    }
    pasang++;
  }
  console.log(`\n${APPLY ? "selesai" : "DRY-RUN selesai"} — ${pasang} video long dipasangi terjemahan ID · ${punya} sudah punya · ${bukan} bukan video long (dilewati).`);
  process.exit(0);
}

// ── mode show: dump metadata mentah sebuah video (diagnostik) ──────────────
if (MODE === "show") {
  // ID berawalan "PL" = playlist. Berguna utk memeriksa apakah defaultLanguage
  // benar-benar tersimpan di sisi YouTube (Studio menampilkannya sbg "Title and
  // description language").
  const idPl = IDS.filter((i) => i.startsWith("PL"));
  if (idPl.length) {
    const rp = await yt.playlists.list({ part: ["snippet", "localizations", "status"], id: idPl });
    for (const p of rp.data.items ?? []) {
      const loc = p.localizations ?? {};
      console.log(`\n== PLAYLIST ${p.id}`);
      console.log(`  title           : ${p.snippet.title}`);
      console.log(`  defaultLanguage : ${p.snippet.defaultLanguage ?? "(KOSONG)"}`);
      console.log(`  localizations   : ${Object.keys(loc).length ? Object.keys(loc).join(", ") : "(tak ada)"}`);
      console.log(`  privacy         : ${p.status?.privacyStatus}`);
    }
  }
  const idVid = IDS.filter((i) => !i.startsWith("PL"));
  if (!idVid.length) process.exit(0);
  // statistics ikut ditarik: saat memutuskan mana dari sepasang video KEMBAR yang
  // dihapus, yang menentukan adalah jumlah tayangannya — jangan sampai yang
  // dibuang justru yang lebih jalan.
  const r = await yt.videos.list({ part: ["snippet", "status", "localizations", "statistics"], id: idVid });
  for (const v of r.data.items ?? []) {
    console.log(`\n== ${v.id}`);
    console.log(`  views/likes/komentar: ${v.statistics?.viewCount ?? "?"} / ${v.statistics?.likeCount ?? "?"} / ${v.statistics?.commentCount ?? "?"}`);
    console.log(`  snippet.title       : ${v.snippet.title}`);
    console.log(`  defaultLanguage     : ${v.snippet.defaultLanguage ?? "(kosong)"}`);
    console.log(`  defaultAudioLanguage: ${v.snippet.defaultAudioLanguage ?? "(kosong)"}`);
    console.log(`  publishedAt         : ${v.snippet.publishedAt}`);
    console.log(`  uploadStatus        : ${v.status?.uploadStatus} · privacy: ${v.status?.privacyStatus}`);
    const loc = v.localizations ?? {};
    console.log(`  localizations       : ${Object.keys(loc).length ? Object.entries(loc).map(([k, x]) => `${k}="${x.title}"`).join(" | ") : "(tak ada)"}`);
    console.log(`  deskripsi memuat "July 2026": ${(v.snippet.description ?? "").includes("July 2026")}`);
  }
  process.exit(0);
}

// ── mode playlist: ganti teks di JUDUL playlist ────────────────────────────
// Penting: situs memetakan halaman game → playlist lewat JUDUL playlist
// (fetch-yt-playlists.mjs, dicocokkan ke nama game). Jadi kalau nama game di
// data diperbaiki, judul playlist WAJIB ikut diperbaiki — kalau tidak,
// pemetaannya putus dan tombol "Video di YouTube" hilang dari halaman game.
if (MODE === "playlist") {
  const r = await yt.playlists.list({ part: ["snippet"], id: IDS });
  const found = r.data.items ?? [];
  for (const id of IDS) if (!found.some((p) => p.id === id)) console.log(`! ${id} tak ditemukan — lewati`);
  let n = 0;
  for (const p of found) {
    const s = p.snippet;
    if (!(s.title ?? "").includes(FROM) && !(s.description ?? "").includes(FROM)) {
      console.log(`-      ${p.id} · sudah benar · ${s.title}`); continue;
    }
    const snippet = {
      title: (s.title ?? "").replaceAll(FROM, TO),
      description: (s.description ?? "").replaceAll(FROM, TO),
      defaultLanguage: s.defaultLanguage,
    };
    console.log(`UBAH   ${p.id}\n       lama: ${s.title}\n       baru: ${snippet.title}`);
    if (APPLY) { await yt.playlists.update({ part: ["snippet"], requestBody: { id: p.id, snippet } }); console.log("       ✓ diperbarui"); }
    n++;
  }
  console.log(`\n${APPLY ? "selesai" : "DRY-RUN selesai"} — ${n} playlist diubah.`);
  process.exit(0);
}

// videos.list menerima maks 50 id per panggilan (1 unit kuota).
// localizations WAJIB ikut ditarik: terjemahan otomatis YouTube menyimpan
// salinan judul/deskripsi sendiri, dan itu yang dilihat penonton asing.
const bacaSemua = async () => {
  const out = [];
  for (let i = 0; i < IDS.length; i += 50) {
    const r = await yt.videos.list({ part: ["snippet", "statistics", "localizations"], id: IDS.slice(i, i + 50) });
    out.push(...(r.data.items ?? []));
  }
  return out;
};
const memuatFROM = (v) => !!FROM && [v.snippet?.title, v.snippet?.description, ...Object.values(v.localizations ?? {}).flatMap((x) => [x.title, x.description])]
  .some((t) => (t ?? "").includes(FROM));

// BACA BEBERAPA KALI. API ini eventual-consistent: replika berbeda memulangkan
// isi berbeda dalam hitungan detik. Sekali baca bisa kebetulan mendapat replika
// yang sudah bersih, lalu skrip menyimpulkan "sudah benar" padahal versi lama
// masih hidup di replika lain — persis yang terjadi pada lnNVEbGIeiA (audit
// melihat en-US "July 2026", retitle 3 menit kemudian melihat bersih).
// Aturannya: kalau ADA pembacaan yang menemukan FROM, itu yang dipakai.
const items = await bacaSemua();
const byId = Object.fromEntries(items.map((v) => [v.id, v]));
if (MODE === "retitle") {
  for (let putaran = 2; putaran <= 3; putaran++) {
    const belum = IDS.filter((id) => byId[id] && !memuatFROM(byId[id]));
    if (!belum.length) break; // semua sudah menampakkan teks lama → cukup
    const lagi = await bacaSemua();
    let baru = 0;
    for (const v of lagi) if (memuatFROM(v) && !memuatFROM(byId[v.id] ?? {})) { byId[v.id] = v; baru++; }
    if (baru) console.log(`(pembacaan ke-${putaran}: ${baru} video ternyata MASIH memuat "${FROM}" — pakai versi itu)`);
  }
}
for (const id of IDS) if (!byId[id]) console.log(`! ${id} tak ditemukan di channel — lewati`);

let ubah = 0, lewat = 0;
const diubah = []; // utk verifikasi baca-ulang di akhir (lihat catatan di bawah)
for (const id of IDS) {
  const v = byId[id]; if (!v) { lewat++; continue; }
  const s = v.snippet, view = v.statistics?.viewCount ?? "0";

  if (MODE === "delete") {
    if (!new RegExp(REQ, "i").test(s.title ?? "")) {
      console.log(`TOLAK  ${id} · judul tak memuat "${REQ}" → TIDAK dihapus\n       ${s.title}`);
      lewat++; continue;
    }
    console.log(`HAPUS  ${id} · ${view} view · ${s.title}`);
    if (APPLY) { await yt.videos.delete({ id }); console.log("       ✓ terhapus"); }
    ubah++; continue;
  }

  // retitle: ganti FROM→TO di judul, deskripsi, tag, DAN SEMUA LOKALISASI.
  //
  // LOKALISASI ITU WAJIB. YouTube membuat terjemahan metadata otomatis (mis.
  // en-US) dari judul/deskripsi SAAT ITU. Memperbarui snippet saja hanya
  // mengubah versi bahasa default (id) — penonton berbahasa Inggris tetap
  // melihat teks LAMA. Kejadian 1 Agt 2026: judul id sudah "(August 2026)"
  // sementara en-US masih "(July 2026)"; videos.list kadang memulangkan versi
  // en-US itu, sehingga verifikasi baca-ulang sempat melapor "tidak tersimpan"
  // padahal Studio sudah benar.
  const loc = v.localizations ?? {};
  const adaDiLokal = Object.values(loc).some((x) => (x.title ?? "").includes(FROM) || (x.description ?? "").includes(FROM));
  if (!(s.title ?? "").includes(FROM) && !(s.description ?? "").includes(FROM) && !adaDiLokal) {
    console.log(`-      ${id} · sudah benar, lewati · ${s.title}`);
    lewat++; continue;
  }
  const baru = {
    title: (s.title ?? "").replaceAll(FROM, TO),
    description: (s.description ?? "").replaceAll(FROM, TO),
    tags: (s.tags ?? []).map((t) => t.replaceAll(FROM, TO)),
    // snippet HARUS lengkap: videos.update menimpa seluruh part, field yang tak
    // dikirim akan TERHAPUS (categoryId wajib; bahasa hilang = subtitle/SEO rusak).
    categoryId: s.categoryId,
    defaultLanguage: s.defaultLanguage,
    defaultAudioLanguage: s.defaultAudioLanguage,
  };
  const nD = ((s.description ?? "").match(new RegExp(FROM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  const nT = (s.tags ?? []).filter((t) => t.includes(FROM)).length;
  console.log(`UBAH   ${id} · ${view} view\n       lama: ${s.title}\n       baru: ${baru.title}\n       deskripsi ${nD} ganti · tag ${nT} ganti`);
  // Lokalisasi ikut diganti. Yang dikirim HANYA bahasa yang benar-benar memuat
  // FROM — read-modify-write penuh berbahaya karena API ini eventual-consistent:
  // pembacaan bisa memulangkan replika basi, dan menulis balik seluruh objek
  // berarti menimpa versi yang sudah benar dengan versi basi itu.
  const locBaru = Object.fromEntries(Object.entries(loc)
    .filter(([, x]) => (x.title ?? "").includes(FROM) || (x.description ?? "").includes(FROM))
    .map(([k, x]) => [k, { title: (x.title ?? "").replaceAll(FROM, TO), description: (x.description ?? "").replaceAll(FROM, TO) }]));
  if (Object.keys(locBaru).length) console.log(`       lokalisasi diganti: ${Object.keys(locBaru).join(", ")}`);
  if (APPLY) {
    const part = ["snippet"], body = { id, snippet: baru };
    // localizations WAJIB dikirim UTUH (bahasa yg tak disertakan akan terhapus)
    // → gabungkan yang diperbaiki dg yang sudah benar.
    if (Object.keys(locBaru).length) { part.push("localizations"); body.localizations = { ...loc, ...locBaru }; }
    await yt.videos.update({ part, requestBody: body });
    console.log("       ✓ diperbarui");
    diubah.push({ id, judul: baru.title });
  }
  ubah++;
}

// VERIFIKASI BACA-ULANG. videos.update bisa menjawab sukses TAPI perubahannya
// tak tersimpan (kejadian 1 Agt 2026: OHt4LRpjn0s dilaporkan "✓ diperbarui",
// beberapa jam kemudian judulnya kembali "(July 2026)" — ketahuan cuma karena
// audit). Jadi jangan percaya respons API: baca ulang & bandingkan.
if (APPLY && MODE === "retitle" && diubah.length) {
  // Bandingkan thd SEMUA varian bahasa: snippet.title yg dipulangkan API bisa
  // versi terlokalisasi (en-US), bukan bahasa default → dulu memicu alarm palsu.
  const r = await yt.videos.list({ part: ["snippet", "localizations"], id: diubah.map((d) => d.id) });
  const kini = Object.fromEntries((r.data.items ?? []).map((v) => [v.id, [v.snippet.title, ...Object.values(v.localizations ?? {}).map((x) => x.title)]]));
  const gagal = diubah.filter((d) => (kini[d.id] ?? []).some((t) => t.includes(FROM)));
  console.log(`\nverifikasi baca-ulang: ${diubah.length - gagal.length}/${diubah.length} tersimpan.`);
  for (const g of gagal) console.log(`  ✗ ${g.id} masih memuat "${FROM}" di salah satu bahasa: ${(kini[g.id] ?? []).join(" | ")}`);
  if (gagal.length) { console.log("  → jalankan ulang mode retitle utk id di atas."); process.exitCode = 1; }
}

console.log(`\n${APPLY ? "selesai" : "DRY-RUN selesai"} — ${ubah} video ${MODE === "delete" ? "dihapus" : "diubah"}, ${lewat} dilewati.`);
if (!APPLY) console.log("Jalankan ulang dengan apply=true untuk mengeksekusi.");
