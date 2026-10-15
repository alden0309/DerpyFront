// Mr. Based's weather (r22), as numbers the world draws from: how hard it's
// raining, how thick the fog is, how wet the ground is (puddles form while
// it rains and go slowly after), and how wet a person is (soaked in the
// rain, drying slowly indoors). The story sets the weather (`@weather
// rain`); left to itself ("changing") it drifts between rain, drizzle,
// a clearing and fog. Pure: the world steps it with its own clock.

export type WeatherKind = "rain" | "drizzle" | "clear" | "fog" | "changing";

export interface WeatherState {
  /** 0 (none) to 1 (a downpour). */
  rain: number;
  /** 0 to 1. */
  fog: number;
  /** How wet the ground is, 0 to 1: puddles and the shine on the stone. */
  ground: number;
}

/** What each weather settles to. */
const TARGETS: Record<Exclude<WeatherKind, "changing">, [number, number]> = {
  rain: [1, 0.15],
  drizzle: [0.35, 0.3],
  clear: [0, 0.05],
  fog: [0.05, 1],
};

/** The drifting weather's cycle, in seconds, and what each part is. */
const CYCLE: [number, Exclude<WeatherKind, "changing">][] = [
  [150, "rain"],
  [90, "drizzle"],
  [60, "clear"],
  [50, "fog"],
  [80, "drizzle"],
];
const CYCLE_LEN = CYCLE.reduce((a, [d]) => a + d, 0);

/** The weather now: the story's, or where the drift has got to. */
export function weatherAt(
  kind: WeatherKind | null,
  t: number,
): Exclude<WeatherKind, "changing"> {
  if (kind !== null && kind !== "changing") return kind;
  let at = ((t % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
  for (const [d, k] of CYCLE) {
    if (at < d) return k;
    at -= d;
  }
  return "rain";
}

export function startWeather(kind: WeatherKind | null): WeatherState {
  const [rain, fog] = TARGETS[weatherAt(kind, 0)];
  return { rain, fog, ground: rain > 0.2 ? 1 : 0.3 };
}

/**
 * One step of `dt` seconds towards the weather wanted. Rain and fog ease in
 * over some seconds; the ground wets in about a minute of rain and takes
 * several to dry.
 */
export function stepWeather(
  s: WeatherState,
  want: Exclude<WeatherKind, "changing">,
  dt: number,
): WeatherState {
  const [rain, fog] = TARGETS[want];
  const ease = (a: number, b: number, tau: number) =>
    a + (b - a) * (1 - Math.exp(-dt / tau));
  const r = ease(s.rain, rain, 8);
  const ground =
    r > 0.05
      ? Math.min(1, s.ground + (dt / 60) * r)
      : Math.max(0, s.ground - dt / 400);
  return { rain: r, fog: ease(s.fog, fog, 12), ground };
}

/** How wet a person gets: in the rain outdoors, or drying. */
export function stepWetness(
  wet: number,
  rainOnHim: number,
  indoors: boolean,
  dt: number,
): number {
  if (!indoors && rainOnHim > 0.05) {
    return Math.min(1, wet + dt * 0.035 * rainOnHim);
  }
  // Dry in about four minutes indoors, slower out in the damp air.
  return Math.max(0, wet - dt * (indoors ? 0.0042 : 0.0015));
}
