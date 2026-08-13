// Saringan anti-dobel antara dua jalur yang bisa memilih GAME YANG SAMA di run
// yang sama: jalur kode-baru (buildCandidates) dan jalur susulan/borongan
// (buildBacklog). Hasilnya dua video judul nyaris kembar, terbit selisih menit.
//
// KENAPA JADI MODUL SENDIRI, bukan satu baris di make-videos.mjs. Saringan ini
// pernah ada di sana dan DIAM-DIAM TAK BEKERJA SEJAK LAHIR (8 Agu 2026 s/d 13
// Agu 2026):
//
//   const sudahJadiKandidat = new Set(candidates.map((c) => c.game).filter(Boolean));
//   const susulan = buildBacklog(state, muat).filter((c) => !sudahJadiKandidat.has(c.game));
//
// Objek kandidat TIDAK punya field `game` — kuncinya `id` (lihat kelima
// `out.push({ platform, id, ... })` di make-videos.mjs, dan dedup antrian di
// baris ~862 yang memang memakai `c.id`). Yang bernama `game` itu record KODE
// (`rb.active[].game`) dan entri log (`state.log[].game`) — dua bentuk yang
// berseliweran di file yang sama, jadi tertukarnya wajar.
//
// Akibatnya `.filter(Boolean)` membuang SEMUA kunci, himpunannya selalu kosong,
// dan `.filter(...)` meloloskan semuanya. Persis bentuk kegagalan yang paling
// mahal: saringan yang tak menyaring apa pun tapi tak pernah melempar error.
// Tak ada dobel yang muncul setelah 8 Agu bukan karena saringannya jalan,
// melainkan karena kolam susulan keburu kering (13 Agu: 0 kandidat dari 212
// game ≥2000 pemain). Begitu katalog bertambah, dobelnya balik.
//
// Dipisah supaya BISA DIUJI (make-videos.mjs memanggil main() saat diimpor,
// jadi tak bisa di-import test), dan supaya salah-nama yang sama tak lolos lagi
// tanpa suara — lihat `kunci()` yang berteriak di bawah.

/** Kunci identitas kandidat. Platform ikut karena ruang id ROBLOX dan MOBILE
 *  terpisah — id yang kebetulan sama bukan game yang sama. */
const idKey = (c) => `${c.platform ?? "ROBLOX"}:${c.id}`;
/** Slug dipakai sebagai kunci KEDUA: satu game bisa ganti id saat namanya
 *  flip-flop di sumber (mis. dog-race → roblox-dog-race) sementara slug-nya
 *  tetap. Dedup by universeId di buildCandidates cuma berlaku di dalam daftar
 *  kandidat, tak menjangkau item susulan yang ditambahkan belakangan. */
const slugKey = (c) => (c.slug ? `${c.platform ?? "ROBLOX"}:slug:${c.slug}` : null);

/**
 * Buang item susulan yang game-nya sudah masuk daftar kandidat run ini.
 *
 * @param {Array<object>} susulan  hasil buildBacklog
 * @param {Array<object>} kandidat daftar kandidat jalur kode-baru + antrian + promo
 * @returns {Array<object>} susulan yang aman ditambahkan
 */
export function saringSusulan(susulan, kandidat) {
  const kunci = new Set();
  for (const c of kandidat ?? []) {
    if (!c) continue;
    if (c.id) kunci.add(idKey(c));
    const s = slugKey(c);
    if (s) kunci.add(s);
  }
  // JEBAKAN YANG MEMBUNUH VERSI SEBELUMNYA, dipasangi alarm. Kandidat yang tak
  // menghasilkan satu kunci pun = field identitasnya berganti nama lagi. Tanpa
  // baris ini kejadiannya persis seperti dulu: saringan mati, log bersih,
  // ketahuan lima hari kemudian dari video kembar di kanal.
  if ((kandidat?.length ?? 0) > 0 && kunci.size === 0) {
    console.log(`  [!] saringSusulan: ${kandidat.length} kandidat tapi 0 kunci identitas — field 'id'/'slug' hilang? Saringan anti-dobel TIDAK aktif run ini.`);
  }
  return (susulan ?? []).filter((c) => {
    const s = slugKey(c);
    return !kunci.has(idKey(c)) && !(s && kunci.has(s));
  });
}
