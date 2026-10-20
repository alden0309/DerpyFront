// Mr. Based's settings, kept in this browser: timed choices on or off, how
// fast text types in, the sound, whether the things he can look at are
// marked, and how fine the pictures are.

export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface Prefs {
  timers: boolean;
  speed: TextSpeed;
  sound: boolean;
  /** The master volume. */
  volume: number;
  /** r25: each part of the sound's own level, under the master. */
  music: number;
  ambience: number;
  effects: number;
  /** r21: mark every hotspot (otherwise only on hover, or holding Tab). */
  marks: boolean;
  /** r21: the 3D pictures' quality. */
  quality: "auto" | "high" | "low";
}

const KEY = "based_prefs";
const DEFAULTS: Prefs = {
  timers: true,
  speed: "normal",
  sound: true,
  volume: 0.7,
  music: 0.6,
  ambience: 0.8,
  effects: 0.8,
  marks: false,
  quality: "auto",
};

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // private window or blocked storage: the defaults will do
  }
  return { ...DEFAULTS };
}

export function savePrefs(p: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // not kept, which is fine
  }
}

/** r25: the sound's levels from the settings. */
export function levelsOf(p: Prefs): {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
} {
  return {
    master: p.volume,
    music: p.music,
    ambience: p.ambience,
    effects: p.effects,
    muted: !p.sound,
  };
}

/** Characters per second; 0 means all at once. */
export const CPS: Record<TextSpeed, number> = {
  slow: 28,
  normal: 52,
  fast: 110,
  instant: 0,
};
