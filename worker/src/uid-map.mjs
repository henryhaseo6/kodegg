// PETA IDENTITAS SUMBER — slug → universeId/placeId, dibangun bertahap.
//
// MASALAH YANG DIPECAHKAN. Kita mengikat game ke sumber lewat SLUG, padahal
// slug cuma alamat dan bisa berubah. Diukur 6 Agu 2026: 75 dari 491 game (15%)
// menembak halaman RoCodes yang sudah tak ada — termasuk Murderers VS Sheriffs
// (85.326 pemain) dan Tower of Hell (14.902). Game-game itu jatuh ke SATU
// sumber tanpa ada yang menyadarinya: tak ada galat, halaman situs tetap
// terbit, cuma diam-diam kehilangan separuh pengawasan. Ditambah 50 game yang
// tak pernah punya slug Den sama sekali, seperempat katalog bersumber tunggal.
//
// KENAPA TAK DICOCOKKAN LEWAT NAMA. Sudah diuji dua kali dan gagal dua kali:
// 3 dari 68 (Agu 2026) dan 2 dari 12 teratas — dan KEDUA yang "ketemu" itu
// salah game (Tower of Hell → `tower-of-madness`, Build A Plane →
// `build-a-plane-tycoon`). Nama tak membedakan game yang berbeda, dan salah
// sambung jauh lebih buruk daripada tak tersambung: kode game lain akan tampil
// di halaman yang salah, dan tak ada galat yang memberitahu kita.
//
// YANG DIPAKAI: universeId — identitas sejati dari Roblox, bukan karangan
// sumber. RoCodes mencantumkannya di metadata halaman; Den mencantumkan
// placeId yang kita simpan juga untuk tiap game. Sekali sebuah slug dipetakan,
// ikatan yang putus bisa disambung ulang lewat pencarian sederhana, dan game
// yang belum dipantau langsung ketahuan identitasnya tanpa menebak.
//
// KENAPA BARU SEKARANG. Kedua scout SUDAH menarik halaman-halaman ini tiap jam
// dan sudah membaca universeId-nya — lalu membuangnya, hanya menyimpan
// {at, players}. 128 + 1.337 halaman sudah lewat di tangan kita tanpa
// meninggalkan apa pun yang bisa menyambung ikatan yang putus. Modul ini tak
// menambah tarikan baru untuk halaman itu; ia menyimpan yang sudah dibaca, lalu
// meneruskan sapuan ke sisa indeks.
//
// KONVERGENSI. Sapuan mendahulukan slug yang BELUM pernah dipetakan, bukan yang
// lastmod-nya paling segar. Bedanya menentukan: penilaian berbasis kesegaran tak
// pernah sampai ke ekor panjang, dan justru di situlah slug pindah bersembunyi —
// halaman yang baru dipindah bisa saja membawa lastmod lama. Dengan jatah
// 60/run, 3.121 slug RoCodes tersapu habis dalam ~2 hari, lalu biayanya turun
// sendiri karena tinggal slug baru yang perlu dipetakan.

const HARI = 24 * 3600 * 1000;
// Petakan ulang sesekali: halaman bisa dipakai ulang untuk game lain, dan
// pemetaan yang basi lebih berbahaya daripada tak ada pemetaan (menyambungkan
// game ke halaman yang isinya sudah berganti). 30 hari cukup jarang untuk murah,
// cukup sering untuk tak menyimpan kebohongan berbulan-bulan.
const UMUR_ULANG = 30 * HARI;

/**
 * Satu putaran sapuan identitas untuk SATU sumber.
 *
 * @param {object}   o
 * @param {Map<string, number>} o.idx    slug → lastmod(ms) dari sitemap sumber
 * @param {object}   o.memo              isi data/<sumber>-uid.json
 * @param {(slug:string)=>Promise<{uid:number|null, place:number|null}>} o.baca
 *        pembaca identitas satu halaman; melempar bila halaman tak terbaca
 * @param {number}   o.jatah             halaman per run
 * @param {string}   o.label             untuk log
 * @param {number}   [o.jeda=300]        jeda antar tarikan (ms)
 * @returns {Promise<{memoBaru: object, dipetakan: number, belum: number}>}
 */
