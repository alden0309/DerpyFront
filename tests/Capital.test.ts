import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  Difficulty,
  PlayerInfo,
  PlayerType,
  TerrainType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig, GameID } from "@openfront/engine-api/Schemas";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  AttackLogicInput,
  EngineConfig,
} from "@openfront/engine/configuration/EngineConfig";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NationStructureBehavior } from "@openfront/engine/execution/nation/NationStructureBehavior";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { vi } from "vitest";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

const gameID: GameID = "game_id";

async function newGame(instantBuild: boolean) {
  const game = await setup("plains", { instantBuild });
  const meInfo = new PlayerInfo("Me", PlayerType.Human, null, "Me");
  const enemyInfo = new PlayerInfo("Enemy", PlayerType.Human, null, "Enemy");
  game.addPlayer(meInfo);
  game.addPlayer(enemyInfo);
  game.addExecution(
    new SpawnExecution(gameID, game.player(meInfo.id).info(), game.ref(5, 5)),
    new SpawnExecution(
      gameID,
      game.player(enemyInfo.id).info(),
      game.ref(5, 40),
    ),
  );
  executeTicks(game, 10);
  const me = game.player(meInfo.id);
  const enemy = game.player(enemyInfo.id);
  me.addGold(20_000_000n);
  return { game, me, enemy };
}

function ownTiles(player: Player): TileRef[] {
  return Array.from(player.tiles());
}

function buildCapital(game: Game, player: Player, tile: TileRef) {
  game.addExecution(new ConstructionExecution(player, UnitType.Capital, tile));
  executeTicks(game, 3);
}

