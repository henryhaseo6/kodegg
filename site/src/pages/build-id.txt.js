// Penanda build: SHA commit yang SEDANG di-deploy. Dipakai workflow update-codes
// untuk tahu kapan deploy sudah LIVE sebelum mengirim notifikasi "kode baru" —
// biar notif tak nyusul lebih dulu sebelum situs benar-benar terbarui.
// Cloudflare Pages menyetel CF_PAGES_COMMIT_SHA saat build; fallback GITHUB_SHA
// / "dev" (build lokal). Diakses di https://kodegg.com/build-id.txt
export function GET() {
  const sha = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || "dev").trim();
  return new Response(sha + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Jangan cache lama — workflow perlu baca nilai terbaru saat polling.
      "cache-control": "no-cache, max-age=0, must-revalidate",
    },
  });
}
