import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

// Derpy Front rules 3: trains pay double at your own stations and a quarter
// more at allies', ports and factories are priced apart, and factories take
// 2% per finished level (up to 20%) off buildings and warships.

async function plainsGame(config: Partial<GameConfig> = {}) {
  const game = await setup("big_plains", { instantBuild: true, ...config }, [
    new PlayerInfo("Me", PlayerType.Human, null, "me"),
  ]);
  const me = game.player("me");
  for (let x = 0; x < 200; x++) {
    for (let y = 0; y < 100; y++) me.conquer(game.ref(x, y));
  }
  me.addGold(1_000_000_000n);
  executeTicks(game, 2);
  return { game, me };
}

const cost = (game: Game, me: Player, type: UnitType) =>
  game.unitInfo(type).cost(game, me);

/** Finished factories, spread out so none crowds the next. */
function factories(game: Game, me: Player, n: number) {
  for (let i = 0; i < n; i++) {
    me.buildUnit(
      UnitType.Factory,
      game.ref(10 + 20 * (i % 9), 10 + 20 * Math.floor(i / 9)),
      {},
    );
  }
}

describe("Train pay", () => {
  const player = { isLobbyCreator: () => false } as unknown as Player;

  test.each([
    ["self", 10_000n, 20_000n],
    ["ally", 35_000n, 43_750n],
    ["team", 25_000n, 25_000n],
    ["other", 25_000n, 25_000n],
  ] as const)("%s: %i under rules 2, %i now", async (rel, before, now) => {
    const old = (await plainsGame({ derpyRules: 2 })).game.config();
    const current = (await plainsGame()).game.config();
    expect(old.trainGold(rel, 0, player)).toBe(before);
    expect(current.trainGold(rel, 0, player)).toBe(now);
  });

  test("the long-route floor scales the same way", async () => {
    const config = (await plainsGame()).game.config();
    // Past the 9 free stops, 5k less per stop, never under 5k (before the bonus).
    expect(config.trainGold("self", 12, player)).toBe(10_000n);
    expect(config.trainGold("ally", 20, player)).toBe(6_250n);
    expect(config.trainGold("ally", 11, player)).toBe(31_250n);
  });
});

describe("Port and factory prices", () => {
  test("no longer push each other up", async () => {
    const { game, me } = await plainsGame();
    const port = cost(game, me, UnitType.Port);
    me.buildUnit(UnitType.Factory, game.ref(50, 50), {});
    // The factory's 2% discount is the only change to the port's price.
    expect(cost(game, me, UnitType.Port)).toBe((port * 98n) / 100n);
    expect(cost(game, me, UnitType.Factory)).toBe((250_000n * 98n) / 100n);
  });

  test("still share a count under rules 2", async () => {
    const { game, me } = await plainsGame({ derpyRules: 2 });
    expect(cost(game, me, UnitType.Port)).toBe(125_000n);
    me.buildUnit(UnitType.Factory, game.ref(50, 50), {});
    expect(cost(game, me, UnitType.Port)).toBe(250_000n);
  });
});

describe("Factory discount", () => {
  test("2% per finished factory level, up to 20%", async () => {
    const { game, me } = await plainsGame();
    expect(game.config().factoryDiscount(me)).toBe(0);
    factories(game, me, 3);
    expect(game.config().factoryDiscount(me)).toBe(6);
    expect(cost(game, me, UnitType.City)).toBe((125_000n * 94n) / 100n);
    expect(cost(game, me, UnitType.MissileSilo)).toBe(940_000n);
    expect(cost(game, me, UnitType.SAMLauncher)).toBe(1_410_000n);
    expect(cost(game, me, UnitType.DefensePost)).toBe(47_000n);
    expect(cost(game, me, UnitType.Warship)).toBe(235_000n);

    // An upgraded factory counts once per level.
    me.units(UnitType.Factory)[0].increaseLevel();
    expect(game.config().factoryDiscount(me)).toBe(8);

    factories(game, me, 12);
    expect(game.config().factoryDiscount(me)).toBe(20);
    expect(cost(game, me, UnitType.MissileSilo)).toBe(800_000n);
  });

  test("leaves nukes, the Capital and the Dome at full price", async () => {
    const { game, me } = await plainsGame();
    factories(game, me, 10);
    expect(cost(game, me, UnitType.AtomBomb)).toBe(750_000n);
    expect(cost(game, me, UnitType.HydrogenBomb)).toBe(5_000_000n);
    expect(cost(game, me, UnitType.Capital)).toBe(5_000_000n);
    expect(cost(game, me, UnitType.Dome)).toBe(50_000_000n);
  });

  test("a factory still being built doesn't count", async () => {
    const { game, me } = await plainsGame({ instantBuild: false });
    const f = me.buildUnit(UnitType.Factory, game.ref(50, 50), {});
    f.setUnderConstruction(true);
    expect(game.config().factoryDiscount(me)).toBe(0);
    f.setUnderConstruction(false);
    expect(game.config().factoryDiscount(me)).toBe(2);
  });

  test("an escort costs two discounted warships", async () => {
    const { game, me } = await plainsGame();
    factories(game, me, 5);
    const { escortedTransportCost } =
      await import("@openfront/engine/execution/TransportShipExecution");
    expect(escortedTransportCost(game, me)).toBe(
      ((250_000n + 500_000n) * 90n) / 100n,
    );
  });

  test("doesn't exist under rules 2", async () => {
    const { game, me } = await plainsGame({ derpyRules: 2 });
    factories(game, me, 10);
    expect(game.config().factoryDiscount(me)).toBe(0);
    expect(cost(game, me, UnitType.MissileSilo)).toBe(1_000_000n);
  });
});
