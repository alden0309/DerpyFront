// Derpy Front (DFSTORE r21): the Derp Store's victory fanfares, made in the
// browser with WebAudio (no recordings, so nothing to license or download).
// Each fanfare is a few bars on a tiny synthesizer: oscillators, filters and
// noise shaped into brass, pipes, steel pans, voices, strings and drums.
//
// The shanty's tune is "What Shall We Do with the Drunken Sailor?", a
// traditional sea shanty in the public domain; the other tunes are new.

export const FANFARE_NAMES = [
  "fanfare_chiptune",
  "fanfare_bagpipes",
  "fanfare_brass",
  "fanfare_steeldrum",
  "fanfare_shanty",
  "fanfare_orchestral",
] as const;
export type FanfareName = (typeof FANFARE_NAMES)[number];

export function isFanfare(
  name: string | null | undefined,
): name is FanfareName {
  return (FANFARE_NAMES as readonly string[]).includes(name ?? "");
}

type Voice =
  | "trumpet"
  | "trombone"
  | "square"
  | "triangle"
  | "pipe"
  | "drone"
  | "steel"
  | "choir"
  | "strings"
  | "horn"
  | "kick"
  | "snare"
  | "noise"
  | "shaker"
  | "stamp"
  | "timpani";

/** [start beat, length in beats, MIDI note (drums: ignored), voice, level]. */
type Note = [number, number, number, Voice, number?];

interface Score {
  bpm: number;
  notes: Note[];
}

// Note names to MIDI, for readable scores.
const N: Record<string, number> = {};
for (const [i, n] of [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
].entries()) {
  for (let o = 1; o <= 7; o++) N[`${n}${o}`] = 12 * (o + 1) + i;
}

function line(
  voice: Voice,
  start: number,
  notes: [string, number][],
  level = 1,
): Note[] {
  const out: Note[] = [];
  let t = start;
  for (const [name, len] of notes) {
    if (name !== "-") out.push([t, len, N[name], voice, level]);
    t += len;
  }
  return out;
}

function chord(
  voice: Voice,
  start: number,
  len: number,
  names: string[],
  level = 0.5,
): Note[] {
  return names.map((n): Note => [start, len, N[n], voice, level]);
}

function hits(voice: Voice, beats: number[], level = 1): Note[] {
  return beats.map((b): Note => [b, 0.25, 0, voice, level]);
}

