// r26: leaning on a counter. The owner: "the bartender is leaning against
// the air not the bar". Someone told to lean at a mark stands where their
// forearms rest on the counter in front of them: their body just clear of
// its edge, their elbows at it, their forearms and hands on the top. The
// counter is the place's `bar` piece (its top overhangs the body by 4 cm at
// the back and 15.5 at the front, as Solid.ts outlines it); how a body
// leans is measured on it (client/world/People.ts, LeanFit). Pure and
// deterministic, so the tests can check every lean in the story.

import { Item, PlaceDef } from "./Place";

/** A counter's top, in its own frame (x along it, z across, front +z). */
export interface Counter {
  x: number;
  z: number;
  /** Turned about y, radians (Kit.ts: local +z towards (sin, cos)). */
  rot: number;
  len: number;
  /** Its top's back and front edges (local z). */
  back: number;
  front: number;
  /** The top's height. */
  top: number;
}

/**
 * How a body leans, in its own frame (z forward, metres, the feet put back
 * at 0): measured on each body in the client (People.ts, measureLean).
 */
export interface LeanShape {
  /** How far behind the root the leaning clip stands the feet. */
  feet: number;
  /** The furthest forward the body comes below the forearms. */
  front: number;
  /** Where its forearms begin. */
  elbow: number;
  /** The underside of its forearms and hands. */
  y: number;
}

/**
 * The lean as measured on the barman's body in r26 (the browser, the
 * leaning clip at its middle): the fallback for a body that can't be
 * measured, and what the tests check the story's leans with.
 */
export const LEAN_FALLBACK: LeanShape = {
  feet: 0.42,
  front: 0.29,
  elbow: 0.27,
  y: 1.11,
};

/** How far clear of the edge the body stays (no clipping). */
export const LEAN_CLEAR = 0.01;
/** How far from a counter a mark may be for its lean to find it. */
export const LEAN_REACH = 1.4;
/** Kept this far in from a counter's ends. */
const END = 0.35;

const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);

function counterOf(item: Item): Counter | null {
  if (item.kind !== "bar") return null;
  const d = num(item.depth, 0.7);
  return {
    x: item.at[0],
    z: item.at[2],
    rot: ((item.rot ?? 0) * Math.PI) / 180,
    len: num(item.len, 8),
    back: -d / 2 - 0.04,
    front: d / 2 + 0.155,
    top: num(item.h, 1.08),
  };
}

/** The counters in a place. */
export function counters(def: PlaceDef): Counter[] {
  return def.items.map(counterOf).filter((c): c is Counter => c !== null);
}

/** Where someone leaning stands, faces, and the top their arms rest on. */
export interface LeanSpot {
  x: number;
  z: number;
  /** Heading, radians (0 is +z): square on to the edge. */
  face: number;
  top: number;
  /** The edge in world space, two points along it (for the tests). */
  edge: [[number, number], [number, number]];
}

/**
 * Where someone told to lean at (x, z), facing `face` (radians), stands so
 * that `shape`'s forearms rest on the counter in front of them; null if no
 * counter is in front of them within reach.
 */
export function leanSpot(
  def: PlaceDef,
  x: number,
  z: number,
  face: number,
  shape: LeanShape,
): LeanSpot | null {
  let best: { s: LeanSpot; d: number } | null = null;
  for (const c of counters(def)) {
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    const dx = x - c.x;
    const dz = z - c.z;
    // Into the counter's frame (Solid.ts turns local to world the other way).
    const lx = dx * cs - dz * sn;
    const lz = dx * sn + dz * cs;
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    const lfz = fx * sn + fz * cs;
    if (Math.abs(lx) > c.len / 2 + 0.2) continue;
    let side: 1 | -1;
    if (lz < c.back && lfz > 0.6) side = 1;
    else if (lz > c.front && lfz < -0.6) side = -1;
    else continue;
    const edge = side === 1 ? c.back : c.front;
    const d = Math.abs(edge - lz);
    if (d > LEAN_REACH) continue;
    const sz = edge - side * (shape.front + LEAN_CLEAR);
    const sx = Math.max(-c.len / 2 + END, Math.min(c.len / 2 - END, lx));
    const world = (px: number, pz: number): [number, number] => [
      c.x + px * cs + pz * sn,
      c.z - px * sn + pz * cs,
    ];
    const [wx, wz] = world(sx, sz);
    const s: LeanSpot = {
      x: wx,
      z: wz,
      face: side === 1 ? c.rot : c.rot + Math.PI,
      top: c.top,
      edge: [world(sx - 0.3, edge), world(sx + 0.3, edge)],
    };
    if (!best || d < best.d) best = { s, d };
  }
  return best?.s ?? null;
}
