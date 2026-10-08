// Sounds for Derpy Conquest, made on the spot with Web Audio (no files to
// download): a quill scratching when a letter comes, wax pressed when you
// answer, the ship's bell when a convoy makes port, drums for war, cannon
// for battle, a hammer for a new colony. Quiet, and off with one click.

export type SoundKind =
  | "letter"
  | "seal"
  | "bell"
  | "drums"
  | "cannon"
  | "victory"
  | "defeat"
  | "colony";

const MUTE_KEY = "derpy_conquest_muted";
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // ignore
  }
}

function audio(): AudioContext | null {
  if (muted || typeof AudioContext === "undefined") return null;
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = 0.22;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    // A fixed hiss (not Math.random, so it sounds the same every time).
    let x = 12345;
    for (let i = 0; i < d.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (x / 0x7fffffff) * 2 - 1;
    }
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function env(
  c: AudioContext,
  at: number,
  attack: number,
  hold: number,
  release: number,
  peak: number,
): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  g.connect(master!);
  return g;
}

function hiss(
  c: AudioContext,
  at: number,
  dur: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  sweepTo?: number,
): void {
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
  f.Q.value = q;
  src.connect(f);
  f.connect(env(c, at, 0.004, dur * 0.2, dur * 0.8, peak));
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

function tone(
  c: AudioContext,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  dropTo?: number,
): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (dropTo) o.frequency.exponentialRampToValueAtTime(dropTo, at + dur);
  o.connect(env(c, at, 0.01, dur * 0.15, dur * 0.85, peak));
  o.start(at);
  o.stop(at + dur + 0.05);
}

export function play(kind: SoundKind): void {
  const c = audio();
  if (!c || !noise) return;
  const t = c.currentTime + 0.02;
  switch (kind) {
    case "letter":
      // A quill: three quick scratches.
      for (const [d, f] of [
        [0, 3800],
        [0.11, 4600],
        [0.2, 3300],
      ] as const)
        hiss(c, t + d, 0.07, "bandpass", f, 3, 0.5);
      break;
    case "seal":
      tone(c, t, 110, 0.16, "sine", 0.6, 55);
      hiss(c, t, 0.06, "lowpass", 600, 0.7, 0.3);
      break;
    case "bell":
      // Two strikes of a ship's bell.
      for (const d of [0, 0.38])
        for (const [mult, peak] of [
          [1, 0.35],
          [2.76, 0.12],
          [5.4, 0.05],
        ] as const)
          tone(c, t + d, 620 * mult, 1.6, "sine", peak);
      break;
    case "drums":
      for (const d of [0, 0.24, 0.48, 0.6, 0.84]) {
        tone(c, t + d, 90, 0.22, "sine", 0.7, 45);
        hiss(c, t + d, 0.08, "lowpass", 900, 0.8, 0.25);
      }
      break;
    case "cannon":
      hiss(c, t, 0.9, "lowpass", 1400, 0.6, 0.9, 120);
      tone(c, t, 60, 0.7, "sine", 0.8, 30);
      break;
    case "victory":
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(c, t + i * 0.13, f, i === 3 ? 0.6 : 0.16, "triangle", 0.25),
      );
      break;
    case "defeat":
      [392, 311, 262].forEach((f, i) =>
        tone(c, t + i * 0.28, f, 0.5, "triangle", 0.22),
      );
      break;
    case "colony":
      for (const d of [0, 0.16, 0.42])
        hiss(c, t + d, 0.05, "bandpass", 1700, 6, 0.6);
      break;
  }
}
