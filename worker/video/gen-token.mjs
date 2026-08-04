// Generate YT_REFRESH_TOKEN (jalankan LOKAL sekali). Butuh OAuth Client "Desktop"
// dari Google Cloud. Pakai:
//   node worker/video/gen-token.mjs
// Client id/secret dibaca dari worker/.env bila ada; kalau tidak, set lewat env:
//   YT_CLIENT_ID=xxx YT_CLIENT_SECRET=yyy node worker/video/gen-token.mjs
// Lalu buka URL yg tampil, izinkan, selesai → refresh token tercetak.
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Baca worker/.env kalau ada — supaya client id/secret tak perlu ditempel ke
// baris perintah tiap kali (dan tak ada peluang salah salin).
{
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const { YT_CLIENT_ID, YT_CLIENT_SECRET } = process.env;
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) {
  console.error("Set dulu: YT_CLIENT_ID dan YT_CLIENT_SECRET (dari OAuth Client Desktop).");
  process.exit(1);
}
const PORT = 5388;
const REDIRECT = `http://localhost:${PORT}`;

const { google } = await import("googleapis");
const oauth2 = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET, REDIRECT);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // paksa refresh_token keluar
  // force-ssl dibutuhkan utk posting komentar (commentThreads.insert); upload &
  // playlist cukup dg dua scope pertama.
  scope: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    // BACA-SAJA. Membuka YouTube Analytics API → kata kunci pencarian yang
    // benar-benar membawa penonton (insightTrafficSourceDetail). Tanpa ini kita
    // cuma bisa MENEBAK permintaan lewat proksi (jumlah pemain, aktivitas kode).
    // Terukur 3 Agu 2026: ~90% tayangan datang dari YouTube Search, jadi inilah
    // sinyal yang paling menentukan game mana yang layak dibuatkan video.
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ],
});

// Jalur cadangan: kalau server lokal keburu mati saat Google mengalihkan balik
// (browser bilang "localhost refused to connect"), kodenya TETAP ada di URL —
// tukar manual: node worker/video/gen-token.mjs --code=4/0A...
// Kode otorisasi hanya berlaku ~10 menit dan sekali pakai.
const argCode = process.argv.find((a) => a.startsWith("--code="))?.slice(7);
if (argCode) {
  const { tokens } = await oauth2.getToken(decodeURIComponent(argCode));
  console.log("\nYT_REFRESH_TOKEN =", tokens.refresh_token ?? "(kosong — cabut akses lama di myaccount.google.com/permissions lalu ulangi)");
  process.exit(0);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, REDIRECT);
    const code = u.searchParams.get("code");
    if (!code) { res.writeHead(400); res.end("Tak ada code."); return; }
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h2>Berhasil!</h2><p>Refresh token sudah tercetak di terminal. Tab ini bisa ditutup.</p>");
    console.log("\n================ SIMPAN INI SEBAGAI GITHUB SECRET ================");
    console.log("YT_REFRESH_TOKEN =", tokens.refresh_token);
    console.log("=================================================================");
    if (!tokens.refresh_token) console.log("⚠️  refresh_token kosong — cabut akses lama di myaccount.google.com/permissions lalu ulang.");
    server.close();
    setTimeout(() => process.exit(0), 500);
  } catch (e) { res.writeHead(500); res.end(String(e.message)); console.error(e.message); }
});
server.listen(PORT, () => {
  console.log("\n1) Buka URL ini di browser (login pakai akun channel YouTube-mu):\n");
  console.log(authUrl);
  console.log(`\n2) Setelah izinkan, kamu diarahkan ke ${REDIRECT} → refresh token muncul di sini.\n`);
});
