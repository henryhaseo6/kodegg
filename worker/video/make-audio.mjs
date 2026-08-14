// Audio video: makeVO (edge-tts, suara Ardi) + muxAudio (VO+ding+musik → MP4).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ffmpegBin } from "./render-short.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, "assets");
const PY = process.env.PYTHON || "python";

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}: ${err.slice(-300)}`))));
    p.on("error", rej);
  });
}

// Naskah VO — nyambung visual, tak baca kode mentah, brand "kode gg dot com".
export function voScript({ name, activeCount, allMode = false, isPromo = false }) {
  const n = activeCount || "beberapa";
  // allMode: game baru masuk pantauan → jangan bilang "kode baru", umurnya tak diketahui.
  const buka = allMode
    ? `Ini semua kode ${name} yang masih aktif! Ada ${n} kode, semuanya udah diverifikasi.`
    : `Kode baru ${name} udah keluar! Ada ${n} kode aktif, semuanya udah diverifikasi.`;
  // Promo Roblox ditukar di roblox dot com slash promocodes, BUKAN di dalam game.
  const cara = isPromo
    ? `Tinggal salin dari layar, terus tukarkan di roblox dot com slash promocodes buat dapetin item avatar gratis.`
    : `Tinggal salin dari layar, terus tukarkan di dalam game.`;
  return `${buka} ${cara} Buruan ya, sebagian cuma aktif beberapa hari. Kode lengkap semua game, cek di kode gg dot com. Jangan lupa subscribe dan nyalain loncengnya biar gak ketinggalan kode baru!`;
}

// MESIN TTS — sengaja dipisah di balik satu nama.
//
// edge-tts gratis dan itu sebabnya dipakai sejak awal, tapi hasilnya terdengar
// seperti mesin: intonasinya datar dan jeda kalimatnya seragam. Begitu naskahnya
// jadi panjang & informatif (video/naskah.mjs), kelemahan itu makin terasa —
// suara robot yang bicara 8 detik masih bisa dimaafkan, yang bicara 40 detik
// tidak.
//
// Ditulis sebagai peta supaya menambah mesin berbayar nanti = menambah SATU
// fungsi di sini, tanpa menyentuh pemanggil mana pun. Pilihannya lewat env
// VO_MESIN, suaranya lewat VO_VOICE — jadi bisa diuji di satu run tanpa deploy.
const MESIN = {
  /** edge-tts (gratis, suara Microsoft). Coba `python` lalu `python3`. */
  async edge(text, outPath) {
    const voice = process.env.VO_VOICE || "id-ID-ArdiNeural";
    const rate = process.env.VO_RATE || "+7%";
    const args = ["-m", "edge_tts", "--voice", voice, `--rate=${rate}`, "--text", text, "--write-media", outPath];
    try {
      await run(PY, args);
    } catch (e) {
      if (PY === "python") await run("python3", args);
      else throw e;
    }
    return outPath;
  },
};

/**
 * Generate voiceover MP3.
 *
 * `text` boleh dikirim langsung (naskah dari video/naskah.mjs). Tanpa itu ia
 * jatuh ke voScript lama — jalur Shorts masih memakainya, dan mengubah keduanya
 * sekaligus berarti dua perubahan yang tak bisa dinilai terpisah.
 */
export async function makeVO({ name, activeCount, allMode = false, isPromo = false, outPath, text = null, mesin = process.env.VO_MESIN || "edge" }) {
  const naskah = text ?? voScript({ name, activeCount, allMode, isPromo });
  const fn = MESIN[mesin];
  // Nama mesin yang salah ketik JANGAN diam-diam jatuh ke edge: kalau kita sudah
  // bayar suara yang lebih baik, video yang terbit dengan suara robot adalah
  // kegagalan yang tak terlihat sampai ada yang menontonnya.
  if (!fn) throw new Error(`VO_MESIN "${mesin}" tak dikenal (ada: ${Object.keys(MESIN).join(", ")})`);
  return fn(naskah, outPath);
}

/** Mux: video bisu + VO + ding + musik → MP4 final (audio ter-mix, voice di atas). */
export async function muxAudio({ videoPath, voPath, outPath }) {
  const FF = ffmpegBin();
  await run(FF, [
    "-y", "-i", videoPath, "-i", voPath, "-i", resolve(ASSETS, "ding.mp3"), "-i", resolve(ASSETS, "music.mp3"),
    "-filter_complex",
    "[1:a]adelay=400|400,volume=1.6[vo];[2:a]adelay=18150|18150,volume=0.55[dg];[3:a]volume=0.6[mu];[vo][dg][mu]amix=inputs=3:duration=longest[mix];[mix]volume=3.0[a]",
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", outPath,
  ]);
  return outPath;
}
