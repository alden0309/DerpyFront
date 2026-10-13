// Mr. Based's settings, kept in this browser: timed choices on or off, how
// fast text types in, and the sound.

export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface Prefs {
  timers: boolean;
  speed: TextSpeed;
  sound: boolean;
  volume: number;
}

const KEY = "based_prefs";
const DEFAULTS: Prefs = {
  timers: true,
  speed: "normal",
  sound: true,
  volume: 0.7,
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
