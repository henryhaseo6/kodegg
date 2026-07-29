// Upload manual video Shorts ke YouTube — buat video yang lewat kuota harian
// (ada di Release `videos-<tgl>` atau folder _video-out/). Dipakai LOKAL.
//
// Kenapa perlu: Shorts TIDAK bisa diberi thumbnail custom lewat Studio (desktop
// maupun app). Satu-satunya jalan = API, seperti yang dipakai bot. Script ini
// memakai kredensial yang sama, plus metadata & thumbnail dari file pendamping.
//
// Pakai:
//   node worker/video/upload-manual.mjs _video-out/2026-07-21-shindo-life.mp4
//   node worker/video/upload-manual.mjs --all                 (semua di _video-out/)
//   node worker/video/upload-manual.mjs --all --dir ~/Downloads/videos-2026-07-21
//   ... --privacy unlisted   |   ... --dry   (lihat saja, tak upload)
//
// Kredensial: YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN — dari env,
// atau tulis sekali di worker/.env (KEY=VALUE per baris, tak ikut ter-commit).
import { existsSync, readFileSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { uploadVideo, ytConfigured } from "./upload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const DEFAULT_DIR = resolve(ROOT, "_video-out");

// .env sederhana (tanpa dependensi): KEY=VALUE, baris '#' diabaikan.
function loadEnvFile() {
  const p = resolve(ROOT, "worker/.env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

/** Baca metadata dari file .txt pendamping (format yang ditulis make-videos.mjs). */
function readMeta(videoPath) {
  const txt = videoPath.replace(/\.mp4$/i, ".txt");
  const fallback = { title: basename(videoPath, ".mp4"), description: "", tags: [] };
  if (!existsSync(txt)) return fallback;
  const raw = readFileSync(txt, "utf8");
  const grab = (label, next) => {
    const re = new RegExp(`${label}:\\s*\\n([\\s\\S]*?)(?:\\n\\n${next}:|\\s*$)`);
    return (re.exec(raw)?.[1] ?? "").trim();
  };
  const title = grab("JUDUL", "DESKRIPSI");
  const description = grab("DESKRIPSI", "TAG");
  const tags = grab("TAG", "PLAYLIST").split(",").map((t) => t.trim()).filter(Boolean);
  // File .txt lama (sebelum fitur playlist) tak punya bagian PLAYLIST → turunkan
  // dari judul: "<Game> Codes (July 2026) ..." → "<Game> Codes — Kode Redeem".
  const playlistTitle = grab("PLAYLIST", "PLAYLIST_DESC") || (/^(.+?) Codes\b/.exec(title || "")?.[1] ? `${/^(.+?) Codes\b/.exec(title)[1]} Codes — Kode Redeem` : undefined);
  const playlistDescription = grab("PLAYLIST_DESC", "ZZZ") || undefined;
  // Komentar utk di-pin: pakai URL halaman game yang sudah ada di deskripsi.
  const pageUrl = /https:\/\/kodegg\.com\/\S+/.exec(description)?.[0];
  const comment = pageUrl ? `🎁 Semua kode + cara redeem:\n${pageUrl}\nKode gagal/expired? Tulis di sini 👇` : undefined;
  return { title: title || fallback.title, description, tags, playlistTitle, playlistDescription, comment };
}

function parseArgs(argv) {
  const opt = { files: [], all: false, dir: DEFAULT_DIR, privacy: process.env.YT_PRIVACY || "public", dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opt.all = true;
    else if (a === "--dry") opt.dry = true;
    else if (a === "--dir") opt.dir = resolve(argv[++i]);
    else if (a === "--privacy") opt.privacy = argv[++i];
    else opt.files.push(resolve(a));
  }
  return opt;
}

async function main() {
  loadEnvFile();
  const opt = parseArgs(process.argv.slice(2));

  let files = opt.files;
  if (opt.all) {
    if (!existsSync(opt.dir)) { console.error(`Folder tak ada: ${opt.dir}`); process.exit(1); }
    files = readdirSync(opt.dir).filter((f) => f.toLowerCase().endsWith(".mp4")).sort().map((f) => join(opt.dir, f));
  }
  if (files.length === 0) {
    console.log("Tak ada video. Contoh:\n  node worker/video/upload-manual.mjs _video-out/2026-07-21-shindo-life.mp4\n  node worker/video/upload-manual.mjs --all --dir <folder hasil download release>");
    return;
  }
  if (!["public", "unlisted", "private"].includes(opt.privacy)) { console.error(`privacy tak valid: ${opt.privacy}`); process.exit(1); }
  if (!opt.dry && !ytConfigured()) {
    console.error("Kredensial YouTube belum ada. Set YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN\n(lewat env atau file worker/.env). Ambil refresh token: node worker/video/gen-token.mjs");
    process.exit(1);
  }

  console.log(`${files.length} video · privacy: ${opt.privacy.toUpperCase()}${opt.dry ? " · MODE LIHAT SAJA" : ""}\n`);
  let ok = 0;
  for (const f of files) {
    if (!existsSync(f)) { console.log(`✗ tak ada: ${f}`); continue; }
    const meta = readMeta(f);
    const thumb = f.replace(/\.mp4$/i, ".jpg");
    console.log(`▶ ${basename(f)}\n  judul: ${meta.title}\n  thumbnail: ${existsSync(thumb) ? "ada" : "TIDAK ADA (YouTube akan pilih frame sendiri)"}`);
    if (opt.dry) { console.log(`  playlist: ${meta.playlistTitle ?? "—"}\n  komentar: ${meta.comment ? meta.comment.split("\n")[1] : "—"}\n  deskripsi: ${meta.description.length} karakter · tag: ${meta.tags.join(", ") || "—"}\n`); continue; }
    try {
      // video long (roundup/top50) = English; Short = Indonesia (default).
      const lang = /roundup|top-?50/i.test(basename(f)) ? "en" : "id";
      const { url } = await uploadVideo({ videoPath: f, ...meta, privacy: opt.privacy, thumbnailPath: thumb, lang });
      console.log(`  ✓ ${url}\n`);
      ok++;
      // Pindahkan berkas yang sudah naik → aman kalau perintah diulang.
      const done = join(dirname(f), "terkirim");
      mkdirSync(done, { recursive: true });
      for (const ext of [".mp4", ".jpg", ".txt"]) {
        const src = f.replace(/\.mp4$/i, ext);
        if (existsSync(src)) renameSync(src, join(done, basename(src)));
      }
    } catch (e) {
      console.log(`  ✗ gagal: ${e.message}\n`);
    }
  }
  if (!opt.dry) console.log(`selesai — ${ok}/${files.length} terupload. Yang berhasil dipindah ke subfolder "terkirim/".`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
