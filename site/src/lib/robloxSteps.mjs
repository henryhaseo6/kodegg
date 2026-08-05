// Langkah redeem Roblox — DITULIS SENDIRI, memakai fakta dari sumber.
//
// Kenapa tidak menyalin langkah sumber apa adanya: 443 dari 473 halaman game
// dulu menampilkan kalimat Roblox Den/RoCodes utuh, tanpa atribusi, dan sama
// persis di versi ID maupun EN. Kode redeem sendiri adalah FAKTA dan bebas
// dipakai siapa pun — tapi kalimat yang mereka karang adalah ekspresi, dan itu
// satu-satunya bagian dari situs ini yang benar-benar bisa diklaim orang lain.
// Menyalinnya juga membuat pembaca Indonesia disuguhi instruksi berbahasa
// Inggris, jadi memperbaikinya menutup dua masalah sekaligus.
//
// Yang diambil dari sumber hanya SASARAN aksinya — nama tombol/menu seperti
// "Settings", "Codes", "Enter code..." — dan itu fakta antarmuka game, bukan
// karangan siapa pun. Kalimatnya kita rangkai sendiri, dalam dua bahasa.
//
// Kalau ekstraksi gagal (2 dari 443 saat diukur), jatuh ke langkah standar yang
// memang sudah kita tulis sendiri sejak awal — jadi tak pernah ada halaman yang
// kehilangan panduan.

/** Nama tombol/menu yang disebut sumber, urut kemunculan, tanpa duplikat. */
export function sasaranUI(howTo = []) {
  const out = [];
  for (const langkah of howTo) {
    const s = String(langkah ?? "");
    // Teks dalam kutip hampir selalu label tombol persis ("Enter Code...").
    const kutip = [...s.matchAll(/["“']([^"”']{2,28})["”']/g)].map((m) => m[1].trim());
    if (kutip.length) { out.push(...kutip); continue; }
    // Kalau tak ada kutip, ambil frasa setelah verba aksi.
    const m = s.match(/\b(?:click|press|tap|open|select|hit)\s+(?:on\s+)?(?:the\s+)?([A-Za-z0-9 '/-]{2,34}?)(?:\s+(?:button|icon|tab|menu|box))?(?:\s+(?:at|on|in|located)\b|[,.]|$)/i);
    if (m) out.push(m[1].trim());
  }
  // Bersihkan sisa kalimat yang ikut terbawa. Ekstraksi mentah menghasilkan
  // "Claim to claim it" (anak kalimat ikut) dan "settings or gear" (huruf kecil
  // di tengah kalimat) — keduanya terbaca seperti salah tempel kalau dibiarkan.
  const bersih = out
    .map((x) => String(x).replace(/\s+/g, " ").trim())
    // buang anak kalimat "to redeem/claim/get ..." yang menempel di belakang
    .map((x) => x.replace(/\s+to\s+(redeem|claim|get|use|open|enter).*$/i, "").trim())
    // "Settings or gear", "P key or click the gear" — sumber menyebut dua cara.
    // Diambil yang PERTAMA saja: kalimat kita jadi instruksi, bukan daftar pilihan.
    .map((x) => x.replace(/\s+or\s+.*$/i, "").trim())
    // buang kata benda generik di ekor ("... button", "... icon")
    .map((x) => x.replace(/\s+(button|icon|tab|menu|box|option)$/i, "").trim())
    // label UI ditulis kapital di gamenya; huruf kecil datang dari tengah kalimat
    .map((x) => (x === x.toLowerCase() ? x.charAt(0).toUpperCase() + x.slice(1) : x))
    // "Codes" SENGAJA tidak dibuang: itu justru nama tombol paling umum di game
    // Roblox — 161 game menyebutnya. Sebelumnya ikut daftar buangan bersama kata
    // sambung, sehingga langkah terpentingnya hilang tanpa jejak.
    .filter((x) => x.length >= 2 && x.length <= 30 && !/^(it|the|then|and|your|here|this|that)$/i.test(x));
  return [...new Set(bersih)];
}

/**
 * Susun langkah redeem versi kita sendiri.
 * @param {string} nama   nama game
 * @param {string[]} howTo langkah mentah dari sumber (hanya dipakai sbg fakta)
 * @param {{id:string[],en:string[]}} standar langkah cadangan milik kita
 */
export function langkahRedeem(nama, howTo, standar) {
  const t = sasaranUI(howTo);
  if (!t.length) return { ...standar, sendiri: false };

  const buka = t[0];
  const akhir = t.length > 1 ? t[t.length - 1] : null;
  const tengah = t.slice(1, -1);

  const id = [`Jalankan ${nama} di Roblox dan tunggu sampai masuk sepenuhnya`];
  const en = [`Launch ${nama} on Roblox and wait until you are fully in-game`];

  id.push(`Buka menu lewat ${buka}`);
  en.push(`Open the menu via ${buka}`);
  for (const m of tengah) {
    id.push(`Pilih ${m}`);
    en.push(`Select ${m}`);
  }
  if (akhir) {
    id.push(`Tempel kodenya, lalu tekan ${akhir}`);
    en.push(`Paste the code, then press ${akhir}`);
  } else {
    id.push("Tempel kodenya di kolom kode, lalu konfirmasi");
    en.push("Paste the code into the code box, then confirm");
  }
  // Peringatan yang selalu relevan dan memang temuan kita sendiri: kode Roblox
  // peka huruf besar/kecil, dan itu penyebab kegagalan paling sering.
  id.push("Salin PERSIS — kode Roblox peka huruf besar/kecil");
  en.push("Copy it EXACTLY — Roblox codes are case-sensitive");
  return { id, en, sendiri: true };
}
