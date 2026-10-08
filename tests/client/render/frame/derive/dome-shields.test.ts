/**
 * Derpy Front: the Dome of Alden shield circles drawn by DomeShieldPass.
 *
 *   - one circle per active Dome, centered on its tile, radius range + 0.5
 *   - colored by relationship (self / ally / enemy); while aiming a nuke,
 *     every finished shield but your own is "blocked"; spectators see owners
 *   - circles merge only with others of the same group (same kind, finished
 *     or not), listing up to DOME_MAX_NEIGHBORS nearest neighbours
 */

import { describe, expect, it } from "vitest";
import {
  buildDomeShieldCircles,
  DOME_MAX_NEIGHBORS,
  domeShieldKind,
  domeStopsNukeAt,
  type DomeShieldOptions,
} from "../../../../../src/client/render/frame/derive/DomeShields";
import type { UnitState } from "../../../../../src/client/render/types";
import { UT_CITY, UT_DOME } from "../../../../../src/client/render/types";

const MAP_W = 1000;
const RANGE = 100;

let nextId = 1;
function dome(
  x: number,
  y: number,
  overrides: Partial<UnitState> = {},
): UnitState {
  return {
    id: nextId++,
    unitType: UT_DOME,
    ownerID: 1,
    lastOwnerID: null,
    pos: y * MAP_W + x,
    lastPos: y * MAP_W + x,
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
    ...overrides,
  };
}

function opts(overrides: Partial<DomeShieldOptions> = {}): DomeShieldOptions {
  return {
    mapWidth: MAP_W,
    range: RANGE,
    localPlayerID: 1,
    allies: new Set([2]),
    nukeAiming: false,
    margin: 4,
    ...overrides,
  };
}

describe("domeShieldKind", () => {
  it("colors by relationship to the viewer", () => {
    const allies = new Set([2]);
    expect(domeShieldKind(1, 1, allies, false)).toBe("self");
    expect(domeShieldKind(2, 1, allies, false)).toBe("ally");
    expect(domeShieldKind(3, 1, allies, false)).toBe("enemy");
  });

  it("marks every shield but your own as blocking while you aim a nuke", () => {
    const allies = new Set([2]);
    expect(domeShieldKind(1, 1, allies, true)).toBe("self");
    // An ally's Dome stops your nuke too.
    expect(domeShieldKind(2, 1, allies, true)).toBe("blocked");
    expect(domeShieldKind(3, 1, allies, true)).toBe("blocked");
  });

  it("uses owner colors without a local player (replay / spectator)", () => {
    expect(domeShieldKind(3, 0, new Set(), true)).toBe("owner");
  });
});

