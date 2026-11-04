// Derpy Front (DFSTORE r21): the Derp Store's Nuke & Dome effect packs.
//
// Each pack is a theme for two things you own in a game:
//  - your nukes: the trail they leave in flight and the burst when they land
//    (one look per bomb: atom, hydrogen and MIRV warheads). These ride
//    OpenFront's own nuke cosmetics (effects nukeTrail / nukeExplosion), so
//    the catalog served at /derpy/api/cosmetics.json carries them;
//  - your Domes of Alden: the shield's colour and shimmer, and the burst
//    when one stops a nuke. Drawn by DomeShieldPass from DERPY_DOME_STYLES.
//
// Everyone in the game sees them, like skins. Rendering only: nothing in the
// simulation reads them.

import type {
  NukeExplosionAttributes,
  NukeExplosionType,
  TrailEffectAttributes,
} from "./CosmeticSchemas";

export type DomeShimmer =
  | "hex"
  | "ripple"
  | "sparkle"
  | "aurora"
  | "scan"
  | "bubble"; // FX (r28)

/** Shader codes for the shimmers (0 is a plain shield). */
export const DOME_SHIMMER_CODE: Record<DomeShimmer, number> = {
  hex: 1,
  ripple: 2,
  sparkle: 3,
  aurora: 4,
  scan: 5,
  bubble: 6,
};

// ---- FX (r28): the layered burst each pack's nukes go off with ----

/** What a burst throws outward: each pack's own debris. */
export const BURST_DEBRIS = [
  "sparks", // hot streaks (Solar)
  "embers", // glowing blobs that bubble as they fall (Toxic)
  "shards", // spinning ice slivers that glint (Frost)
  "confetti", // tumbling sprinkles and peels (Banana)
  "stars", // four-point stars swept round (Cosmic)
  "coins", // flipping coins that catch the light (Golden)
] as const;
export type BurstDebris = (typeof BURST_DEBRIS)[number];

/** What a burst leaves behind for a few seconds: each pack's own residue. */
export const BURST_RESIDUE = [
  "flare", // solar flare loops and heat shimmer (Solar)
  "haze", // bubbling green haze (Toxic)
  "mist", // cold mist with crystal glints (Frost)
  "sprinkles", // a drift of sprinkles (Banana)
  "nebula", // a swirl of nebula colour and stars (Cosmic)
  "rays", // turning sun rays and coin glints (Golden)
] as const;
export type BurstResidue = (typeof BURST_RESIDUE)[number];

/** A pack's layered burst: flash, fireball, ring, debris and residue. */
export interface DerpyBurstLook {
  /** The flash and the light it throws on the ground. */
  flash: string;
  /** The fireball, hot to cool: it expands and cools through these. */
  fireball: [string, string, string, string];
  /** The shockwave ring's leading edge. */
  ring: string;
  debris: { kind: BurstDebris; colors: [string, string, string] };
  residue: { kind: BurstResidue; colors: [string, string, string] };
}

export interface DerpyDomeStyle {
  /** The shield's colour, as #rrggbb. */
  color: string;
  /** The colour its shimmer runs to. */
  accent: string;
  shimmer: DomeShimmer;
  /** How fast the shimmer moves (1 is the usual pace). */
  speed: number;
  /** The burst over a nuke this Dome stops. */
  burst: {
    type: "shockwave" | "sparkles" | "embers";
    colors: string[];
  };
}

export interface DerpyFxTheme {
  /** Store item id and effect-name stem (fx_<theme>). */
  name: string;
  trail: TrailEffectAttributes;
  /** One look for every bomb, scaled to each bomb's blast. */
  explosion: {
    type: "shockwave" | "sparkles" | "embers";
    colors: string[];
    /** Sparkles and embers: how many, for an atom bomb. */
    density?: number;
  };
  dome: DerpyDomeStyle;
  /** FX (r28): the layered burst (used for every bomb, and the Dome's). */
  burst: DerpyBurstLook;
}

