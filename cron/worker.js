// Cloudflare Worker — Cron Trigger untuk memicu workflow GitHub Actions
// "update-codes" TIAP JAM dengan andal. Cron GitHub sendiri sering ditunda/
// di-drop; cron Cloudflare presisi. Worker ini cuma memanggil GitHub API
// workflow_dispatch (butuh token), jadi workflow-nya tetap yang di repo.
//
// Deploy: Workers & Pages → Create → Worker → tempel kode ini.
// Bindings/secret (di Settings → Variables & Bindings):
//   GITHUB_TOKEN  (Secret) : PAT fine-grained, izin Actions=Read&Write di repo
//   GH_REPO       (Text)   : henryhaseo6/kodegg
//   GH_WORKFLOW   (Text)   : update-codes.yml
//   TRIGGER_KEY   (Secret, opsional) : kunci utk uji manual via URL
//   ROBLOX_LOG    (KV)     : log CCU 10-menit (buffer, TTL 4 hari)
//   ROBLOX_DB     (R2)     : database permanen — file harian padat (10-menit utuh)
// Trigger: Cron Triggers → "0 * * * *" (dispatch) + "*/10 * * * *" (log+compact).

export default {
  // Dipanggil otomatis oleh Cron Trigger. DUA jadwal:
  //   "0 * * * *"    → dispatch workflow GitHub Actions (update kode, tiap jam)
  //   "*/10 * * * *" → log CCU game teratas Roblox ke KV (tiap 10 menit)
  // event.cron = string jadwal yang memicu invocation ini (dipisah CF per jadwal).
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil((async () => {
        await logPlayers(env).catch((e) => console.log("kodegg-log gagal:", e.message));
        // Tiap tick sekalian cek: padetin data KEMARIN ke R2 bila belum (idempoten).
        await maybeCompact(env).catch((e) => console.log("kodegg-compact gagal:", e.message));
      })());
    } else {
      ctx.waitUntil(trigger(env)); // "0 * * * *" (default bila cron tak dikenal)
    }
  },

  // Uji manual (opsional): buka https://<worker>.workers.dev/?key=TRIGGER_KEY
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/proxy") return proxy(url, env);
    // Dump snapshot mentah 1 hari dari KV (buffer). Butuh TRIGGER_KEY.
    if (url.pathname === "/roblox-daily") return robloxDaily(url, env);
    // Baca file harian PADAT dari R2 (database permanen). ?date=YYYY-MM-DD atau ?list=1
    if (url.pathname === "/roblox-db") return robloxDb(url, env);
    // Deret CCU BERGULIR utk SATU game: /roblox-series?uid=...&jam=24&key=...
    if (url.pathname === "/roblox-series") return robloxSeries(url, env);
    // Log manual sekali (uji): /log?key=...
    if (url.pathname === "/log") {
      if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) return new Response("unauthorized", { status: 401 });
      try { await logPlayers(env); return new Response("logged ✓"); } catch (e) { return new Response("gagal: " + e.message, { status: 500 }); }
    }
    // Padetin manual (uji): /compact?date=YYYY-MM-DD&key=... (default: kemarin WIB, paksa timpa)
    if (url.pathname === "/compact") {
      if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) return new Response("unauthorized", { status: 401 });
      const date = url.searchParams.get("date") || wibYesterday();
      try { const r = await compactDay(env, date, true); return new Response(`compact ${date}: ${r}`); } catch (e) { return new Response("gagal: " + e.message, { status: 500 }); }
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
  // get-sorts di-PAGINATE (6 sort/halaman). Halaman 1 = 5 sort umum; halaman
  // berikutnya = sort umum lain + 15 sort per-genre. Total 26 kategori (~5 hal).
  // sessionId sama dipakai lintas-halaman (token menyimpan session_id).
  const sid = (globalThis.crypto?.randomUUID?.() ?? `kodegg-${Date.now()}`);
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const ccu = {}, names = {}, sorts = {};
  let token = "", page = 0;
  do {
    const url = `https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${sid}&device=computer&country=all` + (token ? `&sortsPageToken=${encodeURIComponent(token)}` : "");
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": ua } });
    // Halaman 1 wajib (kalau gagal, lempar). Halaman lanjutan best-effort:
    // kalau satu gagal, pakai yang sudah terkumpul (jangan gagalkan seluruh tick).
    if (!res.ok) { if (page === 0) throw new Error("get-sorts " + res.status); break; }
    const j = await res.json();
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
    token = j.nextSortsPageToken || "";
    page++;
  } while (token && page < 8); // 26 sort muat di ~5 hal; 8 = batas aman
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
/**
 * Deret CCU BERGULIR untuk SATU game: N jam terakhir sampai DETIK INI.
 *
 * KENAPA ADA. Grafik di video Roblox memakai berkas harian R2, dan berkas itu
 * baru ada setelah harinya lewat — jadi yang tergambar selalu HARI KALENDER
 * KEMARIN. Untuk video yang terbit jam 13:00, datanya berumur 13-37 jam,
 * sementara labelnya menulis "24 JAM TERAKHIR". Endpoint ini membuat label itu
 * jadi benar.
 *
 * Sumbernya KV, bukan R2, karena hanya KV yang punya data HARI BERJALAN (buffer
 * TTL 4 hari). Waktu tiap titik hidup di NAMA KUNCI (`snap:<tanggal>:<HHMM>`),
 * bukan di isinya — itu sebabnya /roblox-daily tak bisa dipakai untuk ini: ia
 * memulangkan isi snapshot tanpa nama kuncinya, jadi titiknya tak bisa
 * ditempatkan di waktu mana pun.
 *
 * Jendelanya dipotong dari daftar kunci DULU, baru isinya diambil — supaya
 * jumlah pembacaan KV mengikuti lebar jendela (±144 utk 24 jam), bukan seluruh
 * isi buffer.
 */
