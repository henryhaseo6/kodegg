// Renderer video LANDSCAPE per-game — 1920x1080, 30fps, ~45 detik.
//
// Kenapa ada, padahal Shorts jauh lebih laku (median 38 view vs 19). Karena
// pembandingnya keliru: video landscape kita selama ini AGREGAT ("New Roblox
// Codes — AUGUST 4, 100 Codes, 57 Games") dan tak ada yang mencari judul begitu.
// Sementara analytics 8 Agu 2026 menunjukkan penonton kita menonton video
// landscape PER-GAME milik kreator lain dengan 26–88 ribu view, semuanya tentang
// game yang Shorts kita sendiri sudah menang di dalamnya (Drag Drive Simulator).
// Jadi yang belum diuji bukan "landscape vs vertikal", melainkan landscape yang
// judulnya cocok dengan yang orang ketik.
//
// SENGAJA BUKAN VERSI MELAR DARI YANG VERTIKAL. Rasio 16:9 memberi ruang
// horizontal yang tak dimiliki 9:16, dan menyusun ulang komposisinya itulah
// gunanya:
//   - rel kiri TETAP (ikon besar, nama, jumlah pemain, jumlah kode) sebagai
//     jangkar identitas — di vertikal ini jadi header yang tergulung pergi
//   - daftar kode di kanan muncul BERURUTAN, satu baris per kode, dengan reward
//     terbaca penuh; muat 6 kode, bukan 4
//   - strip cara-redeem di bawah, yang di vertikal tak pernah kebagian ruang
//   - durasi 45 detik, bukan 21 — video landscape dinilai YouTube lewat watch
//     time, dan 21 detik terlalu pendek untuk bersaing di hasil pencarian
//
// Audio dimux terpisah seperti render-short (renderer ini menghasilkan MP4 bisu).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { ffmpegBin } from "./render-short.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, "../../site/scripts/ogfonts");

let _cv;
async function canvasLib() {
  if (!_cv) {
    _cv = await import("@napi-rs/canvas");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-700.ttf"), "Grotesk");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-400.ttf"), "GroteskR");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceMono-Bold.ttf"), "Mono");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Twemoji.Mozilla.ttf"), "Emoji");
  }
  return _cv;
}
const SEG = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const W = 1920, H = 1080, FPS = 30;
const RAIL = 640; // lebar rel kiri
const C = { bg: "#090C12", surf: "#151B27", surf2: "#1B2331", txt: "#EEF1F6", muted: "#98A2B3", faint: "#7C8798", acc: "#CBFF46", acc2: "#8B6BFF", ok: "#37E38B", warn: "#FFB13C", ink: "#0B0E14" };

