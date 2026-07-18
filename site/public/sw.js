// Service worker KodeGG — installability PWA + offline dasar.
//
// Strategi:
//  - Navigasi (HTML): NETWORK-FIRST → selalu kode/berita terbaru saat online;
//    fallback ke cache (atau /id) saat offline.
//  - Aset statis same-origin (css/js/gambar/ikon): CACHE-FIRST → cepat & hemat.
//  - Lintas-origin (font CDN, gambar HoYo dsb): tidak diintersep.
// Naikkan versi CACHE saat strategi berubah untuk membuang cache lama.

const CACHE = "kodegg-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // biarkan lintas-origin apa adanya

  // Navigasi halaman → network-first.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/id"))),
    );
    return;
  }

  // Aset statis → cache-first, isi cache saat pertama kali.
  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached),
    ),
  );
});

// PUSH — tampilkan notifikasi kode baru. Payload dikirim worker (web-push).
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data && event.data.text() };
  }
  const title = d.title || "KodeGG";
  const options = {
    body: d.body || "",
    icon: "/assets/favicon-192.png",
    badge: "/assets/favicon-192.png",
    tag: d.tag || "kodegg-code",
    data: { url: d.url || "/id" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi → fokus tab yang sudah terbuka / buka tab baru ke URL-nya.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/id";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cls) => {
      for (const c of cls) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