async function robloxSeries(url, env) {
  if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) return new Response("unauthorized", { status: 401 });
  if (!env.ROBLOX_LOG) return new Response("KV ROBLOX_LOG belum di-bind", { status: 503 });
  const uid = String(url.searchParams.get("uid") || "").trim();
  if (!uid) return new Response("uid wajib", { status: 400 });
  const jam = Math.min(48, Math.max(1, Number(url.searchParams.get("jam")) || 24));

  const now = Date.now();
  const batas = now - jam * 3600e3;
  // Dua hari WIB sudah cukup menutup jendela apa pun sampai 48 jam? Tidak —
  // 48 jam bisa menyentuh tiga tanggal WIB. Dihitung dari batasnya, bukan
  // ditebak dua hari ke belakang.
  const tanggal = [];
  for (let t = batas; t <= now + 864e5; t += 864e5) {
    const d = wibNow(new Date(t)).date;
    if (!tanggal.includes(d)) tanggal.push(d);
  }
  const kunci = [];
  for (const d of tanggal) {
    const list = await env.ROBLOX_LOG.list({ prefix: `snap:${d}:` });
    for (const k of list.keys) {
      const hhmm = k.name.split(":").pop();
      if (!/^\d{4}$/.test(hhmm)) continue;
      // Kunci ditulis dengan jam WIB, jadi offsetnya eksplisit di sini.
      const ms = Date.parse(`${d}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00+07:00`);
      if (Number.isFinite(ms) && ms >= batas && ms <= now) kunci.push({ name: k.name, ms });
    }
  }
  kunci.sort((a, b) => a.ms - b.ms);

  const titik = [];
  for (const k of kunci) {
    const v = await env.ROBLOX_LOG.get(k.name);
    if (!v) continue;
    const snap = JSON.parse(v);
    const ccu = snap.ccu ?? snap; // kompat format lama {uid:ccu}
    const c = ccu[uid];
    // Game yang sedang keluar dari chart TIDAK dicatat nol — titiknya memang
    // tak ada, dan itu beda artinya. Dilewati, bukan diisi.
    if (typeof c === "number" && c >= 0) titik.push({ ms: k.ms, v: c });
  }
  return Response.json({ uid, jam, sampai: now, mulai: batas, count: titik.length, titik });
}

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

// ————————————————————————————————————————————————————————————————
// DATABASE PERMANEN (R2 binding ROBLOX_DB) — file harian PADAT.
// Tiap ganti hari, 144 snapshot mentah KV (buffer, TTL 4 hari) dipadatkan jadi
// SATU objek kolom di R2: daily/<date>.json. Resolusi 10-menit UTUH tersimpan
// selamanya (buat top50 harian, grafik bergerak, video per-kategori, dst).
// Bentuk: { date, count, times:[HHMM], names:{uid:nama},
//           series:{uid:[ccu per titik, null bila absen]},
//           sortsSeries:{sortId:[[uid rangking] per titik]} }
// ————————————————————————————————————————————————————————————————

