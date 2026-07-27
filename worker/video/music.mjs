// Musik latar sintetis (original, bebas copyright) untuk video ranking.
// Electronic/EDM upbeat: 4-on-floor kick + snare + hihat + bass + arpeggio +
// pad, progresi Am–F–C–G (catchy/uplifting), ~124 BPM, loop mengisi durasi.
// Mono Float32 (di-mix dg SFX di renderer). Tanpa dependency.

export function synthMusic(durSec, SR = 44100) {
  const buf = new Float32Array(Math.ceil(durSec * SR));
  const BPM = 124, beat = 60 / BPM, bar = 4 * beat, eighth = beat / 2;
  let seed = 1234567; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const add = (t, dur, amp, fn) => { const s = Math.floor(t * SR), n = Math.floor(dur * SR); for (let i = 0; i < n; i++) { const k = s + i; if (k < 0 || k >= buf.length) continue; buf[k] += amp * fn(i / SR, i / n); } };
  const saw = (f, ph) => 2 * ((f * ph) % 1) - 1;
  const sq = (f, ph) => (((f * ph) % 1) < 0.5 ? 1 : -1);
  const sine = (f, ph) => Math.sin(2 * Math.PI * f * ph);
  const tri = (f, ph) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * ph));

  // drum
  const kick = (t) => add(t, 0.28, 0.95, (ph) => { const f = 45 + 105 * Math.exp(-ph * 32); return Math.sin(2 * Math.PI * f * ph) * Math.exp(-ph * 8.5); });
  const snare = (t) => add(t, 0.2, 0.5, (ph) => ((rnd() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 180 * ph) * 0.5) * Math.exp(-ph * 16));
  const hat = (t, amp) => add(t, 0.05, amp, (ph) => (rnd() * 2 - 1) * Math.exp(-ph * 90));
  // bass: saw+square tebal, envelop pluck
  const bass = (t, f, dur) => add(t, dur, 0.5, (ph, x) => (saw(f, ph) * 0.6 + sq(f, ph) * 0.4) * Math.exp(-x * 2.2) * (1 - x * 0.3));
  // arpeggio pluck (bright)
  const pluck = (t, f, dur) => add(t, dur, 0.26, (ph, x) => (tri(f, ph) * 0.7 + saw(f, ph) * 0.3) * Math.exp(-x * 3.2));
  // pad chord (detuned saw, attack pelan)
  const pad = (t, freqs, dur) => add(t, dur, 0.11, (ph, x) => { const env = Math.min(1, x * 6) * (1 - Math.max(0, (x - 0.85) / 0.15)); let s = 0; for (const f of freqs) s += saw(f, ph) * 0.5 + saw(f * 1.005, ph) * 0.5; return (s / freqs.length) * env; });

  // progresi Am – F – C – G
  const prog = [
    { bass: 110.00, tones: [440.00, 523.25, 659.25] }, // Am
    { bass: 87.31, tones: [349.23, 440.00, 523.25] },  // F
    { bass: 130.81, tones: [523.25, 659.25, 783.99] }, // C
    { bass: 98.00, tones: [392.00, 493.88, 587.33] },  // G
  ];
  const nbars = Math.ceil(durSec / bar);
  for (let b = 0; b < nbars; b++) {
    const t0 = b * bar, P = prog[b % 4];
    const intro = b < 2; // 2 bar pertama lebih sepi (build-up)
    for (let i = 0; i < 4; i++) { const tb = t0 + i * beat; if (!intro || b === 1) kick(tb); if (i % 2 === 1) snare(tb); }
    if (!intro) for (let h = 0; h < 8; h++) hat(t0 + h * eighth, h % 2 ? 0.10 : 0.16);
    for (let e = 0; e < 8; e++) bass(t0 + e * eighth, P.bass * (e % 4 === 2 ? 2 : 1), eighth * 0.95);
    const arp = [P.tones[0], P.tones[1], P.tones[2], P.tones[1], P.tones[0], P.tones[2], P.tones[1], P.tones[2]];
    for (let e = 0; e < 8; e++) pluck(t0 + e * eighth, arp[e] * 2, eighth * 0.9);
    pad(t0, P.tones, bar * 0.98);
  }
  // soft-limit (tanh) → cegah clip, kasih "glue"
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * 0.8);
  return buf;
}
