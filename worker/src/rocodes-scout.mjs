// Pemantau RoCodes.gg — kembaran den-scout.mjs untuk sumber primer yang satunya.
//
// Kenapa perlu (diukur 5 Agu 2026):
//   indeks RoCodes 3.119 slug · indeks Den 4.435 slug
//   belum dipantau 2.721, di antaranya 877 HANYA ada di RoCodes
// Delapan ratus tujuh puluh tujuh slug itu buta total: discovery kita cuma
// bersandar pada sitemap Den, jadi game yang hanya diliput RoCodes tak punya
// jalan masuk sama sekali. Sampel 18 slug tersegar: 5 lolos ambang (Car Zone
// 2.312 pemain, Notoriety 6.541, Neighbors 8.070).
//
// TAPI tugas utamanya bukan itu, melainkan yang kedua:
//
// MENYAMBUNGKAN SLUG YANG BERGANTI NAMA. RoCodes memindahkan halaman tanpa
// meninggalkan redirect, dan slug lama kita jadi 404 diam-diam — 68 game per
// 5 Agu 2026. Contohnya Haze Seas: kita mencarinya di `project-new-world`,
// RoCodes menamainya `haze-piece`. Nama sama sekali tak membantu menebaknya
// (hanya 3 dari 68 ketemu lewat pencocokan nama), sehingga game yang SUDAH kita
// pantau kehilangan satu sumber primer tanpa ada yang menyadarinya — halaman
// Haze Seas bertumpu pada Den saja, padahal RoCodes punya 37 kode untuknya.
//
// KUNCINYA universeId. Komentar lama di fetch-roblox.mjs menolak penambalan slug
// otomatis karena kandidat ber-skor-nama tinggi ternyata game LAIN
// (fighting-simulator → weapon-fighting-simulator), dan catatan itu menutup
// dengan syarat: "WAJIB diverifikasi universeId halaman kandidat dulu." RoCodes
// menyediakan universeId langsung di metadata halamannya, jadi satu tarikan
// sudah cukup untuk memastikan identitas — tanpa resolve placeId seperti Den.
// Itu membuat scout ini justru LEBIH MURAH per kandidat daripada den-scout.
//
// Batasannya sengaja disamakan dengan den-scout: MAX evaluasi per run, hasil
// penilaian dimemo (data/rocodes-scout.json), dan jeda penilaian ulang
// bertingkat menurut kedekatan ke ambang.
import { fetchRoCodes } from "./sources/rocodes.mjs";

const AMBANG = Number(process.env.RO_SCOUT_MIN_PLAYERS || 2000);
const MAX_EVAL = Number(process.env.RO_SCOUT_MAX || 15); // evaluasi per run
// JENDELA JAUH LEBIH LEBAR DARIPADA den-scout, dan itu disengaja. Diukur 5 Agu
// 2026, umur <lastmod> di kedua sitemap ternyata bermakna sangat berbeda:
//   Den     p50 =     26 jam  → sitemap diregenerasi terus; hampir semua entri
//                               tampak "segar", jadi lastmod nyaris tak menyaring
//   RoCodes p50 = 10.481 jam  → lastmod mencerminkan update ISI sebenarnya
// Dengan jendela 36 jam ala Den, RoCodes cuma menyisakan 22 kandidat dari 3.119
// dan `haze-piece` (slug baru Haze Seas) meleset tipis di umur 42 jam — persis
// kasus yang scout ini dibangun untuk menangkapnya.
//
// 30 hari menangkap 373 slug. Dengan 15 evaluasi/run per jam, seluruhnya tersapu
// dalam ~1 hari, lalu memo yang menahan pemeriksaan ulang. Melebarkan jendela di
// sini murah justru KARENA lastmod-nya jujur: yang lama memang benar-benar lama.
const SEGAR_MS = Number(process.env.RO_SCOUT_SEGAR_HARI || 30) * 24 * 3600 * 1000;