const wibYesterday = () => new Date(Date.now() + WIB_MS - 86400000).toISOString().slice(0, 10);

/**
 * Padetkan snapshot 1 hari (dari KV) → 1 file kolom di R2.
 * @param force bila false, lewati kalau file R2 sudah ada (idempoten utk cron).
 * @returns string status ringkas.
 */
async function compactDay(env, date, force = false) {
  if (!env.ROBLOX_LOG) return "KV ROBLOX_LOG belum di-bind";
  if (!env.ROBLOX_DB) return "R2 ROBLOX_DB belum di-bind";
  if (!force && (await env.ROBLOX_DB.head(`daily/${date}.json`))) return "sudah ada";
  const list = await env.ROBLOX_LOG.list({ prefix: `snap:${date}:` });
  const keys = list.keys.map((k) => k.name).sort(); // urut waktu (HHMM di ekor)
  if (!keys.length) return "tak ada snapshot";
  const n = keys.length;
  const times = [], series = {}, sortsSeries = {};
  for (let i = 0; i < n; i++) {
    times.push(keys[i].split(":").pop()); // HHMM
    const v = await env.ROBLOX_LOG.get(keys[i]);
    if (!v) continue; // slot i tetap null di semua series (align terjaga)
    const snap = JSON.parse(v);
    const ccu = snap.ccu ?? snap; // kompat format lama {uid:ccu}
    for (const [uid, c] of Object.entries(ccu)) {
      (series[uid] ??= new Array(n).fill(null))[i] = c;
    }
    for (const [sid, ids] of Object.entries(snap.sorts ?? {})) {
      (sortsSeries[sid] ??= new Array(n).fill(null))[i] = ids;
    }
  }
  const names = JSON.parse((await env.ROBLOX_LOG.get(`names:${date}`)) || "{}");
  const doc = { date, count: n, times, names, series, sortsSeries };
  await env.ROBLOX_DB.put(`daily/${date}.json`, JSON.stringify(doc), {
    httpMetadata: { contentType: "application/json" },
  });
  return `ok (${n} titik, ${Object.keys(series).length} game, ${Object.keys(sortsSeries).length} sort)`;
}

// Auto (dipanggil tiap tick 10-mnt): padetin KEMARIN sekali, LENGKAP.
// Pakai penanda KV `compacted:<date>` supaya exactly-once — dan paksa-timpa
// (force) agar file parsial dari uji manual ke-overwrite jadi hari penuh.
async function maybeCompact(env) {
  if (!env.ROBLOX_DB || !env.ROBLOX_LOG) return; // butuh dua binding; kalau belum, lewati
  const y = wibYesterday();
  if (await env.ROBLOX_LOG.get(`compacted:${y}`)) return; // sudah beres hari ini
  const r = await compactDay(env, y, true);
  // "ok" atau "tak ada snapshot" = keadaan final → set penanda biar tak diulang.
  if (r.startsWith("ok") || r === "tak ada snapshot") {
    await env.ROBLOX_LOG.put(`compacted:${y}`, "1", { expirationTtl: 7 * 86400 });
  }
  console.log(`kodegg-compact: ${y} → ${r}`);
}

// GET /roblox-db?date=YYYY-MM-DD&key=... → file harian padat (JSON) dari R2.
// GET /roblox-db?list=1&key=...          → daftar tanggal tersedia.
async function robloxDb(url, env) {
  if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) return new Response("unauthorized", { status: 401 });
  if (!env.ROBLOX_DB) return new Response("R2 ROBLOX_DB belum di-bind", { status: 503 });
  if (url.searchParams.get("list")) {
    const l = await env.ROBLOX_DB.list({ prefix: "daily/" });
    return Response.json({ dates: (l.objects ?? []).map((o) => o.key.replace(/^daily\//, "").replace(/\.json$/, "")).sort() });
  }
  const date = url.searchParams.get("date");
  if (!date) return new Response("param 'date' wajib (atau ?list=1)", { status: 400 });
  const obj = await env.ROBLOX_DB.get(`daily/${date}.json`);
  if (!obj) return new Response("tidak ditemukan (belum dipadatkan?)", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": "application/json" } });
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