const SCORES: Record<FanfareName, Score> = {
  // A level-clear jingle: a rising arpeggio, then the victory call.
  fanfare_chiptune: {
    bpm: 150,
    notes: [
      ...line("square", 0, [
        ["C5", 0.25],
        ["E5", 0.25],
        ["G5", 0.25],
        ["C6", 0.25],
        ["E6", 0.25],
        ["G6", 0.75],
        ["-", 0.5],
        ["G5", 0.5],
        ["G5", 0.5],
        ["G5", 0.5],
        ["C6", 3],
      ]),
      ...line(
        "triangle",
        0,
        [
          ["C3", 1],
          ["G3", 1],
          ["E3", 1],
          ["G3", 1],
          ["C3", 3],
        ],
        0.8,
      ),
      ...hits("noise", [0, 1, 2, 3, 3.5, 4], 0.5),
    ],
  },
  // Pipes over a drone in A: grace notes before the long notes.
  fanfare_bagpipes: {
    bpm: 96,
    notes: [
      [0, 9, N.A2, "drone", 0.5],
      [0, 9, N.A3, "drone", 0.35],
      ...line("pipe", 0.2, [
        ["G5", 0.1],
        ["A4", 0.9],
        ["C#5", 0.5],
        ["E5", 0.5],
        ["G5", 0.1],
        ["A5", 1.4],
        ["F#5", 0.5],
        ["E5", 0.5],
        ["C#5", 0.5],
        ["D5", 0.5],
        ["G5", 0.1],
        ["E5", 0.9],
        ["C#5", 0.5],
        ["B4", 0.5],
        ["G5", 0.1],
        ["A4", 2.4],
      ]),
      ...hits("snare", [0, 2, 4, 6, 8], 0.4),
    ],
  },
  // A parade call: three pickups, the big note, and the band answers.
  fanfare_brass: {
    bpm: 120,
    notes: [
      ...line("trumpet", 0, [
        ["G4", 1 / 3],
        ["G4", 1 / 3],
        ["G4", 1 / 3],
        ["C5", 1],
        ["G4", 0.5],
        ["C5", 0.5],
        ["E5", 0.5],
        ["G5", 2.5],
      ]),
      ...line(
        "trumpet",
        2,
        [
          ["E4", 0.5],
          ["G4", 0.5],
          ["C5", 0.5],
          ["E5", 2.5],
        ],
        0.55,
      ),
      ...line(
        "trombone",
        1,
        [
          ["C3", 1],
          ["G2", 1],
          ["C3", 0.5],
          ["E3", 0.5],
          ["C3", 2.5],
        ],
        0.7,
      ),
      ...hits("kick", [1, 2, 3, 4, 5], 0.9),
      ...hits("snare", [1.5, 2.5, 3.5], 0.35),
    ],
  },
  // Steel pans on a calypso lilt, with a shaker.
  fanfare_steeldrum: {
    bpm: 132,
    notes: [
      ...line("steel", 0, [
        ["C5", 0.5],
        ["E5", 0.5],
        ["G5", 0.75],
        ["E5", 0.25],
        ["F5", 0.5],
        ["A5", 0.5],
        ["G5", 1],
        ["E5", 0.5],
        ["C6", 0.5],
        ["B5", 0.5],
        ["G5", 0.5],
        ["C6", 2],
      ]),
      ...line(
        "steel",
        0,
        [
          ["C4", 1.5],
          ["G4", 0.5],
          ["F4", 1],
          ["G4", 1],
          ["C4", 1.5],
          ["G4", 0.5],
          ["C4", 2],
        ],
        0.45,
      ),
      ...hits(
        "shaker",
        [0, 0.5, 0.75, 1.5, 2, 2.5, 2.75, 3.5, 4, 4.5, 4.75, 5.5, 6, 6.5],
        0.35,
      ),
      ...hits("kick", [0, 1.5, 2, 3.5, 4, 5.5, 6], 0.5),
    ],
  },
  // The crew sings the first two lines of the Drunken Sailor, stamping.
  fanfare_shanty: {
    bpm: 112,
    notes: [
      ...line("choir", 0, [
        ["A4", 0.5],
        ["A4", 0.25],
        ["A4", 0.25],
        ["A4", 0.5],
        ["A4", 0.25],
        ["A4", 0.25],
        ["A4", 0.5],
        ["D4", 0.5],
        ["F4", 0.5],
        ["A4", 0.5],
        ["G4", 0.5],
        ["G4", 0.25],
        ["G4", 0.25],
        ["G4", 0.5],
        ["G4", 0.25],
        ["G4", 0.25],
        ["G4", 0.5],
        ["C4", 0.5],
        ["E4", 0.5],
        ["G4", 0.5],
        ["A4", 0.5],
        ["A4", 0.25],
        ["A4", 0.25],
        ["A4", 0.5],
        ["B4", 0.5],
        ["C5", 0.5],
        ["D5", 0.5],
        ["C5", 0.5],
        ["A4", 0.5],
        ["G4", 0.5],
        ["E4", 0.5],
        ["D4", 1.5],
      ]),
      ...line(
        "choir",
        0,
        [
          ["D3", 2],
          ["D3", 2],
          ["C3", 2],
          ["C3", 2],
          ["D3", 2],
          ["A2", 1],
          ["D3", 2],
        ],
        0.45,
      ),
      ...hits("stamp", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 0.8),
    ],
  },
  // Strings swell under a horn call; timpani roll into the last chord.
  fanfare_orchestral: {
    bpm: 84,
    notes: [
      ...chord("strings", 0, 2, ["D3", "A3", "D4", "F#4"], 0.32),
      ...chord("strings", 2, 2, ["G3", "B3", "D4", "G4"], 0.32),
      ...chord("strings", 4, 1.5, ["A3", "C#4", "E4", "A4"], 0.32),
      ...chord("strings", 5.5, 3.5, ["D3", "A3", "D4", "F#4", "A4"], 0.34),
      ...line("horn", 0.5, [
        ["A4", 0.5],
        ["D5", 1],
        ["F#5", 0.5],
        ["E5", 0.5],
        ["D5", 0.5],
        ["B4", 0.5],
        ["E5", 1],
        ["A4", 0.5],
        ["C#5", 0.5],
        ["E5", 0.5],
        ["D5", 3.5],
      ]),
      ...hits("timpani", [0, 2, 4, 4.75, 5, 5.25, 5.5], 0.7),
    ],
  },
};

/** How long a fanfare plays, in seconds (its last note's end, plus a tail). */
export function fanfareSeconds(name: FanfareName): number {
  const s = SCORES[name];
  const end = Math.max(...s.notes.map(([t, len]) => t + len));
  return (end * 60) / s.bpm + 0.6;
}

