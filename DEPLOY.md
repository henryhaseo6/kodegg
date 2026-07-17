# Deploy KodeGG

Situs = statis (Astro SSG) → **Cloudflare Pages**. Data ditarik worker saat build,
lalu di-*rebuild* terjadwal supaya kode selalu segar.

```
[cron tiap ~1 jam]  →  Deploy Hook Cloudflare  →  build:
   node worker/fetch-codes.mjs   (tarik kode terbaru → worker/data/codes.json)
   cd site && npm run build       (render 2 bahasa jadi HTML statis)
                                  →  publish ke CDN Cloudflare
```

Kode kadaluarsa diarsipkan (tidak dihapus). Icon sudah ter-commit di
`site/public/assets/games/` — tak perlu ditarik tiap build.

---

## 1. Deploy pertama (Cloudflare Pages)

**Lewat dashboard (paling gampang, tak perlu CLI):**

1. Push repo ini ke GitHub (branch `main`).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pilih repo `kodegg`.
3. Isi **Build settings**:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `site/dist`
   - Root directory: `/` (biarkan)
   - Environment variable: `NODE_VERSION` = `20` (atau lebih tinggi)
4. **Save and Deploy**. Selesai — dapat URL `*.pages.dev`.

**Atau lewat CLI (wrangler):**

```bash
npm run build
npx wrangler pages deploy site/dist --project-name=kodegg
```
(perlu `npx wrangler login` sekali — buka browser, login akun Cloudflare-mu.)

---

## 2. Domain kodegg.com

Cloudflare Pages → project → **Custom domains** → **Set up a custom domain** →
`kodegg.com`. Kalau domain sudah di Cloudflare, SSL & DNS otomatis.

---

## 3. Auto-update kode (~tiap jam)

Sudah disiapkan: **`.github/workflows/update-codes.yml`**. Tiap jam GitHub Actions
menjalankan worker, **commit `worker/data/codes.json`**, lalu push. Karena
Cloudflare Pages (langkah 1) build otomatis tiap push, situs ikut ter-*rebuild*
dengan kode terbaru. Tak perlu deploy hook.

**Penting — kenapa commit, bukan sekadar rebuild:** `codes.json` harus bertahan
antar-build supaya:
- `firstSeenAt` tiap kode tetap → label "Terpantau N hari lalu" akurat,
- arsip kode kadaluarsa terus terakumulasi (jadi database).

Kalau tiap build mulai dari nol (mis. cuma ping deploy hook tanpa commit), kedua
hal itu kereset — semua kode selalu tampak "Terpantau hari ini".

Aktif otomatis begitu repo di-push ke GitHub (Actions jalan sendiri). Cek/menjalankan
manual: tab **Actions** → *update-codes* → *Run workflow*.

Cadence lain (event 3 jam, berita 30 mnt) menyusul saat fitur itu dibangun —
lihat `Cetak Biru Pipeline.dc.html`.

---

## 4. Cek sebelum deploy

```bash
npm run test     # 38 tes worker harus lulus
npm run build    # jalankan 5 worker + build 35 halaman → site/dist
npm run dev      # buka http://localhost:4321/id (beranda)
```

**Halaman yang dihasilkan (× 2 bahasa /id /en):** Beranda, Kode Redeem,
Jelajah Game, Event & Banner, Karakter/Tier, Berita, Favorit, Tentang, Kontak,
+ halaman per-game (8). Plus `sitemap.xml` & `robots.txt`.

**Worker data:** `fetch-codes` (kode), `fetch-catalog` (katalog game),
`fetch-news` (berita RSS), `fetch-events` (event/banner), `fetch-characters`
(database karakter). Semua dijalankan `build.mjs` saat build.
