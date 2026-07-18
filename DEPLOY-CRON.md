# Setup Cloudflare Cron (trigger andal tiap jam)

Cron GitHub sering ditunda/di-drop (sempat 6 jam kosong). Worker Cloudflare ini
memicu workflow `update-codes` **tiap jam presisi** lewat GitHub API. Kode Worker:
`cron/worker.js`.

## 1. Buat GitHub token (fine-grained)
GitHub → **Settings** (akun) → **Developer settings** → **Personal access tokens**
→ **Fine-grained tokens** → **Generate new token**:
- **Token name**: `kodegg-cron`
- **Resource owner**: henryhaseo6
- **Repository access**: **Only select repositories** → **kodegg**
- **Permissions** → **Repository permissions** → **Actions** → **Read and write**
- **Expiration**: pilih (mis. 1 tahun — nanti perpanjang saat kedaluwarsa)
- **Generate token** → **SALIN** token-nya (cuma muncul sekali)

## 2. Buat Worker
Cloudflare → **Workers & Pages** → **Create** → tab **Workers** → **Create Worker**:
- Nama: `kodegg-cron` → **Deploy** (deploy default dulu)
- **Edit code** → hapus semua → tempel isi `cron/worker.js` → **Deploy**

## 3. Set variabel & secret Worker
Worker `kodegg-cron` → **Settings** → **Variables and Secrets** → **Add**:
| Type | Name | Value |
|------|------|-------|
| Secret | `GITHUB_TOKEN` | token GitHub dari langkah 1 |
| Text | `GH_REPO` | `henryhaseo6/kodegg` |
| Text | `GH_WORKFLOW` | `update-codes.yml` |
| Secret | `TRIGGER_KEY` | string acak (opsional, utk uji manual) |

**Deploy** ulang biar variabel kepasang.

## 4. Pasang Cron Trigger
Worker `kodegg-cron` → **Settings** → **Triggers** (atau **Trigger Events**) →
**Cron Triggers** → **Add Cron Trigger** → isi: **`0 * * * *`** (tiap jam) → **Add**.

## 5. Uji
- Manual via URL (kalau set TRIGGER_KEY): buka
  `https://kodegg-cron.<subdomain>.workers.dev/?key=<TRIGGER_KEY>` → balas `dispatched ✓`
- Cek GitHub → **Actions** → **update-codes** → harus muncul run baru dgn actor
  workflow (bukan "Scheduled") tiap jam.
- Cek log Worker: Worker → **Logs** → `kodegg-cron: dispatched ✓`.

## Setelah cron CF jalan
Kurangi/hapus jadwal cron di GitHub (`.github/workflows/update-codes.yml`) agar
tak dobel-jalan (boros menit Actions). Biarkan `workflow_dispatch` tetap ada
(itu yang dipanggil Worker + tombol manual).

## Catatan
- Token fine-grained **kedaluwarsa** — perpanjang sebelum habis, atau notif/update
  berhenti. Set kalender pengingat.
- Cron CF gratis di plan Workers Free (100k req/hari lebih dari cukup).
