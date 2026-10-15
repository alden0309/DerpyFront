// Noticing things (r22): Mr. Based finds what's worth a look by walking
// about, not from a list. A thing is noticed when he's near enough (its own
// distance, widened by his Perception) and can see it: in the same room,
// with no wall in the way on the floor plan. Seated, he reads the whole
// room from where he sits. Doors are seen from further off. Pure: the world
// asks these a few times a second.

import { P } from "./Nav";
import { Area, Hotspot, PlaceDef } from "./Place";

/** How far a thing is noticed by default, in metres. */
export const NEAR = 2.5;
/** How far off a door is seen. */
export const DOOR_NEAR = 7;
/** Seated, reading the room: what he can take in from his seat. */
export const SEATED_NEAR = 8.5;
/** Tab (or the eye) shows what's a little further, too. */
export const SHOW_ALL = 1.35;

/** How far off he notices a thing. */
export function noticeRange(
  h: Hotspot,
  opts: {
    perception: number;
    door: boolean;
    seated: boolean;
    showAll: boolean;
  },
): number {
  let r = opts.door
    ? DOOR_NEAR
    : (h.near ?? NEAR) + 0.5 * Math.max(0, opts.perception - 1);
  if (opts.seated && !opts.door) r = Math.max(r, SEATED_NEAR);
  return opts.showAll ? r * SHOW_ALL : r;
}

/** The room a point is in: the smallest area that holds it. */
export function areaAt(areas: Area[], x: number, z: number): Area | null {
  let best: Area | null = null;
  let bestSize = Infinity;
  for (const a of areas) {
    const [x0, z0, x1, z1] = a.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
      const size = (x1 - x0) * (z1 - z0);
      if (size < bestSize) {
        best = a;
        bestSize = size;
      }
    }
  }
  return best;
}

/**
 * Can he see from `from` to a thing at `at` (looked at from `stand`, if it
 * says)? A room sees only itself, and the street sees only the street: the
 * walls between are what hide things. Inside a room nothing does (a bar's
 * counter and stools are waist high, and the camera sees over them too).
 */
export function canSee(areas: Area[], from: P, at: P, stand?: P): boolean {
  const target = stand ?? at;
  const a = areaAt(areas, from[0], from[1]);
  const b = areaAt(areas, target[0], target[1]);
  if (a?.inside || b?.inside) return a?.id === b?.id;
  return true;
}

/** The things he notices from where he is: near enough, and in sight. */
export function noticed(
  place: PlaceDef,
  from: P,
  things: Iterable<string>,
  opts: {
    perception: number;
    seated: boolean;
    showAll: boolean;
    /** Where each thing is now (things on people move with them). */
    at?: (id: string, h: Hotspot) => [number, number, number];
  },
): Set<string> {
  const out = new Set<string>();
  for (const id of things) {
    const h = place.hotspots[id];
    if (!h) continue;
    const pos = opts.at ? opts.at(id, h) : h.at;
    const d = Math.hypot(pos[0] - from[0], pos[2] - from[1]);
    const range = noticeRange(h, {
      perception: opts.perception,
      door: !!h.to,
      seated: opts.seated,
      showAll: opts.showAll,
    });
    if (d > range) continue;
    const stand = h.stand ? place.marks[h.stand]?.at : undefined;
    if (canSee(place.areas, from, [pos[0], pos[2]], stand)) out.add(id);
  }
  return out;
}
