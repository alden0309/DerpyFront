// CQ24 (r24): where the winter lies on the map, and when. Hard Winter, a map
// style of the Derp Store, became the base game's winter for everyone: from
// the first frosts late in November, deep through December and January, to
// the thaw in early February, and only where it really snowed and froze.
//
// It's decided by the map's own facts, as the engine's seasons are
// (Map.isWinter, Seasons.ts): latitude first, then the lie of the land
// (mountains and hills colder, the coast milder, the Pacific coast much
// milder, the deep interior colder than the Atlantic shore at the same
// latitude, the desert drier), so that
// - New England, New France, the interior of the northern colonies and the
//   mountains get it fully;
// - the middle colonies' coast most of it, the Chesapeake a lighter touch;
// - the Carolinas' coast, Florida, the Gulf, the Caribbean, New Spain and
//   the south none at all;
// - the southern hemisphere has its winter in its own months (the board
//   has no province there yet, but the reckoning is ready for one).
//
// It never contradicts what the engine does with winter: nowhere the engine
// has no winter gets snow, and where the engine keeps snow on the roads
// after the thaw (the far north, through February and into March:
// Seasons.roadFactor) the map keeps a lighter snow until it goes.
//
// Pure, and the same on every screen: the map draws it (client/WinterLook.ts)
// and the tests check it. Nothing in the simulation reads it.

import { dateOf } from "./Calendar";
import { isWinter } from "./Map";
import { isNorth } from "./Seasons";

/** A place, as far as the snow cares (a province of the map). */
export interface SnowPlace {
  lat: number;
  lon: number;
  coastal: boolean;
  terrain?: string;
  /** Off the board (drawn dark): no snow is drawn there. */
  closed?: boolean;
}

/** How deep a winter each kind of country gets, and where the lines fall. */
export const SNOW = {
  /** An "effective latitude" at or above these gets the full winter, most of it, or a light touch. */
  full: 40.5,
  mid: 38.5,
  light: 35.5,
  /** What each gets (1: the full winter). */
  depth: { full: 1, mid: 0.75, light: 0.45 },
  /** The lie of the land, in degrees of latitude it's worth. */
  mountains: 4,
  hills: 2,
  /** Inland, between the Rockies and the Appalachians: the continent's own cold. */
  interior: 1,
  desert: -2,
  coast: -1,
  /** The Pacific coast (west of 117.5°W): the ocean keeps it mild. */
  pacificCoast: -9,
  /** West of the Sierra and the Cascades (119.5°W; California's valley, 118°W), south of 50°N, inland. */
  pacificSlope: -4,
  /** After the thaw, where the engine still has snow on the roads: this much of it lingers. */
  linger: 0.5,
} as const;

/**
 * How hard the winter is at a place, from 0 (none) to 1 (the full winter):
 * the map's own facts, as the engine's seasons read them.
 */
export function winterReach(p: SnowPlace): number {
  if (p.closed) return 0;
  const south = p.lat < 0;
  // Nowhere the engine gives no winter at all.
  if (!isWinter(p.lat, south ? 6 : 0)) return 0;
  let e = Math.abs(p.lat);
  const pacific = !south && p.lon < -117.5;
  if (p.coastal) e += pacific ? SNOW.pacificCoast : SNOW.coast;
  else if (
    !south &&
    p.lat < 50 &&
    (p.lon < -119.5 || (p.lon < -118 && p.terrain === "plains"))
  )
    e += SNOW.pacificSlope;
  if (p.terrain === "mountains") e += SNOW.mountains;
  else if (p.terrain === "hills" && !p.coastal) e += SNOW.hills;
  if (!p.coastal && !south && p.lon > -115 && p.lon < -80) e += SNOW.interior;
  if (p.terrain === "desert") e += SNOW.desert;
  if (p.terrain === "tundra") e = Math.max(e, SNOW.full);
  if (e >= SNOW.full) return SNOW.depth.full;
  if (e >= SNOW.mid) return SNOW.depth.mid;
  if (e >= SNOW.light) return SNOW.depth.light;
  return 0;
}

/**
 * The stages of the winter through the year (northern hemisphere): from the
 * first frosts to deep winter, and the thaw. `from` is [month (0-11), day].
 * The southern hemisphere's run six months later.
 */
export const WINTER_STAGES: readonly {
  from: [number, number];
  strength: number;
  name: string;
}[] = [
  { from: [10, 18], strength: 0.25, name: "the first frosts" },
  { from: [10, 25], strength: 0.5, name: "the first snow" },
  { from: [11, 1], strength: 1, name: "deep winter" },
  { from: [1, 1], strength: 0.6, name: "the thaw begins" },
  { from: [1, 8], strength: 0.3, name: "the thaw" },
  { from: [1, 15], strength: 0, name: "" },
];

/** Which stage a date is in (an index of WINTER_STAGES, or -1 outside the winter). */
export function winterStageIndex(day: number, south = false): number {
  const d = dateOf(day);
  const month = south ? (d.month + 6) % 12 : d.month;
  // The winter runs over the turn of the year: count July to December first.
  const order = (m: number, dd: number) => (m >= 6 ? 0 : 400) + m * 32 + dd;
  const now = order(month, d.day);
  let k = -1;
  for (let i = 0; i < WINTER_STAGES.length; i++) {
    const [m, dd] = WINTER_STAGES[i].from;
    if (now >= order(m, dd)) k = i;
  }
  // Before the first frosts (summer and autumn), or after the thaw.
  if (k < 0 || WINTER_STAGES[k].strength <= 0) return -1;
  return k;
}

/** How far into the winter a date is, 0 to 1 (0 outside it). */
export function winterStrength(day: number, south = false): number {
  const k = winterStageIndex(day, south);
  return k < 0 ? 0 : WINTER_STAGES[k].strength;
}

/** Whether the engine keeps snow on the roads at this latitude this month (Seasons.roadFactor's snow). */
export function roadSnow(lat: number, month: number): boolean {
  return isWinter(lat, month) && isNorth(lat);
}

/** The snow on a place on a day, 0 to 1: its winter's reach, by the stage of the winter. */
export function snowOn(p: SnowPlace, day: number): number {
  const reach = winterReach(p);
  if (reach <= 0) return 0;
  let strength = winterStrength(day, p.lat < 0);
  if (strength < SNOW.linger && roadSnow(p.lat, dateOf(day).month))
    strength = SNOW.linger;
  return Math.round(reach * strength * 1000) / 1000;
}

/**
 * A key that changes only when the drawn winter does (a new stage, or the
 * engine's snow ending in the far north): the chart is redrawn, and the
 * winter's mask made again, only then.
 */
export function snowKey(day: number): string {
  const month = dateOf(day).month;
  return [
    winterStageIndex(day, false),
    winterStageIndex(day, true),
    roadSnow(43, month) ? "r" : "",
    roadSnow(45, month) ? "R" : "",
  ].join(":");
}
