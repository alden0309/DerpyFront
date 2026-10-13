import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  Cell,
  Difficulty,
  Nation,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { NukeMagnitude } from "@openfront/engine-lib/configuration/Config";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { readVersioned } from "@openfront/engine-lib/snapshot/SnapshotType";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NationAllianceBehavior } from "@openfront/engine/execution/nation/NationAllianceBehavior";
import {
  landFrontDepth,
  NukeThreat,
  threatPercent,
} from "@openfront/engine/execution/nation/NationDomes";
import { NationEmojiBehavior } from "@openfront/engine/execution/nation/NationEmojiBehavior";
import { NationNukeBehavior } from "@openfront/engine/execution/nation/NationNukeBehavior";
import {
  NationStructureBehavior,
  NationStructureBehaviorSnapshot,
} from "@openfront/engine/execution/nation/NationStructureBehavior";
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { AiAttackBehavior } from "@openfront/engine/execution/utils/AiAttackBehavior";
import { Game, Player } from "@openfront/engine/game/Game";
import { vi } from "vitest";
import { setup } from "./util/Setup";
import { expectSnapshotRoundTrip } from "./util/Snapshot";
import { TestConfig } from "./util/TestConfig";
import { executeTicks } from "./util/utils";

// Real atom bomb size, so the spacing constants are the real ones.
class AtomConfig extends TestConfig {
  nukeMagnitudes(_: UnitType): NukeMagnitude {
    return { inner: 12, outer: 30 };
  }
}

// A Dome half as wide, so two clusters on the 200x200 map need two Domes.
class SmallDomeConfig extends AtomConfig {
  domeRange(): number {
    return 50;
  }
}

// Smaller still, so four corner clusters need four Domes.
class TinyDomeConfig extends AtomConfig {
  domeRange(): number {
    return 40;
  }
}

interface Layout {
  /** Rows the nation holds, every column. */
  rows?: [number, number];
  /** Rows the foe holds, every column. */
  foeRows?: [number, number];
  difficulty?: Difficulty;
  derpyRules?: number;
  foeType?: PlayerType;
  foeSilo?: [number, number] | null;
  config?: typeof TestConfig;
}

/**
 * big_plains is 200x200 land. The nation ("me") holds a band of rows, the
 * foe another, with a silo and money for bombs. Both start with $1B.
 */
async function aiGame(layout: Layout = {}) {
  const {
    rows = [0, 129],
    foeRows = [170, 199],
    difficulty = Difficulty.Medium,
    derpyRules,
    foeType = PlayerType.Human,
    foeSilo = [100, 185],
    config = AtomConfig,
  } = layout;
  const gameConfig: Partial<GameConfig> = {
    instantBuild: true,
    difficulty,
    ...(derpyRules === undefined ? {} : { derpyRules }),
  };
  const game = await setup(
    "big_plains",
    gameConfig,
    [
      new PlayerInfo("Me", PlayerType.Nation, null, "me"),
      new PlayerInfo("Foe", foeType, null, "foe"),
    ],
    undefined,
    config,
  );
  const me = game.player("me");
  const foe = game.player("foe");
  // A one-tile margin of no man's land along the map's edge, so the border
  // runs all around (nations sample spots inside their border's box).
  for (let x = 1; x < 199; x++) {
    for (let y = Math.max(1, rows[0]); y <= rows[1]; y++) {
      me.conquer(game.ref(x, y));
    }
    for (let y = foeRows[0]; y <= Math.min(198, foeRows[1]); y++) {
      foe.conquer(game.ref(x, y));
    }
  }
  me.addGold(1_000_000_000n);
  foe.addGold(1_000_000_000n);
  const silo =
    foeSilo === null
      ? null
      : foe.buildUnit(
          UnitType.MissileSilo,
          game.ref(foeSilo[0], foeSilo[1]),
          {},
        );
  executeTicks(game, 2);
  const behavior = new NationStructureBehavior(new PseudoRandom(7), game, me);
  const spy = vi.spyOn(game, "addExecution");
  type Order = { constructionType: UnitType; tile: TileRef };
  const orders = (type: UnitType) =>
    spy.mock.calls
      .map(([e]) => e)
      .filter(
        (e) =>
          e instanceof ConstructionExecution &&
          (e as unknown as Order).constructionType === type,
      )
      .map((e) => (e as unknown as Order).tile);
  const domes = () => orders(UnitType.Dome);
  return { game, me, foe, silo, behavior, spy, orders, domes };
}

