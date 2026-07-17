// Pembaca cache events.json untuk halaman Event (SSG).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CACHE = process.env.KODEGG_EVENTS ?? resolve(process.cwd(), "../worker/data/events.json");

/** Rentang tanggal "17 Jul – 21 Jul 2026" (zona WIB), sesuai bahasa. */
export function dateRange(startsAt, endsAt, lang) {
  if (!startsAt || !endsAt) return "";
  const loc = lang === "id" ? "id-ID" : "en-GB";
  const a = new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(startsAt));
  const b = new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(endsAt));
  return `${a} – ${b}`;
}

import { pick, withLang } from "./news.mjs";

export async function loadEvents(lang = "en") {
  let raw;
  try {
    raw = JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return { updatedAt: null, events: [], archive: [], games: [] };
  }
  const shape = (e) => ({
    ...e,
    title: pick(e.title, lang),
    subtitle: pick(e.subtitle, lang),
    desc: pick(e.desc, lang),
    url: withLang(e.url, lang),
  });
  const events = (raw.events ?? []).map(shape);
  const archive = (raw.archive ?? []).map(shape);
  const seen = new Map();
  for (const e of [...events, ...archive]) if (e.game && !seen.has(e.game)) seen.set(e.game, e.gameName);
  return {
    updatedAt: raw.updatedAt ?? null,
    events,
    archive,
    games: [...seen.entries()].map(([id, name]) => ({ id, name })),
  };
}
