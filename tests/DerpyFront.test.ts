import {
  MessageType,
  PlayerInfo,
  PlayerType,
  Relation,
  TerrainType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { DERPY_RULES, GameConfig } from "@openfront/engine-api/Schemas";
import {
  AttackLogicInput,
  EngineConfig,
} from "@openfront/engine/configuration/EngineConfig";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { BoatRetreatExecution } from "@openfront/engine/execution/BoatRetreatExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import {
  TradeAgreementCancelExecution,
  TradeAgreementReplyExecution,
  TradeAgreementRequestExecution,
} from "@openfront/engine/execution/TradeAgreementExecution";
import {
  escortedTransportCost,
  TransportShipExecution,
} from "@openfront/engine/execution/TransportShipExecution";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { WarshipExecution } from "@openfront/engine/execution/WarshipExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { ClientMessage } from "@openfront/shared/WireSchemas";
import {
  createGameWireContext,
  decodeClientMessage,
  encodeClientMessage,
} from "@openfront/shared/ZbinWire";
import { vi } from "vitest";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

// half_land_half_ocean: 16x16, land in columns 0-7, ocean in 8-15.
const coastX = 7;

async function seaGame(infiniteGold = true, derpyRules?: number) {
  const game = await setup(
    "half_land_half_ocean",
    {
      infiniteGold,
      instantBuild: true,
      ...(derpyRules !== undefined ? { derpyRules } : {}),
    },
    [
      new PlayerInfo("North", PlayerType.Human, null, "north"),
      new PlayerInfo("South", PlayerType.Human, null, "south"),
    ],
  );
  const north = game.player("north");
  const south = game.player("south");
  for (let x = 0; x <= coastX; x++) {
    for (let y = 0; y <= 5; y++) north.conquer(game.ref(x, y));
    for (let y = 10; y <= 15; y++) south.conquer(game.ref(x, y));
  }
  executeTicks(game, 50);
  return { game, north, south };
}

function agree(game: Game, a: Player, b: Player) {
  game.addExecution(new TradeAgreementRequestExecution(a, b.id()));
  game.executeNextTick();
  game.addExecution(new TradeAgreementReplyExecution(b, a.id(), true));
  game.executeNextTick();
}