const clamp = (a, b, t) => Math.max(a, Math.min(b, t));
const inv = (a, b, t) => clamp(0, 1, (t - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function potong(ctx, teks, maxW) {
  if (ctx.measureText(teks).width <= maxW) return teks;
  const g = [...SEG.segment(teks)].map((s) => s.segment);
  let out = "";
  for (const ch of g) { if (ctx.measureText(out + ch + "…").width > maxW) break; out += ch; }
  return out + "…";
}
/**
 * Pilih ukuran font TERBESAR yang masih memuat teks utuh dalam maxW.
 *
 * Dipakai untuk KODE dan NAMA GAME, dan alasannya beda dari sekadar rapi:
 * memotong kode dengan elipsis membuat videonya TAK BERGUNA — penonton datang
 * untuk menyalin kodenya, dan "DELAYXIXIORDERANDOU…" tak bisa disalin. Jadi di
 * sini teks mengecil sampai muat, tak pernah dipotong. Kode Roblox terpanjang
 * di katalog 30 karakter, dan pada lantai 26px pun masih terbaca di 1080p.
 */
function fontMuat(ctx, teks, maxW, { berat = "700", min, maks, keluarga }) {
  for (let s = maks; s >= min; s -= 2) {
    ctx.font = `${berat} ${s}px ${keluarga}`;
    if (ctx.measureText(teks).width <= maxW) return s;
  }
  ctx.font = `${berat} ${min}px ${keluarga}`;
  return min;
}
function gambarIkon(ctx, img, x, y, size, r) {
  ctx.save(); rr(ctx, x, y, size, size, r); ctx.clip();
  ctx.drawImage(img, x, y, size, size); ctx.restore();
}
function pil(ctx, x, y, teks, warna, bg, font = "700 26px Mono") {
  ctx.font = font;
  const w = ctx.measureText(teks).width + 34, h = 46;
  rr(ctx, x, y, w, h, 23); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = warna; ctx.textBaseline = "middle"; ctx.fillText(teks, x + 17, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}
function logo(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  rr(ctx, 0, 0, 64, 64, 16); ctx.fillStyle = C.acc; ctx.fill();
  ctx.font = "800 36px Grotesk"; ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("GG", 32, 34);
  ctx.textAlign = "left"; ctx.font = "800 40px Grotesk"; ctx.fillStyle = C.txt;
  ctx.fillText("KODE", 80, 34); const wk = ctx.measureText("KODE").width;
  ctx.fillStyle = C.acc; ctx.fillText("GG", 80 + wk + 4, 34);
  ctx.textBaseline = "alphabetic"; ctx.restore();
}
// Latar: gelap rata + cahaya lembut di kiri (mengikat mata ke rel identitas)
// dan garis vertikal tipis pemisah — bukan gradien penuh seperti versi vertikal,
// supaya daftar kode di kanan tetap kontras tinggi saat dibaca di layar besar.
function latar(ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(RAIL * 0.45, H * 0.34, 40, RAIL * 0.45, H * 0.34, 820);
  g.addColorStop(0, "rgba(139,107,255,0.16)"); g.addColorStop(1, "rgba(139,107,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, RAIL + 240, H);
  ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(RAIL, 78, 2, H - 156);
}

function fmtWIB(d) {
  const f = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return f.format(d).replace(/\./g, ":") + " WIB";
}
const fmtPemain = (n) => (n >= 1000 ? Math.round(n / 1000) + "K" : String(n));

/**
 * @param {{name, platform, players}} game
 * @param {{code, reward, isNew}[]} codes
 * @param {number} activeCount  total kode aktif (utk "+N lagi")
 * @param {string} iconPath     ikon game (PNG)
 * @param {string} outPath      MP4 keluaran (bisu)
 */
export async function renderWide({ game, codes, activeCount, fetchedAt, iconPath, outPath, howTo = null }) {
  const { createCanvas, loadImage } = await canvasLib();
  const ikon = iconPath && existsSync(iconPath) ? await loadImage(iconPath) : null;
  const MAKS = 6;
  const KODE = (codes ?? []).slice(0, MAKS);
  const nAktif = activeCount ?? KODE.length;
  const sisa = Math.max(0, nAktif - KODE.length);
  const stamp = fmtWIB(fetchedAt ? new Date(fetchedAt) : new Date());
  const DUR = 45, N = DUR * FPS;

  // Jadwal munculnya baris kode: mulai 2,4 detik, satu baris tiap 0,85 detik.
  // Cukup lambat untuk dibaca dan disalin, cukup cepat agar 6 kode selesai
  // sebelum detik 8 — sisanya waktu diam supaya penonton bisa menjeda.
  const MULAI = 2.4, JEDA = 0.85;

  function relKiri(ctx, t) {
    const a = easeOut(inv(0.15, 0.95, t));
    ctx.globalAlpha = a;
    const x = 78, geser = (1 - a) * 26;
    logo(ctx, x, 74 - geser, 0.9);

    const S = 208;
    if (ikon) gambarIkon(ctx, ikon, x, 210 - geser, S, 38);
    else { rr(ctx, x, 210 - geser, S, S, 38); ctx.fillStyle = C.surf; ctx.fill(); }

    ctx.textAlign = "left";
    // Nama game mengecil sampai muat, tak dipotong — nama yang terpenggal
    // membuat penonton ragu ini video game yang benar atau bukan.
    ctx.fillStyle = C.txt;
    fontMuat(ctx, game.name, RAIL - 120, { berat: "800", min: 34, maks: 62, keluarga: "Grotesk" });
    ctx.fillText(game.name, x, 500 - geser);

    ctx.font = "700 34px Grotesk"; ctx.fillStyle = C.acc;
    ctx.fillText("KODE REDEEM", x, 552 - geser);

    let py = 604 - geser;
    const wp = pil(ctx, x, py, game.platform === "ROBLOX" ? "ROBLOX" : "GAME", C.acc2, "rgba(139,107,255,0.14)");
    if (game.players) pil(ctx, x + wp + 14, py, fmtPemain(game.players) + " pemain", C.muted, "rgba(255,255,255,0.06)");

    // Angka besar = janji isi video. Di vertikal ini cuma baris kecil; di sini
    // ia punya ruang untuk jadi alasan orang berhenti scroll.
    ctx.font = "800 108px Grotesk"; ctx.fillStyle = C.txt;
    ctx.fillText(String(nAktif), x, 792 - geser);
    const wn = ctx.measureText(String(nAktif)).width;
    ctx.font = "700 36px Grotesk"; ctx.fillStyle = C.muted;
    ctx.fillText("kode aktif", x + wn + 18, 792 - geser);

    ctx.font = "400 27px GroteskR"; ctx.fillStyle = C.faint;
    ctx.fillText("Update terakhir " + stamp, x, 846 - geser);

    ctx.font = "700 31px Mono"; ctx.fillStyle = C.acc;
    ctx.fillText("kodegg.com", x, 946 - geser);
    ctx.globalAlpha = 1;
  }

  function barisKode(ctx, t) {
    const x0 = RAIL + 74, lebar = W - x0 - 78;
    ctx.textAlign = "left";
    ctx.font = "700 30px Grotesk"; ctx.fillStyle = C.muted;
    ctx.globalAlpha = easeOut(inv(1.4, 2.1, t));
    ctx.fillText("SALIN KODENYA — case-sensitive, tulis PERSIS", x0, 132);
    ctx.globalAlpha = 1;

    // Tinggi baris dihitung mundur dari batas strip cara-redeem: 6 baris x 126px
    // (versi pertama) berakhir di y=934 sementara strip mulai y=928 — bertabrakan,
    // dan baris "+N kode lagi" tertimpa. Sekarang 110px, menyisakan ruang tenang
    // untuk keduanya tanpa mengecilkan teks kodenya.
    const TB = 96, GAP = 14;
    KODE.forEach((c, i) => {
      const mulai = MULAI + i * JEDA;
      const a = easeOut(inv(mulai, mulai + 0.55, t));
      if (a <= 0.01) return;
      const y = 178 + i * (TB + GAP), geser = (1 - a) * 54;
      ctx.globalAlpha = a;
      rr(ctx, x0 + geser, y, lebar, TB, 20);
      ctx.fillStyle = C.surf; ctx.fill();
      ctx.strokeStyle = c.isNew ? "rgba(203,255,70,0.5)" : "rgba(255,255,255,0.07)";
      ctx.lineWidth = 2; ctx.stroke();

      // Pita aksen kiri: penanda urutan tanpa perlu nomor — di layar lebar,
      // deretan pita membentuk ritme baca yang tak butuh label tambahan.
      rr(ctx, x0 + geser + 1, y + 1, 7, TB - 2, 4);
      ctx.fillStyle = c.isNew ? C.acc : C.acc2; ctx.fill();

      // Ruang kode dihitung dari lebar baris DIKURANGI badge "BARU" — bukan
      // pecahan tetap. Versi pertama memakai lebar*0.52 dan kode 30 karakter
      // terpenggal jadi "DELAYXIXIORDERANDOU…", yang membuat videonya sia-sia:
      // penonton datang untuk MENYALIN kodenya.
      const ruangBadge = c.isNew ? 130 : 30;
      const maksKode = lebar - 38 - ruangBadge - 24;
      ctx.fillStyle = C.txt;
      fontMuat(ctx, c.code, maksKode, { berat: "700", min: 26, maks: 46, keluarga: "Mono" });
      ctx.fillText(c.code, x0 + geser + 38, y + (c.reward ? 50 : 68));

      if (c.reward) {
        ctx.font = "400 27px GroteskR"; ctx.fillStyle = C.muted;
        ctx.fillText(potong(ctx, c.reward, maksKode), x0 + geser + 38, y + 86);
      }
      if (c.isNew) {
        ctx.font = "800 24px Grotesk";
        const tw = ctx.measureText("BARU").width + 30;
        rr(ctx, x0 + geser + lebar - tw - 26, y + 24, tw, 40, 20);
        ctx.fillStyle = "rgba(203,255,70,0.16)"; ctx.fill();
        ctx.fillStyle = C.acc; ctx.textBaseline = "middle";
        ctx.fillText("BARU", x0 + geser + lebar - tw - 11, y + 45);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
    });

    if (sisa > 0) {
      const a = easeOut(inv(MULAI + KODE.length * JEDA, MULAI + KODE.length * JEDA + 0.5, t));
      if (a > 0.01) {
        ctx.globalAlpha = a; ctx.font = "700 32px Grotesk"; ctx.fillStyle = C.acc;
        ctx.fillText("+ " + sisa + " kode lagi di kodegg.com", x0, Math.min(178 + KODE.length * (TB + GAP) + 44, H - 196));
        ctx.globalAlpha = 1;
      }
    }
  }

  // Strip cara-redeem: keunggulan nyata format lebar. Di 9:16 tak ada ruang
  // untuk ini tanpa mengorbankan kartu kode, padahal "cara pakainya gimana"
  // adalah pertanyaan kedua penonton setelah "kodenya apa".
  function stripRedeem(ctx, t) {
    const a = easeOut(inv(9.2, 10.0, t));
    if (a <= 0.01) return;
    const langkah = howTo?.length ? howTo.slice(0, 3) : ["Buka game di Roblox", "Cari tombol Codes", "Tempel kode → Redeem"];
    const y = H - 152, x0 = RAIL + 74, lebar = W - x0 - 78;
    ctx.globalAlpha = a * 0.98;
    rr(ctx, x0, y, lebar, 104, 18); ctx.fillStyle = C.surf2; ctx.fill();
    const kolom = lebar / langkah.length;
    langkah.forEach((s, i) => {
      const cx = x0 + i * kolom + 30;
      ctx.beginPath(); ctx.arc(cx + 17, y + 52, 17, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(203,255,70,0.15)"; ctx.fill();
      ctx.font = "800 22px Mono"; ctx.fillStyle = C.acc; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), cx + 17, y + 53);
      ctx.textAlign = "left"; ctx.font = "400 25px GroteskR"; ctx.fillStyle = C.muted;
      ctx.fillText(potong(ctx, s, kolom - 90), cx + 48, y + 53);
      ctx.textBaseline = "alphabetic";
    });
    ctx.globalAlpha = 1;
  }

  function frame(ctx, t) {
    latar(ctx);
    relKiri(ctx, t);
    barisKode(ctx, t);
    stripRedeem(ctx, t);
  }

  const ff = spawn(ffmpegBin(), ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath], { stdio: ["pipe", "ignore", "ignore"] });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  for (let f = 0; f < N; f++) {
    frame(ctx, f / FPS);
    const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  return outPath;
}