/** The Capital and four cities around (40, 40), with a SAM over it. */
function capitalCluster(game: Game, me: Player, cx = 40, cy = 40) {
  me.buildUnit(UnitType.Capital, game.ref(cx, cy), {});
  for (const [dx, dy] of [
    [-20, 0],
    [20, 0],
    [0, -20],
    [0, 20],
  ]) {
    me.buildUnit(UnitType.City, game.ref(cx + dx, cy + dy), {});
  }
  // Medium keeps one SAM over its Capital; give it one so it moves on.
  me.buildUnit(UnitType.SAMLauncher, game.ref(cx + 10, cy + 10), {});
}

/** Four cities in a diamond around (x, y). */
function cityCluster(game: Game, me: Player, x: number, y: number) {
  for (const [dx, dy] of [
    [-15, 0],
    [15, 0],
    [0, -15],
    [0, 15],
  ]) {
    me.buildUnit(UnitType.City, game.ref(x + dx, y + dy), {});
  }
}

/** Eight cities in two rings around (x, y): 40 points of buildings. */
function bigCluster(game: Game, me: Player, x: number, y: number) {
  cityCluster(game, me, x, y);
  for (const [dx, dy] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ]) {
    me.buildUnit(UnitType.City, game.ref(x + dx, y + dy), {});
  }
}

function dist2(game: Game, a: TileRef, x: number, y: number) {
  return game.euclideanDistSquared(a, game.ref(x, y));
}

/** Puts one of the foe's atom bombs in the air at (x, y). */
function incoming(
  game: Game,
  foe: Player,
  silo: TileRef,
  x: number,
  y: number,
) {
  game.addExecution(
    new NukeExecution(UnitType.AtomBomb, foe, game.ref(x, y), silo),
  );
  game.executeNextTick();
  game.executeNextTick();
  expect(foe.units(UnitType.AtomBomb).length).toBeGreaterThan(0);
}

/** Orders a Dome for `owner` and lets it finish. */
function buildDome(game: Game, owner: Player, x: number, y: number) {
  game.addExecution(
    new ConstructionExecution(owner, UnitType.Dome, game.ref(x, y)),
  );
  executeTicks(game, 3);
  const domes = owner.units(UnitType.Dome);
  return domes[domes.length - 1];
}