export async function sapuIdentitas({ idx, memo = {}, baca, jatah, label, jeda = 300 }) {
  const now = Date.now();
  const memoBaru = { ...memo };

  // Slug yang lenyap dari sitemap dibuang — kalau tidak, memo menggelembung
  // selamanya dan pencarian balik bisa memulangkan alamat yang sudah mati.
  for (const s of Object.keys(memoBaru)) if (!idx.has(s)) delete memoBaru[s];

  const belumPernah = [];
  const kedaluwarsa = [];
  for (const [slug, lm] of idx) {
    const m = memoBaru[slug];
    if (!m) belumPernah.push([slug, lm]);
    else if (now - (m.at ?? 0) > UMUR_ULANG) kedaluwarsa.push([slug, lm]);
  }
  // Yang belum pernah dipetakan didahulukan; di dalamnya yang lastmod-nya paling
  // baru duluan, karena slug yang BARU muncul di sitemap adalah bentuk khas dari
  // halaman yang baru saja dipindah — persis yang sedang kita kejar.
  const antre = [...belumPernah.sort((a, b) => b[1] - a[1]), ...kedaluwarsa.sort((a, b) => a[1] - b[1])]
    .slice(0, jatah)
    .map(([slug]) => slug);

  let ok = 0, gagal = 0;
  for (const slug of antre) {
    try {
      const { uid, place } = await baca(slug);
      // Halaman terbaca tapi tanpa identitas tetap DICATAT (uid null). Kalau
      // tidak, slug semacam itu akan mengantre lagi tiap run selamanya dan
      // menyumbat jatah sapuan — biaya tetap, hasil selalu nihil.
      memoBaru[slug] = { at: now, ...(uid ? { uid } : {}), ...(place ? { place } : {}) };
      if (uid || place) ok++;
    } catch {
      // 404/timeout juga dicatat, alasan sama: kegagalan yang tak dicatat
      // berubah jadi antrean abadi.
      memoBaru[slug] = { at: now, gagal: true };
      gagal++;
    }
    if (jeda) await new Promise((r) => setTimeout(r, jeda));
  }

  const terpetakan = Object.values(memoBaru).filter((v) => v.uid || v.place).length;
  const belum = idx.size - Object.keys(memoBaru).length;
  console.log(`[uid-map ${label}] +${ok} dipetakan (${gagal} gagal) · total ${terpetakan}/${idx.size} · sisa belum disentuh ${Math.max(0, belum)}`);
  return { memoBaru, dipetakan: ok, belum: Math.max(0, belum) };
}

/** universeId → slug, dari memo. Slug gagal/tanpa identitas diabaikan. */
export function petaUid(memo = {}) {
  const p = new Map();
  for (const [slug, v] of Object.entries(memo)) {
    const u = Number(v?.uid) || 0;
    // Yang PERTAMA menang: kalau dua slug mengaku universeId sama, salah satunya
    // halaman lama yang belum dihapus sumber. Slug diurut agar pilihannya stabil
    // antar-run — berpindah-pindah tiap jam membuat ikatan goyang tanpa sebab.
    if (u && !p.has(u)) p.set(u, slug);
  }
  return p;
}

/** placeId → slug, dari memo. Dipakai untuk Den yang memberi placeId, bukan uid. */
export function petaPlace(memo = {}) {
  const p = new Map();
  for (const [slug, v] of Object.entries(memo)) {
    const pl = Number(v?.place) || 0;
    if (pl && !p.has(pl)) p.set(pl, slug);
  }
  return p;
}

/**
 * Sambung ulang ikatan yang putus, memakai identitas — bukan nama.
 *
 * Dua kasus ditangani sekaligus dan sengaja tak dibedakan, karena akibatnya
 * sama (game bersumber tunggal):
 *   - slug ada tapi sudah tak ada di sitemap sumber  → halaman pindah
 *   - slug tak pernah ada                            → belum pernah dikawinkan
 *
 * @param {Map<string, object>} set   katalog game (id → entri)
 * @param {Map<string, number>} idx   sitemap sumber (slug → lastmod)
 * @param {Map<number, string>} peta  identitas → slug
 * @param {string} field              "rocodesSlug" | "denSlug"
 * @param {(e:object)=>number} kunci  ambil identitas dari entri game kita
 * @returns {{sambung: object[], putus: number}}
 */
export function sambungUlang(set, idx, peta, field, kunci) {
  const sambung = [];
  let putus = 0;
  for (const [gid, e] of set) {
    const punya = e[field];
    if (punya && idx.has(punya)) continue; // ikatan sehat
    putus++;
    const k = Number(kunci(e)) || 0;
    if (!k) continue;
    const slugBaru = peta.get(k);
    if (!slugBaru || slugBaru === punya) continue;
    // Jangan rebut slug yang sudah dipakai game lain: kalau dua entri kita
    // mengaku identitas yang sama, itu masalah identitas ganda yang harus
    // diselesaikan di tempat lain — bukan dengan saling mencuri alamat.
    let bentrok = false;
    for (const [gid2, e2] of set) if (gid2 !== gid && e2[field] === slugBaru) { bentrok = true; break; }
    if (bentrok) continue;
    sambung.push({ game: gid, nama: e.name ?? gid, lama: punya ?? null, baru: slugBaru, id: k });
    e[field] = slugBaru;
  }
  return { sambung, putus };
}
