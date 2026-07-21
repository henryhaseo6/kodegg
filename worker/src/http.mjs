// Helper HTTP untuk sumber yang memblokir bot.
//
// Sebagian situs (whiteoutsurvival-community, wuwastatus) di belakang proteksi
// bot: request dengan UA "KodeGGBot/1.0" dari IP datacenter GitHub Actions
// dijawab HTTP 403, sementara dari IP rumahan/Cloudflare tetap 200. Efeknya
// senyap dan berbahaya — worker mempertahankan data lama, jadi kode baru tak
// pernah masuk (kasus nyata: data Whiteout beku 3 hari, kode JULHD2026JP tak
// pernah terdeteksi → tak ada notif & tak ada video).
//
// Solusinya: kirim header selayaknya browser sungguhan. Ini BUKAN penyamaran
// untuk menembus larangan — halaman yang diambil publik, tanpa login, dan hanya
// dibaca sesekali per jam; header bot minimalis kita saja yang jadi pemicu
// heuristik. Kalau suatu saat tetap 403, jalan berikutnya: proksi lewat
// Cloudflare Worker milik sendiri (IP-nya tak diblokir, lihat cron/worker.js).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** fetch dengan header ala browser. Dipakai sumber yang menolak UA bot. */
export function fetchAsBrowser(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      "Cache-Control": "no-cache",
      ...(init.headers ?? {}),
    },
  });
}
