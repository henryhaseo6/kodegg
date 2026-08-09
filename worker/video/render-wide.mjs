// Renderer video LANDSCAPE per-game, gaya roundup — 1920x1080, 30fps, maks 30 detik.
//
// Kenapa ada. Analytics 8 Agu 2026: penonton kita menonton video landscape
// PER-GAME milik kreator lain dengan 26–88 ribu view, semuanya tentang Drag Drive
// Simulator — game yang Shorts kita sendiri sudah menang di dalamnya (9.575).
// Video landscape KITA sudah ada tapi lemah (median 19 view) karena isinya
// AGREGAT: "New Roblox Codes — AUGUST 4, 100 Codes, 57 Games", judul yang tak
// seorang pun mencarinya. Yang belum diuji bukan "landscape vs vertikal",
// melainkan landscape yang judulnya cocok dengan yang orang ketik.
//
// EMPAT KEPUTUSAN BENTUK (arahan user, 8–9 Agu 2026):
//
//  1. LATAR BERGERAK dari ikon game, bukan bidang gelap diam. Ikon di-blur berat,
//     diperbesar, dan beberapa salinannya hanyut pelan dengan arah & kecepatan
//     berbeda. Ikon cuma 128px — dan justru itu tak masalah, karena yang dicari
//     kesan warna dan gerak, bukan detail. (Gambar OG situs sudah dicoba dan
//     DITOLAK: isinya kartu berdesain lengkap dengan logo & teks sendiri, yang
//     akan bertabrakan dengan tulisan video.)
//
//  2. INTRO ala roundup: judul Anton yang melompat masuk, sub-judul DIKETIK, lalu
//     stempel yang menghantam dengan gelombang kejut. Ini bahasa visual yang
//     sudah dipakai kanal, jadi video baru tak terasa datang dari kanal lain.
//
//  3. KODE DIKETIK, bukan muncul jadi. Kecepatannya sengaja SEDANG (~11 huruf per
//     detik): cukup cepat agar tak membosankan, cukup lambat agar mata sempat
//     mengikuti tiap huruf — dan kode Roblox case-sensitive, jadi "mengikuti tiap
//     huruf" itu bukan hiasan.
//
//  4. MAKSIMAL 2 KODE per adegan dan MAKSIMAL 30 DETIK. Batas durasi menang atas
//     keinginan memajang lebih banyak kode; sisanya diarahkan ke situs.
//
// Audio: synthMusic + whoosh/stamp/chime, sama palet dengan roundup. VO opsional
// memakai voScript yang SAMA dengan Shorts — dan skrip itu TIDAK membacakan
// kodenya, karena TTS mengeja "DELAYXIXIORDERANDOUBLE" cuma jadi bunyi yang tak
// bisa dipahami. Tugas VO membingkai, bukan mendiktekan.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { synthMusic } from "./music.mjs";
const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, "../../site/scripts/ogfonts");
export function ffmpegBin() { if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH; try { return require("@ffmpeg-installer/ffmpeg").path; } catch { return "ffmpeg"; } }

let _cv;
async function canvasLib() {
  if (!_cv) {
    _cv = await import("@napi-rs/canvas");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-700.ttf"), "Grotesk");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceGrotesk-400.ttf"), "GroteskR");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "SpaceMono-Bold.ttf"), "Mono");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Anton-Regular.ttf"), "Rank");
    _cv.GlobalFonts.registerFromPath(resolve(FONTS, "Twemoji.Mozilla.ttf"), "Emoji");
  }
  return _cv;
}
const SEG = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const W = 1920, H = 1080, FPS = 30, SR = 44100;
const C = { bg: "#090C12", surf: "rgba(21,27,39,0.82)", txt: "#EEF1F6", muted: "#A6AFBF", faint: "#818B9C", acc: "#CBFF46", acc2: "#8B6BFF", red: "#FF3355", ink: "#0B0E14", limeSoft: "#E7FFB0", ungu: "#8B6BFF", unguSoft: "#C3B6FF", biru: "#5EC8FF", biruSoft: "#BCE6FF" };

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const inv = (a, b, t) => clamp((t - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const outBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function pop(ctx, t, x, y, fill, sw = 8) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 15; ctx.shadowOffsetY = 6;
  ctx.lineWidth = sw; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(9,12,18,0.92)"; ctx.strokeText(t, x, y);
  ctx.shadowColor = "transparent"; ctx.fillStyle = fill; ctx.fillText(t, x, y); ctx.restore();
}
function ring(ctx, cx, cy, r, w, color, a) {
  if (a <= 0.01 || r <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, w);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.restore();
}
function fitR(ctx, t, mw, base, min) { let f = base; while (f > min) { ctx.font = `${f}px Rank`; if (ctx.measureText(t).width <= mw) break; f -= 3; } return f; }
function fontMuat(ctx, teks, maxW, { berat = "700", min, maks, keluarga }) {
  for (let s = maks; s >= min; s -= 2) { ctx.font = `${berat} ${s}px ${keluarga}`; if (ctx.measureText(teks).width <= maxW) return s; }
  ctx.font = `${berat} ${min}px ${keluarga}`; return min;
}
function potong(ctx, teks, maxW) {
  if (ctx.measureText(teks).width <= maxW) return teks;
  const g = [...SEG.segment(teks)].map((s) => s.segment); let out = "";
  for (const ch of g) { if (ctx.measureText(out + ch + "…").width > maxW) break; out += ch; }
  return out + "…";
}
function ikonBulat(ctx, img, x, y, size, r) { ctx.save(); rr(ctx, x, y, size, size, r); ctx.clip(); ctx.drawImage(img, x, y, size, size); ctx.restore(); }
function logoGG(ctx, x, y, s = 1, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s);
  rr(ctx, 0, 0, 64, 64, 16); ctx.fillStyle = C.acc; ctx.fill();
  ctx.font = "800 36px Grotesk"; ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GG", 32, 34);
  ctx.textAlign = "left"; ctx.font = "800 40px Grotesk"; ctx.fillStyle = C.txt; ctx.fillText("KODE", 80, 34);
  const wk = ctx.measureText("KODE").width; ctx.fillStyle = C.acc; ctx.fillText("GG", 80 + wk + 4, 34);
  ctx.textBaseline = "alphabetic"; ctx.restore();
}
function drawBell(ctx, cx, cy, s, warna, rot = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(s / 100, s / 100);
  ctx.strokeStyle = warna; ctx.lineWidth = 9; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-30, 22); ctx.quadraticCurveTo(-30, -26, 0, -32); ctx.quadraticCurveTo(30, -26, 30, 22); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-38, 26); ctx.lineTo(38, 26); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 36, 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
/**
 * Teks DWIBAHASA: baris Indonesia di atas, Inggris lebih kecil & redup di
 * bawahnya. Pola yang sama dengan render-short, jadi kanal terbaca satu suara.
 *
 * Urutannya sengaja ID dulu: 86,6% penonton kanal ini dari Indonesia dan 7,4%
 * dari Malaysia (analytics 1 Agu 2026), jadi bahasa utama harus yang dipakai
 * mayoritas. Baris EN bukan sekadar sopan-santun — ia membuat sisa penonton
 * tetap terlayani DAN memberi YouTube teks berbahasa Inggris untuk memahami
 * isi video, yang menolong video ini muncul di pencarian non-Indonesia.
 *
 * Jarak antar-baris diskalakan dari ukuran font supaya baris EN tak menabrak
 * ekor huruf 'g/p/y' di baris ID pada teks besar.
 */
