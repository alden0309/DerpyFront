import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  PlayerInfo,
  PlayerType,
  TerrainType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig, GameID } from "@openfront/engine-api/Schemas";
import {
  AttackLogicInput,
  EngineConfig,
} from "@openfront/engine/configuration/EngineConfig";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
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
  me.addGold(5_000_000n);
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
  test("costs 500K and only one can be built", async () => {
    const { game, me } = await newGame(true);
    expect(game.unitInfo(UnitType.Capital).cost(game, me)).toBe(500_000n);

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

  // Troops are stored at 10x the on-screen number, so the 100K a player
  // sees is 1,000,000 here.
  test("adds 100K troops and raises the troop cap by 100K", async () => {
    const { game, me } = await newGame(true);
    const maxBefore = game.config().maxTroops(me);
    const troopsBefore = me.troops();
    buildCapital(game, me, ownTiles(me)[0]);
    expect(game.config().maxTroops(me) - maxBefore).toBeCloseTo(1_000_000);
    expect(me.troops() - troopsBefore).toBeGreaterThanOrEqual(1_000_000);
    // ...and they stay: a few seconds later they haven't drained away.
    executeTicks(game, 50);
    expect(me.troops() - troopsBefore).toBeGreaterThanOrEqual(1_000_000);
  });

  test("pays 10K gold every 5 seconds on top of normal income", async () => {
    const { game, me } = await newGame(true);
    buildCapital(game, me, ownTiles(me)[0]);
    const rate = game.config().goldAdditionRate(me);
    // 5 seconds = 50 ticks: exactly one payout per window, every window.
    for (let window = 0; window < 3; window++) {
      const before = me.gold();
      executeTicks(game, 50);
      expect(me.gold() - before).toBe(50n * rate + 10_000n);
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
    const maxNow = game.config().maxTroops(me);
    const spot = ownTiles(me).find(
      (t) => me.canBuild(UnitType.Capital, t) !== false,
    );
    expect(spot).toBeDefined();
    buildCapital(game, me, spot!);
    expect(me.units(UnitType.Capital)).toHaveLength(1);
    expect(game.config().maxTroops(me) - maxNow).toBeCloseTo(1_000_000);
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
});