describe("Capital", () => {
  test("costs 5M and only one can be built", async () => {
    const { game, me } = await newGame(true);
    expect(game.unitInfo(UnitType.Capital).cost(game, me)).toBe(5_000_000n);

    const tiles = ownTiles(me);
    expect(me.canBuild(UnitType.Capital, tiles[0])).not.toBe(false);
    buildCapital(game, me, tiles[0]);
    expect(me.units(UnitType.Capital)).toHaveLength(1);

    // A second one is refused everywhere, and a forced attempt builds nothing.
    for (const t of tiles) {
      expect(me.canBuild(UnitType.Capital, t)).toBe(false);
    }
    buildCapital(game, me, tiles[tiles.length - 1]);
    expect(me.units(UnitType.Capital)).toHaveLength(1);
  });

  test("one still under construction blocks a second", async () => {
    const { game, me } = await newGame(false);
    const tiles = ownTiles(me);
    buildCapital(game, me, tiles[0]);
    const [capital] = me.units(UnitType.Capital);
    expect(capital.isUnderConstruction()).toBe(true);
    expect(me.canBuild(UnitType.Capital, tiles[tiles.length - 1])).toBe(false);
  });

  // Troops are stored at 10x the on-screen number, so the 200K a player
  // sees is 2,000,000 here.
  test("adds 200K troops and raises the troop cap by 200K", async () => {
    const { game, me } = await newGame(true);
    const maxBefore = game.config().maxTroops(me);
    const troopsBefore = me.troops();
    buildCapital(game, me, ownTiles(me)[0]);
    expect(game.config().maxTroops(me) - maxBefore).toBeCloseTo(2_000_000);
    expect(me.troops() - troopsBefore).toBeGreaterThanOrEqual(2_000_000);
    // ...and they stay: a few seconds later they haven't drained away.
    executeTicks(game, 50);
    expect(me.troops() - troopsBefore).toBeGreaterThanOrEqual(2_000_000);
  });

  test("pays 50K gold every 5 seconds on top of normal income", async () => {
    const { game, me } = await newGame(true);
    buildCapital(game, me, ownTiles(me)[0]);
    const rate = game.config().goldAdditionRate(me);
    // 5 seconds = 50 ticks: exactly one payout per window, every window.
    for (let window = 0; window < 3; window++) {
      const before = me.gold();
      executeTicks(game, 50);
      expect(me.gold() - before).toBe(50n * rate + 50_000n);
    }
  });

  test("is destroyed when captured, then can be rebuilt", async () => {
    const { game, me, enemy } = await newGame(true);
    const tiles = ownTiles(me);
    buildCapital(game, me, tiles[0]);
    const [capital] = me.units(UnitType.Capital);

    enemy.conquer(capital.tile());
    executeTicks(game, 2);
    expect(capital.isActive()).toBe(false);
    expect(me.units(UnitType.Capital)).toHaveLength(0);
    expect(enemy.units(UnitType.Capital)).toHaveLength(0);

    // Income and troop cap bonus stop; a new Capital can go up elsewhere.
    me.addGold(10_000_000n);
    const maxNow = game.config().maxTroops(me);
    const spot = ownTiles(me).find(
      (t) => me.canBuild(UnitType.Capital, t) !== false,
    );
    expect(spot).toBeDefined();
    buildCapital(game, me, spot!);
    expect(me.units(UnitType.Capital)).toHaveLength(1);
    expect(game.config().maxTroops(me) - maxNow).toBeCloseTo(2_000_000);
  });

  test("losing it to a capture hands half your gold to the captor", async () => {
    const { game, me, enemy } = await newGame(true);
    buildCapital(game, me, ownTiles(me)[0]);
    const [capital] = me.units(UnitType.Capital);
    me.addGold(10_000_000n);
    const mine = me.gold();
    const theirs = enemy.gold();

    enemy.conquer(capital.tile());
    executeTicks(game, 2);
    const taken = enemy.gold() - theirs;
    // Half of what I held when it fell (plus a tick or two of income).
    expect(taken).toBeGreaterThanOrEqual(mine / 2n);
    expect(taken).toBeLessThan((mine * 51n) / 100n);
    expect(me.gold()).toBeLessThan((mine * 51n) / 100n);
  });

  test("a nuke (no capture) burns the half instead", async () => {
    const { game, me, enemy } = await newGame(true);
    buildCapital(game, me, ownTiles(me)[0]);
    const [capital] = me.units(UnitType.Capital);
    const mine = me.gold();
    const theirs = enemy.gold();

    const silo = enemy.buildUnit(
      UnitType.MissileSilo,
      Array.from(enemy.tiles())[0],
      {},
    );
    enemy.addGold(10_000_000n);
    const theirsAfterFunding = enemy.gold();
    game.addExecution(
      new NukeExecution(UnitType.AtomBomb, enemy, capital.tile(), silo.tile()),
    );
    for (let i = 0; i < 400 && capital.isActive(); i++) game.executeNextTick();
    expect(capital.isActive()).toBe(false);
    expect(me.gold()).toBeLessThan((mine * 51n) / 100n);
    // The enemy paid for the bomb and got none of my gold.
    expect(enemy.gold()).toBeLessThan(theirsAfterFunding);
    expect(theirs).toBeGreaterThanOrEqual(0n);
  });

  test("deleting your own Capital costs nothing extra", async () => {
    const { game, me } = await newGame(true);
    buildCapital(game, me, ownTiles(me)[0]);
    const [capital] = me.units(UnitType.Capital);
    const mine = me.gold();
    capital.delete(false);
    executeTicks(game, 2);
    expect(me.gold()).toBeGreaterThanOrEqual(mine);
  });

  test("defends like a defense post, at twice the strength", () => {
    // The real formula (the test game's config stubs attackLogic out).
    const config = new EngineConfig({} as GameConfig, false);
    const base: AttackLogicInput = {
      terrain: TerrainType.Plains,
      attackTroops: 50_000,
      attacker: { type: PlayerType.Human, numTiles: 1_000 },
      defender: {
        type: PlayerType.Human,
        numTiles: 500,
        troops: 100_000,
        isTraitor: false,
        isDisconnectedTeammate: false,
      },
      defenderHasDefensePost: false,
      falloutRatio: null,
      borderSize: 50,
    };
    const post = config.attackLogic({ ...base, defenderHasDefensePost: true });
    const capital = config.attackLogic({ ...base, defenderHasCapital: true });
    const both = config.attackLogic({
      ...base,
      defenderHasDefensePost: true,
      defenderHasCapital: true,
    });

    // Attackers lose twice the troops and take land half as fast.
    expect(capital.attackerTroopLoss).toBeCloseTo(2 * post.attackerTroopLoss);
    expect(capital.tickFraction).toBeCloseTo(2 * post.tickFraction);
    // Next to a defense post as well, the Capital's bonus applies once.
    expect(both).toEqual(capital);
    expect(config.capitalDefenseRange()).toBe(config.defensePostRange());
  });

  test("attacks on land near the Capital get its defense", async () => {
    const { game, me, enemy } = await newGame(true);
    buildCapital(game, me, ownTiles(me)[0]);

    // Give the enemy a foothold on the edge of my land, then attack.
    const edge = ownTiles(me).find((t) =>
      game.neighbors(t).some((n) => game.isLand(n) && !game.hasOwner(n)),
    )!;
    const foothold = game
      .neighbors(edge)
      .find((n) => game.isLand(n) && !game.hasOwner(n))!;
    enemy.conquer(foothold);

    const spy = vi.spyOn(game.config(), "attackLogic");
    game.addExecution(new AttackExecution(20_000, enemy, me.id()));
    executeTicks(game, 20);

    const onMe = spy.mock.calls
      .map(([input]) => input)
      .filter((input) => input.defender !== null);
    expect(onMe.length).toBeGreaterThan(0);
    expect(onMe.every((input) => input.defenderHasCapital)).toBe(true);
  });

  describe("on the rail network", () => {
    // My land: a wide strip along the top, clear of the enemy at y=40.
    async function railGame() {
      const { game, me } = await newGame(true);
      for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 80; x++) me.conquer(game.ref(x, y));
      }
      const build = (type: UnitType, x: number, y: number) => {
        game.addExecution(new ConstructionExecution(me, type, game.ref(x, y)));
        executeTicks(game, 5);
        return me.units(type)[0];
      };
      return { game, me, build };
    }

    test("a Capital built near a factory becomes a connected station", async () => {
      const { game, build } = await railGame();
      const factory = build(UnitType.Factory, 10, 10);
      const capital = build(UnitType.Capital, 45, 10);
      executeTicks(game, 5);

      expect(capital.hasTrainStation()).toBe(true);
      const stations = game.railNetwork().stationManager();
      const cluster = stations.findStation(capital)?.getCluster();
      expect(cluster).toBeTruthy();
      expect(stations.findStation(factory)?.getCluster()).toBe(cluster);
    });

    test("a factory built later pulls the Capital in", async () => {
      const { game, build } = await railGame();
      const capital = build(UnitType.Capital, 45, 10);
      expect(capital.hasTrainStation()).toBe(false);
      build(UnitType.Factory, 10, 10);
      executeTicks(game, 5);
      expect(capital.hasTrainStation()).toBe(true);
    });

    test("trains trade at the Capital like a city", async () => {
      const { game, me, build } = await railGame();
      build(UnitType.Factory, 10, 10);
      build(UnitType.Capital, 45, 10);
      // With no city around, the Capital is the factory's only destination.
      executeTicks(game, 2_000);
      expect(me.trainGold()).toBeGreaterThan(0n);
    });
  });
});

