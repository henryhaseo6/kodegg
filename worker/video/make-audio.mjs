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
export function voScript({ name, activeCount, allMode = false }) {
  const n = activeCount || "beberapa";
  // allMode: game baru masuk pantauan → jangan bilang "kode baru", umurnya tak diketahui.
  const buka = allMode
    ? `Ini semua kode ${name} yang masih aktif! Ada ${n} kode, semuanya udah diverifikasi.`
    : `Kode baru ${name} udah keluar! Ada ${n} kode aktif, semuanya udah diverifikasi.`;
  return `${buka} Tinggal salin dari layar, terus tukarkan di dalam game. Buruan ya, sebagian cuma aktif beberapa hari. Kode lengkap semua game, cek di kode gg dot com. Jangan lupa subscribe dan nyalain loncengnya biar gak ketinggalan kode baru!`;
}

/** Generate voiceover MP3 (edge-tts). Coba `python` lalu `python3`. */
export async function makeVO({ name, activeCount, allMode = false, outPath }) {
  const text = voScript({ name, activeCount, allMode });
  const args = ["-m", "edge_tts", "--voice", "id-ID-ArdiNeural", "--rate=+7%", "--text", text, "--write-media", outPath];
  try {
    await run(PY, args);
  } catch (e) {
    if (PY === "python") await run("python3", args);
    else throw e;
  }
  return outPath;
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
