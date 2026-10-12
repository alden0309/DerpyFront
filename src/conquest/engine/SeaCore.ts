// SEA (r15): the sea's own bookkeeping. Where the hurricanes, cruises,
// voyages and privateers fitting out live in the game, the delta that
// carries them to the players, the track's own dice (so the world's dice
// are never disturbed), and the small sums everything at sea shares: a
// point moved along a heading, the km between two points, which ships and
// players are where.

import type { ConquestGame } from "./Game";
import { Rng } from "./Rng";
import type {
  Cruise,
  GameState,
  Life,
  MapDef,
  SeaState,
  Underway,
  Voyage,
} from "./Types";

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

/** Something at sea changed: it goes out with the next delta. */
export function seaChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

/** The state, made the first time it's needed (old saves have none). */
export function seaState(g: ConquestGame): SeaState {
  const s = g.s;
  if (!s.sea) {
    s.sea = { storms: [], cruises: [], voyages: [], subs: [] };
    seaChanged(g);
  }
  s.sea.storms ??= [];
  s.sea.cruises ??= [];
  s.sea.voyages ??= [];
  s.sea.subs ??= [];
  return s.sea;
}

/** Read-only: the state as it is (empty lists for an old save). */
export function seaOf(s: GameState): SeaState {
  return {
    storms: s.sea?.storms ?? [],
    cruises: s.sea?.cruises ?? [],
    voyages: s.sea?.voyages ?? [],
    subs: s.sea?.subs ?? [],
  };
}

/** The sea, when any of it changed since the last call (and clears it). */
export function takeSeaDelta(g: ConquestGame): SeaState | undefined {
  if (!CHANGED.has(g) || !g.s.sea) return undefined;
  CHANGED.delete(g);
  return g.s.sea;
}

export function applySeaDelta(s: GameState, d: SeaState): void {
  s.sea = d;
}

// ---------------------------------------------------------------- the track's dice

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The sea's own dice: seeded afresh each day from the game's seed with a
 * salt of their own, so a storm or a sail sighted never moves the world's
 * dice (the 50-year runs roll the same with or without them).
 */
export function sdice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x2c1b3c6d) ^
          Math.imul(s.day + 7919, 0x297a2d39) ^
          0x5ea5ea5e) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

// ---------------------------------------------------------------- the globe

const RAD = Math.PI / 180;
const EARTH_KM = 6371;
/** Kilometres in a degree of latitude. */
export const KM_DEG = 111.2;

/** Great-circle km between two points. */
export function kmApart(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A point `km` along heading `dir` (degrees: 0 north, 90 east). */
export function moveAlong(
  lat: number,
  lon: number,
  dir: number,
  km: number,
): [number, number] {
  const dLat = (km * Math.cos(dir * RAD)) / KM_DEG;
  const nLat = lat + dLat;
  const mid = (lat + nLat) / 2;
  const dLon =
    (km * Math.sin(dir * RAD)) / (KM_DEG * Math.max(0.2, Math.cos(mid * RAD)));
  return [
    Math.round(nLat * 1000) / 1000,
    Math.round((lon + dLon) * 1000) / 1000,
  ];
}

/** The heading from one point to another (degrees: 0 north, 90 east). */
export function headingTo(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const y = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * RAD);
  const x = lat2 - lat1;
  return (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
}

/** The smallest turn from heading `a` to `b`, signed (degrees). */
export function turnTo(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

// ---------------------------------------------------------------- ships on their way

/**
 * Where a ship is on its way now, as a point between provinces: the
 * province it left and the one it's making for, and how far between (0 to
 * 1), or just the province it lies at.
 */
export function wayAt(
  map: MapDef,
  w: Underway | null,
  p: number,
  day: number,
): { lat: number; lon: number } {
  if (!w || !w.path.length) {
    const d = map.provinces[w?.prov ?? p];
    return { lat: d.lat, lon: d.lon };
  }
  const a = map.provinces[w.prov];
  const b = map.provinces[w.path[0]];
  const t = Math.max(
    0,
    Math.min(1, (day - w.depart) / Math.max(1, w.arrive - w.depart)),
  );
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

/** The cruise a life is aboard now, if any. */
export function cruiseOfLife(s: GameState, life: Life): Cruise | undefined {
  const id = life.travel?.ship;
  if (id === undefined) return undefined;
  return s.sea?.cruises.find(
    (c) => c.id === id && c.hands.some((h) => h.seat === life.seat),
  );
}

/** The voyage a life is on now (aboard, or ashore at the far end), if any. */
export function voyageOfLife(s: GameState, life: Life): Voyage | undefined {
  return s.sea?.voyages.find(
    (v) =>
      v.seat === life.seat && v.c === life.c && v.phase !== "done" && !v.sent,
  );
}

/** A cruise a life has signed for and is waiting to sail in (fitting out). */
export function signedCruise(s: GameState, life: Life): Cruise | undefined {
  return s.sea?.cruises.find(
    (c) =>
      (c.phase === "fitting" || c.phase === "selling") &&
      c.hands.some((h) => h.seat === life.seat && h.c === life.c),
  );
}

/** At sea (or on the trail): aboard a cruise or a voyage that's under way, not in port. */
export function atSea(life: Life): boolean {
  return life.travel?.ship !== undefined;
}

/** A short name for a ship's rig ("a sloop", "a snow"). */
export function aRig(kind: string): string {
  return /^[aeiou]/i.test(kind) ? `an ${kind}` : `a ${kind}`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
export { r1 };
