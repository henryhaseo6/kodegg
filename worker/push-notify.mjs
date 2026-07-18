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
    console.log("push-notify: new-codes.json tak ada — tak ada kode baru.");
    return;
  }
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

  const messages = codes.slice(0, MAX).map((c) => ({
    title: `Kode ${c.gameName} baru!`,
    body: c.reward ? `${c.code} — ${c.reward}` : c.code,
    url: `${SITE_URL}/id/game/${c.game}`,
    tag: `kodegg-${c.code}`,
  }));
  if (codes.length > MAX) {
    messages.push({
      title: "KodeGG",
      body: `+${codes.length - MAX} kode baru lainnya. Buka untuk lihat semua.`,
      url: `${SITE_URL}/id/kode-redeem`,
      tag: "kodegg-more",
    });
  }

  let sent = 0;
  let pruned = 0;
  for (const sub of subs) {
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
          break; // subscription mati → jangan kirim pesan lain ke sini
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
