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

if (!["retitle", "delete"].includes(MODE)) { console.error("--mode wajib: retitle | delete"); process.exit(1); }
if (IDS.length === 0) { console.error("--ids kosong"); process.exit(1); }
if (MODE === "retitle" && (!FROM || !TO)) { console.error("mode retitle butuh --from dan --to"); process.exit(1); }
if (MODE === "delete" && !REQ) { console.error("mode delete WAJIB pakai --require-title (palang pengaman)"); process.exit(1); }
if (!process.env.YT_REFRESH_TOKEN) { console.error("kredensial YouTube belum di-set"); process.exit(1); }

const { google } = await import("googleapis");
const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });
const yt = google.youtube({ version: "v3", auth: o });

console.log(APPLY ? `=== APPLY · mode=${MODE} · ${IDS.length} video ===` : `=== DRY-RUN · mode=${MODE} · ${IDS.length} video (tak mengubah apa pun) ===`);

// videos.list menerima maks 50 id per panggilan (1 unit kuota).
const items = [];
for (let i = 0; i < IDS.length; i += 50) {
  const r = await yt.videos.list({ part: ["snippet", "statistics"], id: IDS.slice(i, i + 50) });
  items.push(...(r.data.items ?? []));
}
const byId = Object.fromEntries(items.map((v) => [v.id, v]));
for (const id of IDS) if (!byId[id]) console.log(`! ${id} tak ditemukan di channel — lewati`);

let ubah = 0, lewat = 0;
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

  // retitle: ganti FROM→TO di judul, deskripsi, dan tag.
  if (!(s.title ?? "").includes(FROM) && !(s.description ?? "").includes(FROM)) {
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
  if (APPLY) { await yt.videos.update({ part: ["snippet"], requestBody: { id, snippet: baru } }); console.log("       ✓ diperbarui"); }
  ubah++;
}

console.log(`\n${APPLY ? "selesai" : "DRY-RUN selesai"} — ${ubah} video ${MODE === "delete" ? "dihapus" : "diubah"}, ${lewat} dilewati.`);
if (!APPLY) console.log("Jalankan ulang dengan apply=true untuk mengeksekusi.");
