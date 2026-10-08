/**
 * Derpy Front: the shields of the Domes of Alden, as circles the
 * DomeShieldPass can draw.
 *
 * A finished Dome stops every nuke but its owner's inside its range, so its
 * shield is shown to everyone, all the time. Circles of the same kind (same
 * relationship to the viewer, finished or still being built) merge into one
 * shape where they overlap: each circle lists the nearby circles of its group,
 * and the shader draws the union of the circle and its neighbours, with each
 * pixel drawn once, by the first circle that reaches it.
 */

import type { UnitState } from "../../types";
import { UT_DOME } from "../../types";

/** How a shield relates to the viewer, which picks its colour. */
export type DomeShieldKind =
  | "self"
  | "ally"
  | "enemy"
  /** Not the viewer's, while the viewer aims a nuke: it will stop the strike. */
  | "blocked"
  /** Spectators and replays have no viewer: shields take the owner's colour. */
  | "owner";

const KIND_GROUP: Record<DomeShieldKind, number> = {
  self: 0,
  ally: 1,
  enemy: 2,
  blocked: 3,
  owner: 4,
};

/** The most neighbours one circle passes to the shader. */
export const DOME_MAX_NEIGHBORS = 6;

export interface DomeShieldCircle {
  /** Center in world units (the middle of the Dome's tile). */
  x: number;
  y: number;
  radius: number;
  ownerID: number;
  kind: DomeShieldKind;
  /** Still being built: drawn as a faint dashed ring, no fill. */
  building: boolean;
  /** Circles merge only with others of the same group. */
  group: number;
  /**
   * Indices (into the returned array) of same-group circles close enough to
   * touch this one, nearest first, at most DOME_MAX_NEIGHBORS.
   */
  neighbors: number[];
}

export interface DomeShieldOptions {
  mapWidth: number;
  /** config().domeRange(), in tiles. */
  range: number;
  /** The viewer's smallID; 0 in replays and for spectators. */
  localPlayerID: number;
  /** smallIDs of the viewer's allies and teammates. */
  allies: ReadonlySet<number>;
  /** The viewer is aiming a nuke: every shield but theirs is "blocked". */
  nukeAiming: boolean;
  /**
   * Extra distance (world units) two circles may be apart and still count as
   * neighbours: the most the drawn ring and its soft edge reach past a circle.
   */
  margin: number;
}

/** Which kind of shield a Dome owned by `ownerID` is for this viewer. */
export function domeShieldKind(
  ownerID: number,
  localPlayerID: number,
  allies: ReadonlySet<number>,
  nukeAiming: boolean,
): DomeShieldKind {
  if (localPlayerID <= 0) return "owner";
  if (ownerID === localPlayerID) return "self";
  if (nukeAiming) return "blocked";
  return allies.has(ownerID) ? "ally" : "enemy";
}

/**
 * The shield circles of every active Dome in `structures`, with each one's
 * merge neighbours. Shields of unfinished Domes are kept apart from finished
 * ones (they don't stop anything yet), and in spectator mode each owner's
 * shields merge only with their own.
 */
export function buildDomeShieldCircles(
  structures: Iterable<UnitState>,
  opts: DomeShieldOptions,
): DomeShieldCircle[] {
  const circles: DomeShieldCircle[] = [];
  // The engine shields tiles whose centers are within `range` of the Dome's
  // tile; half a tile more covers those edge tiles fully.
  const radius = opts.range + 0.5;
  for (const u of structures) {
    if (u.unitType !== UT_DOME || !u.isActive) continue;
    const building = u.underConstruction;
    const kind = domeShieldKind(
      u.ownerID,
      opts.localPlayerID,
      opts.allies,
      opts.nukeAiming && !building,
    );
    const base =
      kind === "owner" ? KIND_GROUP.owner + u.ownerID : KIND_GROUP[kind];
    const x = u.pos % opts.mapWidth;
    const y = (u.pos - x) / opts.mapWidth;
    circles.push({
      x: x + 0.5,
      y: y + 0.5,
      radius,
      ownerID: u.ownerID,
      kind,
      building,
      // Even groups are finished shields, odd ones unfinished.
      group: base * 2 + (building ? 1 : 0),
      neighbors: [],
    });
  }

  for (let i = 0; i < circles.length; i++) {
    const a = circles[i];
    const near: { index: number; d2: number }[] = [];
    for (let j = 0; j < circles.length; j++) {
      if (i === j) continue;
      const b = circles[j];
      if (b.group !== a.group) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const reach = a.radius + b.radius + 2 * opts.margin;
      if (d2 < reach * reach) near.push({ index: j, d2 });
    }
    near.sort((p, q) => p.d2 - q.d2 || p.index - q.index);
    a.neighbors = near.slice(0, DOME_MAX_NEIGHBORS).map((n) => n.index);
  }
  return circles;
}

/**
 * Whether a finished Dome that `attackerID` doesn't own covers tile (x, y),
 * so a nuke aimed there would be stopped. Mirrors the engine's DomeShield
 * check (tile distance squared against the range squared).
 */
export function domeStopsNukeAt(
  domes: readonly { x: number; y: number; ownerID: number }[],
  attackerID: number,
  x: number,
  y: number,
  range: number,
): boolean {
  const range2 = range * range;
  for (const d of domes) {
    if (d.ownerID === attackerID) continue;
    const dx = d.x - x;
    const dy = d.y - y;
    if (dx * dx + dy * dy <= range2) return true;
  }
  return false;
}
