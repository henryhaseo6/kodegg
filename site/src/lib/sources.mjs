// Daftar sumber data untuk footer — DITURUNKAN OTOMATIS dari data yang beneran
// dipakai (codes.json + news.json + events.json). Menambah sumber baru di worker
// → otomatis muncul di footer, tak perlu edit manual di sini.
//
// Nama teknis sumber (mis. "wiki", "pocketgamer") dipercantik lewat DISPLAY;
// sumber yang belum dikenal tetap tampil apa adanya (jadi tetap ter-kredit).
// URL = origin (homepage) dari URL sumber di data, kecuali ada URL_OVERRIDE.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const P = (env, file) => process.env[env] ?? resolve(process.cwd(), `../worker/data/${file}`);
const FILES = [P("KODEGG_CODES", "codes.json"), P("KODEGG_NEWS", "news.json"), P("KODEGG_EVENTS", "events.json"), P("KODEGG_ROBLOX", "roblox-codes.json")];

// Bukan sumber eksternal: "curated" = kode permanen yang kita rawat sendiri,
// "editorial" = label meta cross-check (situs spesifiknya sudah terdaftar).
const EXCLUDE = new Set(["curated", "editorial"]);

// Nama tampilan yang lebih rapi untuk sumber yang dikenal (opsional).
const DISPLAY = {
  wiki: "Fandom",
  pocketgamer: "PocketGamer",
  pockettactics: "Pocket Tactics",
  progameguides: "Pro Game Guides",
  dexerto: "Dexerto",
  "redeem-code-tracker": "redeem-code-tracker",
  "whiteoutsurvival-community": "Whiteout Community",
  crimsonwitch: "crimsonwitch",
};

// Untuk sumber yang di data URL-nya menunjuk halaman spesifik satu game (mis.
// satu wiki Fandom), pakai homepage generik supaya link footer tak nyasar.
const URL_OVERRIDE = {
  wiki: "https://www.fandom.com",
};

function homepage(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function collect(json, out) {
  const buckets = [
    json.active, json.archive, // codes
    json.articles, // news (+ archive di atas)
    json.events, // events (+ archive di atas)
  ];
  for (const arr of buckets) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const names = item.sources?.length ? item.sources : item.source ? [item.source] : [];
      for (const name of names) {
        if (!name || EXCLUDE.has(name)) continue;
        const url = item.sourceUrls?.[name] ?? item.sourceUrl ?? item.url ?? null;
        if (!out.has(name)) out.set(name, url);
        else if (!out.get(name) && url) out.set(name, url);
      }
    }
  }
}

/**
 * Baca semua cache & kembalikan daftar sumber unik untuk footer.
 * @returns {Promise<{name:string,url:string|null}[]>} diurutkan alfabetis (case-insensitive)
 */
export async function loadSources() {
  const raw = new Map(); // technicalName → url mentah
  for (const f of FILES) {
    try {
      collect(JSON.parse(await readFile(f, "utf8")), raw);
    } catch {
      // file belum ada saat build pertama — abaikan, sumber lain tetap terkumpul.
    }
  }
  return [...raw.entries()]
    .map(([name, url]) => ({
      name: DISPLAY[name] ?? name,
      url: URL_OVERRIDE[name] ?? homepage(url),
    }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
