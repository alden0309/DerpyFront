import {
  Difficulty,
  GameMapSize,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { Player, Unit } from "@openfront/engine/game/Game";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN3 (r27): a scenario nation's cityTroopsMax caps what its cities add
 * to its troop cap. On Hard a computer-run Hungary in Europe 1939 built
 * its cap from 0.24M to 8.8M in 40 minutes; the small nations' cities now
 * add at most their data's cityTroopsMax.
 */

function aCity(p: Player): Unit {
  const city = p.units(UnitType.City)[0];
  if (city !== undefined) return city;
  const at = p.landBasedStructureSpawn(p.spawnTile()!);
  if (at === false) throw new Error("no room for a city");
  return p.buildUnit(UnitType.City, at, {}, true);
}

describe("scenario city troops", () => {
  it.each([GameMapSize.Normal, GameMapSize.Compact])(
    "adds at most the nation's cityTroopsMax (%s), and no limit without one",
    async (size) => {
      const data = scenarioData("europe1939")!;
      const hungaryData = data.nations.find((n) => n.key === "hungary")!;
      const was = hungaryData.cityTroopsMax;
      hungaryData.cityTroopsMax = 300_000;
      const germanyData = data.nations.find((n) => n.key === "germany")!;
      const germanyWas = germanyData.cityTroopsMax;
      delete germanyData.cityTroopsMax;
      try {
        // Hard: a nation's cap counts as a person's (Medium's is 0.75 of it).
        const g = await scenarioGame("europe1939", {
          size,
          config: { difficulty: Difficulty.Hard },
        });
        const config = g.game.config();
        const scale = size === GameMapSize.Compact ? 2 : 1;
        const perLevel = config.cityTroopIncrease();
        for (const [key, capped] of [
          ["hungary", true],
          ["germany", false],
        ] as const) {
          const p = g.nation(key);
          const before = config.maxTroops(p);
          const city = aCity(p);
          const levels = () =>
            p
              .units(UnitType.City)
              .reduce(
                (sum, c) => sum + (c.isUnderConstruction() ? 0 : c.level()),
                0,
              );
          const levelsBefore = levels();
          for (let i = 0; i < 60; i++) city.increaseLevel();
          const added = config.maxTroops(p) - before;
          if (capped) {
            // Stored troops are ten times what players see; half on Compact.
            const max = (300_000 * 10) / scale;
            expect(levels() * perLevel).toBeGreaterThan(max);
            expect(added).toBeLessThanOrEqual(max);
            expect(config.maxTroops(p)).toBeLessThan(before + max + 1);
            expect(p.scenarioCityTroopsMax?.()).toBe(max);
          } else {
            expect(added).toBeCloseTo((levels() - levelsBefore) * perLevel, 0);
            expect(p.scenarioCityTroopsMax?.()).toBe(Infinity);
          }
        }
      } finally {
        if (was === undefined) delete hungaryData.cityTroopsMax;
        else hungaryData.cityTroopsMax = was;
        if (germanyWas !== undefined) germanyData.cityTroopsMax = germanyWas;
      }
    },
    120_000,
  );
});
