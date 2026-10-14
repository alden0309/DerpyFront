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

export type DomeShimmer = "hex" | "ripple" | "sparkle" | "aurora" | "scan";

/** Shader codes for the shimmers (0 is a plain shield). */
export const DOME_SHIMMER_CODE: Record<DomeShimmer, number> = {
  hex: 1,
  ripple: 2,
  sparkle: 3,
  aurora: 4,
  scan: 5,
};

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
      shimmer: "ripple",
      speed: 0.6,
      burst: { type: "embers", colors: ["#d9ff66", "#7cff00"] },
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
