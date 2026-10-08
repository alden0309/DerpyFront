// Derpy Front: the Dome of Alden. A finished Dome stops every nuke but its
// owner's: one aimed inside its range never goes off, and one that lands
// outside leaves everything inside the range untouched.

import { TileRef } from "@openfront/engine-api/game/GameMap";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { Game, isUnit, Player, Unit } from "../game/Game";

/**
 * The finished Domes that shield anything within `reach` of `center` from
 * `attacker`'s nukes. Empty in games without Domes, so callers can skip the
 * per-tile checks.
 */
export function shieldingDomes(
  mg: Game,
  attacker: Player,
  center: TileRef,
  reach: number,
): Unit[] {
  return mg
    .nearbyUnits(
      center,
      reach + mg.config().domeRange(),
      UnitType.Dome,
      ({ unit }) => isUnit(unit) && unit.owner() !== attacker,
    )
    .map(({ unit }) => unit);
}

/** Whether a tile is inside any of these Domes' range. */
export function shielded(
  mg: Game,
  domes: readonly Unit[],
  tile: TileRef,
): boolean {
  if (domes.length === 0) return false;
  const range2 = mg.config().domeRange() ** 2;
  for (const dome of domes) {
    if (mg.euclideanDistSquared(dome.tile(), tile) <= range2) return true;
  }
  return false;
}