function bi(ctx, id, en, x, y, { idFont, enFont, idColor = C.txt, enColor = C.faint, gap, tebal = 0 } = {}) {
  const px = (f) => Number(/(\d+)px/.exec(f)?.[1] || 32);
  const dy = gap ?? Math.round(0.34 * px(idFont) + 0.98 * px(enFont));
  ctx.font = idFont;
  if (tebal) pop(ctx, id, x, y, idColor, tebal); else { ctx.fillStyle = idColor; ctx.fillText(id, x, y); }
  ctx.font = enFont; ctx.fillStyle = enColor; ctx.fillText(en, x, y + dy);
  return dy;
}

function fmtWIB(d) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d).replace(/\./g, ":") + " WIB";
}
const fmtPemain = (n) => (n >= 1000 ? Math.round(n / 1000) + "K" : String(n));
const nf = (v) => { v = Math.round(v); return v >= 1000 ? (v / 1000).toFixed(1) + "K" : String(v); };

// synthSeries SENGAJA DIHAPUS dari sini (9 Agu 2026).
//
// Ia mengarang bentuk grafik dari jumlah pemain sekarang memakai kurva harian
// umum. Untuk sekadar hiasan latar itu tak apa — tapi begitu turunannya dipajang
// sebagai "PEAK PLAYERS 53.7K", angka karangan berhenti jadi hiasan dan mulai
// jadi KLAIM. Video kode kita sudah menegakkan aturan keras soal itu (kode yang
// terbukti mati diarsipkan, langkah redeem diverifikasi dengan membuka gamenya),
// dan statistik tak boleh jadi pengecualian.
//
// Data nyata dibaca lewat src/player-series.mjs — pengukuran 10 menit sekali
// yang sudah kita kumpulkan sejak 26 Jul. Tanpa data, pita statistik TIDAK
// digambar sama sekali: ruang kosong lebih jujur daripada angka yang direka.

// SFX sepalet roundup.
function sfxSamples(events, durSec) {
  const buf = new Float32Array(Math.ceil(durSec * SR));
  const tone = (t, f1, dur, amp, decay, f2 = null, tri = false) => {
    const s0 = Math.floor(t * SR), n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) { const k = s0 + i; if (k < 0 || k >= buf.length) continue; const ph = i / SR, f = f2 == null ? f1 : f1 + (f2 - f1) * (i / n); let s = Math.sin(2 * Math.PI * f * ph); if (tri) s = (2 / Math.PI) * Math.asin(s); buf[k] += s * amp * Math.exp(-ph * decay); }
  };
  const noise = (t, dur, amp, decay = false) => {
    const s0 = Math.floor(t * SR), n = Math.floor(dur * SR); let prev = 0;
    for (let i = 0; i < n; i++) { const k = s0 + i; if (k < 0 || k >= buf.length) continue; const x = i / n, env = decay ? Math.exp(-x * 6) : Math.sin(Math.PI * x); prev = prev * 0.6 + (Math.random() * 2 - 1) * 0.4; buf[k] += prev * amp * env; }
  };
  const SFX = {
    stamp: (t) => { tone(t - 0.05, 800, 0.03, 0.24, 45, null, true); tone(t, 165, 0.32, 0.9, 13, 44); noise(t, 0.05, 0.34, true); },
    whoosh: (t) => { noise(t, 0.4, 0.15); tone(t, 300, 0.3, 0.05, 5, 900); },
    tik: (t) => { tone(t, 1750, 0.016, 0.05, 90, null, true); },
    chime: (t) => { tone(t, 784, 0.5, 0.2, 5); tone(t, 1046.5, 0.5, 0.14, 5.5); tone(t, 1568, 0.4, 0.07, 7); },
    subup: (t) => { tone(t, 660, 0.12, 0.19, 10); tone(t + 0.12, 880, 0.18, 0.19, 8); },
  };
  for (const e of events) (SFX[e.k] || (() => {}))(e.t);
  return buf;
}
function wavMono(mix) {
  let peak = 0; for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const gg = peak > 0.95 ? 0.95 / peak : 1, N = mix.length, b = Buffer.alloc(44 + N * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + N * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) b.writeInt16LE(Math.round(clamp(mix[i] * gg, -1, 1) * 32767), 44 + i * 2);
  return b;
}