export const DERPY_FX_THEMES: readonly DerpyFxTheme[] = [
  {
    name: "fx_solar",
    trail: {
      type: "gradient",
      colors: ["#fff3b0", "#ffb703", "#fb8500", "#d00000"],
      colorSize: 3,
      movementSpeed: 6,
    },
    explosion: {
      type: "shockwave",
      colors: ["#fff3b0", "#ffb703", "#fb8500", "#d00000"],
    },
    dome: {
      color: "#ffb703",
      accent: "#fff3b0",
      shimmer: "ripple",
      speed: 1,
      burst: { type: "shockwave", colors: ["#fff3b0", "#ffb703"] },
    },
    burst: {
      flash: "#fff6d5",
      fireball: ["#fffbe6", "#ffd166", "#fb8500", "#9d0208"],
      ring: "#ffcf5a",
      debris: { kind: "sparks", colors: ["#fff3b0", "#ffb703", "#fb5607"] },
      residue: { kind: "flare", colors: ["#ffd166", "#fb8500", "#d00000"] },
    },
  },
  {
    name: "fx_toxic",
    trail: {
      type: "transition",
      colors: ["#d9ff66", "#7cff00", "#2bb800"],
      frequency: 3,
    },
    explosion: {
      type: "embers",
      colors: ["#d9ff66", "#7cff00", "#2bb800", "#0d5c00"],
      density: 120,
    },
    dome: {
      color: "#5be300",
      accent: "#d9ff66",
      shimmer: "bubble",
      speed: 0.6,
      burst: { type: "embers", colors: ["#d9ff66", "#7cff00"] },
    },
    burst: {
      flash: "#efffc2",
      fireball: ["#eaffd0", "#8dff3c", "#2fb800", "#0f3300"],
      ring: "#a3ff3c",
      debris: { kind: "embers", colors: ["#e6ff80", "#7cff00", "#2bb800"] },
      residue: { kind: "haze", colors: ["#9dff3c", "#3fa000", "#173f00"] },
    },
  },
  {
    name: "fx_frost",
    trail: {
      type: "gradient",
      colors: ["#ffffff", "#bae6fd", "#7dd3fc", "#3b82f6"],
      colorSize: 4,
      movementSpeed: 3,
    },
    explosion: {
      type: "sparkles",
      colors: ["#ffffff", "#e0f2fe", "#7dd3fc", "#60a5fa"],
      density: 90,
    },
    dome: {
      color: "#7dd3fc",
      accent: "#ffffff",
      shimmer: "hex",
      speed: 0.8,
      burst: { type: "sparkles", colors: ["#ffffff", "#bae6fd"] },
    },
    burst: {
      flash: "#f0fbff",
      fireball: ["#f0fbff", "#93dcff", "#2f7cf0", "#0c1e5c"],
      ring: "#d6f1ff",
      debris: { kind: "shards", colors: ["#ffffff", "#bae6fd", "#60a5fa"] },
      residue: { kind: "mist", colors: ["#f0f9ff", "#bae6fd", "#93c5fd"] },
    },
  },
  {
    name: "fx_banana",
    trail: {
      type: "gradient",
      colors: ["#ffe135", "#fff8d6", "#ff8fab", "#7b3f00"],
      colorSize: 2,
      movementSpeed: 8,
    },
    explosion: {
      type: "sparkles",
      colors: ["#ffe135", "#fff8d6", "#ff8fab", "#a0522d"],
      density: 110,
    },
    dome: {
      color: "#ffd60a",
      accent: "#ff8fab",
      shimmer: "sparkle",
      speed: 1.2,
      burst: { type: "sparkles", colors: ["#ffe135", "#ff8fab"] },
    },
    burst: {
      flash: "#fffbe0",
      fireball: ["#fffdf0", "#ffe135", "#ffa62b", "#8b4513"],
      ring: "#ffef8a",
      debris: { kind: "confetti", colors: ["#ffe135", "#ff8fab", "#7dd3fc"] },
      residue: { kind: "sprinkles", colors: ["#ff8fab", "#ffe135", "#b4f0a8"] },
    },
  },
  {
    name: "fx_cosmic",
    trail: {
      type: "spiral",
      colors: ["#c084fc", "#22d3ee", "#f0abfc"],
      radius: 4,
      strands: 3,
      rotationSpeed: 3,
    },
    explosion: {
      type: "sparkles",
      colors: ["#f0abfc", "#c084fc", "#22d3ee", "#1e1b4b"],
      density: 140,
    },
    dome: {
      color: "#a855f7",
      accent: "#22d3ee",
      shimmer: "aurora",
      speed: 1,
      burst: { type: "sparkles", colors: ["#f0abfc", "#22d3ee"] },
    },
    burst: {
      flash: "#fbe8ff",
      fireball: ["#ffffff", "#f0abfc", "#a855f7", "#1e1b4b"],
      ring: "#67e8f9",
      debris: { kind: "stars", colors: ["#ffffff", "#f0abfc", "#22d3ee"] },
      residue: { kind: "nebula", colors: ["#c084fc", "#22d3ee", "#f472b6"] },
    },
  },
  {
    name: "fx_golden",
    trail: {
      type: "spiral",
      colors: ["#fff7cc", "#ffd700", "#b8860b"],
      radius: 3.5,
      strands: 2,
      rotationSpeed: 2.5,
    },
    explosion: {
      type: "sparkles",
      colors: ["#ffffff", "#fff7cc", "#ffd700", "#b8860b"],
      density: 160,
    },
    dome: {
      color: "#ffd700",
      accent: "#fffbe6",
      shimmer: "scan",
      speed: 0.7,
      burst: { type: "sparkles", colors: ["#fffbe6", "#ffd700"] },
    },
    burst: {
      flash: "#fffbea",
      fireball: ["#ffffff", "#fff2b3", "#ffc800", "#7a4b00"],
      ring: "#ffe27a",
      debris: { kind: "coins", colors: ["#fff7cc", "#ffd700", "#b8860b"] },
      residue: { kind: "rays", colors: ["#fff2b3", "#ffd700", "#ffb300"] },
    },
  },
];

