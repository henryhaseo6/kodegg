// Orkestrasi build produksi — lintas-platform (Windows lokal & Linux Cloudflare).
//
// 1. Tarik kode terbaru → worker/data/codes.json. Bila SEMUA sumber gagal
//    (worker exit != 0), JANGAN gagalkan build — pakai codes.json terakhir yang
//    ter-commit, biar deploy tetap jalan dengan data terakhir yang diketahui.
// 2. Install deps situs & build SSG.

import { execSync } from "node:child_process";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

try {
  run("node worker/fetch-codes.mjs");
} catch {
  console.warn("\n⚠ worker kode gagal — lanjut build dengan codes.json terakhir.\n");
}
try {
  run("node worker/fetch-catalog.mjs");
} catch {
  console.warn("\n⚠ worker katalog gagal — lanjut build dengan games.json terakhir.\n");
}
try {
  run("node worker/fetch-news.mjs");
} catch {
  console.warn("\n⚠ worker berita gagal — lanjut build dengan news.json terakhir.\n");
}
try {
  run("node worker/fetch-events.mjs");
} catch {
  console.warn("\n⚠ worker event gagal — lanjut build dengan events.json terakhir.\n");
}

run("npm install", { cwd: "site" });
run("npm run build", { cwd: "site" });
