// Pemantau sumber (1×/hari). Menjawab dua pertanyaan yang selama ini baru
// ketahuan setelah berhari-hari data diam-diam beku:
//
//   LAPIS 1 — katalog sumber berubah?
//     Game BARU di sumber yang sudah kita pakai (parsernya sama → tinggal
//     tambah slug), dan game yang DIHAPUS sumber (kasus Guardian Tales:
//     404 tiap jam selama berhari-hari tanpa ada yang sadar).
//
//   LAPIS 2 — game tanpa cross-check bisa ditolong?
//     Untuk game yang belum punya ≥2 sumber editorial, tebak slug di situs
//     editorial yang polanya sudah kita kenal, lalu BENAR-BENAR parse. Kalau
//     ≥2 situs menghasilkan kode, laporkan sebagai kandidat cross-check.
//
// Bot ini sengaja hanya MELAPOR, tak mengubah registry: menambah sumber kode
// memengaruhi akurasi, jadi keputusannya tetap di manusia. Hasil: konsol,
// data/source-report.json, ringkasan job GitHub, plus ::warning:: bila ada
// sumber yang hilang.
//
// Jalan manual: node worker/discover-sources.mjs
import { writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "./src/games.mjs";
import { SLUGS as RCT_SLUGS } from "./src/sources/redeemtracker.mjs";
import { SITES, GAMES_CFG } from "./src/sources/editorial.mjs";
import { fetchAsBrowser } from "./src/http.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/source-report.json");
const RCT_HOME = "https://www.redeem-code-tracker.com/";
// HoYo punya jalur API sendiri → kehadirannya di tracker lain bukan "belum dicover".
const PUNYA_SUMBER_LAIN = new Set(["genshin-impact", "honkai-star-rail", "zenless-zone-zero", "honkai-impact-3rd"]);

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** LAPIS 1 — bandingkan katalog redeem-code-tracker dengan slug yang kita pantau. */
async function auditRedeemTracker() {
  const res = await fetchAsBrowser(RCT_HOME);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const live = [...new Set([...html.matchAll(/\/games\/([a-z0-9-]+)/g)].map((m) => m[1]))];
  if (live.length === 0) throw new Error("0 game terparse — layout beranda berubah");
  const dipantau = Object.values(RCT_SLUGS);
  return {
    live: live.length,
    baru: live.filter((s) => !dipantau.includes(s) && !PUNYA_SUMBER_LAIN.has(s)),
    hilang: dipantau.filter((s) => !live.includes(s)), // slug kita yang tak ada lagi di sumber
  };
}

/** LAPIS 2 — tebak slug editorial utk satu game, parse beneran, kembalikan yg berhasil. */
async function probeEditorial(name) {
  const slug = slugify(name);
  const tebakan = {
    pockettactics: [`${slug}/codes`, `${slug}-codes`],
    progameguides: [`${slug}/${slug}-codes`, `${slug}/codes`],
    pocketgamer: [`${slug}/codes`, `${slug}/redeem-codes`],
  };
  const hit = [];
  for (const [site, kandidat] of Object.entries(tebakan)) {
    for (const s of kandidat) {
      try {
        const r = await fetchAsBrowser(SITES[site].url(s));
        if (!r.ok) continue;
        const parsed = SITES[site].parse(await r.text());
        if (parsed.active.length === 0) continue;
        hit.push({ site, slug: s, kode: parsed.active.length, contoh: parsed.active.slice(0, 3).map((c) => c.code) });
        break; // satu slug yang jalan per situs sudah cukup
      } catch { /* kandidat berikutnya */ }
    }
  }
  return hit;
}

async function main() {
  const lapor = { dijalankan: new Date().toISOString(), redeemTracker: null, kandidatEditorial: [], error: [] };

  try {
    lapor.redeemTracker = await auditRedeemTracker();
  } catch (e) {
    lapor.error.push(`audit redeem-code-tracker: ${e.message}`);
  }

  // Game yang layak diprobe: sudah ada di registry kita TAPI belum punya entri
  // editorial (yaitu belum ter-cross-check), plus game baru temuan lapis 1.
  const targetRegistry = Object.entries(GAMES)
    .filter(([id]) => !GAMES_CFG[id])
    .filter(([id]) => !Object.keys(RCT_SLUGS).includes(id)) // sudah punya sumber khusus yang jalan
    .map(([id, m]) => ({ id, name: m.name }));
  const targetBaru = (lapor.redeemTracker?.baru ?? []).map((s) => ({ id: `(baru) ${s}`, name: s.replace(/-/g, " ") }));
  const target = [...targetRegistry, ...targetBaru];

  console.log(`probe editorial utk ${target.length} game…`);
  for (const g of target) {
    try {
      const hit = await probeEditorial(g.name);
      if (hit.length >= 2) {
        lapor.kandidatEditorial.push({ ...g, status: "SIAP cross-check", sumber: hit });
        console.log(`  ✓ ${g.name}: ${hit.map((h) => h.site).join(" + ")} (${hit.map((h) => h.kode).join("/")} kode)`);
      } else if (hit.length === 1) {
        lapor.kandidatEditorial.push({ ...g, status: "kurang 1 sumber", sumber: hit });
      }
    } catch (e) {
      lapor.error.push(`probe ${g.name}: ${e.message}`);
    }
  }

  await writeFile(OUT, JSON.stringify(lapor, null, 2));

  const rt = lapor.redeemTracker;
  const siap = lapor.kandidatEditorial.filter((k) => k.status === "SIAP cross-check");
  console.log(
    `\n✓ data/source-report.json — redeem-code-tracker: ${rt?.baru.length ?? "?"} game baru, ` +
      `${rt?.hilang.length ?? "?"} hilang | editorial: ${siap.length} siap cross-check`,
  );

  if (process.env.GITHUB_ACTIONS) {
    const baris = [];
    if (rt?.hilang.length) baris.push(`**Hilang dari redeem-code-tracker:** ${rt.hilang.join(", ")} — cabut slugnya, sumbernya 404 tiap jam.`);
    if (rt?.baru.length) baris.push(`**Game baru di redeem-code-tracker:** ${rt.baru.join(", ")} — parser sama, tinggal tambah slug.`);
    for (const k of siap) baris.push(`**${k.name}** siap cross-check: ${k.sumber.map((s) => `${s.site} (${s.kode} kode)`).join(" + ")}`);
    if (baris.length) {
      console.log(`::warning title=Sumber kode berubah::${baris.length} temuan — lihat ringkasan run`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### 🔎 Pemantau sumber\n${baris.map((b) => `- ${b}`).join("\n")}\n`);
      }
    }
  }
}

main().catch((e) => {
  console.error("discover-sources gagal:", e.message);
  process.exit(0); // jangan gagalkan run: ini pemantau, bukan jalur data utama
});