describe("Trade Agreements", () => {
  afterEach(() => vi.restoreAllMocks());

  test("request, accept, and end", async () => {
    const { game, north, south } = await seaGame();
    game.addExecution(new TradeAgreementRequestExecution(north, south.id()));
    game.executeNextTick();
    expect(south.hasPendingTradeAgreementRequestFrom(north)).toBe(true);
    expect(north.hasTradeAgreementWith(south)).toBe(false);

    game.addExecution(
      new TradeAgreementReplyExecution(south, north.id(), true),
    );
    game.executeNextTick();
    expect(north.hasTradeAgreementWith(south)).toBe(true);
    expect(south.hasTradeAgreementWith(north)).toBe(true);
    expect(north.canRequestTradeAgreement(south)).toBe(false);

    game.addExecution(new TradeAgreementCancelExecution(south, north.id()));
    game.executeNextTick();
    expect(north.hasTradeAgreementWith(south)).toBe(false);
    expect(south.hasTradeAgreementWith(north)).toBe(false);
  });

  test("a declined request forms nothing", async () => {
    const { game, north, south } = await seaGame();
    game.addExecution(new TradeAgreementRequestExecution(north, south.id()));
    game.executeNextTick();
    game.addExecution(
      new TradeAgreementReplyExecution(south, north.id(), false),
    );
    game.executeNextTick();
    expect(north.hasTradeAgreementWith(south)).toBe(false);
    expect(south.hasPendingTradeAgreementRequestFrom(north)).toBe(false);
  });

  test("asking back accepts, and an answer without a request does nothing", async () => {
    const { game, north, south } = await seaGame();
    game.addExecution(
      new TradeAgreementReplyExecution(south, north.id(), true),
    );
    game.executeNextTick();
    expect(north.hasTradeAgreementWith(south)).toBe(false);

    game.addExecution(new TradeAgreementRequestExecution(north, south.id()));
    game.executeNextTick();
    game.addExecution(new TradeAgreementRequestExecution(south, north.id()));
    game.executeNextTick();
    expect(north.hasTradeAgreementWith(south)).toBe(true);
  });

  test("the request reaches the recipient as an actionable message", async () => {
    const { game, north, south } = await seaGame();
    const spy = vi.spyOn(game, "displayMessage");
    game.addExecution(new TradeAgreementRequestExecution(north, south.id()));
    game.executeNextTick();
    expect(spy).toHaveBeenCalledWith(
      "events_display.trade_agreement_request",
      MessageType.TRADE_AGREEMENT_REQUEST,
      south.id(),
      undefined,
      { name: north.displayName() },
      undefined,
      north.id(),
    );
  });

  test("a nation answers on the spot: yes when friendly, no when hostile", async () => {
    const game = await setup("plains", { instantBuild: true }, [
      new PlayerInfo("Me", PlayerType.Human, null, "me"),
    ]);
    const me = game.player("me");
    const calm = game.addPlayer(
      new PlayerInfo("Calm", PlayerType.Nation, null, "calm"),
    );
    const angry = game.addPlayer(
      new PlayerInfo("Angry", PlayerType.Nation, null, "angry"),
    );
    me.conquer(game.ref(5, 5));
    calm.conquer(game.ref(50, 50));
    angry.conquer(game.ref(90, 90));
    angry.updateRelation(me, -1000, "attacked");
    expect(angry.relation(me)).toBeLessThan(Relation.Neutral);

    game.addExecution(
      new TradeAgreementRequestExecution(me, calm.id()),
      new TradeAgreementRequestExecution(me, angry.id()),
    );
    game.executeNextTick();
    expect(me.hasTradeAgreementWith(calm)).toBe(true);
    expect(me.hasTradeAgreementWith(angry)).toBe(false);
  });

  test("warships leave a partner's trade ships alone", async () => {
    for (const withAgreement of [false, true]) {
      const { game, north, south } = await seaGame();
      if (withAgreement) agree(game, north, south);
      const portTile = game.ref(coastX, 3);
      north.buildUnit(UnitType.Port, portTile, {});
      game.addExecution(
        new WarshipExecution(
          north.buildUnit(UnitType.Warship, portTile, { patrolTile: portTile }),
        ),
      );
      const tradeShip = south.buildUnit(
        UnitType.TradeShip,
        game.ref(coastX + 1, 4),
        {
          targetUnit: south.buildUnit(UnitType.Port, game.ref(coastX, 12), {}),
        },
      );
      executeTicks(game, 10);
      expect(tradeShip.owner()).toBe(withAgreement ? south : north);
    }
  });

  test("warships don't shoot a partner's transports or warships", async () => {
    for (const withAgreement of [false, true]) {
      const { game, north, south } = await seaGame();
      if (withAgreement) agree(game, north, south);
      const tile = game.ref(coastX + 2, 4);
      game.addExecution(
        new WarshipExecution(
          north.buildUnit(UnitType.Warship, tile, { patrolTile: tile }),
        ),
      );
      const transport = south.buildUnit(
        UnitType.TransportShip,
        game.ref(coastX + 3, 5),
        { troops: 100 },
      );
      const enemyWarship = south.buildUnit(
        UnitType.Warship,
        game.ref(coastX + 4, 6),
        { patrolTile: game.ref(coastX + 4, 6) },
      );
      executeTicks(game, 60);
      expect(transport.isActive()).toBe(withAgreement);
      if (withAgreement) {
        expect(enemyWarship.health()).toBe(enemyWarship.maxHealth());
      }
    }
  });
});

