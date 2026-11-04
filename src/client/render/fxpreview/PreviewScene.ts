/**
 * PreviewScene — the short looping scene the store plays for a Nuke & Dome
 * effect pack, as plain data: which nukes fly where and when, where the
 * Domes stand, and what the game would report each simulation tick (units in
 * flight, nukes that just went off). FxStage feeds those ticks through the
 * game's own trail, unit, FX and Dome passes.
 *
 * Pure and deterministic: tick k always gives the same units and events, so
 * a still frame or a captured clip is the same on every machine.
 */

import type { UnitState } from "../types/Renderer";
import {
  UT_ATOM_BOMB,
  UT_DOME,
  UT_HYDROGEN_BOMB,
  UT_MIRV_WARHEAD,
} from "../types/UnitType";
import { STAGE_ENEMY, STAGE_W, STAGE_YOU } from "./StageMap";

/** The simulation tick, as in a match (Config.msPerTick). */
export const SCENE_TICK_MS = 100;

export interface ScenePoint {
  x: number;
  y: number;
}

export interface SceneNuke {
  id: number;
  unitType:
    | typeof UT_ATOM_BOMB
    | typeof UT_HYDROGEN_BOMB
    | typeof UT_MIRV_WARHEAD;
  owner: number;
  from: ScenePoint;
  to: ScenePoint;
  /** Seconds into the loop it launches, and how long it flies. */
  launch: number;
  flight: number;
  /** How far (tiles) the flight bows north of the straight line. */
  arc: number;
  /** Stopped by a Dome: it dies over its target without going off. */
  stopped?: boolean;
}

export interface SceneDome extends ScenePoint {
  owner: number;
}

export interface PreviewScript {
  /** Seconds before the scene starts over. */
  loopSec: number;
  nukes: readonly SceneNuke[];
  domes: readonly SceneDome[];
  /** Dome shield radius on the stage, in tiles. */
  domeRange: number;
  /** Camera centre (tiles) and how many tiles fit across the view. */
  view: { x: number; y: number; across: number };
  /** Scene time (s) of the still shown when the preview isn't playing. */
  stillSec: number;
}

/**
 * The store's scene: your nuke arcs west into enemy land and goes off; then
 * an enemy nuke (plain, as theirs would be) comes at your Dome and is stopped
 * over it. What the pack changes is all yours: the trail, the burst, the
 * Dome and its burst.
 */
export const STORE_SCENE: PreviewScript = {
  loopSec: 8,
  domeRange: 52,
  nukes: [
    {
      id: 101,
      unitType: UT_ATOM_BOMB,
      owner: STAGE_YOU,
      from: { x: 360, y: 150 },
      to: { x: 112, y: 92 },
      launch: 0.3,
      flight: 2.3,
      arc: 46,
    },
    {
      id: 102,
      unitType: UT_ATOM_BOMB,
      owner: STAGE_ENEMY,
      from: { x: 30, y: 140 },
      to: { x: 284, y: 104 },
      launch: 3.1,
      flight: 2.1,
      arc: 38,
      stopped: true,
    },
  ],
  domes: [{ x: 300, y: 96, owner: STAGE_YOU }],
  view: { x: STAGE_W / 2, y: 112, across: 360 },
  stillSec: 2.95,
};

export interface SceneDeath {
  unitType: string;
  owner: number;
  x: number;
  y: number;
  reachedTarget: boolean;
}

export interface SceneTick {
  /** Nukes in flight this tick, as the game's UnitState. */
  units: UnitState[];
  /** Nukes that ended this tick. */
  deaths: SceneDeath[];
}

/** Where a nuke is at `t` seconds into its flight (clamped to the flight). */
export function nukeAt(n: SceneNuke, t: number): ScenePoint {
  const f = Math.min(1, Math.max(0, t / n.flight));
  return {
    x: n.from.x + (n.to.x - n.from.x) * f,
    y: n.from.y + (n.to.y - n.from.y) * f - 4 * n.arc * f * (1 - f),
  };
}

function ref(p: ScenePoint, mapW: number): number {
  return Math.floor(p.y) * mapW + Math.floor(p.x);
}

/** The scene at simulation tick `tick` (0 = the loop's start). */
export function sceneTick(
  script: PreviewScript,
  tick: number,
  mapW: number,
): SceneTick {
  const t = (tick * SCENE_TICK_MS) / 1000;
  const prev = t - SCENE_TICK_MS / 1000;
  const units: UnitState[] = [];
  const deaths: SceneDeath[] = [];
  for (const n of script.nukes) {
    const end = n.launch + n.flight;
    if (t >= n.launch && t < end) {
      const pos = nukeAt(n, t - n.launch);
      const last = nukeAt(n, Math.max(0, prev - n.launch));
      units.push(
        sceneUnit(n.id, n.unitType, n.owner, ref(pos, mapW), ref(last, mapW)),
      );
    } else if (t >= end && prev < end) {
      deaths.push({
        unitType: n.unitType,
        owner: n.owner,
        x: Math.floor(n.to.x),
        y: Math.floor(n.to.y),
        reachedTarget: !n.stopped,
      });
    }
  }
  return { units, deaths };
}

/** The scene's Domes, as finished structures. */
export function sceneDomes(script: PreviewScript, mapW: number): UnitState[] {
  return script.domes.map((d, i) =>
    sceneUnit(900 + i, UT_DOME, d.owner, ref(d, mapW), ref(d, mapW)),
  );
}

export function sceneUnit(
  id: number,
  unitType: string,
  ownerID: number,
  pos: number,
  lastPos: number,
): UnitState {
  return {
    id,
    unitType,
    ownerID,
    lastOwnerID: null,
    pos,
    lastPos,
    isActive: true,
    reachedTarget: false,
    retreating: false,
    targetable: true,
    waitTicks: 0,
    markedForDeletion: false,
    health: null,
    underConstruction: false,
    targetUnitId: null,
    targetTile: null,
    troops: 0,
    missileTimerQueue: [],
    level: 1,
    veterancy: 0,
    hasTrainStation: false,
    trainType: null,
    loaded: null,
    constructionStartTick: null,
    samUpgradeStartTick: null,
    samUpgradeStartRange: null,
    samUpgradeTargetLevel: null,
    samUpgradeDuration: null,
  };
}
