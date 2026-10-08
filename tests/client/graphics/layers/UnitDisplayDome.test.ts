import { BuildableUnit, UnitType } from "@openfront/engine-api/game/GameTypes";
import { describe, expect, it } from "vitest";
// Side-effect import: registers <unit-display>.
import {
  atDomeLimit,
  UnitDisplay,
} from "../../../../src/client/hud/layers/UnitDisplay";

const LIMIT = 5;

function player(domes: number, gold: bigint) {
  return {
    gold: () => gold,
    units: (type: UnitType) =>
      type === UnitType.Dome ? Array.from({ length: domes }, () => ({})) : [],
  };
}

const config = {
  domeLimit: () => LIMIT,
  isUnitDisabled: () => false,
};

function display(domes: number, gold: bigint, cost: bigint): UnitDisplay {
  const d = new UnitDisplay();
  d.game = {
    config: () => config,
    myPlayer: () => player(domes, gold),
  } as any;
  (d as any).playerBuildables = [
    { type: UnitType.Dome, canBuild: false, canUpgrade: false, cost },
  ] as unknown as BuildableUnit[];
  return d;
}

describe("atDomeLimit", () => {
  it("is reached once a player owns domeLimit() Domes", () => {
    expect(atDomeLimit(player(0, 0n), config)).toBe(false);
    expect(atDomeLimit(player(LIMIT - 1, 0n), config)).toBe(false);
    expect(atDomeLimit(player(LIMIT, 0n), config)).toBe(true);
    expect(atDomeLimit(player(LIMIT + 1, 0n), config)).toBe(true);
  });

  it("is never reached without a player", () => {
    expect(atDomeLimit(null, config)).toBe(false);
  });
});

describe("UnitDisplay Dome of Alden button", () => {
  const canBuild = (d: UnitDisplay) =>
    (d as any).canBuild(UnitType.Dome) as boolean;

  it("is available with the gold and room for another Dome", () => {
    expect(canBuild(display(0, 50_000_000n, 50_000_000n))).toBe(true);
    expect(canBuild(display(LIMIT - 1, 60_000_000n, 60_000_000n))).toBe(true);
  });

  it("greys out at the Dome limit, however rich the player is", () => {
    expect(canBuild(display(LIMIT, 10n ** 12n, 60_000_000n))).toBe(false);
  });

  it("greys out when the player can't afford it", () => {
    expect(canBuild(display(1, 59_999_999n, 60_000_000n))).toBe(false);
  });
});