describe("Stacked defense posts", () => {
  test("a defense post upgrades to level 2 and no further", async () => {
    const { game, north } = await seaGame();
    const post = north.buildUnit(UnitType.DefensePost, game.ref(3, 3), {});
    expect(north.canUpgradeUnit(post)).toBe(true);
    game.addExecution(new UpgradeStructureExecution(north, post.id()));
    game.executeNextTick();
    expect(post.level()).toBe(2);
    expect(north.canUpgradeUnit(post)).toBe(false);
    game.addExecution(new UpgradeStructureExecution(north, post.id()));
    game.executeNextTick();
    expect(post.level()).toBe(2);
  });

  test("a stacked post is 50% stronger, and a Capital still beats it", () => {
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
      defenderHasDefensePost: true,
      falloutRatio: null,
      borderSize: 50,
    };
    const single = config.attackLogic(base);
    const stacked = config.attackLogic({
      ...base,
      defenderHasStackedDefensePost: true,
    });
    const capital = config.attackLogic({
      ...base,
      defenderHasStackedDefensePost: true,
      defenderHasCapital: true,
    });
    expect(stacked.attackerTroopLoss).toBeCloseTo(
      1.5 * single.attackerTroopLoss,
    );
    expect(stacked.tickFraction).toBeCloseTo(1.5 * single.tickFraction);
    expect(capital.attackerTroopLoss).toBeGreaterThan(
      stacked.attackerTroopLoss,
    );
  });

  test("attacks near a stacked post get the stacked bonus", async () => {
    const game = await setup("plains", { instantBuild: true });
    const meInfo = new PlayerInfo("Me", PlayerType.Human, null, "Me");
    const enemyInfo = new PlayerInfo("Enemy", PlayerType.Human, null, "Enemy");
    game.addPlayer(meInfo);
    game.addPlayer(enemyInfo);
    game.addExecution(
      new SpawnExecution("g", game.player(meInfo.id).info(), game.ref(5, 5)),
      new SpawnExecution(
        "g",
        game.player(enemyInfo.id).info(),
        game.ref(5, 40),
      ),
    );
    executeTicks(game, 10);
    const me = game.player(meInfo.id);
    const enemy = game.player(enemyInfo.id);
    me.addGold(5_000_000n);
    const tile = Array.from(me.tiles())[0];
    game.addExecution(
      new ConstructionExecution(me, UnitType.DefensePost, tile),
    );
    executeTicks(game, 3);
    const [post] = me.units(UnitType.DefensePost);
    game.addExecution(new UpgradeStructureExecution(me, post.id()));
    executeTicks(game, 2);
    expect(post.level()).toBe(2);

    const edge = Array.from(me.tiles()).find((t) =>
      game.neighbors(t).some((n) => game.isLand(n) && !game.hasOwner(n)),
    )!;
    enemy.conquer(
      game.neighbors(edge).find((n) => game.isLand(n) && !game.hasOwner(n))!,
    );
    const spy = vi.spyOn(game.config(), "attackLogic");
    game.addExecution(new AttackExecution(20_000, enemy, me.id()));
    executeTicks(game, 20);
    const onMe = spy.mock.calls
      .map(([input]) => input)
      .filter((input) => input.defender !== null);
    expect(onMe.length).toBeGreaterThan(0);
    expect(onMe.every((input) => input.defenderHasStackedDefensePost)).toBe(
      true,
    );
  });
});