describe("buildDomeShieldCircles", () => {
  it("makes one circle per active Dome, at its tile center", () => {
    const circles = buildDomeShieldCircles(
      [
        dome(10, 20),
        dome(500, 500, { isActive: false }),
        dome(300, 300, { unitType: UT_CITY }),
      ],
      opts(),
    );
    expect(circles).toHaveLength(1);
    expect(circles[0]).toMatchObject({
      x: 10.5,
      y: 20.5,
      radius: RANGE + 0.5,
      kind: "self",
      building: false,
      neighbors: [],
    });
  });

  it("merges overlapping shields of the same kind", () => {
    const circles = buildDomeShieldCircles(
      [dome(100, 100), dome(250, 100), dome(800, 800)],
      opts(),
    );
    expect(circles[0].neighbors).toEqual([1]);
    expect(circles[1].neighbors).toEqual([0]);
    expect(circles[2].neighbors).toEqual([]);
  });

  it("counts shields just out of touch as neighbours within the margin", () => {
    // Centers 2 * radius + 6 apart: the edges are 6 apart, under 2 * margin.
    const gap = 2 * (RANGE + 0.5) + 6;
    const circles = buildDomeShieldCircles(
      [dome(100, 100), dome(100 + gap, 100)],
      opts({ margin: 4 }),
    );
    expect(circles[0].neighbors).toEqual([1]);
    const apart = buildDomeShieldCircles(
      [dome(100, 100), dome(100 + gap, 100)],
      opts({ margin: 2 }),
    );
    expect(apart[0].neighbors).toEqual([]);
  });

  it("keeps different kinds, and unfinished Domes, apart", () => {
    const circles = buildDomeShieldCircles(
      [
        dome(100, 100, { ownerID: 1 }),
        dome(150, 100, { ownerID: 2 }),
        dome(200, 100, { ownerID: 3 }),
        dome(120, 100, { ownerID: 1, underConstruction: true }),
        dome(130, 100, { ownerID: 1, underConstruction: true }),
      ],
      opts(),
    );
    expect(circles.map((c) => c.kind)).toEqual([
      "self",
      "ally",
      "enemy",
      "self",
      "self",
    ]);
    expect(new Set(circles.map((c) => c.group)).size).toBe(4);
    expect(circles[0].neighbors).toEqual([]);
    expect(circles[1].neighbors).toEqual([]);
    expect(circles[2].neighbors).toEqual([]);
    expect(circles[3].neighbors).toEqual([4]);
    expect(circles[3].building).toBe(true);
  });

  it("merges every shield that would stop your nuke while you aim one", () => {
    const circles = buildDomeShieldCircles(
      [
        dome(100, 100, { ownerID: 2 }),
        dome(150, 100, { ownerID: 3 }),
        dome(120, 100, { ownerID: 1 }),
        // Unfinished: it can't stop anything yet.
        dome(140, 100, { ownerID: 3, underConstruction: true }),
      ],
      opts({ nukeAiming: true }),
    );
    expect(circles.map((c) => c.kind)).toEqual([
      "blocked",
      "blocked",
      "self",
      "enemy",
    ]);
    expect(circles[0].neighbors).toEqual([1]);
    expect(circles[1].neighbors).toEqual([0]);
  });

  it("merges each owner's shields separately for spectators", () => {
    const circles = buildDomeShieldCircles(
      [
        dome(100, 100, { ownerID: 4 }),
        dome(150, 100, { ownerID: 4 }),
        dome(130, 100, { ownerID: 5 }),
      ],
      opts({ localPlayerID: 0 }),
    );
    expect(circles.every((c) => c.kind === "owner")).toBe(true);
    expect(circles[0].neighbors).toEqual([1]);
    expect(circles[2].neighbors).toEqual([]);
  });

  it("lists at most DOME_MAX_NEIGHBORS neighbours, nearest first", () => {
    const ring = [];
    for (let i = 0; i < DOME_MAX_NEIGHBORS + 3; i++) {
      // Farther and farther along a line from the first Dome.
      ring.push(dome(100 + (i + 1) * 15, 400));
    }
    const circles = buildDomeShieldCircles([dome(100, 400), ...ring], opts());
    expect(circles[0].neighbors).toEqual(
      Array.from({ length: DOME_MAX_NEIGHBORS }, (_, i) => i + 1),
    );
  });
});

describe("domeStopsNukeAt", () => {
  const domes = [
    { x: 100, y: 100, ownerID: 2 },
    { x: 400, y: 400, ownerID: 1 },
  ];

  it("stops a nuke aimed within range of another player's Dome", () => {
    expect(domeStopsNukeAt(domes, 1, 100, 100, RANGE)).toBe(true);
    // Exactly at the range, like the engine's <= check.
    expect(domeStopsNukeAt(domes, 1, 160, 180, RANGE)).toBe(true);
    expect(domeStopsNukeAt(domes, 1, 161, 180, RANGE)).toBe(false);
  });

  it("never stops its owner's nukes", () => {
    expect(domeStopsNukeAt(domes, 1, 400, 400, RANGE)).toBe(false);
    expect(domeStopsNukeAt(domes, 2, 100, 100, RANGE)).toBe(false);
    expect(domeStopsNukeAt(domes, 2, 400, 400, RANGE)).toBe(true);
  });
});