describe("Nations raise Domes before the bombs fall (rules 4)", () => {
  test("a nation a foe can nuke shields its Capital and cities before any nuke", async () => {
    const { game, me, behavior, domes } = await aiGame();
    capitalCluster(game, me);
    behavior.handleStructures();
    expect(domes()).toHaveLength(1);
    const [dome] = domes();
    // Over the Capital and all four cities
    for (const [x, y] of [
      [40, 40],
      [20, 40],
      [60, 40],
      [40, 20],
      [40, 60],
    ]) {
      expect(dist2(game, dome, x, y)).toBeLessThanOrEqual(100 * 100);
    }
  });

  test("games under rules 3 still wait for a nuke", async () => {
    const { game, me, behavior, domes } = await aiGame({ derpyRules: 3 });
    capitalCluster(game, me);
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);
  });

  test("not when the foe has no silo", async () => {
    const { game, me, behavior, domes } = await aiGame({ foeSilo: null });
    capitalCluster(game, me);
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);
  });

  test("not when the foe with a silo is an ally", async () => {
    const { game, me, foe, behavior, domes } = await aiGame();
    capitalCluster(game, me);
    me.createAllianceRequest(foe)?.accept();
    expect(me.isAlliedWith(foe)).toBe(true);
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);
  });

  test("not when a far, neutral nation has a silo", async () => {
    // A nation that neither borders us nor fights us is no clear threat.
    const { game, me, behavior, domes } = await aiGame({
      foeType: PlayerType.Nation,
    });
    capitalCluster(game, me);
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);
  });

  test("but a neighbouring nation with a silo is", async () => {
    const { game, me, behavior, domes } = await aiGame({
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    capitalCluster(game, me);
    behavior.handleStructures();
    expect(domes()).toHaveLength(1);
  });

  test("Easy waits for a nuke", async () => {
    const { game, me, behavior, domes } = await aiGame({
      difficulty: Difficulty.Easy,
    });
    capitalCluster(game, me);
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);
  });

  test("not for a couple of cities, until a nuke comes", async () => {
    const { game, me, foe, silo, behavior, domes } = await aiGame();
    me.buildUnit(UnitType.City, game.ref(40, 40), {});
    me.buildUnit(UnitType.City, game.ref(70, 40), {});
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);

    // It notes the nuke now, and looks again 30 seconds after finding
    // nothing worth a Dome.
    incoming(game, foe, silo!.tile(), 150, 100);
    behavior.handleStructures();
    expect(domes()).toHaveLength(0);
    executeTicks(game, 300);
    behavior.handleStructures();
    expect(domes()).toHaveLength(1);
  });

  test("keeps a quarter of the price in hand before any nuke", async () => {
    const { game, me, behavior, domes } = await aiGame();
    capitalCluster(game, me);
    me.removeGold(me.gold() - 60_000_000n);
    expect(behavior["tryBuildSmartDome"]()).toBe(false);
    me.addGold(3_000_000n);
    expect(behavior["tryBuildSmartDome"]()).toBe(true);
    expect(domes()).toHaveLength(1);
  });

  test("under a heavy land attack, holds out for twice the price and more", async () => {
    const { game, me, foe, behavior, domes } = await aiGame({
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    capitalCluster(game, me);
    me.removeGold(me.gold() - 100_000_000n);
    me.removeTroops(me.troops());
    me.addTroops(100_000);
    foe.addTroops(1_000_000);
    game.addExecution(new AttackExecution(80_000, foe, me.id()));
    executeTicks(game, 2);
    expect(me.incomingAttacks().length).toBeGreaterThan(0);
    expect(behavior["tryBuildSmartDome"]()).toBe(false);
    me.addGold(80_000_000n);
    expect(behavior["tryBuildSmartDome"]()).toBe(true);
    expect(domes()).toHaveLength(1);
  });

  test("one a minute, at most three before a nuke", async () => {
    const { game, me, behavior, domes } = await aiGame({
      config: TinyDomeConfig,
    });
    // Four clusters, each worth a Dome of its own
    bigCluster(game, me, 25, 25);
    bigCluster(game, me, 175, 25);
    bigCluster(game, me, 25, 110);
    bigCluster(game, me, 175, 110);
    // Asks every 3 seconds, as nations do, for `ticks`
    const run = (ticks: number) => {
      for (let t = 0; t < ticks; t += 30) {
        behavior.handleStructures();
        executeTicks(game, 30);
      }
    };
    behavior.handleStructures();
    executeTicks(game, 3);
    expect(domes()).toHaveLength(1);
    run(540);
    expect(domes()).toHaveLength(1);
    run(300);
    expect(domes()).toHaveLength(2);
    run(900);
    expect(domes()).toHaveLength(3);
    run(1200);
    expect(domes()).toHaveLength(3);
  });
});

