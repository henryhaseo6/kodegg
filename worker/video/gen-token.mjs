// Generate YT_REFRESH_TOKEN (jalankan LOKAL sekali). Butuh OAuth Client "Desktop"
// dari Google Cloud. Pakai:
//   YT_CLIENT_ID=xxx YT_CLIENT_SECRET=yyy node worker/video/gen-token.mjs
// Lalu buka URL yg tampil, izinkan, selesai → refresh token tercetak.
import http from "node:http";

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
  scope: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"],
});

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
