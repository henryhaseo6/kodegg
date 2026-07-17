// KodeGG — worker KARAKTER → data/characters.json (untuk halaman Tier/Database).
//
// Sumber: yatta.moe (Project Amber) — data karakter resmi-mirror untuk Genshin
// & HSR. Nama, rarity, element, senjata/path, icon, dan SKILL verbatim.
//
// Aturan CLAUDE.md: data karakter (nama skill, deskripsi) VERBATIM dari sumber —
// di sini tidak diparafrase, hanya dibersihkan dari tag warna/HTML wiki.
// Peringkat tier (S/A/B) TIDAK di sini: itu opini, digarap terpisah + dikredit.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "data/characters.json");
const UA = "KodeGGBot/1.0 (+https://kodegg.com)";

const clean = (s) =>
  (s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\n|\n/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Jalankan promise-thunk dengan batas konkurensi (sopan ke API). */
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function genshin() {
  const list = await getJSON("https://gi.yatta.moe/api/v2/en/avatar");
  const items = Object.values(list.data.items);
  const chars = items.map((c) => ({
    id: String(c.id),
    name: c.name,
    rarity: c.rank,
    element: c.element ?? null,
    weapon: c.weaponType ?? null,
    icon: `https://gi.yatta.moe/assets/UI/${c.icon}.png`,
    skills: [],
  }));

  // Skill verbatim untuk ★5 (talent Normal/Skill/Burst).
  const fives = chars.filter((c) => c.rarity === 5);
  await pool(fives, 8, async (c) => {
    try {
      const det = await getJSON(`https://gi.yatta.moe/api/v2/en/avatar/${c.id}`);
      const talents = Object.values(det.data.talent ?? {})
        .filter((t) => t?.name && t?.description)
        .slice(0, 3);
      c.skills = talents.map((t) => ({ name: t.name, desc: clean(t.description).slice(0, 320) }));
    } catch {
      /* biarkan skills kosong bila detail gagal */
    }
  });

  return { name: "Genshin Impact", characters: chars };
}

async function starrail() {
  const list = await getJSON("https://sr.yatta.moe/api/v2/en/avatar");
  const items = Object.values(list.data.items);
  const chars = items.map((c) => ({
    id: String(c.id),
    name: c.name,
    rarity: c.rank,
    element: c.types?.combatType ?? null, // element = combat type (Ice, Fire, …)
    weapon: c.types?.pathType ?? null, // "weapon" = path (Knight, Hunt, …)
    icon: `https://sr.yatta.moe/hsr/assets/UI/avatar/${c.icon}.png`,
    skills: [],
  }));
  return { name: "Honkai: Star Rail", characters: chars };
}

async function main() {
  const now = new Date().toISOString();
  const games = {};
  for (const [id, fn] of [["gi", genshin], ["hsr", starrail]]) {
    try {
      games[id] = await fn();
      console.log(`  ${id}: ${games[id].characters.length} karakter`);
    } catch (err) {
      console.error(`✗ ${id}: ${err.message}`);
    }
  }

  if (Object.keys(games).length === 0) {
    console.error("✗ 0 game — characters.json dibiarkan utuh");
    process.exit(1);
  }

  const total = Object.values(games).reduce((n, g) => n + g.characters.length, 0);
  const withSkills = Object.values(games).flatMap((g) => g.characters).filter((c) => c.skills.length).length;
  const payload = { updatedAt: now, games };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));
  console.log(`✓ data/characters.json — ${total} karakter (${withSkills} dengan skill verbatim)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