export async function renderWide({ game, codes, activeCount, fetchedAt, iconPath, outPath, voPath = null, music = true, sfx = true, series = null, media = null }) {
  const { createCanvas, loadImage } = await canvasLib();
  const ikon = iconPath && existsSync(iconPath) ? await loadImage(iconPath) : null;
  // media datang sebagai Buffer PNG dari src/game-media.mjs; dimuat di sini
  // supaya pemanggil tak perlu tahu apa-apa soal canvas.
  const mediaImg = [];
  for (const buf of media ?? []) { try { mediaImg.push(await loadImage(buf)); } catch {} }
  const nAktif = activeCount ?? (codes ?? []).length;
  const stamp = fmtWIB(fetchedAt ? new Date(fetchedAt) : new Date());
  const KETIK = 11; // huruf per detik — sengaja sedang, lihat catatan kepala berkas

  const PER = 2, INTRO = 4.0, TRT = 0.4, MAKS = 30;
  // Outro memanjang mengikuti jumlah kode yang direkap — sepuluh kode tak bisa
  // dibaca dalam waktu yang sama dengan dua. Anggaran 30 detik memesan yang
  // TERPANJANG (OUTRO_MAKS) sejak awal, karena panjang outro baru diketahui
  // setelah `halaman` tersusun sementara penyusunannya butuh angka itu duluan.
  // Memesan yang terpanjang membuat videonya kadang selesai sedikit di bawah 30
  // detik; memesan yang terpendek akan melewatinya, dan batas itu keras.
  const OUTRO_MIN = 3.4, OUTRO_MAKS = 5.4;
  // Pita statistik HANYA tampil bila ada pengukuran nyata (lihat
  // src/player-series.mjs). Tanpa data, ia disembunyikan — bukan diisi kurva
  // karangan. Angka di layar dibaca penonton sebagai fakta, dan "PEAK PLAYERS
  // 53.7K" yang kita reka sendiri adalah kebohongan kecil yang tak sepadan.
  const deret = Array.isArray(series) && series.length >= 12 ? series : null;
  // Diisi setelah SEC tersusun; adegan memakainya lewat closure untuk menghitung
  // progres grafik terhadap SELURUH video.
  let total = 0;
  // Jendela tempat grafik BENAR-BENAR terlihat: dari saat pita muncul sampai
  // adegan kode terakhir berakhir. Bukan durasi video — intro & outro tak
  // memajang grafik, jadi menghitungnya membuat garis kehabisan waktu sebelum
  // ujung (dilaporkan user: berhenti di ~88%).
  let grafikMulai = 0, grafikAkhir = 0;
  // Durasi adegan mengikuti kode TERPANJANG di dalamnya: waktu ketik + waktu baca.
  // Adegan berisi kode 25 huruf butuh lebih lama daripada yang berisi 8 huruf,
  // dan mematoknya sama membuat yang panjang terasa terburu-buru.
  // Ketik BERURUTAN → durasi adegan = jumlah waktu ketik SEMUA kode di dalamnya
  // plus jeda antar-kode dan waktu baca di ekor. Rumus lama memakai kode
  // TERPANJANG saja, dan itu benar selagi kedua kode diketik bersamaan; begitu
  // berurutan, kode kedua akan terpotong di tengah pengetikan.
  const durAdegan = (list) => {
    let d = 0.38;
    for (const c of list) d += 0.30 + c.code.length / KETIK + 0.55;
    return clamp(d + 0.9, 4.5, 9.5);
  };
  const semua = [];
  for (let i = 0; i < (codes ?? []).length; i += PER) semua.push(codes.slice(i, i + PER));
  const halaman = [];
  let pakai = INTRO + OUTRO_MAKS;
  for (const h of semua) {
    const d = durAdegan(h);
    if (pakai + d - TRT > MAKS) break;
    halaman.push(h); pakai += d - TRT;
  }
  if (!halaman.length && semua.length) halaman.push(semua[0]);
  const ditampilkan = halaman.reduce((a, h) => a + h.length, 0);
  const sisa = Math.max(0, nAktif - ditampilkan);
  const rekap = halaman.flat();
  const OUTRO = clamp(OUTRO_MIN + rekap.length * 0.17, OUTRO_MIN, OUTRO_MAKS);

  // ── LATAR BERGERAK ────────────────────────────────────────────────────────
  // Empat salinan ikon, di-blur berat dan diperbesar, hanyut dengan kecepatan &
  // arah berbeda supaya polanya tak pernah berulang persis. Di atasnya vignette
  // dan lapis gelap tipis — tanpa itu, teks kode kehilangan kontras begitu
  // salinan terang lewat di belakangnya.
  // ── LATAR BERGERAK dari GAMBAR PROMOSI GAME ────────────────────────────
  // Bahannya bukan lagi ikon 128px, melainkan gambar carousel resmi game di
  // halaman Roblox-nya (768x432, sampai 8 buah): tangkapan gameplay, poster
  // update, banner event. Tiap game punya set berbeda, jadi latar tiap video
  // jadi khas tanpa kita merancang apa pun per-game.
  //
  // ACAK TIAP RENDER (arahan user). Ukuran, arah, kecepatan, sudut, putaran,
  // dan gambar mana yang dipakai semuanya diundi saat render dimulai — dua
  // video game yang sama, dirender dua kali, tak akan identik latarnya.
  //
  // Blur SEDANG (26px), bukan berat seperti versi ikon. Ikon 128px yang
  // diperbesar 8x memang harus di-blur habis supaya tak pecah; gambar 768px
  // tidak, jadi bentuknya masih bisa dikenali sebagai gamenya — dan itulah
  // gunanya memakai gambar asli, bukan noda warna.
  const bahan = mediaImg.length ? mediaImg : ikon ? [ikon] : [];
  const KEPING = bahan.length
    ? Array.from({ length: Math.min(6, Math.max(4, bahan.length)) }, (_, i) => {
        const r = () => Math.random();
        const arah = r() * Math.PI * 2, laju = 26 + r() * 46; // px per detik
        return {
          img: bahan[i % bahan.length],
          x: r() * W, y: r() * H,
          s: 520 + r() * 760,
          vx: Math.cos(arah) * laju, vy: Math.sin(arah) * laju,
          rot: (r() - 0.5) * 0.5, vr: (r() - 0.5) * 0.05,
          a: 0.30 + r() * 0.26,
        };
      })
    : [];

  function latar(ctx, t) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    for (const k of KEPING) {
      const w = k.s, h = w * 0.5625; // jaga rasio 16:9 gambar sumber
      // Bungkus melingkar dengan margin selebar kepingnya sendiri: yang keluar
      // di kanan masuk lagi dari kiri TANPA pernah muncul mendadak di tengah.
      const per = W + w * 2, pev = H + h * 2;
      const x = (((k.x + k.vx * t) % per) + per) % per - w;
      const y = (((k.y + k.vy * t) % pev) + pev) % pev - h;
      ctx.save(); ctx.globalAlpha = k.a; ctx.filter = "blur(26px)";
      ctx.translate(x + w / 2, y + h / 2); ctx.rotate(k.rot + k.vr * t);
      try { ctx.drawImage(k.img, -w / 2, -h / 2, w, h); } catch {}
      ctx.restore();
    }
    ctx.filter = "none";
    // Lapis gelap + vignette. Tanpa ini, keping terang yang lewat di belakang
    // kartu kode menghapus kontras teksnya persis saat orang membacanya.
    ctx.fillStyle = "rgba(9,12,18,0.30)"; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 1280);
    g.addColorStop(0, "rgba(9,12,18,0.10)"); g.addColorStop(1, "rgba(9,12,18,0.72)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function kepala(ctx, a = 1, gt = 0) {
    logoGG(ctx, 74, 62, 0.82, a);
    ctx.save(); ctx.globalAlpha = a * 0.9; ctx.textAlign = "right";
    ctx.font = "700 26px Mono"; ctx.fillStyle = C.faint; ctx.fillText("kodegg.com", W - 74, 106);
    ctx.restore(); ctx.textAlign = "left";

    // STEMPEL WAKTU BERDENYUT di tengah header.
    //
    // Kenapa ada: pita ini menjawab pertanyaan yang menentukan orang mau repot
    // menyalin kode atau tidak — "ini video kapan?". Sebelumnya jawabannya cuma
    // ada di intro (4 detik pertama, di kaki layar); penonton yang mulai
    // menonton dari tengah tak pernah melihatnya sama sekali.
    //
    // Titik yang berdenyut + cincin yang mengembang dipakai karena header yang
    // diam total terbaca seperti gambar mati — dan seluruh sisa layar memang
    // sedang diam saat kode sudah selesai diketik. Denyutnya lambat (2,2 rad/s)
    // supaya jadi tanda hidup, bukan pengalih perhatian dari kodenya.
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = "700 25px Mono";
    const wT = ctx.measureText(stamp).width;
    const padX = 26, dot = 11, jarak = 16;
    const lebar = padX * 2 + dot * 2 + jarak + wT, tinggi = 52;
    const px = W / 2 - lebar / 2, py = 62;
    rr(ctx, px, py, lebar, tinggi, tinggi / 2);
    ctx.fillStyle = "rgba(21,27,39,0.72)"; ctx.fill();
    ctx.strokeStyle = "rgba(203,255,70,0.20)"; ctx.lineWidth = 2; ctx.stroke();

    const cxd = px + padX + dot, cyd = py + tinggi / 2;
    // Cincin mengembang lalu memudar — satu siklus 1,6 detik.
    const fase = (gt / 1.6) % 1;
    // Rentang mengembangnya dibatasi 13px: jari-jari maksimum 24 masih di dalam
    // pil setinggi 52 (setengahnya 26). Lebih dari itu cincinnya memotong garis
    // tepi pil dan terbaca sebagai cacat gambar, bukan animasi.
    ctx.beginPath(); ctx.arc(cxd, cyd, dot + fase * 13, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(203,255,70,${(1 - fase) * 0.78 * a})`; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cxd, cyd, dot * (0.82 + 0.18 * Math.sin(gt * 2.2)), 0, Math.PI * 2);
    ctx.fillStyle = C.acc; ctx.fill();

    ctx.fillStyle = C.txt; ctx.textBaseline = "middle";
    ctx.fillText(stamp, cxd + dot + jarak, cyd + 1);
    ctx.textBaseline = "alphabetic"; ctx.restore();
  }

  // ── INTRO ala roundup ────────────────────────────────────────────────────
  function intro(ctx, ts) {
    latar(ctx, ts); kepala(ctx, clamp(ts / 0.4), ts);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const a = outBack(clamp(ts / 0.42));
    const judul = game.name.toUpperCase();
    const tf = fitR(ctx, judul, W - 260, 172, 74);
    ctx.save(); ctx.globalAlpha = clamp(ts / 0.26);
    ctx.translate(W / 2, H / 2 - 168); ctx.scale(0.86 + 0.14 * a, 0.86 + 0.14 * a);
    ctx.font = `${tf}px Rank`; pop(ctx, judul, 0, 0, C.acc, 16); ctx.restore();

    ctx.save(); ctx.globalAlpha = clamp((ts - 0.4) / 0.3);
    bi(ctx, "KODE REDEEM", "REDEEM CODES", W / 2, H / 2 - 58, { idFont: "800 56px Grotesk", enFont: "700 28px Grotesk", idColor: C.txt, enColor: C.faint });
    ctx.restore();

    // Sub-judul DIKETIK — pola yang sama dengan roundup.
    const s1 = clamp((ts - 0.85) / 0.6);
    if (s1 > 0) {
      const txt = `${nAktif} KODE AKTIF` + (game.players ? `  ·  ${fmtPemain(game.players)} PEMAIN` : "");
      // Dulu abu-abu (C.muted) dan tenggelam di latar yang kini terang. Baris ini
      // memuat dua angka yang jadi alasan orang menonton — berapa kode dan
      // seberapa ramai gamenya — jadi ia dinaikkan ke putih penuh dan diperbesar.
      ctx.save(); ctx.font = "800 58px Grotesk"; ctx.textAlign = "left";
      const fw = ctx.measureText(txt).width, left = W / 2 - fw / 2, yy = H / 2 + 36;
      const nn = Math.round(s1 * txt.length), sub = txt.slice(0, nn);
      pop(ctx, sub, left, yy, C.txt, 9);
      if (s1 < 1 && Math.floor(ts * 3) % 2 === 0) { ctx.fillStyle = C.acc; ctx.fillRect(left + ctx.measureText(sub).width + 5, yy - 28, 6, 52); }
      ctx.restore();
      // Baris Inggris menyusul SETELAH ketikan selesai. Kalau ikut diketik, dua
      // baris berjalan bersamaan dan mata tak tahu harus mengikuti yang mana.
      const en1 = clamp((ts - 1.55) / 0.4);
      if (en1 > 0.01) {
        ctx.save(); ctx.globalAlpha = en1 * 0.9; ctx.textAlign = "center";
        ctx.font = "700 30px Grotesk"; ctx.fillStyle = C.faint;
        const txtEn = `${nAktif} ACTIVE CODES` + (game.players ? `  ·  ${fmtPemain(game.players)} PLAYERS` : "");
        ctx.fillText(txtEn, W / 2, H / 2 + 80); ctx.restore();
      }
    }

    // TANGGAL & JAM pembuatan. Ditaruh di kaki intro supaya penonton tahu
    // kesegarannya sebelum menyalin apa pun — kode redeem cepat hangus, dan
    // "video ini dari kapan" adalah pertanyaan pertama yang wajar.
    const dt = clamp((ts - 1.5) / 0.5);
    if (dt > 0.01) {
      ctx.save(); ctx.globalAlpha = dt * 0.95; ctx.textAlign = "center";
      ctx.font = "700 30px Mono"; ctx.fillStyle = C.limeSoft;
      ctx.fillText(stamp, W / 2, H - 68); ctx.restore();
    }

    // Stempel MENGHANTAM + gelombang kejut, persis irama roundup.
    const st0 = 1.85, stp = clamp((ts - st0) / 0.6);
    if (stp > 0) {
      const impact = 0.6, cx = W / 2, cy = H / 2 + 246; const land = stp >= impact;
      let sc, alpha, rot, shX = 0, shY = 0;
      if (!land) { const q = stp / impact; sc = 3.4 - 2.4 * (q * q); alpha = clamp(q * 1.9); rot = -0.34 + 0.28 * q; }
      else { const q = (stp - impact) / (1 - impact); const o = 0.15 * Math.exp(-q * 6) * Math.cos(q * 24); sc = 1 + o; alpha = 1; rot = -0.07 + 0.055 * Math.exp(-q * 5) * Math.sin(q * 22); const sh = Math.exp(-q * 9) * 9; shX = sh * Math.sin(q * 55); shY = sh * Math.cos(q * 48); }
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx + shX, cy + shY); ctx.rotate(rot); ctx.scale(sc, sc);
      ctx.font = "72px Rank"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const teks = "MASIH JALAN", dw = ctx.measureText(teks).width, bw = dw + 76, bh = 112;
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 14; ctx.lineWidth = 10; ctx.strokeStyle = C.red;
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 16); ctx.stroke(); ctx.shadowColor = "transparent";
      ctx.fillStyle = C.red; ctx.fillText(teks, 0, 4); ctx.restore();
      if (land) {
        const q = (stp - impact) / (1 - impact);
        ring(ctx, cx, cy, 50 + q * 520, 12 * clamp(1 - q), C.red, clamp(1 - q) * 0.5);
        ring(ctx, cx, cy, 26 + q * 340, 6 * clamp(1 - q), "#fff", clamp(1 - q) * 0.26);
        ctx.save(); ctx.globalAlpha = clamp(q * 2.2) * 0.85; ctx.textAlign = "center";
        ctx.font = "700 26px Grotesk"; ctx.fillStyle = C.faint;
        ctx.fillText("STILL WORKING", cx, cy + 92); ctx.restore();
      }
    }
    if (ts < 0.22) { ctx.globalAlpha = 1 - ts / 0.22; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.textBaseline = "alphabetic";
  }

  // ── ADEGAN KODE: diketik ─────────────────────────────────────────────────
  function adegan(ctx, list, ts, idxHal, gt) {
    latar(ctx, gt); kepala(ctx, 1, gt);
    const x0 = 150, lebar = W - 300;
    ctx.textAlign = "left";

    ctx.save(); ctx.globalAlpha = clamp(ts / 0.35);
    if (ikon) ikonBulat(ctx, ikon, x0, 152, 78, 18);
    ctx.font = "800 40px Grotesk"; ctx.fillStyle = C.txt;
    ctx.fillText(potong(ctx, game.name, lebar - 460), x0 + 100, 196);
    ctx.textAlign = "right"; ctx.font = "700 30px Mono"; ctx.fillStyle = C.acc;
    const dari = Math.min(idxHal * PER + list.length, nAktif);
    ctx.fillText(`${idxHal * PER + 1}–${dari} / ${nAktif}`, x0 + lebar, 196);
    ctx.textAlign = "left"; ctx.restore();

    // Tinggi & posisi kartu dihitung mundur dari pita statistik di kaki layar:
    // dua kartu harus selesai sebelum y=700, kalau tidak grafik pemain tertimpa.
    pitaStat(ctx, gt);
    // Tanpa pita statistik, kartu DIPUSATKAN ke ruang yang tersisa. Kalau tidak,
    // sepertiga bawah layar menganga kosong — dan itu bukan kasus langka: pita
    // cuma tampil untuk game yang masuk 760 besar Roblox Charts (lihat
    // src/player-series.mjs), jadi game kecil selalu tampil timpang.
    const TB = 196, GAP = 28;
    const tinggiKartu = list.length * TB + (list.length - 1) * GAP;
    const y0 = deret ? 244 : 244 + (756 - tinggiKartu) / 2;
    // KETIK BERURUTAN (arahan user): kode kedua baru mulai setelah kode pertama
    // SELESAI diketik, bukan bersamaan dengan jeda. Mata cuma bisa mengikuti satu
    // baris huruf pada satu waktu — dua kursor berkedip serentak justru membuat
    // keduanya tak terbaca, dan kode Roblox case-sensitive jadi "terbaca" itu
    // syarat, bukan kenyamanan.
    const mulaiKe = (i) => {
      let t = 0.38;
      for (let k = 0; k < i; k++) t += 0.30 + list[k].code.length / KETIK + 0.55;
      return t;
    };
    list.forEach((c, i) => {
      const mulai = mulaiKe(i);
      const masuk = easeOut(inv(mulai, mulai + 0.42, ts));
      if (masuk <= 0.01) return;
      const y = y0 + i * (TB + GAP), geser = (1 - masuk) * 40;
      ctx.globalAlpha = masuk;
      rr(ctx, x0 + geser, y, lebar, TB, 26); ctx.fillStyle = C.surf; ctx.fill();
      ctx.strokeStyle = c.isNew ? "rgba(203,255,70,0.5)" : "rgba(255,255,255,0.09)"; ctx.lineWidth = 2; ctx.stroke();
      rr(ctx, x0 + geser + 1, y + 1, 9, TB - 2, 5); ctx.fillStyle = c.isNew ? C.acc : C.acc2; ctx.fill();

      if (c.isNew) {
        ctx.font = "800 27px Grotesk";
        const tw = ctx.measureText("BARU").width + 36;
        rr(ctx, x0 + geser + lebar - tw - 32, y + 26, tw, 44, 22);
        ctx.fillStyle = "rgba(203,255,70,0.18)"; ctx.fill();
        ctx.fillStyle = C.acc; ctx.textBaseline = "middle"; ctx.fillText("BARU", x0 + geser + lebar - tw - 14, y + 49); ctx.textBaseline = "alphabetic";
      }

      // KETIK. Kode tak pernah dipotong — penonton datang untuk MENYALIN, jadi
      // fontnya yang mengecil sampai muat, bukan hurufnya yang dibuang.
      const ruangBadge = c.isNew ? 160 : 44;
      ctx.fillStyle = C.txt;
      fontMuat(ctx, c.code, lebar - 60 - ruangBadge, { berat: "700", min: 34, maks: 70, keluarga: "Mono" });
      const tKetik = Math.max(0, ts - (mulai + 0.3));
      const n = Math.min(c.code.length, Math.floor(tKetik * KETIK));
      const sub = c.code.slice(0, n);
      const yk = y + (c.reward ? 104 : 120);
      ctx.fillText(sub, x0 + geser + 46, yk);
      if (n < c.code.length && Math.floor(ts * 6) % 2 === 0) {
        const wsub = ctx.measureText(sub).width;
        ctx.fillStyle = C.acc; ctx.fillRect(x0 + geser + 50 + wsub, yk - 40, 6, 50);
      }
      if (c.reward && n >= c.code.length) {
        ctx.globalAlpha = masuk * clamp((ts - (mulai + 0.3 + c.code.length / KETIK)) / 0.3);
        ctx.font = "400 30px GroteskR"; ctx.fillStyle = C.muted;
        ctx.fillText(potong(ctx, c.reward, lebar - 100), x0 + geser + 46, y + 154);
      }
      ctx.globalAlpha = 1;
    });
  }

  // ── PITA STATISTIK + GRAFIK 24 JAM ──────────────────────────────────────
  // Mengisi kaki layar yang sebelumnya kosong, memakai bahasa visual roundup
  // (PEAK/AVERAGE/LOWEST + area chart). Gunanya bukan hiasan: angka pemain
  // menjawab "game ini masih rame gak?" — pertanyaan yang menentukan orang mau
  // repot menyalin kode atau tidak.
  //
  // GARISNYA MAJU MENGIKUTI SELURUH DURASI VIDEO, bukan durasi adegan (arahan
  // user). Progres dihitung dari waktu GLOBAL dibagi total, jadi video pendek
  // menggambar cepat dan video panjang menggambar pelan — dan grafiknya selalu
  // sampai ujung tepat saat video habis, tak pernah berhenti di tengah.
  function pitaStat(ctx, gt) {
    if (!deret) return; // tanpa pengukuran nyata: ruang dibiarkan kosong
    const a = clamp((gt - INTRO * 0.55) / 0.6);
    if (a <= 0.01) return;
    const puncak = Math.max(...deret), rendah = Math.min(...deret), rata = deret.reduce((x, y) => x + y, 0) / deret.length;
    const sel = [
      { l: "PEMAIN TERTINGGI", e: "PEAK PLAYERS", v: puncak, c: C.acc, s: C.limeSoft },
      { l: "RATA-RATA PEMAIN", e: "AVERAGE PLAYERS", v: rata, c: C.ungu, s: C.unguSoft },
      { l: "PEMAIN TERENDAH", e: "LOWEST PLAYERS", v: rendah, c: C.biru, s: C.biruSoft },
    ];
    const X0 = 150, SW = W - 300, cw = SW / 3, yL = 748, yN = 802;
    ctx.save(); ctx.globalAlpha = a;
    const rev = easeOut(clamp((gt - INTRO * 0.55) / 0.9));
    sel.forEach((c, i) => {
      const cx = X0 + cw * i + cw / 2;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = "700 23px GroteskR"; ctx.fillStyle = c.s; ctx.fillText(c.l, cx, yL - 22);
      ctx.font = "700 18px GroteskR"; ctx.fillStyle = "rgba(166,175,191,0.62)"; ctx.fillText(c.e, cx, yL + 2);
      ctx.font = "700 52px Mono"; pop(ctx, nf(c.v * rev), cx, yN, c.c, 7);
      if (i < 2) { ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X0 + cw * (i + 1), yL - 26); ctx.lineTo(X0 + cw * (i + 1), yN - 4); ctx.stroke(); }
    });
    const GX = 150, GY = 828, GW = SW, GH = 158;
    rr(ctx, GX, GY, GW, GH, 18); ctx.fillStyle = "rgba(9,12,18,0.55)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 2; ctx.stroke();
    const pad = 22, atas = 42, gx = GX + pad, gy = GY + atas, gw = GW - pad * 2, gh = GH - atas - 32;
    const n = deret.length, mn = Math.min(...deret), mx = Math.max(...deret), rng = mx - mn || 1;
    const px = (i) => gx + (i / (n - 1)) * gw, py = (v) => gy + gh - ((v - mn) / rng) * gh;
    ctx.textAlign = "left"; ctx.font = "700 24px Grotesk"; ctx.fillStyle = C.muted;
    ctx.fillText("PEMAIN  ·  24 JAM TERAKHIR  ·  LAST 24 HOURS", gx, GY + 28);
    ctx.font = "700 18px Mono"; ctx.fillStyle = "rgba(166,175,191,0.55)"; ctx.textAlign = "center";
    ["00:00", "06:00", "12:00", "18:00", "24:00"].forEach((t, k) => ctx.fillText(t, gx + (k / 4) * gw, GY + GH - 10));
    const prog = clamp((gt - grafikMulai) / Math.max(0.001, grafikAkhir - grafikMulai));
    const upto = Math.max(1, Math.floor(prog * (n - 1)));
    ctx.beginPath(); ctx.moveTo(px(0), gy + gh);
    for (let i = 0; i <= upto; i++) ctx.lineTo(px(i), py(deret[i]));
    ctx.lineTo(px(upto), gy + gh); ctx.closePath();
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
    grad.addColorStop(0, "rgba(203,255,70,0.34)"); grad.addColorStop(1, "rgba(203,255,70,0.02)");
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= upto; i++) { const X = px(i), Y = py(deret[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.strokeStyle = C.acc; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.stroke();
    const hx = px(upto), hy = py(deret[upto]);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = C.acc; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  // ── OUTRO = REKAP SEMUA KODE + branding ──────────────────────────────────
  // Tiga detik terakhir dulu murni logo + tombol subscribe: nol informasi,
  // padahal justru bagian video yang paling mungkin di-pause orang. Sekarang ia
  // mengulang SEMUA kode yang tadi tampil dalam satu bingkai, jadi yang mau
  // menyalin punya satu frame untuk berhenti alih-alih menggulung mundur.
  //
  // KENAPA REKAP, BUKAN MEMINDAHKAN KODE BARU KE BELAKANG. Video ini dipotong
  // oleh anggaran 30 detik DARI EKOR (lihat perakitan `halaman` di atas: begitu
  // anggaran habis, sisa adegan di-`break` dan cuma jadi angka "+N kode lagi").
  // Apa pun yang ditaruh di akhir adalah yang paling berisiko tak pernah
  // muncul — dan kode BARU justru yang dijanjikan judul videonya. Rekap aman
  // di posisi ini justru karena ia tak membawa informasi baru: kalau ia
  // terpotong, tak ada yang hilang.
  function outro(ctx, ts, gt) {
    latar(ctx, gt);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.save(); ctx.globalAlpha = clamp(ts / 0.3);
    bi(ctx, "SEMUA KODE DI VIDEO INI", "ALL CODES IN THIS VIDEO", W / 2, 132, {
      idFont: "800 46px Grotesk", enFont: "600 28px GroteskR", idColor: C.txt, enColor: C.faint });
    ctx.restore();

    // Dua kolom begitu kodenya lebih dari empat: satu kolom panjang memaksa
    // kartunya memendek dan fontnya ikut mengecil jauh lebih cepat.
    const n = rekap.length, duaKol = n > 4;
    const kol = duaKol ? 2 : 1, baris = Math.ceil(n / kol);
    const M = 160, GAPX = 36, GAPY = 14, RUANG = 452;
    const penuh = (W - M * 2 - (kol - 1) * GAPX) / kol;
    // Satu kolom selebar layar bikin kode pendek mengambang di kartu yang
    // hampir seluruhnya kosong — dipersempit lalu dipusatkan.
    const lebarKol = duaKol ? penuh : Math.min(penuh, 1180);
    const xKiri = duaKol ? M : (W - lebarKol) / 2;
    const TB = clamp(Math.floor((RUANG - (baris - 1) * GAPY) / baris), 54, 104);
    const yTop = 236 + (RUANG - (baris * TB + (baris - 1) * GAPY)) / 2;

    rekap.forEach((c, i) => {
      // Urutan muncul = urutan di video, jadi mata menemukan kembali kode yang
      // tadi dilihat di tempat yang sama relatifnya.
      const kx = duaKol ? i % 2 : 0, ky = duaKol ? Math.floor(i / 2) : i;
      const mulai = 0.24 + i * 0.05;
      const a = easeOut(inv(mulai, mulai + 0.3, ts));
      if (a <= 0.01) return;
      const x = xKiri + kx * (lebarKol + GAPX), y = yTop + ky * (TB + GAPY);
      const cx = x + lebarKol / 2, cy = y + TB / 2, sk = 0.94 + 0.06 * a;
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(cx, cy); ctx.scale(sk, sk); ctx.translate(-cx, -cy);
      rr(ctx, x, y, lebarKol, TB, Math.min(18, TB / 3)); ctx.fillStyle = C.surf; ctx.fill();
      ctx.strokeStyle = c.isNew ? "rgba(203,255,70,0.45)" : "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2; ctx.stroke();
      rr(ctx, x + 1, y + 1, 7, TB - 2, 4); ctx.fillStyle = c.isNew ? C.acc : C.acc2; ctx.fill();

      // Tag BARU ikut ke rekap. Penanda mana yang paling layak dicoba duluan
      // tak ada gunanya kalau cuma hidup di adegan yang sudah lewat.
      let ruang = 30;
      if (c.isNew) {
        ctx.font = "800 20px Grotesk";
        const tw = ctx.measureText("BARU").width + 26;
        rr(ctx, x + lebarKol - tw - 18, cy - 17, tw, 34, 17);
        ctx.fillStyle = "rgba(203,255,70,0.16)"; ctx.fill();
        ctx.fillStyle = C.acc; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("BARU", x + lebarKol - tw / 2 - 18, cy + 1);
        ruang = tw + 40;
      }
      // Sama seperti di adegan utama: kode TAK PERNAH dipotong, fontnya yang
      // mengecil sampai muat. Rekap yang memotong kode jadi "ABCD…" tak ada
      // gunanya sama sekali.
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = C.txt;
      fontMuat(ctx, c.code, lebarKol - 44 - ruang, { berat: "700", min: 20, maks: Math.floor(TB * 0.52), keluarga: "Mono" });
      ctx.fillText(c.code, x + 26, cy + 1);
      ctx.restore();
    });

    // Branding dipadatkan ke kaki layar — tetap ada, tak lagi memakan bingkai.
    //
    // JANGAN pakai logoGG() di sini: ia menggambar lockup LENGKAP (badge + kata
    // "KODEGG"), jadi menaruhnya di sebelah teks "kodegg.com" membuat wordmark-nya
    // tertimpa URL. Yang dipakai cuma badge-nya, dirakit di tempat, supaya yang
    // terbaca satu hal saja: alamat situsnya.
    ctx.textBaseline = "alphabetic";
    const ba = clamp((ts - 0.5) / 0.4);
    ctx.save(); ctx.globalAlpha = ba;
    const yb = 792, bs = 62;
    ctx.font = "700 62px Grotesk";
    const wUrl = ctx.measureText("kodegg.com").width;
    const lx = W / 2 - (bs + 22 + wUrl) / 2;
    rr(ctx, lx, yb - bs + 10, bs, bs, 16); ctx.fillStyle = C.acc; ctx.fill();
    ctx.font = "800 34px Grotesk"; ctx.fillStyle = C.ink;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("GG", lx + bs / 2, yb - bs / 2 + 11);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = "700 62px Grotesk"; ctx.fillStyle = C.acc;
    ctx.fillText("kodegg.com", lx + bs + 22, yb);
    ctx.textAlign = "center";
    bi(ctx, sisa > 0 ? `+ ${sisa} kode lagi · update tiap jam` : "Semua kode + cara redeem · update tiap jam",
       sisa > 0 ? `+ ${sisa} more codes · updated hourly` : "All codes + how to redeem · updated hourly",
       W / 2, 862, { idFont: "400 30px GroteskR", enFont: "400 23px GroteskR", idColor: C.muted, enColor: C.faint });
    ctx.restore();

    const ca = clamp((ts - 0.72) / 0.35), e = outBack(ca);
    const btnW = 330, btnH = 88, bell = 70, by = 972, bx = W / 2 - (btnW + 44 + bell) / 2;
    ctx.save(); ctx.globalAlpha = ca;
    ctx.translate(W / 2, by); ctx.scale(0.85 + 0.15 * e, 0.85 + 0.15 * e); ctx.translate(-W / 2, -by);
    rr(ctx, bx, by - btnH / 2, btnW, btnH, 18); ctx.fillStyle = "#FF0033";
    ctx.shadowColor = "rgba(255,0,51,0.45)"; ctx.shadowBlur = 26; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = "800 38px Grotesk"; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
    ctx.fillText("SUBSCRIBE", bx + btnW / 2, by + 1);
    const wig = Math.sin(ts * 9) * 0.18 * clamp((ts - 1.02) / 0.3);
    drawBell(ctx, bx + btnW + 44 + bell / 2, by, bell, C.acc, wig);
    ctx.restore(); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }

  // ── susunan adegan + cross-fade ──────────────────────────────────────────
  const SEC = [{ D: INTRO, d: (c, ts, gt) => intro(c, ts) }];
  halaman.forEach((h, i) => SEC.push({ D: durAdegan(h), d: (c, ts, gt) => adegan(c, h, ts, i, gt) }));
  SEC.push({ D: OUTRO, d: (c, ts, gt) => outro(c, ts, gt) });
  const St = [0]; for (let i = 0; i < SEC.length - 1; i++) St.push(St[i] + SEC[i].D - TRT);
  total = St[SEC.length - 1] + SEC[SEC.length - 1].D;
  grafikMulai = INTRO * 0.55;                 // saat pita statistik mulai muncul
  grafikAkhir = St[SEC.length - 1];           // awal outro = adegan kode terakhir habis

  const silent = outPath.replace(/\.mp4$/, ".silent.mp4");
  const FF = ffmpegBin();
  const ff = spawn(FF, ["-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", "60", "-movflags", "+faststart", silent, "-loglevel", "error"], { stdio: ["pipe", "ignore", "inherit"] });
  const mk = () => createCanvas(W, H).getContext("2d");
  const mc = mk(), ac = mk(), bc = mk();
  const N = Math.round(total * FPS);
  for (let f = 0; f < N; f++) {
    const gt = f / FPS;
    let tr = -1;
    for (let b = 1; b < SEC.length; b++) { const s = St[b]; if (gt >= s && gt < s + TRT) { tr = b; break; } }
    if (tr >= 0) {
      SEC[tr - 1].d(ac, gt - St[tr - 1], gt); SEC[tr].d(bc, gt - St[tr], gt);
      const p = easeIO((gt - St[tr]) / TRT);
      mc.globalAlpha = 1; mc.drawImage(ac.canvas, 0, 0);
      mc.globalAlpha = p; mc.drawImage(bc.canvas, 0, 0); mc.globalAlpha = 1;
    } else {
      let i = 0; for (let k = 0; k < SEC.length; k++) if (St[k] <= gt) i = k;
      SEC[i].d(mc, gt - St[i], gt);
    }
    const buf = Buffer.from(mc.getImageData(0, 0, W, H).data);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));

  // ── audio ────────────────────────────────────────────────────────────────
  const ev = [{ t: 2.45, k: "stamp" }];
  for (let b = 1; b < SEC.length; b++) ev.push({ t: St[b], k: "whoosh" });
  // Satu 'tik' tiap 3 huruf — tiap huruf terlalu ramai dan jadi berisik.
  // Jadwal 'tik' HARUS mengikuti jadwal ketik yang berurutan, kalau tidak
  // bunyinya jalan sendiri dan terdengar seperti salah sinkron.
  halaman.forEach((h, i) => {
    let off = 0.38;
    for (const c of h) {
      const m = St[i + 1] + off + 0.30;
      for (let k = 0; k < c.code.length; k += 3) ev.push({ t: m + k / KETIK, k: "tik" });
      off += 0.30 + c.code.length / KETIK + 0.55;
    }
  });
  const outroT = St[SEC.length - 1];
  // subup mengikuti tombol SUBSCRIBE yang kini muncul di ts 0.72 (dulu 0.55).
  ev.push({ t: outroT + 0.05, k: "chime" }); ev.push({ t: outroT + 0.78, k: "subup" });

  const n2 = Math.ceil(total * SR);
  const mus = music ? synthMusic(total, SR) : null, sx = sfx ? sfxSamples(ev, total) : null;
  const mix = new Float32Array(n2);
  const volMus = voPath ? 0.5 : 0.85;
  for (let i = 0; i < n2; i++) mix[i] = (mus ? mus[i] * volMus : 0) + (sx ? sx[i] * 0.9 : 0);
  const wav = outPath.replace(/\.mp4$/, ".mix.wav");
  writeFileSync(wav, wavMono(mix));

  const args = ["-y", "-i", silent, "-i", wav];
  const adaVO = voPath && existsSync(voPath);
  if (adaVO) args.push("-i", voPath);
  args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-map", "0:v:0");
  if (adaVO) args.push("-filter_complex", "[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=0[a]", "-map", "[a]");
  else args.push("-map", "1:a:0");
  args.push("-shortest", outPath, "-loglevel", "error");
  await new Promise((r) => spawn(FF, args, { stdio: "inherit" }).on("close", r));
  try { unlinkSync(silent); unlinkSync(wav); } catch {}
  return { outPath, durasi: total, adegan: halaman.length, ditampilkan, sisa, ukuran: statSync(outPath).size };
}


// ── THUMBNAIL LANDSCAPE (1280x720) ──────────────────────────────────────────
//
// Susunannya MENIRU renderRoundupThumb (arahan user): kolase ubin ber-jitter di
// belakang, gradien vertikal, judul Anton besar di tengah, stempel tanggal
// merah, dan badge burst di kiri-kanan. Yang diganti cuma bahan kolasenya —
// roundup memakai ikon banyak game karena ia video agregat; ini per-game, jadi
// bahannya gambar promosi game itu sendiri.
//
// Percobaan pertama memasang SATU gambar penuh layar lalu mem-blur-nya 15px,
// dan hasilnya rusak: sumbernya 768x432, diperbesar 1,7x untuk menutup
// 1280x720, lalu diburamkan — yang tersisa cuma bubur warna berkotak-kotak.
// Kolase tak punya masalah itu karena tiap ubin dipakai pada ukuran yang
// mendekati resolusi aslinya, dan yang meredamkannya alpha 0.5, bukan blur.
//
// Kisinya 4x4: sel 320x180 PERSIS 16:9, sama dengan rasio gambar promosi
// Roblox, jadi tak ada yang gepeng. (Roundup pakai 6x4 karena bahannya ikon
// yang memang persegi.)
function burstBentuk(ctx, cx, cy, R, duri, warna) {
  ctx.beginPath();
  for (let i = 0; i < duri * 2; i++) {
    const a = (i / (duri * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? R * 0.8 : R;
    const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  }
  ctx.closePath(); ctx.fillStyle = warna; ctx.fill();
}
function kotakStempel(ctx, cx, cy, txt, px, rot = -0.03) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.font = `${px}px Rank`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 12;
  const dw = ctx.measureText(txt).width, bw = dw + px * 0.7, bh = px * 1.42;
  ctx.lineWidth = px * 0.11; ctx.strokeStyle = C.red;
  rr(ctx, -bw / 2, -bh / 2, bw, bh, px * 0.15); ctx.stroke();
  ctx.shadowColor = "transparent"; ctx.fillStyle = C.red; ctx.fillText(txt, 0, px * 0.06);
  ctx.restore();
}

/**
 * @param {object}   o
 * @param {{name:string}} o.game
 * @param {number}   o.activeCount  jumlah kode aktif — angka badge kiri
 * @param {string}   o.dateLabel    mis. "9 AGUSTUS"
 * @param {string}   [o.iconPath]   ikon game — isi badge kanan
 * @param {Buffer[]} [o.media]      gambar promosi; bahan kolase
 * @param {string}   o.outPath      .jpg (disarankan) atau .png
 * @param {number}   [o.seed]       jitter kolase; tetap → thumbnail reproducible
 */
export async function renderWideThumb({ game, activeCount, dateLabel, iconPath, media = null, outPath, seed = 3 }) {
  const { createCanvas, loadImage } = await canvasLib();
  const TW = 1280, TH = 720;
  const cv = createCanvas(TW, TH), ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, TW, TH);

  let ikon = null;
  if (iconPath && existsSync(iconPath)) { try { ikon = await loadImage(iconPath); } catch {} }
  const bahan = [];
  for (const buf of media ?? []) { try { bahan.push(await loadImage(buf)); } catch {} }
  // Tanpa gambar promosi, ikon dipakai sebagai bahan kolase — persis perilaku
  // roundup. Lebih baik kolase ikon daripada bidang kosong.
  if (!bahan.length && ikon) bahan.push(ikon);

  if (bahan.length) {
    // PRNG bersemai (sama dengan roundup): jitter-nya acak-acakan tapi SAMA tiap
    // render. Thumbnail yang berubah tiap kali dirender membuat video yang
    // di-retry punya thumbnail berbeda dari yang sudah tayang.
    let a = seed >>> 0;
    const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const cols = 4, rows = 4, cw = TW / cols, ch = TH / rows;
    let k = 0;
    for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
      const img = bahan[k % bahan.length]; k++;
      if (!img) continue;
      const w = cw * (1.05 + r() * 0.15), h = w * 0.5625;
      const x = cx * cw + (cw - w) / 2 + (r() - 0.5) * 26;
      const y = ry * ch + (ch - h) / 2 + (r() - 0.5) * 26;
      // Alpha 0.5 — angka roundup, dipakai apa adanya.
      //
      // Sempat dinaikkan ke 0.66 karena kolasenya tampak gelap dan berlumpur,
      // tapi itu salah sasaran: yang gelap bukan kolasenya melainkan kompresi
      // JPEG-nya (lihat catatan skala kualitas di akhir fungsi). Begitu itu
      // dibereskan, 0.5 justru lebih baik — teksnya lebih menonjol.
      ctx.save(); ctx.globalAlpha = 0.5;
      rr(ctx, x, y, w, h, Math.min(w, h) * 0.14); ctx.clip();
      // Cover-fit: gambar promosi 16:9 masuk ke ubin 16:9 tanpa distorsi, dan
      // ikon (persegi) yang jadi cadangan pun tak gepeng.
      const sk = Math.max(w / img.width, h / img.height);
      const iw = img.width * sk, ih = img.height * sk;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      ctx.restore();
    }
  }
  const gr = ctx.createLinearGradient(0, 0, 0, TH);
  gr.addColorStop(0, "rgba(9,12,18,0.40)"); gr.addColorStop(0.5, "rgba(9,12,18,0.74)"); gr.addColorStop(1, "rgba(9,12,18,0.92)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, TW, TH);

  logoGG(ctx, 52, 40, 0.68, 0.96);

  // JUDUL: "KODE" putih, nama game lime di bawahnya — sejajar dengan roundup
  // yang memakai "NEW ROBLOX" putih + "CODES" lime.
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = "132px Rank";
  pop(ctx, "KODE", TW / 2, 236, C.txt, 14);

  const nama = String(game.name || "").toUpperCase();
  const kata = nama.split(/\s+/).filter(Boolean);
  const LEBAR = 1140;
  let baris = [nama];
  // Dipecah dua baris kalau satu baris memaksa font turun sampai 92px. Di bawah
  // itu nama jadi terlalu kecil untuk ukuran kisi YouTube (~210px lebar), dan
  // dua baris besar lebih terbaca daripada satu baris yang tak terbaca.
  ctx.font = "92px Rank";
  if (ctx.measureText(nama).width > LEBAR && kata.length > 1) {
    let terbaik = 1, beda = Infinity;
    ctx.font = "100px Rank";
    for (let i = 1; i < kata.length; i++) {
      const x1 = ctx.measureText(kata.slice(0, i).join(" ")).width;
      const x2 = ctx.measureText(kata.slice(i).join(" ")).width;
      if (Math.abs(x1 - x2) < beda) { beda = Math.abs(x1 - x2); terbaik = i; }
    }
    baris = [kata.slice(0, terbaik).join(" "), kata.slice(terbaik).join(" ")];
  }
  const fn = Math.min(...baris.map((b) => fitR(ctx, b, LEBAR, baris.length === 1 ? 132 : 100, 52)));
  ctx.font = `${fn}px Rank`;
  baris.forEach((b, i) => pop(ctx, b, TW / 2, 236 + 34 + (i + 1) * fn * 0.98, C.acc, 14));

  // Baris badge + stempel. Turun kalau namanya dua baris, supaya tak bertumpuk.
  const yBaris = baris.length === 1 ? 528 : 570;
  kotakStempel(ctx, TW / 2, yBaris, String(dateLabel || "").toUpperCase(), 78, -0.03);

  const R = baris.length === 1 ? 130 : 110;
  ctx.save(); ctx.translate(185, yBaris); ctx.rotate(-0.1); ctx.translate(-185, -yBaris);
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  burstBentuk(ctx, 185, yBaris, R, 15, C.acc); ctx.shadowColor = "transparent";
  burstBentuk(ctx, 185, yBaris, R * 0.87, 15, C.bg);
  burstBentuk(ctx, 185, yBaris, R * 0.81, 15, C.acc);
  ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // Lebar aman DIHITUNG dari geometri bintang, bukan ditebak dengan pengali.
  // Bentuk isi digambar burstBentuk(R*0.81), dan yang benar-benar muat di
  // dalamnya adalah lingkaran LEMBAH (0.8 x 0.81R), bukan lingkaran ujung duri.
  // Lebarnya juga menyempit makin jauh dari pusat, jadi angka (di atas pusat)
  // dan label (di bawahnya) punya jatah yang berbeda — dipatok satu pengali,
  // salah satunya pasti menempel duri, dan itu berubah-ubah mengikuti R yang
  // sendirinya bergantung pada nama game satu atau dua baris.
  const lembah = R * 0.81 * 0.8;
  const muatDi = (yOff) => 2 * Math.sqrt(Math.max(0, lembah * lembah - yOff * yOff)) * 0.9;
  const yAngka = -R * 0.16, yLabel = R * 0.44;
  ctx.font = `${fitR(ctx, String(activeCount), muatDi(yAngka), R * 0.9, R * 0.34)}px Rank`;
  ctx.fillText(String(activeCount), 185, yBaris + yAngka);
  fontMuat(ctx, "KODE AKTIF", muatDi(yLabel), { berat: "700", min: 10, maks: Math.round(R * 0.16), keluarga: "Grotesk" });
  ctx.fillText("KODE AKTIF", 185, yBaris + yLabel);
  ctx.restore();

  // Badge kanan = IKON GAME, penyeimbang badge angka di kiri. Roundup punya dua
  // badge angka; di sini angka keduanya tak ada yang berarti. Ikon juga yang
  // dikenali orang dari halaman Roblox — gambar promosi sering tak memuat judul.
  if (ikon) {
    ctx.save(); ctx.translate(1095, yBaris); ctx.rotate(0.08); ctx.translate(-1095, -yBaris);
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    burstBentuk(ctx, 1095, yBaris, R, 15, C.acc); ctx.shadowColor = "transparent";
    const s = R * 1.16;
    ikonBulat(ctx, ikon, 1095 - s / 2, yBaris - s / 2, s, s * 0.24);
    ctx.restore();
  }

  ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "700 32px Grotesk";
  const t1 = "KODE BARU TIAP JAM DI ", t2 = "KODEGG.COM";
  const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width, lx = TW / 2 - (w1 + w2) / 2;
  ctx.fillStyle = C.muted; ctx.fillText(t1, lx, 682);
  ctx.fillStyle = C.acc; ctx.fillText(t2, lx + w1, 682);

  // KUALITAS JPEG DI SINI SKALANYA 0-100, BUKAN 0-1.
  //
  // @napi-rs/canvas memakai 0-100, berbeda dari toDataURL() di browser dan dari
  // node-canvas yang memakai 0-1. Dikirim 0.92, ia dibaca sebagai kualitas ~1:
  // berkasnya jadi 16 KB dan gambarnya hancur berkotak-kotak. Gejalanya menipu —
  // terlihat seperti masalah resolusi sumber atau blur yang kelewatan, padahal
  // murni artefak kompresi. Diukur: q=0.92 → 16 KB, q=92 → 260 KB.
  const jpg = /\.jpe?g$/i.test(outPath);
  writeFileSync(outPath, jpg ? cv.toBuffer("image/jpeg", 92) : cv.toBuffer("image/png"));
  return { outPath, ukuran: statSync(outPath).size };
}