/** The notes' count, voices and timing, for tests. */
export function fanfareScore(name: FanfareName): {
  bpm: number;
  notes: readonly Note[];
} {
  return SCORES[name];
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer !== null && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // A fixed sequence, so every play sounds the same.
  let x = 12345;
  for (let i = 0; i < data.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = x / 0x3fffffff - 1;
  }
  noiseBuffer = buf;
  return buf;
}

/** An attack-decay-sustain-release envelope on a gain node. */
function envelope(
  g: GainNode,
  t: number,
  dur: number,
  peak: number,
  a: number,
  d: number,
  sustain: number,
  r: number,
): number {
  const p = g.gain;
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.linearRampToValueAtTime(peak * sustain, t + a + d);
  const end = Math.max(t + a + d, t + dur);
  p.setValueAtTime(peak * sustain, end);
  p.exponentialRampToValueAtTime(0.0001, end + r);
  return end + r;
}

function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  hz: number,
  t: number,
  stop: number,
  out: AudioNode,
  detune = 0,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, t);
  o.detune.setValueAtTime(detune, t);
  o.connect(out);
  o.start(t);
  o.stop(stop + 0.05);
  return o;
}

function vibrato(
  ctx: BaseAudioContext,
  o: OscillatorNode,
  t: number,
  stop: number,
  rate: number,
  cents: number,
): void {
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.setValueAtTime(rate, t);
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + 0.25);
  lfo.connect(depth);
  depth.connect(o.detune);
  lfo.start(t);
  lfo.stop(stop + 0.05);
}

function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  hz: number,
  q: number,
  out: AudioNode,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  f.connect(out);
  return f;
}

function noiseHit(
  ctx: BaseAudioContext,
  t: number,
  out: AudioNode,
  type: BiquadFilterType,
  hz: number,
  level: number,
  decay: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const g = ctx.createGain();
  const f = filter(ctx, type, hz, 0.8, g);
  g.connect(out);
  src.connect(f);
  envelope(g, t, 0, level, 0.003, decay, 0.0001, 0.02);
  src.start(t, (t * 7919) % 0.5);
  src.stop(t + decay + 0.1);
}

function drum(
  ctx: BaseAudioContext,
  t: number,
  out: AudioNode,
  from: number,
  to: number,
  level: number,
  decay: number,
): void {
  const g = ctx.createGain();
  g.connect(out);
  const o = osc(ctx, "sine", from, t, t + decay, g);
  o.frequency.exponentialRampToValueAtTime(to, t + decay * 0.6);
  envelope(g, t, 0, level, 0.004, decay, 0.0001, 0.02);
}

