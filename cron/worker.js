// Cloudflare Worker — Cron Trigger untuk memicu workflow GitHub Actions
// "update-codes" TIAP JAM dengan andal. Cron GitHub sendiri sering ditunda/
// di-drop; cron Cloudflare presisi. Worker ini cuma memanggil GitHub API
// workflow_dispatch (butuh token), jadi workflow-nya tetap yang di repo.
//
// Deploy: Workers & Pages → Create → Worker → tempel kode ini.
// Bindings/secret (di Settings → Variables):
//   GITHUB_TOKEN  (Secret) : PAT fine-grained, izin Actions=Read&Write di repo
//   GH_REPO       (Text)   : henryhaseo6/kodegg
//   GH_WORKFLOW   (Text)   : update-codes.yml
//   TRIGGER_KEY   (Secret, opsional) : kunci utk uji manual via URL
// Trigger: Settings → Triggers → Cron Triggers → "0 * * * *" (tiap jam).

export default {
  // Dipanggil otomatis oleh Cron Trigger. DUA jadwal:
  //   "0 * * * *"    → dispatch workflow GitHub Actions (update kode, tiap jam)
  //   "*/10 * * * *" → log CCU game teratas Roblox ke KV (tiap 10 menit)
  // event.cron = string jadwal yang memicu invocation ini (dipisah CF per jadwal).
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(logPlayers(env).catch((e) => console.log("kodegg-log gagal:", e.message)));
    } else {
      ctx.waitUntil(trigger(env)); // "0 * * * *" (default bila cron tak dikenal)
    }
  },

  // Uji manual (opsional): buka https://<worker>.workers.dev/?key=TRIGGER_KEY
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/proxy") return proxy(url, env);
    // Dump snapshot 1 hari (buat pipeline video hitung rollup). Butuh TRIGGER_KEY.
    if (url.pathname === "/roblox-daily") return robloxDaily(url, env);
    // Log manual sekali (uji): /log?key=...
    if (url.pathname === "/log") {
      if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) return new Response("unauthorized", { status: 401 });
      try { await logPlayers(env); return new Response("logged ✓"); } catch (e) { return new Response("gagal: " + e.message, { status: 500 }); }
    }
    if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("kodegg-cron aktif. Tambah ?key=... utk uji manual.", { status: 200 });
    }
    return new Response(await trigger(env));
  },
};

// ————————————————————————————————————————————————————————————————
// LOG CCU GAME ROBLOX (Charts) — tiap 10 menit ke KV binding ROBLOX_LOG.
// Sumber: explore-api get-sorts (1 call = ~264 game teratas + playerCount inline,
// ber-kode maupun tidak; game baru yang naik chart otomatis kebawa). Logika
// fetch ini CERMIN dari worker/src/roblox-charts.mjs (dipakai sisi Node/Actions
// utk rollup & render) — worker ini di-paste manual, tak bisa import modul.
// ————————————————————————————————————————————————————————————————

const WIB_MS = 7 * 3600 * 1000; // WIB = UTC+7, tanpa DST

// Tanggal & jam WIB dari waktu sekarang. Trik: geser +7 jam lalu baca ISO (UTC).
function wibNow(d = new Date()) {
  const iso = new Date(d.getTime() + WIB_MS).toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 13) + iso.slice(14, 16) };
}

