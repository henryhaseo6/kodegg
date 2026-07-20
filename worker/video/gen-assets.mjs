// Generate aset audio statis untuk video: musik latar custom + ding lonceng.
// Jalan SEKALI, hasil di-commit (assets/music.wav, assets/ding.wav) → dipakai
// ulang tiap video (deterministik, hemat). `node worker/video/gen-assets.mjs`.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { ffmpegBin } from "./render-short.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "assets");
mkdirSync(OUT, { recursive: true });
const FF = ffmpegBin();

// ---------- MUSIK: synthwave 128 BPM, Am–F–C–G ----------
const SR = 44100, BPM = 128, beat = 60 / BPM, step16 = beat / 4, DUR = 21.6, N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const saw = (f, t) => { const p = (t * f) % 1; return 2 * p - 1; };
const noise = () => Math.random() * 2 - 1;
function voice(startT, durS, gen, aL = 1, aR = 1) {
  const s0 = Math.floor(startT * SR), ns = Math.floor(durS * SR);
  for (let i = 0; i < ns; i++) { const idx = s0 + i; if (idx < 0 || idx >= N) continue; const v = gen(i / SR); L[idx] += v * aL; R[idx] += v * aR; }
}
const CH = [{ root: 45, tri: [69, 72, 76] }, { root: 41, tri: [65, 69, 72] }, { root: 48, tri: [72, 76, 79] }, { root: 43, tri: [67, 71, 74] }];
const totalSteps = Math.ceil(DUR / step16);
for (let s = 0; s < totalSteps; s++) {
  const t = s * step16, bar = Math.floor(s / 16), sib = s % 16, ch = CH[bar % 4], full = bar >= 1;
  if (full && sib % 4 === 0) voice(t, 0.2, (lt) => Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-lt * 55)) * lt) * Math.exp(-lt * 20), 0.95, 0.95);
  if (full && sib % 2 === 0) { const open = sib % 8 === 6; voice(t, open ? 0.12 : 0.035, (lt) => noise() * Math.exp(-lt * (open ? 26 : 90)), 0.16, 0.16); }
  if (full && (sib === 4 || sib === 12)) voice(t, 0.16, (lt) => (noise() * 0.8 + Math.sin(2 * Math.PI * 190 * lt) * 0.3) * Math.exp(-lt * 24), 0.34, 0.34);
  if (sib % 2 === 0) { const f = mtof(ch.root); voice(t, step16 * 2 * 0.92, (lt) => { const env = Math.min(1, lt / 0.008) * (0.7 + 0.3 * Math.exp(-lt * 6)); return (0.62 * sine(f, lt) + 0.38 * saw(f, lt)) * env; }, 0.34, 0.34); }
  { const arp = [ch.tri[0], ch.tri[1], ch.tri[2], ch.tri[0] + 12], f = mtof(arp[sib % 4]); const pl = sib % 2 === 0 ? 1 : 0.55, pr = sib % 2 === 0 ? 0.55 : 1; voice(t, step16 * 1.6, (lt) => { const env = Math.min(1, lt / 0.004) * Math.exp(-lt * 13); return (sine(f, lt) + 0.28 * sine(2 * f, lt)) * env; }, 0.18 * pl, 0.18 * pr); }
  if (sib === 0) for (const m of ch.tri) { const f = mtof(m - 12); voice(t, beat * 4 * 0.98, (lt) => { const env = Math.min(1, lt / 0.25) * (1 - Math.max(0, lt - beat * 4 * 0.7) * 1.2); return (0.5 * saw(f, lt) + 0.5 * saw(f * 1.006, lt)) * Math.max(0, env); }, 0.06, 0.06); }
}
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 0.9) * 0.92; R[i] = Math.tanh(R[i] * 0.9) * 0.92; }
const fs = Math.floor(SR * 0.15);
for (let i = 0; i < fs; i++) { const g = i / fs; L[i] *= g; R[i] *= g; L[N - 1 - i] *= g; R[N - 1 - i] *= g; }
const inter = Buffer.alloc(N * 8);
for (let i = 0; i < N; i++) { inter.writeFloatLE(L[i], i * 8); inter.writeFloatLE(R[i], i * 8 + 4); }
await new Promise((res) => { const ff = spawn(FF, ["-y", "-f", "f32le", "-ar", String(SR), "-ac", "2", "-i", "-", "-c:a", "libmp3lame", "-q:a", "3", resolve(OUT, "music.mp3")], { stdio: ["pipe", "ignore", "ignore"] }); ff.stdin.write(inter); ff.stdin.end(); ff.on("close", res); });
console.log("✓ music.mp3");

// ---------- DING lonceng (2 nada naik) ----------
await new Promise((res) => { const ff = spawn(FF, ["-y", "-f", "lavfi", "-i", "aevalsrc='(0.5*sin(2*PI*784*t))*exp(-9*t)':d=0.13:s=44100", "-f", "lavfi", "-i", "aevalsrc='(0.55*sin(2*PI*1046*t)+0.28*sin(2*PI*2092*t)+0.1*sin(2*PI*3139*t))*exp(-4.5*t)':d=0.85:s=44100", "-filter_complex", "[0][1]concat=n=2:v=0:a=1[a]", "-map", "[a]", "-c:a", "libmp3lame", "-q:a", "4", resolve(OUT, "ding.mp3")], { stdio: ["pipe", "ignore", "ignore"] }); ff.on("close", res); });
console.log("✓ ding.mp3");
console.log("SELESAI aset →", OUT);
