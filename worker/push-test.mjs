// KodeGG — kirim SATU notifikasi UJI ke semua subscriber (untuk menguji rantai
// push tanpa menunggu kode baru asli). Dipicu manual dari GitHub Actions
// (workflow_dispatch input test_push). Env sama seperti push-notify.mjs.

import webpush from "web-push";

const {
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  VAPID_SUBJECT = "mailto:admin@kodegg.com",
  PUSH_SECRET,
  SITE_URL = "https://kodegg.com",
} = process.env;

async function main() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !PUSH_SECRET) {
    console.log("push-test: VAPID/PUSH_SECRET belum lengkap.");
    return;
  }
  const res = await fetch(`${SITE_URL}/api/list`, { headers: { authorization: `Bearer ${PUSH_SECRET}` } });
  if (!res.ok) {
    console.log(`push-test: gagal ambil subscription (HTTP ${res.status}).`);
    return;
  }
  const subs = await res.json();
  if (!subs.length) {
    console.log("push-test: belum ada subscriber — klik lonceng di situs dulu.");
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const msg = JSON.stringify({
    title: "KodeGG — Tes notifikasi ✅",
    body: "Mantap! Notifikasi kode baru sudah aktif. Ini cuma pesan uji.",
    url: `${SITE_URL}/id/kode-redeem`,
    tag: "kodegg-test",
  });

  let sent = 0;
  let pruned = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, msg);
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await fetch(`${SITE_URL}/api/subscribe`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        pruned += 1;
      } else {
        console.log(`push-test: error ${err.statusCode ?? "?"} — ${err.message}`);
      }
    }
  }
  console.log(`push-test: ${sent} terkirim, ${pruned} sub mati dihapus (${subs.length} subscriber).`);
}

main().catch((e) => {
  console.error("push-test error:", e.message);
  process.exit(0);
});
