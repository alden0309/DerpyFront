import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { NukeMagnitude } from "@openfront/engine-lib/configuration/Config";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NationStructureBehavior } from "@openfront/engine/execution/nation/NationStructureBehavior";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { vi } from "vitest";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";
import { executeTicks } from "./util/utils";

// Real atom bomb size, so a blast can straddle a Dome's edge.
class AtomConfig extends TestConfig {
  nukeMagnitudes(_: UnitType): NukeMagnitude {
    return { inner: 12, outer: 30 };
  }
}

// big_plains is 200x200 land. "me" holds a band across the middle (rows
// 90-110, every column); "foe" holds rows 150-160 with a silo.
async function domeGame(
  config: Partial<GameConfig> = {},
  meType: PlayerType = PlayerType.Human,
) {
  const game = await setup(
    "big_plains",
    { instantBuild: true, ...config },
    [
      new PlayerInfo("Me", meType, null, "me"),
      new PlayerInfo("Foe", PlayerType.Human, null, "foe"),
    ],
    undefined,
    AtomConfig,
  );
  const me = game.player("me");
  const foe = game.player("foe");
  for (let x = 0; x < 200; x++) {
    for (let y = 90; y <= 110; y++) me.conquer(game.ref(x, y));
    for (let y = 150; y <= 160; y++) foe.conquer(game.ref(x, y));
  }
  me.addGold(1_000_000_000n);
  foe.addGold(1_000_000_000n);
  const silo = foe.buildUnit(UnitType.MissileSilo, game.ref(100, 155), {});
  executeTicks(game, 2);
  return { game, me, foe, silo };
}

function buildDome(game: Game, owner: Player, x: number, y: number) {
  game.addExecution(
    new ConstructionExecution(owner, UnitType.Dome, game.ref(x, y)),
  );
  executeTicks(game, 3);
  const domes = owner.units(UnitType.Dome);
  return domes[domes.length - 1];
}

/** Launches a nuke from the foe's silo and runs until it is gone. */
function nuke(
  game: Game,
  from: Player,
  silo: TileRef,
  x: number,
  y: number,
  type: UnitType.AtomBomb | UnitType.HydrogenBomb = UnitType.AtomBomb,
) {
  const exec = new NukeExecution(type, from, game.ref(x, y), silo);
  game.addExecution(exec);
  game.executeNextTick();
  game.executeNextTick();
  for (let i = 0; i < 500 && exec.isActive(); i++) game.executeNextTick();
  expect(exec.isActive()).toBe(false);
  return exec;
}

describe("Dome of Alden", () => {
  test("costs $50M, then $60M, and a player can own five", async () => {
    const { game, me } = await domeGame();
    const cost = () => game.unitInfo(UnitType.Dome).cost(game, me);
    expect(cost()).toBe(50_000_000n);
    const gold = me.gold();
    buildDome(game, me, 10, 100);
    expect(me.units(UnitType.Dome)).toHaveLength(1);
    expect(gold - me.gold()).toBeGreaterThanOrEqual(50_000_000n);
    expect(cost()).toBe(60_000_000n);

    for (const x of [50, 90, 130, 170]) buildDome(game, me, x, 100);
    expect(me.units(UnitType.Dome)).toHaveLength(5);
    expect(me.canBuild(UnitType.Dome, game.ref(30, 95))).toBe(false);

    // Losing one frees a slot but doesn't make the next one cheaper.
    me.units(UnitType.Dome)[0].delete(false);
    expect(me.canBuild(UnitType.Dome, game.ref(30, 95))).not.toBe(false);
    expect(cost()).toBe(60_000_000n);
  });

  test("isn't upgradable and takes 30 seconds to build", async () => {
    const { game } = await domeGame();
    const info = game.config().unitInfo(UnitType.Dome);
    expect(info.upgradable).toBe(false);
    const slow = await domeGame({ instantBuild: false });
    expect(
      slow.game.config().unitInfo(UnitType.Dome).constructionDuration,
    ).toBe(300);
    expect(game.config().domeRange()).toBe(100);
  });

  test("a nuke aimed inside an enemy Dome never goes off", async () => {
    const { game, me, foe, silo } = await domeGame();
    buildDome(game, me, 60, 100);
    const city = me.buildUnit(UnitType.City, game.ref(90, 100), {});
    const tiles = me.numTilesOwned();
    const messages = vi.spyOn(game, "displayMessage");

    nuke(game, foe, silo.tile(), 90, 100);

    expect(me.numTilesOwned()).toBe(tiles);
    expect(game.owner(game.ref(90, 100))).toBe(me);
    expect(city.isActive()).toBe(true);
    const keys = messages.mock.calls.map((c) => [c[0], c[2]]);
    expect(keys).toContainEqual(["events_display.dome_stopped_nuke", me.id()]);
    expect(keys).toContainEqual([
      "events_display.dome_stopped_your_nuke",
      foe.id(),
    ]);
  });

  test("a blast that reaches into a Dome stops at its edge", async () => {
    const { game, me, foe, silo } = await domeGame();
    // Range 100 from (60, 100) ends at x = 160; the bomb lands at x = 165.
    buildDome(game, me, 60, 100);
    const inside = me.buildUnit(UnitType.City, game.ref(158, 100), {});
    const outside = me.buildUnit(UnitType.City, game.ref(175, 100), {});

    nuke(game, foe, silo.tile(), 165, 100);

    // Inner blast reaches 12 tiles: x 153..177.
    for (let x = 153; x <= 160; x++) {
      expect(game.owner(game.ref(x, 100))).toBe(me);
    }
    for (let x = 161; x <= 177; x++) {
      expect(game.owner(game.ref(x, 100))).not.toBe(me);
    }
    expect(inside.isActive()).toBe(true);
    expect(outside.isActive()).toBe(false);
  });

  test("its owner's own nukes go off inside it", async () => {
    const { game, me } = await domeGame();
    buildDome(game, me, 60, 100);
    const mySilo = me.buildUnit(UnitType.MissileSilo, game.ref(10, 100), {});
    executeTicks(game, 2);

    nuke(game, me, mySilo.tile(), 90, 100);

    expect(game.owner(game.ref(90, 100))).not.toBe(me);
  });

  test("an unfinished Dome shields nothing", async () => {
    const { game, me, foe, silo } = await domeGame({ instantBuild: false });
    game.addExecution(
      new ConstructionExecution(me, UnitType.Dome, game.ref(60, 100)),
    );
    executeTicks(game, 3);
    const [dome] = me.units(UnitType.Dome);
    expect(dome.isUnderConstruction()).toBe(true);

    nuke(game, foe, silo.tile(), 90, 100);

    expect(game.owner(game.ref(90, 100))).not.toBe(me);
  });

  test("it shields other players' land in range too", async () => {
    const { game, me, foe, silo } = await domeGame();
    game.addPlayer(new PlayerInfo("Third", PlayerType.Human, null, "third"));
    const third = game.player("third");
    for (let x = 0; x < 40; x++) {
      for (let y = 115; y <= 120; y++) third.conquer(game.ref(x, y));
    }
    buildDome(game, me, 20, 100);

    nuke(game, foe, silo.tile(), 20, 118);

    expect(game.owner(game.ref(20, 118))).toBe(third);
  });

  test("is taken with its land, and then shields its new owner", async () => {
    const { game, me, foe, silo } = await domeGame();
    const dome = buildDome(game, me, 60, 100);
    game.addExecution(new PlayerExecution(me));
    foe.conquer(dome.tile());
    executeTicks(game, 2);
    expect(dome.owner()).toBe(foe);

    // Now the foe's own nukes go through, and mine would be stopped.
    nuke(game, foe, silo.tile(), 90, 100);
    expect(game.owner(game.ref(90, 100))).not.toBe(me);
  });
});