/**
 * How big each bomb's burst is, in tiles across, and how fast it grows:
 * close to the usual look (the blast radius times 1.5, over 1.5 seconds).
 * MIRV warheads come many at once, so theirs are small and sparse.
 */
const BOMB_SCALE: Record<
  NukeExplosionType,
  { size: number; speed: number; thickness: number; density: number }
> = {
  atom: { size: 200, speed: 135, thickness: 8, density: 1 },
  hydro: { size: 460, speed: 300, thickness: 14, density: 1.6 },
  mirvWarhead: { size: 110, speed: 90, thickness: 5, density: 0.35 },
};

const SLOT_SUFFIX: Record<NukeExplosionType, string> = {
  atom: "atom",
  hydro: "hydro",
  mirvWarhead: "mirv",
};

/** The effect names a theme's nukes go by, slot by slot. */
export function fxEffectNames(theme: DerpyFxTheme): {
  nukeTrail: string;
  atom: string;
  hydro: string;
  mirvWarhead: string;
} {
  return {
    nukeTrail: `${theme.name}_trail`,
    atom: `${theme.name}_${SLOT_SUFFIX.atom}`,
    hydro: `${theme.name}_${SLOT_SUFFIX.hydro}`,
    mirvWarhead: `${theme.name}_${SLOT_SUFFIX.mirvWarhead}`,
  };
}

