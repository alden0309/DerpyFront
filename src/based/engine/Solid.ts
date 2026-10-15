// BFIX (r23): what's solid in a place, worked out from its pieces, so the
// walking grid is blocked wherever something stands: the props models (by
// their footprints in Props.ts), the bar counter and the back bar, boxes,
// the street's lamps, the Morris column, the kiosk, the moped, the post box,
// the chalkboard, the cigarette machine... Flat things (rugs, puddles,
// footprints, glows, a drain) and anything up on a counter, a table or a
// wall stay walkable. The place's own `nav.blocks` are the walls, written by
// hand. Pure and deterministic.
//
// An item can say `"solid": false` (walk through it) or `"solid": true` (a
// box of its `size`, for a piece the kit doesn't know).

import { Item, PlaceDef } from "./Place";
import { PROP_SHAPES } from "./Props";

export type Pt = [number, number];

/** Something solid: its outline on the floor (convex), and how close a body may come. */
export interface Solid {
  poly: Pt[];
  margin: number;
  /** What it is (the item's kind, or its model). */
  what: string;
  /** Its index in the place's items. */
  item: number;
}

/** How close a body comes to most things, and to seats and tables (people slip between stools). */
export const MARGIN = 0.15;
export const SEAT_MARGIN = 0.1;

/** Pieces people sit at or between. */
const SEATS = new Set([
  "stoolBar",
  "chair",
  "chairCushion",
  "loungeChair",
  "bench",
  "tableRound",
]);

/** Below this a piece is stepped over; above this it's up on something. */
const FLAT = 0.12;
const RAISED = 0.3;

function rect(w: number, d: number, cx = 0, cz = 0): Pt[] {
  return [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ];
}

function circle(r: number, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Outside the circle: the polygon's edges touch it.
    const k = r / Math.cos(Math.PI / n);
    out.push([Math.cos(a) * k, Math.sin(a) * k]);
  }
  return out;
}

function num(v: unknown, d: number): number {
  return typeof v === "number" ? v : d;
}

/** A props model's footprint at the item's size (as Kit.ts scales it). */
function propOutline(name: string, item: Item): Pt[] | null {
  const shape = PROP_SHAPES[name];
  if (!shape) return null;
  const h = num(item.height, 0);
  const k = h > 0 ? h / shape.size[1] : num(item.scale, 1);
  if (shape.size[1] * k < FLAT || shape.hull.length < 3) return null;
  return shape.hull.map(([x, z]) => [x * k, z * k]);
}

/** A piece's outline in its own space, or null if he can walk over it. */
function outline(item: Item): { poly: Pt[]; what: string } | null {
  if (item.solid === false) return null;
  if (item.solid === true) {
    const [w, , d] = (item.size as [number, number, number]) ?? [0.5, 1, 0.5];
    return { poly: rect(w, d), what: item.kind };
  }
  const y = item.at[1] ?? 0;
  if (y > RAISED && item.kind !== "wall") return null;
  switch (item.kind) {
    case "model": {
      const name = typeof item.model === "string" ? item.model : "";
      const poly = propOutline(name, item);
      return poly ? { poly, what: name } : null;
    }
    case "lamppost":
      return {
        poly: propOutline("lamppost", item) ?? circle(0.17),
        what: "lamppost",
      };
    case "morris":
      return {
        poly: propOutline("morrisColumn", item) ?? circle(0.62),
        what: "morrisColumn",
      };
    case "box": {
      const [w, h, d] = (item.size as [number, number, number]) ?? [1, 1, 1];
      return h < 0.25 ? null : { poly: rect(w, d), what: "box" };
    }
    case "bar": {
      // The counter, its top overhanging the front.
      const len = num(item.len, 8);
      const d = num(item.depth, 0.7);
      const front = d / 2 + 0.155;
      const back = -d / 2 - 0.04;
      return {
        poly: rect(len + 0.08, front - back, 0, (front + back) / 2),
        what: "bar",
      };
    }
    case "backbar":
      return {
        poly: rect(num(item.len, 8) + 0.04, 0.56, 0, 0.26),
        what: "backbar",
      };
    case "kiosk":
      return { poly: rect(1.8, 1.2), what: "kiosk" };
    case "moped":
      return { poly: rect(1.7, 0.64), what: "moped" };
    case "aframe": {
      const [w] = (item.size as [number, number]) ?? [0.6, 0.9];
      return { poly: rect(w + 0.04, 0.44), what: "aframe" };
    }
    case "postbox":
      return { poly: rect(0.42, 0.32), what: "postbox" };
    case "bollard":
      return { poly: circle(0.08, 8), what: "bollard" };
    case "machine":
      return { poly: rect(0.62, 0.56, 0, 0.03), what: "machine" };
    case "standjar":
      return { poly: circle(0.14, 10), what: "standjar" };
    case "bowl":
      return { poly: circle(0.12, 8), what: "bowl" };
    case "coats":
      return { poly: circle(0.34, 10), what: "coats" };
    case "tray": {
      const [w, h, d] = (item.size as [number, number, number]) ?? [
        0.5, 0.3, 0.38,
      ];
      return h < 0.25 ? null : { poly: rect(w, d), what: "tray" };
    }
    default:
      return null;
  }
}