async function fetchChartsGamesW() {
  const sid = (globalThis.crypto?.randomUUID?.() ?? `kodegg-${Date.now()}`);
  const res = await fetch(
    `https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${sid}&device=computer&country=all`,
    { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" } },
  );
  if (!res.ok) throw new Error("get-sorts " + res.status);
  const j = await res.json();
  const ccu = {}, names = {}, sorts = {};
  for (const srt of j.sorts ?? []) {
    if (srt.contentType !== "Games") continue;
    const ids = []; // urutan array = RANGKING game di dalam sort ini
    for (const g of srt.games ?? []) {
      if (!g.universeId || typeof g.playerCount !== "number") continue;
      if (ccu[g.universeId] == null || g.playerCount > ccu[g.universeId]) ccu[g.universeId] = g.playerCount;
      names[g.universeId] = g.name;
      ids.push(g.universeId);
    }
    if (ids.length) sorts[srt.sortId] = ids;
  }
  return { ccu, names, sorts };
}

async function logPlayers(env) {
  if (!env.ROBLOX_LOG) { console.log("kodegg-log: KV ROBLOX_LOG belum di-bind — lewati."); return; }
  const { ccu, names, sorts } = await fetchChartsGamesW();
  const { date, hhmm } = wibNow();
  const ttl = 4 * 86400; // 4 hari: cukup utk rollup H-1 + buffer
  // snapshot: CCU {uid: ccu} + keanggotaan sort {sortId: [uid urut rangking]}.
  // sorts disimpan supaya bisa bikin video per-kategori (Top Trending, dst) —
  // info ini TAK bisa diambil retroaktif, jadi dilog sejak awal.
  await env.ROBLOX_LOG.put(`snap:${date}:${hhmm}`, JSON.stringify({ ccu, sorts }), { expirationTtl: ttl });
  // nama per-hari (union). Tulis ULANG hanya bila ada perubahan (game/nama baru)
  // — daftar chart stabil, jadi ini hemat ~140 write/hari.
  const prevRaw = (await env.ROBLOX_LOG.get(`names:${date}`)) || "{}";
  const mergedRaw = JSON.stringify({ ...JSON.parse(prevRaw), ...names });
  if (mergedRaw !== prevRaw) await env.ROBLOX_LOG.put(`names:${date}`, mergedRaw, { expirationTtl: ttl });
  console.log(`kodegg-log: ${date} ${hhmm} — ${Object.keys(ccu).length} game, ${Object.keys(sorts).length} sort${mergedRaw !== prevRaw ? " (+names)" : ""}`);
}

// GET /roblox-daily?date=YYYY-MM-DD&key=TRIGGER_KEY → {date, count, names, snapshots:[{uid:ccu}]}
// Default date = hari WIB ini. Pipeline video ambil H-1 lalu hitung rollup Node.
async function robloxDaily(url, env) {
  if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) return new Response("unauthorized", { status: 401 });
  if (!env.ROBLOX_LOG) return new Response("KV ROBLOX_LOG belum di-bind", { status: 503 });
  const date = url.searchParams.get("date") || wibNow().date;
  const list = await env.ROBLOX_LOG.list({ prefix: `snap:${date}:` });
  const snapshots = [];
  for (const k of list.keys) { const v = await env.ROBLOX_LOG.get(k.name); if (v) snapshots.push(JSON.parse(v)); }
  const names = JSON.parse((await env.ROBLOX_LOG.get(`names:${date}`)) || "{}");
  return Response.json({ date, count: snapshots.length, names, snapshots });
}

// Host yang boleh diambil lewat proxy. SENGAJA daftar tertutup: worker ini tak
// boleh jadi open proxy. Tambah host baru hanya bila sumbernya memang memblokir
// IP GitHub Actions.
const HOST_DIIZINKAN = new Set([
  "www.whiteoutsurvival-community.com",
  "wuwastatus.com",
  // Situs editorial (cross-check) — sebagian juga 403 dari IP Actions.
  "game8.co",
  "www.pockettactics.com",
  "progameguides.com",
  "www.pocketgamer.com",
  "www.dexerto.com",
]);

/**
 * Ambil halaman publik dari IP Cloudflare, untuk sumber yang membalas 403 ke IP
 * datacenter GitHub Actions (kasus nyata: whiteoutsurvival-community & wuwastatus
 * — halaman yang sama tetap 200 dari IP Cloudflare/rumahan). Butuh TRIGGER_KEY.
 */
async function proxy(url, env) {
  if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) {
    return new Response("unauthorized", { status: 401 });
  }
  let target;
  try {
    target = new URL(url.searchParams.get("url") ?? "");
  } catch {
    return new Response("url tidak valid", { status: 400 });
  }
  if (target.protocol !== "https:" || !HOST_DIIZINKAN.has(target.hostname)) {
    return new Response("host tidak diizinkan", { status: 403 });
  }
  const res = await fetch(target.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    },
  });
  return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "text/html" } });
}

async function trigger(env) {
  const repo = env.GH_REPO || "henryhaseo6/kodegg";
  const wf = env.GH_WORKFLOW || "update-codes.yml";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kodegg-cron",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  // GitHub balas 204 No Content saat sukses.
  const msg = res.status === 204 ? "dispatched ✓" : `gagal ${res.status}: ${await res.text()}`;
  console.log("kodegg-cron:", msg);
  return msg;
}