/** A theme's burst for one bomb, as OpenFront's nuke-explosion attributes. */
export function fxExplosionAttributes(
  theme: DerpyFxTheme,
  nukeType: NukeExplosionType,
): NukeExplosionAttributes {
  const s = BOMB_SCALE[nukeType];
  const base = {
    nukeType,
    colors: theme.explosion.colors,
    size: s.size,
    speed: s.speed,
    thickness: s.thickness,
    transitionSpeed: 2,
  };
  if (theme.explosion.type === "shockwave") {
    return { ...base, type: "shockwave" };
  }
  const density = Math.max(
    4,
    Math.round((theme.explosion.density ?? 80) * s.density),
  );
  return { ...base, type: theme.explosion.type, density };
}

/** A Dome's burst over a nuke it stopped (about an atom bomb's ring, small). */
export function domeBurstAttributes(
  style: DerpyDomeStyle,
): NukeExplosionAttributes {
  const base = {
    nukeType: "atom" as const,
    colors: style.burst.colors,
    size: 70,
    speed: 70,
    thickness: 4,
    transitionSpeed: 3,
  };
  return style.burst.type === "shockwave"
    ? { ...base, type: "shockwave" }
    : { ...base, type: style.burst.type, density: 40 };
}

export function findFxTheme(name: string): DerpyFxTheme | undefined {
  return DERPY_FX_THEMES.find((t) => t.name === name);
}

/** The Dome styles by name (a theme's name), for the shield renderer. */
export const DERPY_DOME_STYLES: ReadonlyMap<string, DerpyDomeStyle> = new Map(
  DERPY_FX_THEMES.map((t) => [t.name, t.dome]),
);

/**
 * The renderer's index for a Dome style (1-based, in theme order), or 0 for
 * a plain shield.
 */
export function domeStyleIndex(name: string | null | undefined): number {
  if (!name) return 0;
  const i = DERPY_FX_THEMES.findIndex((t) => t.name === name);
  return i < 0 ? 0 : i + 1;
}

/** The pack whose nuke effect is called `effectName` (fx_<theme>_atom…). */
export function fxThemeOfEffect(effectName: string): DerpyFxTheme | undefined {
  return DERPY_FX_THEMES.find((t) =>
    Object.values(fxEffectNames(t)).includes(effectName),
  );
}

/** The renderer's index for a pack (1-based, in theme order), or 0. */
export function fxThemeIndex(theme: DerpyFxTheme | undefined): number {
  return theme ? DERPY_FX_THEMES.indexOf(theme) + 1 : 0;
}

// ---- FX (r28): how big and how busy each burst is ----

/** "light" is the lighter fallback for low graphics settings. */
export type BurstDetail = "full" | "light";
/** A bomb's burst, or a Dome's over a nuke it stopped. */
export type BurstKind = NukeExplosionType | "domeStop";

export interface BurstPlan {
  /** The shockwave ring's final radius, in tiles. */
  ringRadius: number;
  /** The fireball's full radius, in tiles. */
  fireballRadius: number;
  /** How far the flash lights the ground, in tiles. */
  flashRadius: number;
  /** How long each layer lasts, in seconds. */
  flashSec: number;
  fireballSec: number;
  ringSec: number;
  residueSec: number;
  /** Particles thrown outward. */
  debris: number;
  /** Particles left drifting as the pack's residue. */
  residue: number;
  /** Whether the lingering residue field (haze, nebula, rays…) is drawn. */
  residueField: boolean;
}

/**
 * Each burst at full detail, for a pack of average density. The ring keeps
 * the catalog's size (an atom's is 200 tiles across). MIRV warheads come 350
 * at a time, so theirs are small and spare: a few sparks, no residue.
 */