describe("Escorted troop transport", () => {
  const dst = (game: Game) => game.ref(3, 12);

  test("is one ship with 3x a warship's health, priced like two warships", async () => {
    const { game, north } = await seaGame(false);
    north.addGold(10_000_000n);
    const before = north.gold();
    const cost = escortedTransportCost(game, north);
    game.addExecution(new TransportShipExecution(north, dst(game), 100, true));
    game.executeNextTick();

    const [boat] = north.units(UnitType.TransportShip);
    expect(boat).toBeDefined();
    expect(boat.hasHealth()).toBe(true);
    expect(boat.health()).toBe(3 * 1000);
    expect(boat.troops()).toBe(100);
    expect(north.units(UnitType.Warship)).toHaveLength(0);
    expect(before - north.gold()).toBe(cost);
  });

  test("refuses when it can't be paid for", async () => {
    const { game, north } = await seaGame(false);
    game.addExecution(new TransportShipExecution(north, dst(game), 100, true));
    game.executeNextTick();
    expect(north.units(UnitType.TransportShip)).toHaveLength(0);
  });

  test("fires back at enemy ships in range", async () => {
    const { game, north, south } = await seaGame();
    game.addExecution(new TransportShipExecution(north, dst(game), 100, true));
    game.executeNextTick();
    const enemy = south.buildUnit(UnitType.Warship, game.ref(coastX + 3, 8), {
      patrolTile: game.ref(coastX + 3, 8),
    });
    executeTicks(game, 30);
    expect(enemy.health()).toBeLessThan(enemy.maxHealth());
  });

  test("an enemy warship reloads between shots at it", async () => {
    const { game, north, south } = await seaGame();
    game.addExecution(new TransportShipExecution(north, dst(game), 100, true));
    game.executeNextTick();
    const shooter = south.buildUnit(UnitType.Warship, game.ref(coastX + 4, 9), {
      patrolTile: game.ref(coastX + 4, 9),
    });
    game.addExecution(new WarshipExecution(shooter));
    const spy = vi.spyOn(game, "addExecution");
    const ticks = 30;
    executeTicks(game, ticks);
    const shellsFromShooter = spy.mock.calls.filter(
      ([e]) =>
        e.constructor.name === "ShellExecution" &&
        (e as unknown as { ownerUnit: unknown }).ownerUnit === shooter,
    ).length;
    const reload = game.config().warshipShellAttackRate();
    expect(shellsFromShooter).toBeGreaterThan(0);
    expect(shellsFromShooter).toBeLessThanOrEqual(
      Math.ceil(ticks / reload) + 1,
    );
  });

  test("sinks when its health runs out", async () => {
    const { game, north } = await seaGame();
    game.addExecution(new TransportShipExecution(north, dst(game), 100, true));
    game.executeNextTick();
    const [boat] = north.units(UnitType.TransportShip);
    boat.modifyHealth(-boat.health());
    game.executeNextTick();
    expect(boat.isActive()).toBe(false);
  });

  test("lands its troops like a normal transport", async () => {
    const { game, north, south } = await seaGame();
    const southTilesBefore = south.numTilesOwned();
    game.addExecution(new TransportShipExecution(north, dst(game), 100, true));
    game.executeNextTick();
    const [boat] = north.units(UnitType.TransportShip);
    for (let i = 0; i < 200 && boat.isActive(); i++) game.executeNextTick();
    expect(boat.isActive()).toBe(false);
    executeTicks(game, 5);
    expect(south.numTilesOwned()).toBeLessThan(southTilesBefore);
  });

  /** Launches a transport from North and sails it until its trip ends. */
  function sail(game: Game, north: Player, escorted: boolean) {
    game.addExecution(
      new TransportShipExecution(north, dst(game), 100, escorted),
    );
    game.executeNextTick();
    const [boat] = north.units(UnitType.TransportShip);
    expect(boat).toBeDefined();
    return boat;
  }

  function sailUntilDone(game: Game, boat: ReturnType<typeof sail>) {
    for (let i = 0; i < 200 && boat.isActive(); i++) game.executeNextTick();
    expect(boat.isActive()).toBe(false);
  }

  test("lands as two warships on the water by the landing spot, already paid for", async () => {
    const { game, north } = await seaGame(false);
    north.addGold(10_000_000n);
    const boat = sail(game, north, true);
    // Walk up to the tick the boat lands so that tick's gold can be checked:
    // only income can change it, so a charge for the warships would show.
    for (let i = 0; i < 200 && boat.isActive(); i++) {
      const before = north.gold();
      game.executeNextTick();
      if (!boat.isActive()) expect(north.gold()).toBeGreaterThanOrEqual(before);
    }
    expect(boat.isActive()).toBe(false);

    const warships = north.units(UnitType.Warship);
    expect(warships).toHaveLength(2);
    for (const warship of warships) {
      expect(game.isWater(warship.tile())).toBe(true);
      expect(
        game.map().manhattanDist(warship.tile(), boat.tile()),
      ).toBeLessThanOrEqual(4);
      expect(warship.health()).toBe(warship.maxHealth());
    }

    // They go on as ordinary warships, patrolling the waters there.
    executeTicks(game, 20);
    expect(north.units(UnitType.Warship)).toHaveLength(2);
    for (const warship of north.units(UnitType.Warship)) {
      expect(game.isWater(warship.tile())).toBe(true);
    }
  });

  test("its warships carry the convoy's damage", async () => {
    const { game, north } = await seaGame();
    const boat = sail(game, north, true);
    boat.modifyHealth(-boat.maxHealth() / 2);
    sailUntilDone(game, boat);
    const warships = north.units(UnitType.Warship);
    expect(warships).toHaveLength(2);
    for (const warship of warships) {
      expect(warship.health()).toBe(warship.maxHealth() / 2);
    }
  });

  test("a nearly sunk convoy still leaves warships with some health", async () => {
    const { game, north } = await seaGame();
    const boat = sail(game, north, true);
    boat.modifyHealth(1 - boat.health());
    sailUntilDone(game, boat);
    const warships = north.units(UnitType.Warship);
    expect(warships).toHaveLength(2);
    for (const warship of warships) expect(warship.health()).toBe(1);
  });

  test("retreating home also leaves its warships", async () => {
    const { game, north } = await seaGame();
    const boat = sail(game, north, true);
    executeTicks(game, 2);
    game.addExecution(new BoatRetreatExecution(north, boat.id()));
    sailUntilDone(game, boat);
    expect(game.owner(boat.tile())).toBe(north);
    const warships = north.units(UnitType.Warship);
    expect(warships).toHaveLength(2);
    for (const warship of warships) {
      expect(game.isWater(warship.tile())).toBe(true);
    }
  });

  test("a sunk convoy leaves no warships", async () => {
    const { game, north } = await seaGame();
    const boat = sail(game, north, true);
    boat.modifyHealth(-boat.health());
    executeTicks(game, 5);
    expect(boat.isActive()).toBe(false);
    expect(north.units(UnitType.Warship)).toHaveLength(0);
  });

  test("a game saved under the first rules replays without them", async () => {
    // Replays of games played before escorts sailed on must keep the old
    // ending, or they drift from what happened.
    const { game, north } = await seaGame(true, 1);
    expect(game.config().escortSailsOn()).toBe(false);
    const boat = sail(game, north, true);
    sailUntilDone(game, boat);
    expect(north.units(UnitType.Warship)).toHaveLength(0);
  });

  test("a game with no rules edition plays the current rules", async () => {
    const { game } = await seaGame();
    expect(game.config().derpyRules()).toBe(DERPY_RULES);
    expect(game.config().escortSailsOn()).toBe(true);
  });

  test("a plain transport still lands without warships", async () => {
    const { game, north } = await seaGame();
    const boat = sail(game, north, false);
    sailUntilDone(game, boat);
    expect(north.units(UnitType.Warship)).toHaveLength(0);
  });
});

describe("New intents on the wire", () => {
  const roster = [{ clientID: "aB3dEf7h" }, { clientID: "Xk9mNp2q" }];
  const other = roster[1].clientID;
  test.each([
    { type: "tradeAgreementRequest", recipient: other },
    { type: "tradeAgreementReply", requestor: other, accept: true },
    { type: "tradeAgreementCancel", recipient: other },
    { type: "escorted_boat", troops: 1234.5, dst: 4242 },
  ] as const)("$type survives the trip to the server", (intent) => {
    const msg = { type: "intent", intent } as ClientMessage;
    const bytes = encodeClientMessage(msg, createGameWireContext(roster));
    expect(decodeClientMessage(bytes, createGameWireContext(roster))).toEqual(
      msg,
    );
  });
});
