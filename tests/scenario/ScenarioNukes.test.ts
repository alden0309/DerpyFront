import { GameMapSize, UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  NUCLEAR_UNITS,
  SCENARIO_CATALOG,
  scenarioDisabledUnits,
} from "@openfront/engine-api/game/Scenarios";
import { applyScenarioRules } from "@openfront/engine-lib/scenario/ScenarioConfig";
import {
  allScenarioData,
  scenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN3 (r27), the owner's call: no nukes in a scenario set before nuclear
 * weapons (August 1945). Every scenario but Korea 1950 has `nukes: false`,
 * and its games leave out the bombs, the silos and the two units that only
 * stop nukes (SAMs, Domes), whatever the host's Units settings say.
 */

describe("scenario nukes: the data", () => {
  it("has no nukes in every scenario set before August 1945, and keeps them in Korea 1950", () => {
    for (const d of allScenarioData()) {
      expect([d.id, d.nukes !== false]).toEqual([d.id, d.year >= 1946]);
    }
    expect(scenarioData("korea1950")!.nukes).toBeUndefined();
  });

  it("copies map, sides, nations, capitalFullTiles and nukes to the index", () => {
    for (const d of allScenarioData()) {
      const entry = SCENARIO_CATALOG[d.id];
      expect(entry).toEqual({
        map: d.map,
        sides: d.sides.map((s) => s.id),
        nations: d.nations.map((n) => n.key),
        ...(d.capitalFullTiles === undefined
          ? {}
          : { capitalFullTiles: d.capitalFullTiles }),
        ...(d.nukes === undefined ? {} : { nukes: d.nukes }),
      });
    }
  });

  it("leaves out the bombs, MIRVs, silos, SAMs and Domes", () => {
    expect([...NUCLEAR_UNITS].sort()).toEqual(
      [
        UnitType.AtomBomb,
        UnitType.HydrogenBomb,
        UnitType.MIRV,
        UnitType.MIRVWarhead,
        UnitType.MissileSilo,
        UnitType.SAMLauncher,
        UnitType.Dome,
      ].sort(),
    );
    expect(scenarioDisabledUnits("europe1939")).toEqual(NUCLEAR_UNITS);
    expect(scenarioDisabledUnits("korea1950")).toEqual([]);
    expect(scenarioDisabledUnits(undefined)).toEqual([]);
  });
});

describe("scenario nukes: the start's config", () => {
  it("adds them to the host's disabled units in a scenario without nukes", () => {
    const c = applyScenarioRules({
      scenario: { id: "ww1914" },
      disabledUnits: [UnitType.Warship, UnitType.AtomBomb],
    });
    expect(new Set(c.disabledUnits)).toEqual(
      new Set([UnitType.Warship, ...NUCLEAR_UNITS]),
    );
    expect(c.disabledUnits).toHaveLength(1 + NUCLEAR_UNITS.length);
  });

  it("leaves Korea 1950's and an ordinary game's units as the host set them", () => {
    expect(
      applyScenarioRules({
        scenario: { id: "korea1950" },
        disabledUnits: [UnitType.Warship],
      }).disabledUnits,
    ).toEqual([UnitType.Warship]);
    expect(
      applyScenarioRules<{ disabledUnits?: UnitType[] }>({}).disabledUnits,
    ).toBeUndefined();
  });
});

describe("scenario nukes: in the game", () => {
  it("can't build or fire them before 1945, even when the config left them on", async () => {
    const g = await scenarioGame("europe1939", {
      size: GameMapSize.Compact,
      config: { disabledUnits: [] },
    });
    const config = g.game.config();
    for (const u of NUCLEAR_UNITS) expect(config.isUnitDisabled(u)).toBe(true);
    expect(config.isUnitDisabled(UnitType.City)).toBe(false);
    expect(config.isUnitDisabled(UnitType.Warship)).toBe(false);

    const germany = g.nation("germany");
    germany.addGold(1_000_000_000n);
    const home = germany.tiles().values().next().value!;
    expect(germany.canBuild(UnitType.MissileSilo, home)).toBe(false);
    expect(germany.canBuild(UnitType.SAMLauncher, home)).toBe(false);
    expect(germany.canBuild(UnitType.Dome, home)).toBe(false);
    expect(germany.canBuild(UnitType.AtomBomb, home)).toBe(false);
    // Nothing nuclear on the board.
    for (const p of g.game.allPlayers()) {
      expect(p.units().filter((u) => NUCLEAR_UNITS.includes(u.type()))).toEqual(
        [],
      );
    }
  });

  it.each([GameMapSize.Normal, GameMapSize.Compact])(
    "keeps them in Korea 1950 (%s), with the UN's Japan all under its Domes",
    async (size) => {
      const g = await scenarioGame("korea1950", { size });
      const config = g.game.config();
      for (const u of NUCLEAR_UNITS) {
        expect(config.isUnitDisabled(u)).toBe(false);
      }
      const un = g.nation("un_command");
      const domes = un.units(UnitType.Dome);
      expect(domes.length).toBeGreaterThanOrEqual(4);
      const r2 = config.domeRange() ** 2;
      let bare = 0;
      for (const t of un.tiles()) {
        if (
          !domes.some((d) => g.game.euclideanDistSquared(d.tile(), t) <= r2)
        ) {
          bare++;
        }
      }
      expect(bare).toBe(0);
    },
  );
});