const BURST_BASE: Readonly<Record<BurstKind, BurstPlan>> = {
  atom: {
    ringRadius: 100,
    fireballRadius: 30,
    flashRadius: 130,
    flashSec: 0.45,
    fireballSec: 2.4,
    ringSec: 1.5,
    residueSec: 5,
    debris: 90,
    residue: 40,
    residueField: true,
  },
  hydro: {
    ringRadius: 230,
    fireballRadius: 85,
    flashRadius: 320,
    flashSec: 0.7,
    fireballSec: 3.4,
    ringSec: 2.2,
    residueSec: 8,
    debris: 180,
    residue: 80,
    residueField: true,
  },
  mirvWarhead: {
    ringRadius: 55,
    fireballRadius: 15,
    flashRadius: 55,
    flashSec: 0.3,
    fireballSec: 1.4,
    ringSec: 1.0,
    residueSec: 2,
    debris: 8,
    residue: 0,
    residueField: false,
  },
  domeStop: {
    ringRadius: 46,
    fireballRadius: 14,
    flashRadius: 70,
    flashSec: 0.35,
    fireballSec: 1.3,
    ringSec: 1.0,
    residueSec: 3,
    debris: 40,
    residue: 16,
    residueField: true,
  },
};

/** The most burst particles alive at once; the oldest give way past it. */
export const BURST_PARTICLE_CAP: Readonly<Record<BurstDetail, number>> = {
  full: 12_288,
  light: 4_096,
};

/** The most bursts (fireball, ring and residue) drawn at once. */
export const BURST_CAP = 1_024;

/** A pack's debris count, relative to an average pack (density 120). */
function densityScale(theme: DerpyFxTheme): number {
  const d = theme.explosion.density ?? 120;
  return Math.min(1.35, Math.max(0.75, d / 120));
}

/**
 * How big and busy `theme`'s burst is for `kind` at `detail`. The light
 * fallback keeps the flash, fireball and ring, throws less debris, and
 * leaves no residue behind.
 */
export function burstPlan(
  theme: DerpyFxTheme,
  kind: BurstKind,
  detail: BurstDetail,
): BurstPlan {
  const base = BURST_BASE[kind];
  const debris = Math.round(base.debris * densityScale(theme));
  if (detail === "full") return { ...base, debris };
  return {
    ...base,
    flashRadius: base.flashRadius * 0.75,
    debris: Math.round(debris * 0.4),
    residue: 0,
    residueField: false,
    residueSec: Math.min(base.residueSec, base.fireballSec),
  };
}

/** #rrggbb as rgb 0–1. */
export function hexRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Relative luminance (sRGB weights) of a #rrggbb colour, 0–1. */
export function luminance(hex: string): number {
  const [r, g, b] = hexRgb01(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour `t` (0–1) of the way along a ramp of colours, blended between
 * neighbours: how a fireball cools from its first colour to its last.
 */
export function rampAt(
  colors: readonly string[],
  t: number,
): [number, number, number] {
  const n = colors.length;
  if (n === 0) return [1, 1, 1];
  const f = Math.min(1, Math.max(0, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  if (n === 1) return hexRgb01(colors[0]);
  const a = hexRgb01(colors[i]);
  const b = hexRgb01(colors[i + 1]);
  const k = f - i;
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

/** Colours per pack in BURST_LOOK_TABLE: flash, fireball ×4, ring, debris ×3, residue ×3. */
export const BURST_LOOK_COLORS = 12;

/**
 * Every pack's burst colours as one flat rgb table for the renderer: row
 * k-1 is pack k (fxThemeIndex), BURST_LOOK_COLORS colours each.
 */
export function burstLookTable(): Float32Array {
  const out = new Float32Array(DERPY_FX_THEMES.length * BURST_LOOK_COLORS * 3);
  DERPY_FX_THEMES.forEach((t, k) => {
    const b = t.burst;
    const cols = [
      b.flash,
      ...b.fireball,
      b.ring,
      ...b.debris.colors,
      ...b.residue.colors,
    ];
    cols.forEach((c, i) =>
      out.set(hexRgb01(c), (k * BURST_LOOK_COLORS + i) * 3),
    );
  });
  return out;
}
