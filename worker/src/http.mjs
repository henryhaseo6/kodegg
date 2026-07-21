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

/** URL proxy untuk sebuah target, atau null bila proxy belum dikonfigurasi. */
export function proxyUrl(url) {
  const { KODEGG_PROXY, KODEGG_PROXY_KEY } = process.env;
  if (!KODEGG_PROXY || !KODEGG_PROXY_KEY) return null;
  return `${KODEGG_PROXY}?key=${encodeURIComponent(KODEGG_PROXY_KEY)}&url=${encodeURIComponent(url)}`;
}

const HEADERS_BROWSER = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Cache-Control": "no-cache",
};

/**
 * fetch dengan header ala browser; bila tetap ditolak (403/429/451) DAN proxy
 * Cloudflare tersedia, ulangi lewat proxy itu.
 *
 * Ternyata header browser saja tak cukup: whiteoutsurvival-community tetap 403
 * dari IP GitHub Actions (lihat run #80), sementara dari IP Cloudflare & lokal
 * 200. Jadi yang diblokir memang RENTANG IP-nya, bukan UA. Proxy = Worker milik
 * sendiri (cron/worker.js, route /proxy, host di-allowlist).
 *
 * Env: KODEGG_PROXY (URL /proxy) + KODEGG_PROXY_KEY. Tanpa env itu, perilakunya
 * sama seperti sebelumnya (lokal & Cloudflare build tak butuh proxy).
 */
export async function fetchAsBrowser(url, init = {}, { forceProxy = false } = {}) {
  const headers = { ...HEADERS_BROWSER, ...(init.headers ?? {}) };
  if (forceProxy) {
    const lewat = proxyUrl(url);
    if (lewat) return fetch(lewat, { headers });
  }
  const res = await fetch(url, { ...init, headers });
  const diblokir = res.status === 403 || res.status === 429 || res.status === 451;
  const { KODEGG_PROXY, KODEGG_PROXY_KEY } = process.env;
  if (!diblokir || !KODEGG_PROXY || !KODEGG_PROXY_KEY) return res;

  const lewatProxy = await fetch(proxyUrl(url), { headers });
  if (lewatProxy.ok) console.log(`  · ${new URL(url).hostname} ${res.status} langsung → OK via proxy`);
  return lewatProxy;
}
