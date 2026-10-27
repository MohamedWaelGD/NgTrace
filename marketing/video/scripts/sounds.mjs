// Synthesizes the promo's sound design into public/sfx: short UI sounds, no background bed.
// No samples, no music, nothing to license. Deterministic (seeded noise). Usage: node scripts/sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RATE = 48000;
const OUT = resolve('public/sfx');
mkdirSync(OUT, { recursive: true });

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;

const buffer = (seconds) => new Float32Array(Math.round(seconds * RATE));

/** RBJ band-pass with a cutoff that may change per sample. */
function bandpass(input, freqAt, q = 1.2) {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const w = (2 * Math.PI * freqAt(i / RATE)) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
    const y = b0 * input[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = input[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

const lowpass = (input, hz) => {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
  let y = 0;
  return input.map((x) => (y += a * (x - y)));
};
const highpass = (input, hz) => {
  const low = lowpass(input, hz);
  return input.map((x, i) => x - low[i]);
};
const noise = (seconds) => buffer(seconds).map(() => rand());

function normalize(samples, peak) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  return samples.map((s) => (s / (max || 1)) * peak);
}

function write(name, samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  writeFileSync(resolve(OUT, name), data);
  console.log(name, (samples.length / RATE).toFixed(2) + 's');
}

// Transition whoosh: band-passed noise sweeping up and back, swelling then fading.
{
  const d = 0.55;
  const s = bandpass(noise(d), (t) => 350 + 2600 * Math.sin((Math.PI * t) / d) ** 2, 0.9);
  write('whoosh.wav', normalize(s.map((x, i) => x * Math.sin((Math.PI * i) / s.length) ** 2), 0.7));
}

// Card slide: a shorter, lower air puff.
{
  const d = 0.3;
  const s = bandpass(noise(d), (t) => 500 + 900 * (t / d), 0.8);
  write('card.wav', normalize(s.map((x, i) => x * Math.sin((Math.PI * i) / s.length) ** 1.5), 0.55));
}

// Bubble pop: a quick downward blip with a soft click on the front.
{
  const s = buffer(0.14);
  let phase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (380 + 700 * Math.exp(-t / 0.025))) / RATE;
    s[i] = Math.sin(phase) * Math.exp(-t / 0.035) + (i < 120 ? rand() * 0.3 * (1 - i / 120) : 0);
  }
  write('pop.wav', normalize(s, 0.7));
}

// Tick: a tiny bright click for tiles and words.
{
  const s = buffer(0.05);
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    s[i] = (Math.sin(2 * Math.PI * 2300 * t) * 0.7 + rand() * 0.3) * Math.exp(-t / 0.008);
  }
  write('tick.wav', normalize(highpass(s, 900), 0.55));
}

// Marker scribble: a soft, dull felt-tip swish in gentle strokes (low and rounded, no papery hiss).
{
  const d = 0.5;
  const s = lowpass(lowpass(bandpass(noise(d), (t) => 1300 + 300 * Math.sin(2 * Math.PI * 2.5 * t), 0.7), 2600), 2600);
  const out = s.map((x, i) => {
    const t = i / RATE;
    const strokes = 0.45 + 0.55 * Math.sin(Math.PI * 4.5 * t) ** 2;
    return x * strokes * Math.min(1, t / 0.08, (d - t) / 0.18);
  });
  write('scribble.wav', normalize(out, 0.35));
}

// Chime for the call to action: two soft partials, quickly decaying (a UI ding, not a melody).
{
  const s = buffer(1.2);
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    s[i] = (Math.sin(2 * Math.PI * 1318 * t) + 0.45 * Math.sin(2 * Math.PI * 1976 * t)) * Math.exp(-t / 0.28) * Math.min(1, t / 0.004);
  }
  write('ding.wav', normalize(s, 0.5));
}
