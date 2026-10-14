// Mr. Based's settings, kept in this browser: timed choices on or off, how
// fast text types in, the sound, whether the things he can look at are
// marked, and how fine the pictures are.

export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface Prefs {
  timers: boolean;
  speed: TextSpeed;
  sound: boolean;
  volume: number;
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

/** Characters per second; 0 means all at once. */
export const CPS: Record<TextSpeed, number> = {
  slow: 28,
  normal: 52,
  fast: 110,
  instant: 0,
};