describe("Nations and the Capital", () => {
  async function nationGame(
    cities: number,
    gold: bigint,
    difficulty: Difficulty = Difficulty.Medium,
  ) {
    const game = await setup("plains", { instantBuild: true, difficulty });
    const info = new PlayerInfo("Nation", PlayerType.Nation, null, "Nation");
    game.addPlayer(info);
    const nation = game.player(info.id);
    // Most of the map, leaving a border (nations pick spots inside it).
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) nation.conquer(game.ref(x, y));
    }
    for (let i = 0; i < cities; i++) {
      nation.buildUnit(UnitType.City, game.ref(10 + 30 * i, 40), {});
    }
    nation.addGold(gold);
    const behavior = new NationStructureBehavior(
      new PseudoRandom(7),
      game,
      nation,
    );
    const spy = vi.spyOn(game, "addExecution");
    type Built = { constructionType: UnitType; tile: TileRef };
    const placements = () =>
      spy.mock.calls
        .map(([e]) => e)
        .filter((e) => e instanceof ConstructionExecution)
        .map((e) => e as unknown as Built);
    const built = () => placements().map((b) => b.constructionType);
    return { game, nation, behavior, built, placements };
  }

  test("a nation with a city builds its Capital once it can afford it", async () => {
    const { behavior, built } = await nationGame(1, 5_000_000n);
    expect(behavior.handleStructures()).toBe(true);
    expect(built()).toEqual([UnitType.Capital]);
  });

  test("not before its first city", async () => {
    const { behavior, built } = await nationGame(0, 5_000_000n);
    behavior.handleStructures();
    expect(built()).not.toContain(UnitType.Capital);
  });

  test("not while it can't afford one", async () => {
    const { behavior, built } = await nationGame(1, 4_500_000n);
    behavior.handleStructures();
    expect(built()).not.toContain(UnitType.Capital);
  });

  test("never a second one", async () => {
    const { game, nation, behavior, built } = await nationGame(1, 5_000_000n);
    nation.buildUnit(UnitType.Capital, game.ref(60, 60), {});
    behavior.handleStructures();
    expect(built()).not.toContain(UnitType.Capital);
  });

  // The nation holds the square (0..79, 0..79); its borders are the x=79
  // column and the y=79 row.
  test("Impossible tucks its Capital deep inside its land", async () => {
    const { behavior, placements } = await nationGame(
      1,
      5_000_000n,
      Difficulty.Impossible,
    );
    behavior.handleStructures();
    const capital = placements().find(
      (p) => p.constructionType === UnitType.Capital,
    );
    expect(capital).toBeDefined();
    const { game } = await nationGame(0, 0n);
    const depth = Math.min(
      79 - game.x(capital!.tile),
      79 - game.y(capital!.tile),
    );
    expect(depth).toBeGreaterThanOrEqual(40);
  });

  test("Medium guards a finished Capital with a SAM launcher first", async () => {
    const { game, nation, behavior, placements } = await nationGame(
      1,
      20_000_000n,
    );
    const capital = nation.buildUnit(UnitType.Capital, game.ref(40, 40), {});
    behavior.handleStructures();
    const sams = () =>
      placements().filter((p) => p.constructionType === UnitType.SAMLauncher);
    expect(sams()).toHaveLength(1);
    expect(
      game.euclideanDistSquared(sams()[0].tile, capital.tile()),
    ).toBeLessThanOrEqual(36 * 36);
  });

  test("Hard wants a second SAM over its Capital", async () => {
    const { game, nation, behavior, placements } = await nationGame(
      1,
      20_000_000n,
      Difficulty.Hard,
    );
    nation.buildUnit(UnitType.Capital, game.ref(40, 40), {});
    behavior.handleStructures();
    executeTicks(game, 3);
    behavior.handleStructures();
    const sams = placements().filter(
      (p) => p.constructionType === UnitType.SAMLauncher,
    );
    expect(sams).toHaveLength(2);
  });

  test("Easy doesn't bother guarding it", async () => {
    const { game, nation, behavior, placements } = await nationGame(
      1,
      20_000_000n,
      Difficulty.Easy,
    );
    nation.buildUnit(UnitType.Capital, game.ref(40, 40), {});
    behavior.handleStructures();
    // Whatever Easy builds, it isn't a SAM placed to cover the Capital.
    const guard = placements().find(
      (p) =>
        p.constructionType === UnitType.SAMLauncher &&
        game.euclideanDistSquared(p.tile, game.ref(40, 40)) <= 36 * 36,
    );
    expect(guard).toBeUndefined();
  });
});