describe("Saving for a Dome (rules 4)", () => {
  /** The nation's nuke behavior, told what the structure behavior holds. */
  function nukes(game: Game, me: Player, behavior: NationStructureBehavior) {
    const emoji = new NationEmojiBehavior(new PseudoRandom(1), game, me);
    const alliance = new NationAllianceBehavior(
      new PseudoRandom(1),
      game,
      me,
      emoji,
    );
    const attack = new AiAttackBehavior(
      new PseudoRandom(1),
      game,
      me,
      0.5,
      0.3,
      0.2,
      alliance,
      emoji,
    );
    return new NationNukeBehavior(
      new PseudoRandom(2),
      game,
      me,
      attack,
      emoji,
      () => behavior.savingForDome(),
    );
  }

  test("a nation with most of the price saves the rest and holds its bombs", async () => {
    const { game, me, behavior, domes } = await aiGame();
    capitalCluster(game, me);
    me.removeGold(me.gold() - 50_000_000n);
    const bombs = nukes(game, me, behavior);
    expect(bombs["nukeTypesToTry"]()).not.toEqual([]);

    expect(behavior["tryBuildSmartDome"]()).toBe(false);
    expect(behavior.savingForDome()).toBe(62_500_000n);
    expect(behavior["getSaveUpTarget"]()).toBe(62_500_000n);
    // A hydrogen bomb would cut into the Dome's price
    expect(bombs["nukeTypesToTry"]()).toEqual([]);

    // Once it holds the price, it builds the Dome and stops saving
    me.addGold(13_000_000n);
    expect(behavior["tryBuildSmartDome"]()).toBe(true);
    expect(domes()).toHaveLength(1);
    expect(behavior.savingForDome()).toBeNull();
  });

  test("decides again every 30 seconds", async () => {
    const { game, me, behavior } = await aiGame();
    capitalCluster(game, me);
    me.removeGold(me.gold() - 50_000_000n);
    behavior["tryBuildSmartDome"]();
    expect(behavior.savingForDome()).not.toBeNull();
    executeTicks(game, 300);
    expect(behavior.savingForDome()).toBeNull();
  });

  test("saves five minutes out of ten at most", async () => {
    const { game, me, behavior } = await aiGame();
    capitalCluster(game, me);
    const saving = () => {
      me.removeGold(me.gold() - 40_000_000n);
      behavior["tryBuildSmartDome"]();
      return behavior.savingForDome() !== null;
    };
    expect(saving()).toBe(true);
    for (let i = 0; i < 9; i++) {
      executeTicks(game, 300);
      expect(saving()).toBe(true);
    }
    executeTicks(game, 300);
    expect(saving()).toBe(false);
    executeTicks(game, 2700);
    expect(saving()).toBe(false);
    executeTicks(game, 300);
    expect(saving()).toBe(true);
  });

  test("only for its first Dome", async () => {
    const { game, me, behavior } = await aiGame();
    capitalCluster(game, me);
    buildDome(game, me, 170, 110);
    me.removeGold(me.gold() - 50_000_000n);
    behavior["tryBuildSmartDome"]();
    expect(behavior.savingForDome()).toBeNull();
  });

  test("not with under half the price, on Easy, or under a land attack", async () => {
    const poor = await aiGame();
    capitalCluster(poor.game, poor.me);
    poor.me.removeGold(poor.me.gold() - 30_000_000n);
    poor.behavior["tryBuildSmartDome"]();
    expect(poor.behavior.savingForDome()).toBeNull();

    const easy = await aiGame({ difficulty: Difficulty.Easy });
    capitalCluster(easy.game, easy.me);
    easy.me.removeGold(easy.me.gold() - 45_000_000n);
    // Nuked, so Easy would build one at $50M, but doesn't save for it
    const silo = easy.silo!.tile();
    incoming(easy.game, easy.game.player("foe"), silo, 40, 40);
    easy.behavior.handleStructures();
    expect(easy.behavior.savingForDome()).toBeNull();

    const { game, me, foe, behavior } = await aiGame({
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    capitalCluster(game, me);
    me.removeGold(me.gold() - 55_000_000n);
    me.removeTroops(me.troops());
    me.addTroops(100_000);
    foe.addTroops(1_000_000);
    game.addExecution(new AttackExecution(80_000, foe, me.id()));
    executeTicks(game, 2);
    behavior["tryBuildSmartDome"]();
    expect(behavior.savingForDome()).toBeNull();
  });

  test("rules 3 nations never save for one", async () => {
    const { game, me, behavior } = await aiGame({ derpyRules: 3 });
    capitalCluster(game, me);
    me.removeGold(me.gold() - 50_000_000n);
    behavior.handleStructures();
    expect(behavior.savingForDome()).toBeNull();
  });
});

describe("Where nations put a Dome (rules 4)", () => {
  test("over the cluster nearer the foe's silos", async () => {
    // Two equal clusters too far apart for one Dome of range 50
    const { game, me, behavior, domes } = await aiGame({
      config: SmallDomeConfig,
      foeSilo: [180, 190],
    });
    bigCluster(game, me, 30, 40);
    bigCluster(game, me, 170, 90);
    behavior.handleStructures();
    const [dome] = domes();
    expect(dome).toBeDefined();
    expect(dist2(game, dome, 170, 90)).toBeLessThanOrEqual(50 * 50);
  });

  test("over the cluster a nuke has come at", async () => {
    const { game, me, foe, silo, behavior, domes } = await aiGame({
      config: SmallDomeConfig,
      foeSilo: [100, 190],
    });
    cityCluster(game, me, 30, 40);
    cityCluster(game, me, 170, 40);
    incoming(game, foe, silo!.tile(), 30, 40);
    behavior.handleStructures();
    const [dome] = domes();
    expect(dome).toBeDefined();
    expect(dist2(game, dome, 30, 40)).toBeLessThanOrEqual(50 * 50);
  });

  test("the next one covers what the first doesn't, clear of it", async () => {
    const { game, me, behavior, domes } = await aiGame({
      config: SmallDomeConfig,
    });
    cityCluster(game, me, 40, 30);
    cityCluster(game, me, 40, 80);
    cityCluster(game, me, 160, 30);
    cityCluster(game, me, 160, 80);
    // Covers the two clusters on the left
    const first = buildDome(game, me, 60, 55);
    expect(game.x(first.tile())).toBe(60);
    const before = domes().length;
    behavior.handleStructures();
    expect(domes()).toHaveLength(before + 1);
    const dome = domes()[before];
    expect(dist2(game, dome, 160, 55)).toBeLessThanOrEqual(50 * 50);
    expect(game.euclideanDistSquared(dome, first.tile())).toBeGreaterThan(
      50 * 50,
    );
  });

  test("keeps off land a foe could take", async () => {
    // The foe's land touches ours at row 130; our cities sit near it.
    const { game, me, behavior, domes } = await aiGame({
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    capitalCluster(game, me, 100, 105);
    behavior.handleStructures();
    const [dome] = domes();
    expect(dome).toBeDefined();
    expect(landFrontDepth(game, me, dome, 33)).toBeGreaterThanOrEqual(10);
  });

  test("weighs a building by the nukes, silos and front around it", async () => {
    // Range 50: nukes within 50, silos within 150 or 300, front within 25
    const { game, foe } = await aiGame({
      config: SmallDomeConfig,
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    const calm: NukeThreat = {
      nuked: false,
      armed: true,
      foeSilos: [],
      foeIDs: new Set(),
      impacts: [],
    };
    const at = (x: number, y: number, t: NukeThreat) =>
      threatPercent(game, game.ref(x, y), t);
    expect(at(20, 20, calm)).toBe(100);
    expect(at(20, 20, { ...calm, impacts: [game.ref(60, 40)] })).toBe(200);
    expect(at(20, 20, { ...calm, impacts: [game.ref(80, 40)] })).toBe(100);
    expect(at(20, 20, { ...calm, foeSilos: [game.ref(20, 160)] })).toBe(150);
    expect(at(20, 20, { ...calm, foeSilos: [game.ref(190, 190)] })).toBe(125);
    const front = { ...calm, foeIDs: new Set([foe.smallID()]) };
    expect(at(50, 110, front)).toBe(125);
    expect(at(20, 20, front)).toBe(100);
  });

  test("measures how far the land front is", async () => {
    const { game, me } = await aiGame({
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    expect(landFrontDepth(game, me, game.ref(50, 129), 33)).toBe(1);
    expect(landFrontDepth(game, me, game.ref(50, 110), 33)).toBe(20);
    expect(landFrontDepth(game, me, game.ref(50, 40), 33)).toBe(33);
    // An ally's land is no front
    const ally = game.player("foe");
    me.createAllianceRequest(ally)?.accept();
    expect(landFrontDepth(game, me, game.ref(50, 129), 33)).toBe(33);
  });
});

describe("Building under a Dome (rules 4)", () => {
  /** Where 40 new cities would go, as a share under the Dome at (40, 40). */
  async function shelteredShare(layout: Layout, citiesUnder = 0) {
    const { game, me, behavior } = await aiGame({
      config: SmallDomeConfig,
      ...layout,
    });
    buildDome(game, me, 40, 40);
    for (let i = 0; i < citiesUnder; i++) {
      me.buildUnit(UnitType.City, game.ref(20 + 20 * i, 25), {});
    }
    let under = 0;
    for (let i = 0; i < 40; i++) {
      const tile = behavior["structureSpawnTile"](UnitType.City);
      if (tile !== null && dist2(game, tile, 40, 40) <= 50 * 50) under++;
    }
    return under / 40;
  }

  test("a threatened nation puts new cities under its Dome", async () => {
    expect(await shelteredShare({})).toBeGreaterThanOrEqual(0.75);
  });

  test("but not when nobody can nuke it, nor under rules 3", async () => {
    expect(await shelteredShare({ foeSilo: null })).toBeLessThan(0.4);
    expect(await shelteredShare({ derpyRules: 3 })).toBeLessThan(0.4);
  });

  test("and less once the Dome already covers a few", async () => {
    const crowded = await shelteredShare({}, 4);
    expect(crowded).toBeLessThan(await shelteredShare({}));
  });

  test("silos and SAMs too", async () => {
    const { game, me, behavior } = await aiGame({ config: SmallDomeConfig });
    buildDome(game, me, 40, 40);
    for (const type of [UnitType.MissileSilo, UnitType.SAMLauncher]) {
      let under = 0;
      for (let i = 0; i < 20; i++) {
        const tile = behavior["structureSpawnTile"](type);
        if (tile !== null && dist2(game, tile, 40, 40) <= 50 * 50) under++;
      }
      expect(under).toBeGreaterThanOrEqual(10);
    }
  });

  test("prefers to upgrade what its Dome shields", async () => {
    /** How often, of 100 picks, the city outside the Dome is upgraded. */
    async function outsidePicks(derpyRules?: number) {
      const { game, me, behavior } = await aiGame({
        config: SmallDomeConfig,
        difficulty: Difficulty.Impossible,
        derpyRules,
      });
      buildDome(game, me, 40, 40);
      const cities = [
        me.buildUnit(UnitType.City, game.ref(170, 100), {}),
        ...[20, 40, 60].map((x) =>
          me.buildUnit(UnitType.City, game.ref(x, 60), {}),
        ),
      ];
      let picks = 0;
      for (let i = 0; i < 100; i++) {
        if (behavior["findBestStructureToUpgrade"](cities) === cities[0]) {
          picks++;
        }
      }
      return picks;
    }
    // Only the 10% random pick reaches it now, against about a quarter.
    expect(await outsidePicks()).toBeLessThanOrEqual(10);
    expect(await outsidePicks(3)).toBeGreaterThan(10);
  });
});

describe("Guarding a Dome (rules 4)", () => {
  test("Hard puts a defense post where a land attack nears its Dome", async () => {
    const { game, me, foe, orders, behavior } = await aiGame({
      difficulty: Difficulty.Hard,
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    const dome = buildDome(game, me, 100, 85);
    me.addTroops(1_000_000);
    foe.addTroops(1_000_000);
    game.addExecution(new AttackExecution(10_000, foe, me.id()));
    executeTicks(game, 2);
    expect(me.incomingAttacks().length).toBeGreaterThan(0);
    behavior.handleStructures();
    const posts = orders(UnitType.DefensePost);
    expect(posts).toHaveLength(1);
    expect(game.euclideanDistSquared(posts[0], dome.tile())).toBeLessThan(
      100 * 100,
    );
  });

  test("Medium doesn't", async () => {
    const { game, me, foe, orders, behavior } = await aiGame({
      foeType: PlayerType.Nation,
      foeRows: [130, 199],
    });
    buildDome(game, me, 100, 85);
    me.addTroops(1_000_000);
    foe.addTroops(1_000_000);
    game.addExecution(new AttackExecution(10_000, foe, me.id()));
    executeTicks(game, 2);
    behavior.handleStructures();
    expect(orders(UnitType.DefensePost)).toHaveLength(0);
  });
});

describe("Nation Dome memory in snapshots", () => {
  test("round-trips while a nation shields itself under fire", async () => {
    const game = await setup(
      "big_plains",
      { instantBuild: true, difficulty: Difficulty.Hard },
      [new PlayerInfo("Foe", PlayerType.Human, null, "foe")],
      undefined,
      AtomConfig,
      false,
      [
        new Nation(
          new Cell(60, 40),
          new PlayerInfo("Me", PlayerType.Nation, null, "me"),
        ),
      ],
    );
    const exec = new NationExecution("dome_snapshot", game.nations()[0]);
    game.addExecution(exec);
    executeTicks(game, 10);
    game.endSpawnPhase();
    executeTicks(game, 3);
    const me = game.player("me");
    const foe = game.player("foe");
    for (let x = 1; x < 199; x++) {
      for (let y = 1; y <= 129; y++) me.conquer(game.ref(x, y));
      for (let y = 170; y <= 198; y++) foe.conquer(game.ref(x, y));
    }
    me.addGold(1_000_000_000n);
    foe.addGold(1_000_000_000n);
    capitalCluster(game, me, 60, 40);
    cityCluster(game, me, 150, 60);
    const silo = foe.buildUnit(UnitType.MissileSilo, game.ref(100, 185), {});
    for (let i = 0; i < 600 && me.units(UnitType.Dome).length === 0; i++) {
      game.executeNextTick();
    }
    expect(me.units(UnitType.Dome).length).toBeGreaterThan(0);
    incoming(game, foe, silo.tile(), 150, 60);
    executeTicks(game, 30);
    // The nation has noted where the nuke was aimed
    expect(exec["structureBehavior"]["nukeImpacts"]).toEqual([
      [expect.any(Number), game.ref(150, 60)],
    ]);
    await expectSnapshotRoundTrip(game, "big_plains", 40);
  }, 60_000);

  test("a version 1 record reads with no Dome memory", () => {
    const v1 = {
      v: 1,
      d: {
        lastStructureTick: 5,
        placementsCount: 2,
        builtCrowdedMapFirstStructure: false,
        hasHighStartingGold: null,
        postSaveUpStartTick: null,
        nukedTick: 40,
      },
    };
    const s = readVersioned(NationStructureBehaviorSnapshot, v1);
    expect(s.nukedTick).toBe(40);
    expect(s.nukeImpacts).toEqual([]);
    expect(s.lastDomeTick).toBeNull();
    expect(s.domeRetryTick).toBeNull();
  });
});
