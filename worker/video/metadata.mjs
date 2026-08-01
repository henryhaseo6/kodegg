// Metadata YouTube otomatis (judul/deskripsi/tag SEO) dari data game + kode.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SITE = "https://kodegg.com";

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const pascal = (s) => s.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

// Tanggal WIB (sama dg stempel di video) — dipakai agar judul UNIK tiap hari:
// satu game bisa dapat kode baru beberapa kali sebulan, kalau judulnya cuma
// "(July 2026)" semua video tampak duplikat di mata penonton & YouTube.
// Bulan EN (`monEn`) juga dari WIB: dulu diambil dari getUTCMonth() → video yg
// terbit 1 Agustus 00:00–07:00 WIB judulnya "(July 2026)" padahal deskripsinya
// sendiri bilang "Update terakhir: 1 Agustus 2026". Satu sumber waktu saja: WIB.
function wibParts(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).map((x) => [x.type, x.value]));
  const mi = Number(p.month) - 1;
  return { d: Number(p.day), mon: MONTHS_ID[mi], monEn: MONTHS[mi], y: p.year, hm: `${p.hour}.${p.minute}` };
}

/**
 * @param {{name, platform:'ROBLOX'|'MOBILE', slug, codes:[{code,reward}], activeCount, now:Date}} o
 * @returns {{title, description, tags:string[]}}
 */
export function buildMetadata({ name, platform, slug, codes, activeCount, allMode = false, isPromo = false, now }) {
  const w = wibParts(now);
  const my = `${w.monEn} ${w.y}`; // bulan WIB — sama dg tanggal di judul/deskripsi/video
  const isRoblox = platform === "ROBLOX";
  // Promo Roblox = halaman khusus /roblox/promo-codes/ (bukan per-game).
  const seg = isPromo ? "roblox" : isRoblox ? "roblox" : "game";
  const path = isPromo ? "roblox/promo-codes" : `${seg}/${slug}`;
  const url = `${SITE}/id/${path}/`; // halaman ID (dipakai deskripsi/komentar ID)
  const urlEn = `${SITE}/en/${path}/`; // halaman EN — dipakai teks berbahasa Inggris
  const tag = pascal(name); // "BloxFruits"

  // Judul (<=100 char): "[Game] Codes (July 2026)" utk search global EN, "Kode
  // Terbaru" utk search ID, + tanggal WIB biar tiap video beda (bukan duplikat).
  // Turun bertahap kalau nama game panjang; potongan terakhir = potong keras.
  // allMode (game baru masuk pantauan): kodenya belum tentu baru → jangan tulis
  // "Kode Terbaru", pakai "Semua Kode Aktif".
  const label = allMode ? "Semua Kode Aktif" : "Kode Terbaru";
  const cw = isPromo ? "" : " Codes"; // nama promo sudah "...Codes" → jangan dobel
  const title = [
    `${name}${cw} (${my}) 🎁 ${label} Update ${w.d} ${w.mon} ${w.y} — KodeGG`,
    `${name}${cw} (${my}) 🎁 ${label} Update ${w.d} ${w.mon} — KodeGG`,
    `${name}${cw} (${my}) 🎁 ${label} ${w.d} ${w.mon}`,
    `${name}${cw} (${my}) ${label} ${w.d} ${w.mon}`,
  ].find((t) => t.length <= 100) ?? `${name}${cw} ${w.d} ${w.mon} ${w.y}`.slice(0, 100);

  const codeLines = codes.slice(0, 8).map((c) => `• ${c.code}${c.reward ? ` — ${c.reward}` : ""}`).join("\n");
  const description =
    `${allMode ? `Semua kode redeem ${name} yang masih aktif ${my}!` : `Kode redeem ${name} terbaru & aktif ${my}!`} ${activeCount} kode aktif, semua terverifikasi.\n` +
    `🕒 Update terakhir: ${w.d} ${w.mon} ${w.y}, ${w.hm} WIB\n\n` +
    `🎁 KODE:\n${codeLines}\n\n` +
    `✅ Full list + cara redeem (auto-update tiap jam):\n${url}\n\n` +
    `KodeGG — portal kode redeem game online & Roblox. 200+ game, kode terverifikasi cross-check, update otomatis tiap jam.\n` +
    `🔔 Subscribe & nyalain lonceng biar gak ketinggalan kode baru!\n\n` +
    `— The latest working ${name} codes for ${my} (updated hourly). Full list + how to redeem: ${urlEn}\n\n` +
    `#Shorts #${tag} #${tag}Codes #${isRoblox ? "RobloxCodes #Roblox" : "GameCodes"} #RedeemCodes #KodeRedeem #KodeGG`;

  const tags = [
    name, `${name} codes`, `${name} code`, `${name} redeem codes`, `kode ${name}`, `${name} ${my}`,
    isRoblox ? "roblox codes" : "redeem codes", isRoblox ? "roblox" : "game codes",
    "redeem codes", "kode redeem", "free codes", "kodegg", "new codes",
  ];
  // Playlist per game → penonton bisa telusuri semua kode game itu dari waktu ke
  // waktu, dan tiap video punya rumah tetap meski judulnya beda tanggal.
  // Komentar utk di-pin: 3 baris supaya kebaca penuh di panel komentar HP tanpa
  // "Read more". URL di baris sendiri biar gampang di-copy (di Shorts, URL pada
  // komentar tak di-linkify YouTube).
  const comment = `🎁 Semua kode + cara redeem → link ada di DESKRIPSI 👆\n⚠️ Kode CASE-SENSITIVE, salin PERSIS! Sebagian ada syarat/region & sekali pakai.\n✅ Update tiap jam — kode expired auto ke arsip di kodegg.com`;
  const playlistTitle = `${name}${cw} — Kode Redeem`;
  // Deskripsi playlist BILINGUAL: YouTube TAK auto-translate deskripsi playlist
  // (beda dari video) → tulis ID + EN langsung supaya penonton luar pun terlayani.
  const playlistDescription =
    `Semua kode redeem ${name} dari KodeGG, diupdate tiap ada kode baru. Full list + cara redeem: ${url}\n\n` +
    `All ${name} redeem codes from KodeGG, updated whenever new codes drop. Full list + how to redeem: ${urlEn}`;
  return { title, description: description.slice(0, 4900), tags, playlistTitle, playlistDescription, comment };
}