describe("Nations and the Dome of Alden", () => {
  async function nationGame(derpyRules?: number) {
    const { game, me, foe, silo } = await domeGame(
      derpyRules === undefined ? {} : { derpyRules },
      PlayerType.Nation,
    );
    for (const x of [40, 60, 80]) {
      me.buildUnit(UnitType.City, game.ref(x, 100), {});
    }
    const behavior = new NationStructureBehavior(new PseudoRandom(7), game, me);
    return { game, nation: me, foe, silo, behavior };
  }

  function domesOrdered(spy: { mock: { calls: any[][] } }) {
    return spy.mock.calls
      .map((c) => c[0])
      .filter(
        (e) =>
          e instanceof ConstructionExecution &&
          e["constructionType"] === UnitType.Dome,
      );
  }

  /** Puts one of the foe's atom bombs in the air over the nation. */
  function incoming(game: Game, foe: Player, silo: TileRef) {
    game.addExecution(
      new NukeExecution(UnitType.AtomBomb, foe, game.ref(150, 100), silo),
    );
    game.executeNextTick();
    game.executeNextTick();
    expect(foe.units(UnitType.AtomBomb)).toHaveLength(1);
  }

  test("a nuked nation that can afford one builds a Dome over its cities", async () => {
    const { game, nation, foe, silo, behavior } = await nationGame();
    incoming(game, foe, silo.tile());
    const spy = vi.spyOn(game, "addExecution");
    expect(behavior.handleStructures()).toBe(true);
    const [order] = domesOrdered(spy);
    expect(order).toBeDefined();
    // Placed where it covers all three cities.
    for (const city of nation.units(UnitType.City)) {
      expect(
        game.euclideanDistSquared(order["tile"], city.tile()),
      ).toBeLessThanOrEqual(100 * 100);
    }
  });

  test("not before it has been nuked, nor when it can't pay", async () => {
    const { game, nation, foe, silo, behavior } = await nationGame();
    const spy = vi.spyOn(game, "addExecution");
    behavior.handleStructures();
    expect(domesOrdered(spy)).toHaveLength(0);

    nation.removeGold(nation.gold() - 1_000_000n);
    incoming(game, foe, silo.tile());
    behavior.handleStructures();
    expect(domesOrdered(spy)).toHaveLength(0);
  });

  test("games under older rules never see a nation build one", async () => {
    const { game, foe, silo, behavior } = await nationGame(2);
    incoming(game, foe, silo.tile());
    const spy = vi.spyOn(game, "addExecution");
    behavior.handleStructures();
    expect(domesOrdered(spy)).toHaveLength(0);
  });

  test("the next Dome covers what the first one doesn't", async () => {
    const { game, nation, foe, silo, behavior } = await nationGame();
    const far = [175, 185, 195].map((x) =>
      nation.buildUnit(UnitType.City, game.ref(x, 100), {}),
    );
    buildDome(game, nation, 60, 100);
    incoming(game, foe, silo.tile());
    const spy = vi.spyOn(game, "addExecution");
    behavior.handleStructures();
    const [order] = domesOrdered(spy);
    for (const city of far) {
      expect(
        game.euclideanDistSquared(order["tile"], city.tile()),
      ).toBeLessThanOrEqual(100 * 100);
    }
  });
});