// Sama persis dengan den-scout: game yang NYARIS lolos paling berharga dipantau
// ketat, yang kecil cukup sesekali.
const jedaUlang = (players) => {
  const H = 24 * 3600 * 1000;
  if (players >= AMBANG * 0.6) return 2 * H;
  if (players >= AMBANG * 0.25) return 7 * H;
  return 30 * H;
};

async function pemainDari(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    try {
      const r = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeIds.slice(i, i + 50).join(",")}`, { signal: AbortSignal.timeout(12000) });
      if (r.ok) for (const g of (await r.json()).data ?? []) out[g.id] = { playing: g.playing ?? 0, name: g.name || null };
    } catch { /* biarkan */ }
  }
  return out;
}

/**
 * @param {Map<string, number>} roIndex     slug → lastmod(ms) dari sitemap RoCodes
 * @param {Set<string>} sudahDipantau       rocodesSlug yang sudah terhubung
 * @param {Map<number, string>} uidDipantau universeId → id game kita (deteksi rename)
 * @param {object} memo                     isi data/rocodes-scout.json
 * @returns {Promise<{tambah: object[], pindah: object[], memoBaru: object}>}
 *   tambah = game baru; pindah = slug baru untuk game yang SUDAH dipantau
 */
export async function scoutRoCodes(roIndex, sudahDipantau, uidDipantau, memo = {}) {
  const now = Date.now();
  const kandidat = [...roIndex]
    .filter(([slug, lm]) => lm > 0 && now - lm <= SEGAR_MS && !sudahDipantau.has(slug))
    .filter(([slug]) => { const m = memo[slug]; return !m || now - m.at > jedaUlang(m.players ?? 0); })
    .sort((a, b) => b[1] - a[1]) // paling baru diperbarui dinilai duluan
    .slice(0, MAX_EVAL)
    .map(([slug]) => slug);
  if (!kandidat.length) return { tambah: [], pindah: [], memoBaru: memo };

  const nilai = [];
  for (const slug of kandidat) {
    try {
      const r = await fetchRoCodes(slug);
      const uid = Number(r.meta?.universeId) || null;
      nilai.push({ slug, universeId: uid, kode: (r.active ?? []).length, nama: r.meta?.name ?? null });
    } catch {
      // 404/410 itu hasil yang SAH, bukan galat: slug memang tak ada lagi.
      // Tetap dimemo supaya tak ditembak ulang tiap jam.
      nilai.push({ slug, universeId: null, kode: 0, nama: null });
    }
  }
  const pemain = await pemainDari(nilai.map((n) => n.universeId).filter(Boolean));

  const memoBaru = { ...memo };
  const tambah = [];
  const pindah = [];
  for (const n of nilai) {
    const p = n.universeId ? pemain[n.universeId] : null;
    const jml = p?.playing ?? 0;
    memoBaru[n.slug] = { at: now, players: jml };
    if (!n.universeId) continue;

    // RENAME: universeId-nya milik game yang SUDAH kita pantau → ini halaman
    // yang sama dengan slug baru. Diprioritaskan di atas "game baru", kalau
    // tidak game yang sama masuk dua kali dengan identitas terpecah.
    const gameLama = uidDipantau.get(n.universeId);
    if (gameLama) {
      if (n.kode > 0) pindah.push({ game: gameLama, slugBaru: n.slug, nama: p?.name || n.nama || n.slug, kode: n.kode });
      continue;
    }
    if (jml >= AMBANG && n.kode > 0) {
      tambah.push({ slug: n.slug, universeId: n.universeId, players: jml, name: p?.name || n.nama || n.slug });
    }
  }
  console.log(`[rocodes-scout] menilai ${nilai.length} slug → ${tambah.length} game baru, ${pindah.length} slug pindah`);
  for (const t of tambah) console.log(`  + ${t.name} (${t.players} pemain, ${t.slug})`);
  for (const p of pindah) console.log(`  ↻ ${p.nama}: slug RoCodes pindah ke "${p.slugBaru}" (${p.kode} kode) — game ${p.game}`);
  return { tambah, pindah, memoBaru };
}
