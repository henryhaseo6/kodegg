# Auto-post video YouTube (Shorts) — setup

Sistem ini otomatis bikin **YouTube Short** tiap ada **kode baru** (maks **3/hari**,
prioritas game populer, di-upload **Unlisted** dulu biar bisa direview) dan jalan di
GitHub Actions setelah fetch tiap jam.

Kamu cuma perlu **setup kredensial YouTube API SEKALI**. Ikuti langkah ini.

---

## 1. Google Cloud project + YouTube API

1. Buka <https://console.cloud.google.com/> → buat **project baru** (mis. "KodeGG Video").
2. **APIs & Services → Library** → cari **"YouTube Data API v3"** → **Enable**.

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen** → tipe **External** → Create.
2. Isi App name (mis. "KodeGG"), email support, email developer. Save.
3. **Scopes** → boleh dilewati (kita minta scope lewat kode).
4. **Test users** → **Add users** → masukkan **email Google yang punya channel YouTube-mu**.
   (Selama app "Testing", cuma test user yang bisa dipakai — itu cukup, gak perlu publish.)

## 3. OAuth Client ID (Desktop)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app** → Create.
3. Catat **Client ID** dan **Client secret**.

## 4. Generate refresh token (lokal, sekali)

Di komputermu (butuh Node + paket `googleapis`):

```bash
cd worker
npm install googleapis --no-save
# ganti xxx/yyy dengan Client ID & Secret dari langkah 3:
YT_CLIENT_ID=xxx YT_CLIENT_SECRET=yyy node video/gen-token.mjs
```

- Buka URL yang tampil → **login pakai akun channel YouTube-mu** → izinkan.
- Setelah diarahkan ke `localhost:5388`, **refresh token** tercetak di terminal.
- Kalau refresh token kosong: buka <https://myaccount.google.com/permissions>, cabut akses app-nya, lalu ulang.

## 5. Set GitHub Secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Isi |
|---|---|
| `YT_CLIENT_ID` | Client ID (langkah 3) |
| `YT_CLIENT_SECRET` | Client secret (langkah 3) |
| `YT_REFRESH_TOKEN` | refresh token (langkah 4) |

(Opsional, tab **Variables**: `YT_PRIVACY` = `unlisted`/`public`, `VIDEO_MAX_PER_DAY` = `3`.)

## 6. Selesai

Mulai run berikutnya, tiap ada kode baru → video otomatis ke-render & upload **Unlisted**.
Review di **YouTube Studio → Content**, kalau bagus tinggal jadiin **Public**.

---

## Catatan penting

- **Quota**: default YouTube API = ~**6 upload/hari**. Sistem dibatasi 3/hari (aman). Kalau
  mau lebih, ajukan quota increase di Google Cloud.
- **Ganti ke Public otomatis**: ubah Variable `YT_PRIVACY` = `public`.
- **Preview tanpa upload** (tes lokal): `DRY_RUN=1 node worker/make-videos.mjs` → video ke
  folder `_video-review/` (butuh `new-*-codes.json` berisi kode + paket canvas/ffmpeg/edge-tts).
- **Suara**: butuh `edge-tts` (Python) — di-install otomatis di Actions.
- File state: `worker/data/video-state.json` (dedup + hitung harian, di-commit).
