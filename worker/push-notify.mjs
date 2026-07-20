// KodeGG — kirim notifikasi push "kode baru" (dijalankan GitHub Actions).
//
// Kripto Web Push (VAPID + enkripsi) ditangani library `web-push` di Node —
// battle-tested, jauh lebih aman daripada hand-roll di Worker. Cloudflare hanya
// menyimpan subscription (KV). Alur:
//   fetch-codes menulis data/new-codes.json (kode baru run ini) →
//   ambil subscription dari <SITE>/api/list (Bearer PUSH_SECRET) →
//   web-push.sendNotification ke tiap subscriber; subscription mati (404/410)
//   dihapus via DELETE /api/subscribe.
//
// Env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SECRET, SITE_URL.
// Tak pernah menggagalkan Actions (exit 0 saat error/kekurangan konfig).

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  VAPID_SUBJECT = "mailto:admin@kodegg.com",
  PUSH_SECRET,
  SITE_URL = "https://kodegg.com",
} = process.env;

const MAX = 3; // maksimal notifikasi kode individual per run (sisanya diringkas)

async function main() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !PUSH_SECRET) {
    console.log("push-notify: VAPID/PUSH_SECRET belum lengkap — dilewati.");
    return;
  }

  let codes = [];
  try {
    codes = JSON.parse(await readFile(resolve(HERE, "data/new-codes.json"), "utf8")).codes ?? [];
  } catch {
    /* tak ada kode mobile baru — mungkin ada kode Roblox baru di bawah */
  }
  // Kode Roblox baru: tandai platform + resolve slug (id ≠ slug) utk URL
  // /roblox/<slug>. Subscriber yg memilih game Roblox (id) di picker menerimanya.
  try {
    const rb = JSON.parse(await readFile(resolve(HERE, "data/new-roblox-codes.json"), "utf8")).codes ?? [];
    if (rb.length) {
      let rbGames = {};
      try {
        rbGames = JSON.parse(await readFile(resolve(HERE, "data/roblox-codes.json"), "utf8")).games ?? {};
      } catch {}
      for (const c of rb) codes.push({ ...c, platform: "roblox", gameSlug: rbGames[c.game]?.slug ?? c.game });
    }
  } catch {}
  if (codes.length === 0) {
    console.log("push-notify: tak ada kode baru.");
    return;
  }

  const res = await fetch(`${SITE_URL}/api/list`, { headers: { authorization: `Bearer ${PUSH_SECRET}` } });
  if (!res.ok) {
    console.log(`push-notify: gagal ambil subscription (HTTP ${res.status}).`);
    return;
  }
  const subs = await res.json();
  if (!subs.length) {
    console.log("push-notify: belum ada subscriber.");
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const msgFor = (c) => ({
    title: `Kode ${c.gameName} baru!`,
    body: c.reward ? `${c.code} — ${c.reward}` : c.code,
    url: c.platform === "roblox" ? `${SITE_URL}/id/roblox/${c.gameSlug}` : `${SITE_URL}/id/game/${c.game}`,
    tag: `kodegg-${c.code}`,
  });

  let sent = 0;
  let pruned = 0;
  for (const entry of subs) {
    // Kompat: entri baru = {sub, games}; lama = subscription polos (→ semua game).
    const sub = entry && entry.sub ? entry.sub : entry;
    const games = Array.isArray(entry?.games) ? entry.games : [];
    const wantsAll = games.length === 0;

    // Kode yang relevan buat subscriber ini (sesuai pilihan game-nya).
    const mine = wantsAll ? codes : codes.filter((c) => games.includes(c.game));
    if (mine.length === 0) continue;

    const messages = mine.slice(0, MAX).map(msgFor);
    if (mine.length > MAX) {
      messages.push({
        title: "KodeGG",
        body: `+${mine.length - MAX} kode baru lainnya. Buka untuk lihat semua.`,
        url: `${SITE_URL}/id/kode-redeem`,
        tag: "kodegg-more",
      });
    }

    for (const m of messages) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(m));
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${SITE_URL}/api/subscribe`, {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          pruned += 1;
          break; // subscription mati → berhenti kirim ke sini
        }
      }
    }
  }
  console.log(`push-notify: ${sent} notifikasi terkirim, ${pruned} subscription mati dihapus (${subs.length} subscriber, ${codes.length} kode baru).`);
}

main().catch((e) => {
  console.error("push-notify error:", e.message);
  process.exit(0); // jangan gagalkan Actions karena notifikasi
});