/** Schedules one note. */
function play(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  midi: number,
  voice: Voice,
  level: number,
): void {
  switch (voice) {
    case "kick":
      return drum(ctx, t, out, 120, 45, 0.8 * level, 0.3);
    case "timpani":
      drum(ctx, t, out, 110, 80, 0.7 * level, 0.6);
      return noiseHit(ctx, t, out, "lowpass", 400, 0.15 * level, 0.2);
    case "snare":
      return noiseHit(ctx, t, out, "highpass", 1800, 0.35 * level, 0.12);
    case "noise":
      return noiseHit(ctx, t, out, "highpass", 3000, 0.25 * level, 0.05);
    case "shaker":
      return noiseHit(ctx, t, out, "highpass", 6000, 0.2 * level, 0.06);
    case "stamp":
      drum(ctx, t, out, 90, 50, 0.55 * level, 0.18);
      return noiseHit(ctx, t, out, "lowpass", 300, 0.4 * level, 0.08);
  }
  const hz = midiHz(midi);
  const g = ctx.createGain();
  g.connect(out);
  switch (voice) {
    case "trumpet":
    case "trombone": {
      const bright = voice === "trumpet" ? 2400 : 1100;
      const f = filter(ctx, "lowpass", bright, 1.2, g);
      const end = envelope(g, t, dur, 0.22 * level, 0.03, 0.08, 0.8, 0.12);
      const o = osc(ctx, "sawtooth", hz, t, end, f);
      vibrato(ctx, o, t, end, 5.5, 8);
      f.frequency.setValueAtTime(bright * 0.4, t);
      f.frequency.linearRampToValueAtTime(bright, t + 0.06);
      break;
    }
    case "horn": {
      const f = filter(ctx, "lowpass", 900, 0.7, g);
      const end = envelope(g, t, dur, 0.26 * level, 0.06, 0.1, 0.85, 0.25);
      osc(ctx, "triangle", hz, t, end, f);
      const o = osc(ctx, "sawtooth", hz, t, end, f, 4);
      vibrato(ctx, o, t, end, 5, 6);
      break;
    }
    case "square": {
      const end = envelope(g, t, dur, 0.09 * level, 0.005, 0.05, 0.7, 0.05);
      osc(ctx, "square", hz, t, end, g);
      break;
    }
    case "triangle": {
      const end = envelope(g, t, dur, 0.22 * level, 0.005, 0.05, 0.8, 0.05);
      osc(ctx, "triangle", hz, t, end, g);
      break;
    }
    case "pipe": {
      const f = filter(ctx, "bandpass", hz * 3, 1.5, g);
      const end = envelope(g, t, dur, 0.5 * level, 0.01, 0.03, 0.9, 0.05);
      osc(ctx, "sawtooth", hz, t, end, f);
      osc(ctx, "square", hz, t, end, f, 6);
      break;
    }
    case "drone": {
      const f = filter(ctx, "lowpass", 1400, 1, g);
      const end = envelope(g, t, dur, 0.1 * level, 0.3, 0.1, 1, 0.4);
      osc(ctx, "sawtooth", hz, t, end, f);
      osc(ctx, "sawtooth", hz, t, end, f, 5);
      break;
    }
    case "steel": {
      // A bell: a sine with a quickly fading partial an octave and a fifth up.
      const end = envelope(g, t, 0, 0.3 * level, 0.004, 0.5, 0.15, 0.4);
      osc(ctx, "sine", hz, t, end, g);
      const g2 = ctx.createGain();
      g2.connect(out);
      const end2 = envelope(g2, t, 0, 0.12 * level, 0.002, 0.15, 0.0001, 0.05);
      osc(ctx, "sine", hz * 3, t, end2, g2);
      break;
    }
    case "choir": {
      // "Ah": two formants over detuned saws, with a singer's vibrato.
      const f1 = filter(ctx, "bandpass", 750, 4, g);
      const f2 = filter(ctx, "bandpass", 1150, 5, g);
      const end = envelope(g, t, dur, 0.45 * level, 0.04, 0.1, 0.85, 0.15);
      for (const d of [-9, 0, 9]) {
        const o = osc(ctx, "sawtooth", hz, t, end, f1, d);
        o.connect(f2);
        vibrato(ctx, o, t, end, 5 + d / 10, 12);
      }
      break;
    }
    case "strings": {
      const f = filter(ctx, "lowpass", 1800, 0.6, g);
      const end = envelope(g, t, dur, 0.12 * level, 0.35, 0.2, 0.9, 0.6);
      for (const d of [-7, 7]) {
        const o = osc(ctx, "sawtooth", hz, t, end, f, d);
        vibrato(ctx, o, t, end, 5.5, 7);
      }
      break;
    }
  }
}

export interface FanfarePlayback {
  /** Seconds it lasts. */
  duration: number;
  /** Fades it out at once. */
  stop(): void;
}

/**
 * Plays a fanfare into `destination` (the context's speakers by default) at
 * `volume` (0–1). Returns null when there is nothing to play it on.
 */
export function playFanfare(
  name: FanfareName,
  opts: {
    ctx?: AudioContext | null;
    destination?: AudioNode | null;
    volume: number;
  },
): FanfarePlayback | null {
  if (opts.volume <= 0) return null;
  let ctx = opts.ctx ?? null;
  if (ctx === null) {
    const Ctor =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext);
    if (!Ctor) return null;
    ctx = sharedContext ??= new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const score = SCORES[name];
  const beat = 60 / score.bpm;
  const master = ctx.createGain();
  master.gain.value = Math.min(1, opts.volume);
  master.connect(opts.destination ?? ctx.destination);
  const t0 = ctx.currentTime + 0.05;
  for (const [start, len, midi, voice, level] of score.notes) {
    play(ctx, master, t0 + start * beat, len * beat, midi, voice, level ?? 1);
  }
  const duration = fanfareSeconds(name);
  const c = ctx;
  return {
    duration,
    stop() {
      const now = c.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.15);
      setTimeout(() => master.disconnect(), 300);
    },
  };
}

let sharedContext: AudioContext | null = null;

// ---- The fanfare you've chosen (kept in this browser, like your skin) ----

export const FANFARE_KEY = "derpyFanfare";

export function chosenFanfare(): FanfareName | null {
  try {
    const v = window.localStorage.getItem(FANFARE_KEY);
    return isFanfare(v) ? v : null;
  } catch {
    return null;
  }
}

export function chooseFanfare(name: FanfareName | null): void {
  try {
    if (name === null) window.localStorage.removeItem(FANFARE_KEY);
    else window.localStorage.setItem(FANFARE_KEY, name);
  } catch {
    // storage blocked: nothing to remember it in
  }
}
