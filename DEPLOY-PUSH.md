# Setup Notifikasi Push "Kode Baru"

Fitur ini **dormant** sampai langkah di bawah selesai — sebelum itu, tombol lonceng
tidak muncul & worker push melewati dirinya sendiri (tidak error).

## Arsitektur (kenapa aman)

Kripto Web Push (VAPID + enkripsi) ditangani library **`web-push` (Node) di GitHub
Actions** — battle-tested. Cloudflare cuma menyimpan subscription di **KV** (tanpa kripto).

```
User klik lonceng → izin → subscribe
   → POST /api/subscribe  → simpan di KV (Pages Function)
[tiap jam] Actions: fetch-codes tulis new-codes.json (kode baru run ini)
   → push-notify.mjs ambil subs dari GET /api/list (Bearer PUSH_SECRET)
   → web-push kirim notifikasi; subscription mati (404/410) dihapus
```

---

## Langkah setup (sekali)

### 1. Generate VAPID keys
Di komputermu:
```bash
npx web-push generate-vapid-keys
```
Simpan `Public Key` & `Private Key`. **Jangan pakai punya orang lain / contoh.**

### 2. Buat KV namespace (Cloudflare)
Dashboard → **Workers & Pages** → **KV** → **Create namespace** → nama mis. `kodegg-subs`.

### 3. Bind KV ke project Pages
Project **kodegg** → **Settings** → **Functions** → **KV namespace bindings** → **Add**:
- Variable name: **`SUBS`**
- KV namespace: `kodegg-subs`

### 4. Set Environment Variables di project Pages
Project **kodegg** → **Settings** → **Environment variables** → **Production** (Add):
| Name | Value |
|------|-------|
| `PUBLIC_VAPID_KEY` | VAPID **public** key (dipakai saat build → memunculkan lonceng) |
| `PUSH_SECRET` | string acak rahasia (mis. hasil `openssl rand -hex 24`) — melindungi `/api/list` |

### 5. Set GitHub Actions Secrets
Repo GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
| Name | Value |
|------|-------|
| `VAPID_PUBLIC` | VAPID public key (sama dgn #4) |
| `VAPID_PRIVATE` | VAPID **private** key (RAHASIA) |
| `VAPID_SUBJECT` | `mailto:emailkamu@contoh.com` |
| `PUSH_SECRET` | **sama persis** dengan `PUSH_SECRET` di #4 |

### 6. Redeploy
Cloudflare Pages → **Deployments** → **Retry deployment** (atau push commit apa saja).
Build ulang membakukan `PUBLIC_VAPID_KEY` → lonceng muncul + Functions aktif.

---

## Verifikasi

1. **Functions hidup**: buka `https://kodegg.com/api/subscribe` di browser → harus balas
   *"bad json"/"KV..."* (metode salah), **bukan 404**. Kalau 404, Functions belum ke-deploy
   (cek folder `functions/` ikut ter-deploy; root directory Pages = `/`).
2. **Lonceng muncul** di header (kalau tidak: `PUBLIC_VAPID_KEY` belum ke-build, redeploy).
3. **Subscribe**: klik lonceng → *Allow* → lonceng jadi lime. Cek KV namespace → ada key `sub:...`.
4. **Kirim uji**: tunggu kode baru masuk (Actions per jam) ATAU jalankan workflow manual
   (**Actions → update-codes → Run workflow**) setelah ada kode baru. Notifikasi muncul di device.
   - Lihat log step **"Kirim notifikasi push"** di Actions untuk `X notifikasi terkirim`.

## Catatan
- **iOS**: Web Push hanya jalan bila situs **di-install sebagai PWA** (Add to Home Screen),
  iOS 16.4+. Android/desktop Chrome: langsung dari browser.
- Notifikasi dibatasi **maks 3 kode** per run + 1 ringkasan (anti-spam). Ubah `MAX` di
  `worker/push-notify.mjs`.
- `PUSH_SECRET` di Cloudflare & GitHub **harus identik** — kalau beda, `/api/list` menolak
  (401) dan tak ada notifikasi terkirim.
