import { GameMap, TileRef } from "./GameMap";
import {
  Gold,
  PlayerID,
  PlayerType,
  TerraNullius,
  UnitType,
} from "./GameTypes";

/*
 * Read-only views of game state that rules code (Config, UnitGrid,
 * execution/NukeAlliance) runs on. The engine's Player/Unit/Game and the client's
 * PlayerView/UnitView/GameView both satisfy them, so the same rules run on
 * either side without the rules importing the engine or the client.
 *
 * Each interface lists exactly the members rules code calls. Add a member
 * only when a rule needs it, and implement it on both sides.
 */

export interface PlayerLike {
  id(): PlayerID;
  smallID(): number;
  isPlayer(): boolean;
  type(): PlayerType;
  isLobbyCreator(): boolean;
  numTilesOwned(): number;
  troops(): number;
  gold(): Gold;
  units(type: UnitType): readonly UnitLike[];
  /**
   * SCEN (r25): troops a Scenario adds to this player's cap (its nation's
   * troopCapBonus, stored ten times as troops are); absent or 0 otherwise.
   */
  scenarioTroopCap?(): number;
  /**
   * SCEN3 (r27): the most a Scenario lets this player's cities add to its
   * troop cap (its nation's cityTroopsMax, stored ten times as troops are);
   * absent or Infinity otherwise.
   */
  scenarioCityTroopsMax?(): number;
  /**
   * SCEN (r25): how fast a Scenario lets this player's troops grow back
   * (its nation's troopGrowth); absent or 1 otherwise.
   */
  scenarioTroopGrowth?(): number;
  /**
   * SCEN (r25): a Scenario's multiple of this player's gold income (its
   * nation's goldIncome); absent or 1 otherwise.
   */
  scenarioGoldIncome?(): number;
}

export interface UnitLike {
  type(): UnitType;
  owner(): PlayerLike;
  tile(): TileRef;
  lastTile(): TileRef;
  isActive(): boolean;
  isUnderConstruction(): boolean;
  level(): number;
}

export interface GameLike extends GameMap {
  owner(ref: TileRef): PlayerLike | TerraNullius;
  anyUnitNearby(
    tile: TileRef,
    searchRange: number,
    types: readonly UnitType[],
    predicate: (unit: UnitLike) => boolean,
    playerId?: PlayerID,
    includeUnderConstruction?: boolean,
  ): boolean;
  nearbyUnits(
    tile: TileRef,
    searchRange: number,
    types: UnitType | readonly UnitType[],
    predicate?: UnitPredicate,
  ): Array<{ unit: UnitLike; distSquared: number }>;
}

/**
 * The read surface of TileSet, mirroring the parts of ReadonlySet that
 * simulation code uses. A native Set<TileRef> also satisfies this interface.
 */
export interface ReadonlyTileSet {
  readonly size: number;
  has(tile: TileRef): boolean;
  forEach(
    callback: (tile: TileRef, tile2: TileRef, set: ReadonlyTileSet) => void,
  ): void;
  values(): IterableIterator<TileRef>;
  [Symbol.iterator](): IterableIterator<TileRef>;
}

export type UnitPredicate = (value: {
  unit: UnitLike;
  distSquared: number;
}) => boolean;
