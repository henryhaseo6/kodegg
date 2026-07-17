// Sumber kode redeem HoYoverse — GABUNGAN banyak penyedia, per-game.
//
// Untuk kode, kelengkapan & kesegaran lebih penting daripada berhenti di satu
// sumber: tidak ada satu penyedia pun yang superset (mis. Genshin punya kode
// yang hanya di ennead; HSR & HI3 punya kode yang hanya di seria). Karena itu
// TIAP game menggabungkan hasil SEMUA penyedia yang mendukungnya, dedup per
// kode. Ini sekaligus menjawab dua hal:
//   - tahan blokir : satu penyedia mati, penyedia lain tetap mengisi.
//   - paling segar : penyedia mana pun yang lebih dulu menemukan kode baru,
//                    kodenya langsung ikut terkumpul.
//
// Penyedia saat ini (diverifikasi 2026-07-16):
//   1. seria   hoyo-codes.seria.moe  — 4 game (genshin, hkrpg, nap, honkai3rd)
//   2. ennead  api.ennead.cc/mihoyo  — 3 game (genshin, starrail, zenless); TANPA hi3
//
// Dedup: bila kode sama muncul di >1 penyedia, teks reward diambil dari penyedia
// prioritas lebih tinggi (urutan PROVIDERS) agar konsisten & verbatim.
// Menambah penyedia = tambah satu adapter ke PROVIDERS. Tidak ada endpoint yang
// menyediakan tanggal kedaluwarsa → endsAt selalu null (kartu pakai "Terpantau").

import { GAMES, HOYO_IDS } from "../games.mjs";
import { normalizeReward } from "../normalize.mjs";
import { collectAll } from "../chain.mjs";

async function getJSON(url, ua) {
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Adapter 1: hoyo-codes.seria.moe ---
// Bentuk: { codes: [{ code, status, rewards }] }, rewards = string ("A*60;B*5")
const seria = {
  name: "seria",
  label: "hoyo-codes",
  url: "https://hoyo-codes.seria.moe",
  keys: { gi: "genshin", hsr: "hkrpg", zzz: "nap", hi3: "honkai3rd", tot: "tot" },
  async fetch(gameKey, ua) {
    const data = await getJSON(`https://hoyo-codes.seria.moe/codes?game=${gameKey}`, ua);
    const rows = data.codes ?? data.active ?? [];
    return rows
      .filter((c) => c.code && String(c.status ?? "OK").toUpperCase() === "OK")
      .map((c) => ({ code: String(c.code).trim(), reward: normalizeReward(c.rewards) }));
  },
};

// --- Adapter 2: api.ennead.cc/mihoyo ---
// Bentuk: { active: [{ code, rewards: ["Stellar Jade x100", …] }] }, rewards = array
const ennead = {
  name: "ennead",
  label: "ennead.cc",
  url: "https://api.ennead.cc",
  keys: { gi: "genshin", hsr: "starrail", zzz: "zenless" }, // tanpa hi3
  async fetch(gameKey, ua) {
    const data = await getJSON(`https://api.ennead.cc/mihoyo/${gameKey}/codes`, ua);
    const rows = data.active ?? [];
    return rows
      .filter((c) => c.code)
      .map((c) => ({
        code: String(c.code).trim(),
        // Sudah berupa daftar string dari sumber → gabung apa adanya (verbatim).
        reward: Array.isArray(c.rewards) ? c.rewards.join(" · ") || null : normalizeReward(c.rewards),
      }));
  },
};

const PROVIDERS = [seria, ennead];

// Skor kelengkapan reward: null paling rendah; selain itu makin panjang makin
// lengkap. Dipakai cross-check — bila sumber A memotong reward (kasus nyata:
// seria "60 polychrome, two w"), sumber B yang utuh menang.
const rewardScore = (r) => (r == null ? -1 : r.length);

/** Bungkus item hasil gabungan ke skema kartu penuh. */
function decorate(id, merged) {
  return {
    game: id,
    gameName: GAMES[id].name,
    code: merged.code,
    reward: merged.reward,
    status: "active",
    perm: false,
    endsAt: null,
    claimUrl: null,
    source: merged.source, // nama sumber data (bukan situs redeem)
    sourceUrl: merged.sourceUrl, // tautan ke sumber data untuk cross-check
  };
}

export async function fetchHoyo({ userAgent, log = () => {} }) {
  const covered = new Set(); // game yang SUKSES ditarik (aman untuk diarsipkan)
  const items = [];
  let failed = 0;

  await Promise.all(
    HOYO_IDS.map(async (id) => {
      // Hanya penyedia yang punya kunci untuk game ini yang ikut.
      const providers = PROVIDERS.filter((p) => p.keys[id]);
      const { ok, failed: down } = await collectAll(
        providers.map((p) => ({ name: p.name, run: () => p.fetch(p.keys[id], userAgent) })),
      );

      for (const f of down) log(`[${id}] · ${f.name}: ${f.error}, dilewati`);

      if (ok.length === 0) {
        // Semua penyedia gagal untuk game ini → JANGAN tandai covered, supaya
        // kode lamanya dipertahankan (tidak diarsipkan massal).
        failed += 1;
        log(`[${id}] semua penyedia gagal — kode lama dipertahankan`);
        return;
      }

      covered.add(id);

      // Gabung semua penyedia yang berhasil, dedup per kode dengan CROSS-CHECK:
      //  - identitas & atribusi diambil dari penyedia prioritas tertinggi yang
      //    punya kode itu (urutan PROVIDERS),
      //  - reward diambil dari penyedia mana pun yang paling LENGKAP (skor),
      //    sehingga data yang terpotong di satu sumber diperbaiki sumber lain.
      const byCode = new Map();
      for (const provider of providers) {
        const res = ok.find((r) => r.name === provider.name);
        if (!res) continue;
        for (const raw of res.value) {
          const cur = byCode.get(raw.code);
          if (!cur) {
            byCode.set(raw.code, {
              code: raw.code,
              reward: raw.reward,
              source: provider.label,
              sourceUrl: provider.url,
            });
          } else if (rewardScore(raw.reward) > rewardScore(cur.reward)) {
            cur.reward = raw.reward; // sumber lebih lengkap menang untuk reward
          }
        }
      }

      for (const merged of byCode.values()) items.push(decorate(id, merged));
      log(`[${id}] ✓ ${byCode.size} kode dari ${ok.map((r) => r.name).join("+")}`);
    }),
  );

  return { items, covered, failed };
}
