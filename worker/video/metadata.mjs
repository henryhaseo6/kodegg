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
 * @param {string} [o.playlistUrl] tautan playlist game — masuk DESKRIPSI (dulu di komentar)
 * @returns {{title, description, tags:string[]}}
 */
export function buildMetadata({ name, platform, slug, codes, activeCount, allMode = false, isPromo = false, redeemNote = null, alias = null, now, shorts = true, playlistUrl = null }) {
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

  // [NEW] di depan kode yang memang baru — penonton bisa langsung memilah tanpa
  // membaca seluruh daftar. Penandanya sama dengan badge di kartu video (isNew),
  // jadi video & deskripsi tak pernah bertentangan.
  const dipakai = codes.slice(0, 8);
  const codeLines = dipakai.map((c) => `• ${c.isNew ? "[NEW] " : ""}${c.code}${c.reward ? ` — ${c.reward}` : ""}`).join("\n");
  // Sisa kode yang tak muat di deskripsi — disebut angkanya supaya penonton tahu
  // daftarnya jauh lebih panjang, bukan cuma segini.
  const sisa = Math.max(0, (activeCount || 0) - dipakai.length);
  const barisSisa = sisa > 0 ? `\n➕ ${sisa} kode aktif lainnya ada di kodegg.com\n` : "";
  const description =
    // "semua terverifikasi" dulu dicetak TANPA SYARAT, padahal daftar yang
    // ditampilkan juga memuat kode berstatus ACTIVE — cuma satu sumber yang
    // mendaftarkan, belum ada cross-check. Uji lapangan 7 Agu 2026 menunjukkan
    // bedanya bukan sekadar tata bahasa: VERIFIED 6 dari 6 hidup, ACTIVE 4 hidup
    // 1 mati. Klaimnya sekarang cuma dipasang kalau memang benar untuk kode yang
    // BENAR-BENAR tercantum di deskripsi (bukan seluruh activeCount, karena yang
    // tak muat tak bisa kita pertanggungjawabkan di kalimat ini).
    `${allMode ? `Semua kode redeem ${name} yang masih aktif ${my}!` : `Kode redeem ${name} terbaru & aktif ${my}!`} ${activeCount} kode aktif${dipakai.every((c) => c.verified) ? ", semua terverifikasi" : ""}.\n` +
    `🕒 Update terakhir: ${w.d} ${w.mon} ${w.y}, ${w.hm} WIB\n\n` +
    `🎁 KODE:\n${codeLines}\n${barisSisa}\n` +
    // SYARAT redeem (mis. RIVALS wajib follow developer-nya dulu). Ditaruh
    // SEBELUM tautan: kalau syaratnya tak dipenuhi, kode yang benar & masih
    // aktif pun ditolak game — penonton yang cuma menyalin kode dari video akan
    // mengira kodenya mati, padahal syaratnya yang kurang.
    // Tautan akunnya ikut dicantumkan: di video penonton tak bisa mengklik apa
    // pun di layar, jadi deskripsi adalah satu-satunya tempat syarat ini bisa
    // benar-benar dikerjakan tanpa mencari-cari sendiri.
    (redeemNote?.id || redeemNote?.en
      ? `⚠️ ${redeemNote.kind === "catatan" ? "CATATAN" : "SYARAT"}: ${redeemNote.id ?? redeemNote.en}\n` +
        (redeemNote.links?.length ? redeemNote.links.map((l) => `   • ${l.label}: ${l.url}`).join("\n") + "\n" : "") +
        "\n"
      : "") +
    // PERINGATAN KEDALUWARSA. Video adalah potret satu jam tertentu, sedangkan
    // halaman game hidup terus — tapi video tak pernah berhenti ditonton. Diukur
    // 7 Agu 2026: video Drag Drive terbit 1 Agustus masih menarik 184 view/jam
    // (tercepat di kanal) padahal keempat kode di deskripsinya sudah mati semua.
    //
    // Deskripsi video lama TIDAK diedit (keputusan user 3 Agu) dan kode di LAYAR
    // memang tak bisa diperbaiki — maka satu-satunya jalan adalah memberi tahu
    // penonton di muka bahwa potret ini bisa basi, lalu menunjukkan ke mana
    // harus pergi. Ditaruh persis SETELAH daftar kode, karena di situlah orang
    // menggulir begitu kode yang disalin ditolak game.
    // Peringatan CASE-SENSITIVE dan tautan playlist DIPINDAH KE SINI dari
    // komentar otomatis (10 Agu 2026). Komentar itu dihentikan: commentThreads
    // .insert 50 unit — 23% anggaran per video — untuk teks yang hampir tak
    // pernah terlihat, karena API YouTube tak punya endpoint pin dan 46 video
    // sehari mustahil di-pin manual satu per satu. Di deskripsi, keduanya justru
    // selalu tampil.
    `⚠️ Kode CASE-SENSITIVE — salin PERSIS. Sebagian ada syarat/region & sekali pakai.\n` +
    `⏳ Kode redeem cepat kedaluwarsa — yang ada di video ini bisa saja sudah lewat saat kamu menonton.\n` +
    `✅ Daftar terbaru + cara redeem (auto-update tiap jam):\n${url}\n` +
    (playlistUrl ? `🎬 Semua video ${name} (terbaru di paling atas):\n${playlistUrl}\n` : "") +
    `\n` +
    // Sebut nama alternatifnya di deskripsi juga — membantu pembaca memastikan
    // ini game yang mereka cari, dan ikut terbaca mesin pencari.
    (alias?.length ? `🔎 Dikenal juga sebagai: ${alias.join(", ")}\n\n` : "") +
    `KodeGG — portal kode redeem game online & Roblox. 200+ game, kode terverifikasi cross-check, update otomatis tiap jam.\n` +
    `🔔 Subscribe & nyalain lonceng biar gak ketinggalan kode baru!\n\n` +
    (redeemNote?.en ? `— NOTE: ${redeemNote.en}\n\n` : "") +
    `— The latest working ${name} codes for ${my} (updated hourly). Codes expire fast, so some in this video may already be gone — the current list is always at ${urlEn}\n\n` +
    // #Shorts HANYA untuk video vertikal. Video landscape per-game (render-wide)
    // 16:9 bukan Short — memasang tagar itu di sana menyesatkan penonton yang
    // mengkliknya dan menandai video ke format yang bukan formatnya.
    `${shorts ? "#Shorts " : ""}#${tag} #${tag}Codes #${isRoblox ? "RobloxCodes #Roblox" : "GameCodes"} #RedeemCodes #KodeRedeem #KodeGG`;

  // Alias pencarian (nama Indonesia / singkatan komunitas) ikut jadi TAG.
  // Diukur dari kueri nyata: Throw a Coin ditemukan lewat "kode lempar koin",
  // Drag Drive Simulator lewat "kode ddc" — istilah yang TIDAK ADA di judul
  // maupun tag kita. Judul sengaja dibiarkan bersih; tag yang menampung ini.
  const tagAlias = (alias ?? []).flatMap((a) => [a, `kode ${a}`, `${a} codes`, `kode redeem ${a}`]);
  const tags = [
    name, `${name} codes`, `${name} code`, `${name} redeem codes`, `kode ${name}`, `${name} ${my}`,
    ...tagAlias,
    isRoblox ? "roblox codes" : "redeem codes", isRoblox ? "roblox" : "game codes",
    "redeem codes", "kode redeem", "free codes", "kodegg", "new codes",
  ];
  // Playlist per game → penonton bisa telusuri semua kode game itu dari waktu ke
  // waktu, dan tiap video punya rumah tetap meski judulnya beda tanggal.
  // Komentar utk di-pin: 3 baris supaya kebaca penuh di panel komentar HP tanpa
  // "Read more". URL di baris sendiri biar gampang di-copy (di Shorts, URL pada
  // komentar tak di-linkify YouTube).
  // Dua perubahan dari versi lama, keduanya dari pelajaran 7 Agu 2026:
  //
  //  1. TAUTAN SPESIFIK, bukan "kodegg.com". Komentar ini menetap selamanya di
  //     video yang terus ditonton berbulan-bulan. Menyuruh orang mengetik ulang
  //     nama situs lalu mencari game-nya sendiri membuang mereka di tengah jalan;
  //     alamat halaman game-nya langsung menyelesaikan urusan.
  //
  //  2. PERINGATAN KEDALUWARSA. Kode di LAYAR video tak bisa diperbaiki setelah
  //     terbit — video Drag Drive 1 Agustus masih menarik 184 view/jam saat
  //     keempat kodenya sudah mati. Kalimatnya sengaja dirangkai supaya benar
  //     baik di hari terbit maupun setahun kemudian: bukan "video ini sudah
  //     lama" (salah di hari pertama), melainkan "kalau ada yang tak jalan".
  //
  // Tetap 4 baris supaya terbaca penuh di panel komentar HP tanpa "Read more",
  // dan URL berdiri sendiri di barisnya — di Shorts, URL pada komentar TIDAK
  // di-linkify YouTube, jadi ia harus gampang di-blok dan disalin.
  const comment =
    `🎁 Semua kode + cara redeem → link ada di DESKRIPSI 👆\n` +
    `⚠️ Kode CASE-SENSITIVE, salin PERSIS! Sebagian ada syarat/region & sekali pakai.\n` +
    `⏳ Kode cepat hangus. Kalau ada yang tak jalan, daftar terbaru (update tiap jam):\n` +
    `${url}`;
  const playlistTitle = `${name}${cw} — Kode Redeem`;
  // Deskripsi playlist BILINGUAL: YouTube TAK auto-translate deskripsi playlist
  // (beda dari video) → tulis ID + EN langsung supaya penonton luar pun terlayani.
  const playlistDescription =
    `Semua kode redeem ${name} dari KodeGG, diupdate tiap ada kode baru. Full list + cara redeem: ${url}\n\n` +
    `All ${name} redeem codes from KodeGG, updated whenever new codes drop. Full list + how to redeem: ${urlEn}`;
  return { title, description: description.slice(0, 4900), tags, playlistTitle, playlistDescription, comment };
}