/** Every solid piece's outline where it stands, with its margin. */
export function solids(def: PlaceDef): Solid[] {
  const out: Solid[] = [];
  def.items.forEach((item, i) => {
    const o = outline(item);
    if (!o) return;
    const a = ((item.rot ?? 0) * Math.PI) / 180;
    // Kit.ts turns a piece by rot about y: local +z towards (sin, cos).
    const c = Math.cos(a);
    const s = Math.sin(a);
    const [x0, , z0] = item.at;
    const poly = o.poly.map(
      ([x, z]): Pt => [x0 + x * c + z * s, z0 - x * s + z * c],
    );
    out.push({
      poly,
      margin:
        typeof item.margin === "number"
          ? item.margin
          : SEATS.has(o.what)
            ? SEAT_MARGIN
            : MARGIN,
      what: o.what,
      item: i,
    });
  });
  return out;
}

/** BFIX (r23): somewhere to sit: a stool, a chair, an armchair, a bench. */
export interface Seat {
  /** The middle of the seat. */
  x: number;
  z: number;
  /** Its height. */
  y: number;
  /** Which way a chair faces (radians); null for a stool (any way). */
  facing: number | null;
  /** How wide and deep it is (for the pointer). */
  w: number;
  d: number;
  /** The model, and its index in the place's items. */
  what: string;
  item: number;
}

/** Seats with a back (they say which way he faces). */
const BACKED = new Set(["chair", "chairCushion", "loungeChair", "bench"]);

/** Every seat in a place, where it is and how high. */
export function seats(def: PlaceDef): Seat[] {
  const out: Seat[] = [];
  def.items.forEach((item, i) => {
    if (item.kind !== "model" || item.solid === false) return;
    const name = typeof item.model === "string" ? item.model : "";
    const shape = PROP_SHAPES[name];
    if (!shape?.seat || (item.at[1] ?? 0) > RAISED) return;
    const h = num(item.height, 0);
    const k = h > 0 ? h / shape.size[1] : num(item.scale, 1);
    const a = ((item.rot ?? 0) * Math.PI) / 180;
    const [sx, sz] = shape.seatAt ?? [0, 0];
    out.push({
      x: item.at[0] + (sx * Math.cos(a) + sz * Math.sin(a)) * k,
      z: item.at[2] + (-sx * Math.sin(a) + sz * Math.cos(a)) * k,
      y: shape.seat * k,
      facing: BACKED.has(name) ? a : null,
      w: shape.size[0] * k,
      d: shape.size[2] * k,
      what: name,
      item: i,
    });
  });
  return out;
}

// --- geometry ------------------------------------------------------------

function segDist2(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = dx * dx + dz * dz;
  let t = l > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + dx * t - p[0];
  const z = a[1] + dz * t - p[1];
  return x * x + z * z;
}

/** Whether a point is inside a convex polygon (either winding). */
export function insidePoly(p: Pt, poly: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cr === 0) continue;
    const sg = cr > 0 ? 1 : -1;
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
}

/** How far a point is from a convex polygon (0 inside). */
export function polyDist(p: Pt, poly: Pt[]): number {
  if (insidePoly(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, segDist2(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return Math.sqrt(best);
}

/** How far apart two convex polygons are (0 if they overlap). */
export function polysDist(a: Pt[], b: Pt[]): number {
  for (const p of a) if (insidePoly(p, b)) return 0;
  for (const p of b) if (insidePoly(p, a)) return 0;
  // Edges crossing?
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (cross(a0, a1, b[j], b[(j + 1) % b.length])) return 0;
    }
  }
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (const p of b) best = Math.min(best, segDist2(p, a0, a1));
  }
  for (let j = 0; j < b.length; j++) {
    const b0 = b[j];
    const b1 = b[(j + 1) % b.length];
    for (const p of a) best = Math.min(best, segDist2(p, b0, b1));
  }
  return Math.sqrt(best);
}

function cross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
