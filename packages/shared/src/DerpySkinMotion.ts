// SITE (r22): Derp Store skins that move. A skin is still one tiling PNG;
// a skin listed here also gets a motion the territory shader plays over it
// (territory.frag.glsl). Looks only: nothing in the simulation reads it, and
// with "reduce motion" on, every skin holds still.

/** The motions, in shader code order (code = index + 1; 0 is still). */
export const SKIN_MOTIONS = ["drift", "ripple", "shimmer", "twinkle"] as const;
export type SkinMotion = (typeof SKIN_MOTIONS)[number];

/** What each motion does, for the store. */
export const SKIN_MOTION_TEXT: Record<SkinMotion, string> = {
  drift: "Drifts slowly across your land",
  ripple: "Ripples like heat over a fire, or water",
  shimmer: "A gleam of light sweeps across it",
  twinkle: "Its lights twinkle",
};

/** The skins that move, by name. */
export const DERPY_SKIN_MOTION: Readonly<Record<string, SkinMotion>> = {
  motion_lava: "ripple",
  motion_aurora: "ripple",
  motion_fireflies: "twinkle",
  motion_clouds: "drift",
  motion_honey: "shimmer",
};

/** A skin's name from its image's URL (/derpy-skins/<name>.png, maybe hashed or on a CDN). */
export function skinNameFromUrl(url: string): string | null {
  return /\/derpy-skins\/([a-z0-9_]+)/.exec(url)?.[1] ?? null;
}

/** The shader's code for a skin's motion (0: it holds still). */
export function skinMotionCode(url: string | null | undefined): number {
  if (!url) return 0;
  const name = skinNameFromUrl(url);
  const motion = name === null ? undefined : DERPY_SKIN_MOTION[name];
  return motion === undefined ? 0 : SKIN_MOTIONS.indexOf(motion) + 1;
}

/**
 * The shader's clock for skins, in seconds. It wraps every 1440 s, which
 * every motion's period divides (8, 9, 10, 3, 240 and 720 s), so the wrap
 * can't be seen.
 */
export const SKIN_TIME_WRAP = 1440;
