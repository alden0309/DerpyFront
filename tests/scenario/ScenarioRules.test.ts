import { PlayerType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { GameConfigSchema } from "@openfront/engine-api/Schemas";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { resolveScenarioSeats } from "@openfront/engine-lib/scenario/ScenarioSeats";
import { BreakAllianceExecution } from "@openfront/engine/execution/alliance/BreakAllianceExecution";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { scenarioAttackFactor } from "@openfront/engine/scenario/ScenarioFronts";
import {
  enemySideFor,
  EUROPE_1939_HOLD_TICKS,
  EUROPE_1939_PURGE_FACTOR,
  EUROPE_1939_PURGE_TICKS,
  holdTargetTiles,
  SCENARIO_RULES,
  scenarioHoldsFire,
} from "@openfront/engine/scenario/ScenarioRules";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

// SCEN (r25): locked sides, the neutral rule, side wins and seats.

function tilesOf(game: Game, p: Player): number {
  return p.numTilesOwned();
}

describe("Scenario sides", () => {
  it("puts every nation on its side, locked: no alliances, no attacks on side-mates", async () => {
    const g = await scenarioGame("europe1939");
    const { game } = g;
    const germany = g.nation("germany");
    const italy = g.nation("italy");
    const france = g.nation("france");
    const spain = g.nation("spain");
    expect(germany.team()).toBe("Axis");
    expect(italy.team()).toBe("Axis");
    expect(france.team()).toBe("Allies");
    expect(spain.team()).toBeNull();
    expect(germany.isFriendly(italy)).toBe(true);
    expect(germany.isFriendly(france)).toBe(false);
    // No alliances to make or break, and nothing that expires.
    expect(game.config().disableAlliances()).toBe(true);
    expect(germany.canSendAllianceRequest(france)).toBe(false);
    expect(germany.canSendAllianceRequest(spain)).toBe(false);
    expect(germany.alliances()).toHaveLength(0);
    game.addExecution(new BreakAllianceExecution(germany, italy.id()));
    // An attack on a side-mate goes nowhere.
    const italyTiles = tilesOf(game, italy);
    game.addExecution(new AttackExecution(100_000, germany, italy.id()));
    g.step(300);
    expect(germany.isFriendly(italy)).toBe(true);
    expect(germany.team()).toBe("Axis");
    expect(germany.outgoingAttacks().some((a) => a.target() === italy)).toBe(
      false,
    );
    // (Italy's land changes only by its own fights, never from Germany.)
    expect(tilesOf(game, italy)).toBeGreaterThan(0);
    expect(italyTiles).toBeGreaterThan(0);
  }, 120_000);

  it("a neutral invaded by one side joins the other, locked, with a news line", async () => {
    const g = await scenarioGame("europe1939");
    const { game } = g;
    const germany = g.nation("germany");
    const switzerland = g.nation("switzerland");
    const france = g.nation("france");
    expect(switzerland.team()).toBeNull();
    g.updates.length = 0;
    game.addExecution(
      new AttackExecution(germany.troops() / 2, germany, switzerland.id()),
    );
    g.step(3);
    expect(switzerland.team()).toBe("Allies");
    expect(switzerland.isFriendly(france)).toBe(true);
    const news = g.updates
      .flatMap((u) => u.updates[GameUpdateType.DisplayEvent])
      .filter((e) => e.message === "events_display.scenario_joined_side");
    expect(news).toHaveLength(1);
    expect(news[0].playerID).toBeNull(); // everyone hears
    expect(news[0].params?.side).toBe("Allies");
    // It stays: a later attack by the Allies on it does nothing.
    game.addExecution(new AttackExecution(10_000, france, switzerland.id()));
    g.step(20);
    expect(switzerland.team()).toBe("Allies");
    expect(
      france.outgoingAttacks().some((a) => a.target() === switzerland),
    ).toBe(false);
  }, 120_000);

  it("a neutral that attacks a side joins that side's enemies", async () => {
    const g = await scenarioGame("europe1939");
    const spain = g.nation("spain");
    const france = g.nation("france");
    g.game.addExecution(
      new AttackExecution(spain.troops() / 3, spain, france.id()),
    );
    g.step(3);
    expect(spain.team()).toBe("Axis");
  }, 120_000);

  it("with three sides, a neutral joins the side it borders most, else the smallest", () => {
    // A stand-in game: three sides; the neutral's border tiles touch side B
    // twice and side C once.
    const owners = new Map<number, Player>();
    const mk = (team: string | null, tiles: number) =>
      ({
        team: () => team,
        numTilesOwned: () => tiles,
        isPlayer: () => true,
      }) as unknown as Player;
    const b = mk("B", 500);
    const c = mk("C", 100);
    const neutral = {
      ...mk(null, 50),
      borderTiles: () => ({
        forEach: (f: (t: number) => void) => [1, 2, 3].forEach(f),
      }),
    } as unknown as Player;
    owners.set(11, b);
    owners.set(12, b);
    owners.set(13, c);
    const game = {
      scenario: () => ({ sideIds: () => ["A", "B", "C"] }),
      neighbors4: (t: number, out: number[]) => {
        out[0] = 10 + t;
        return 1;
      },
      owner: (t: number) => owners.get(t) ?? neutral,
      players: () => [b, c, neutral],
    } as unknown as Game;
    expect(enemySideFor(game, neutral, "A")).toBe("B");
    // Bordering neither of the others: the smaller one.
    owners.clear();
    expect(enemySideFor(game, neutral, "A")).toBe("C");
    // Two sides: always the other one.
    const two = { ...game, scenario: () => ({ sideIds: () => ["A", "B"] }) };
    expect(enemySideFor(two as unknown as Game, neutral, "A")).toBe("B");
  });
});

describe("a scenario's special rule", () => {
  it("runs its hooks: once at the start, and when a neutral would join", async () => {
    const data = scenarioData("europe1939")!;
    let started = 0;
    SCENARIO_RULES.test_rule = {
      start: () => started++,
      // Switzerland stays out of it, whoever invades.
      sideToJoin: (_g, neutral) =>
        neutral.name() === "Switzerland" ? null : undefined,
    };
    const before = data.rule;
    data.rule = "test_rule";
    try {
      const g = await scenarioGame("europe1939");
      expect(started).toBe(1);
      const germany = g.nation("germany");
      const swiss = g.nation("switzerland");
      const denmark = g.nation("denmark");
      g.game.addExecution(
        new AttackExecution(germany.troops() / 4, germany, swiss.id()),
      );
      g.game.addExecution(
        new AttackExecution(germany.troops() / 4, germany, denmark.id()),
      );
      g.step(3);
      expect(swiss.team()).toBeNull();
      expect(denmark.team()).toBe("Allies");
      g.step(20);
      expect(started).toBe(1);
    } finally {
      data.rule = before;
      delete SCENARIO_RULES.test_rule;
    }
  }, 120_000);
});

describe("Europe 1939's rule: the pact, the Phoney War and the purges", () => {
  it("holds the Soviet Union, France and Britain back three minutes, unless attacked", async () => {
    const g = await scenarioGame("europe1939");
    const at = (ticks: number) => {
      const view = Object.create(g.game) as Game;
      view.ticks = () => ticks;
      return view;
    };
    const ussr = g.nation("soviet_union");
    const france = g.nation("france");
    const germany = g.nation("germany");
    const spain = g.nation("spain");
    expect(EUROPE_1939_HOLD_TICKS.soviet_union).toBe(3 * 600);
    expect(scenarioHoldsFire(at(100), ussr)).toBe(true);
    expect(scenarioHoldsFire(at(100), france)).toBe(true);
    expect(scenarioHoldsFire(at(100), germany)).toBe(false);
    // Neutrals start no war at all.
    expect(scenarioHoldsFire(at(100_000), spain)).toBe(true);
    expect(scenarioHoldsFire(at(3 * 600), france)).toBe(false);
    expect(scenarioHoldsFire(at(3 * 600 - 1), ussr)).toBe(true);
    expect(scenarioHoldsFire(at(3 * 600), ussr)).toBe(false);
    // Attacked, it fights back at once.
    const finland = g.nation("finland");
    g.game.addExecution(
      new AttackExecution(finland.troops() / 2, finland, ussr.id()),
    );
    g.step(2);
    expect(ussr.incomingAttacks().length).toBeGreaterThan(0);
    expect(scenarioHoldsFire(at(100), ussr)).toBe(false);
  }, 120_000);

  it("gives the Soviet Union the biggest army, weak in attack while the purges last", async () => {
    const g = await scenarioGame("europe1939");
    const { game } = g;
    const ussr = g.nation("soviet_union");
    const germany = g.nation("germany");
    const finland = g.nation("finland");
    // The biggest army on the board, with deep reserves (room to grow).
    for (const p of game.players()) {
      if (p !== ussr)
        expect(ussr.troops(), p.name()).toBeGreaterThan(p.troops());
    }
    expect(ussr.troops()).toBeGreaterThan(germany.troops() * 1.1);
    expect(game.config().maxTroops(ussr)).toBeGreaterThan(
      game.config().maxTroops(germany) * 1.5,
    );
    expect(ussr.troops()).toBeLessThan(game.config().maxTroops(ussr) * 0.75);
    // Its attacks cost double for the first minutes; nobody else's do.
    const rule = SCENARIO_RULES.europe1939;
    const at = (ticks: number) => {
      const view = Object.create(game) as Game;
      view.ticks = () => ticks;
      return view;
    };
    expect(rule.attackFactor!(at(100), ussr, finland)).toBe(
      EUROPE_1939_PURGE_FACTOR,
    );
    expect(EUROPE_1939_PURGE_FACTOR).toBeGreaterThan(1);
    expect(
      rule.attackFactor!(at(EUROPE_1939_PURGE_TICKS - 1), ussr, finland),
    ).toBe(EUROPE_1939_PURGE_FACTOR);
    expect(rule.attackFactor!(at(EUROPE_1939_PURGE_TICKS), ussr, finland)).toBe(
      1,
    );
    expect(rule.attackFactor!(at(100), germany, ussr)).toBe(1);
    expect(rule.attackFactor!(at(100), finland, ussr)).toBe(1);
    // ...and it shows in the cost of a tile (ScenarioFronts).
    const karelia = [...finland.tiles()].find((t) =>
      game.neighbors(t).some((n) => game.owner(n) === ussr),
    )!;
    const early = scenarioAttackFactor(at(100), ussr, finland, karelia);
    const late = scenarioAttackFactor(
      at(EUROPE_1939_PURGE_TICKS),
      ussr,
      finland,
      karelia,
    );
    expect(early / late).toBeCloseTo(EUROPE_1939_PURGE_FACTOR, 6);
  }, 120_000);
});

describe("a scenario game, computer against computer", () => {
  // The short version of the balance runs (tests/scenario/ScenarioBalance.ts):
  // the same seed plays the same war, and both sides are still in it after
  // a few minutes.
  it("is deterministic, and nobody is wiped out at once", async () => {
    const play = async () => {
      const g = await scenarioGame("continental1776", { gameID: "BALANCE1" });
      const hashes: number[] = [];
      for (let i = 0; i < 6; i++) {
        g.step(300);
        hashes.push((g.game as unknown as { hash(): number }).hash());
      }
      return { g, hashes };
    };
    const a = await play();
    const b = await play();
    expect(b.hashes).toEqual(a.hashes);
    expect(a.g.nation("great_britain").numTilesOwned()).toBeGreaterThan(0);
    expect(a.g.nation("united_colonies").numTilesOwned()).toBeGreaterThan(0);
  }, 300_000);
});

describe("Scenario victory", () => {
  it("a side wins together when the other side is gone", async () => {
    const g = await scenarioGame("continental1776", {
      players: [
        { clientID: "HUMAN001", username: "Alden", nation: "united_colonies" },
      ],
    });
    const britain = g.nation("great_britain");
    const colonies = g.nation("united_colonies");
    // Hand Britain's land to the colonies, all but a scrap (well under
    // 0.2% of the land): a fort left over doesn't hold the war up.
    const tiles = [...britain.tiles()];
    for (const t of tiles.slice(60)) colonies.conquer(t);
    expect(britain.numTilesOwned()).toBeGreaterThan(0);
    g.updates.length = 0;
    g.step(30);
    const wins = g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
    expect(wins).toHaveLength(1);
    expect(wins[0].winner?.[0]).toBe("team");
    expect(wins[0].winner?.[1]).toBe("Patriots");
    expect(wins[0].winner?.slice(2)).toEqual(["HUMAN001"]);
  }, 120_000);
});

describe("Scenario victory by land", () => {
  it("each side has its own bar: Britain wins at 35% of the land", async () => {
    const g = await scenarioGame("continental1776");
    const britain = g.nation("great_britain");
    const colonies = g.nation("united_colonies");
    const land = g.game.numLandTiles();
    // Give Britain the colonies' land until it holds just over 35%.
    const want = Math.floor((land * 35) / 100) + 1 - britain.numTilesOwned();
    let moved = 0;
    for (const t of [...colonies.tiles()]) {
      if (moved >= want) break;
      britain.conquer(t);
      moved++;
    }
    g.updates.length = 0;
    g.step(20);
    const wins = g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
    expect(wins).toHaveLength(1);
    expect(wins[0].winner?.[1]).toBe("British");
  }, 120_000);

  it("at the timer, the side nearest its bar wins", async () => {
    const g = await scenarioGame("continental1776", {
      config: { maxTimerValue: 1 },
    });
    g.updates.length = 0;
    g.step(620);
    const wins = g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
    expect(wins).toHaveLength(1);
    // The colonies hold some 58% of the land (bar 75); Britain 3% (bar 35).
    expect(wins[0].winner?.[1]).toBe("Patriots");
  }, 120_000);
});

describe("winning by holding another nation's land (winByHolding)", () => {
  // The fixture: in continental1776, the Patriots win by holding Britain's
  // starting land, its small pieces (Detroit, Niagara, Staten Island)
  // ignored, as North Korea wins by holding South Korea, base in Japan or
  // not.
  it("wins as soon as the side holds it all, small pieces ignored", async () => {
    const patriots = scenarioData("continental1776")!.sides.find(
      (s) => s.id === "Patriots",
    )!;
    patriots.winByHolding = { nations: ["great_britain"], ignoreUnder: 2000 };
    try {
      const g = await scenarioGame("continental1776");
      const britain = g.nation("great_britain");
      const colonies = g.nation("united_colonies");
      const all = holdTargetTiles(g.game, ["great_britain"], 0);
      const big = holdTargetTiles(g.game, ["great_britain"], 2000);
      expect(big.length).toBeGreaterThan(1000);
      expect(all.length).toBeGreaterThan(big.length);
      // Britain also takes some colonial land (not its starting land), so
      // it stays well in the war throughout.
      const colonial = [...colonies.tiles()].slice(0, 6000);
      for (const t of colonial) britain.conquer(t);
      // Not yet: Britain holds its land.
      g.updates.length = 0;
      g.step(20);
      expect(
        g.updates
          .flatMap((u) => u.updates[GameUpdateType.Win])
          .map((w) => w.winner),
      ).toEqual([]);
      // All of it but one tile: still not.
      for (let i = 0; i < big.length - 1; i++) colonies.conquer(big[i]);
      g.step(20);
      expect(
        g.updates.flatMap((u) => u.updates[GameUpdateType.Win]),
      ).toHaveLength(0);
      // The last one: the Patriots win, with Britain still on the map.
      colonies.conquer(big[big.length - 1]);
      g.step(20);
      const wins = g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
      expect(wins).toHaveLength(1);
      expect(wins[0].winner?.[1]).toBe("Patriots");
      expect(britain.numTilesOwned()).toBeGreaterThan(0);
    } finally {
      delete patriots.winByHolding;
    }
  }, 120_000);
});

describe("Scenario seats", () => {
  const data = scenarioData("europe1939")!;

  it("keeps valid seats, gives seatless players free nations, one each", () => {
    const seats = resolveScenarioSeats(
      data,
      { france: "PLAYERAA", germany: "PLAYERBB", nowhere: "PLAYERCC" },
      ["PLAYERAA", "PLAYERBB", "PLAYERCC", "PLAYERDD"],
    );
    expect(seats.get("france")).toBe("PLAYERAA");
    expect(seats.get("germany")).toBe("PLAYERBB");
    // The others take the first free nations in the data's order.
    const others = [...seats.entries()].filter(
      ([, c]) => c === "PLAYERCC" || c === "PLAYERDD",
    );
    expect(others.map(([k]) => k)).toEqual(["italy", "hungary"]);
    expect(new Set(seats.values()).size).toBe(seats.size);
    // Seats of players who aren't in the game are dropped.
    expect(resolveScenarioSeats(data, { france: "GONEAWAY" }, []).size).toBe(0);
  });

  it("plays a human as the seat's nation, named and flagged as it", async () => {
    const g = await scenarioGame("europe1939", {
      players: [{ clientID: "HUMAN001", username: "Alden", nation: "france" }],
    });
    const france = g.game.playerByClientID("HUMAN001")!;
    expect(france.type()).toBe(PlayerType.Human);
    expect(france.name()).toBe("France (Alden)");
    expect(france.info().nationFlag).toBe("fr");
    expect(france.team()).toBe("Allies");
    const paris = g.game.owner(g.game.ref(1101, 910));
    expect(paris).toBe(france);
    // Everyone else is computer-run, and France isn't twice in the game.
    const nations = g.game
      .allPlayers()
      .filter((p) => p.type() === PlayerType.Nation);
    expect(nations).toHaveLength(data.nations.length - 1);
    expect(nations.some((p) => p.name() === "France")).toBe(false);
    g.step(2);
    expect(france.units(UnitType.Capital)).toHaveLength(1);
  }, 120_000);

  it("refuses bad picks in the config", () => {
    const base = {
      gameMap: "Europe",
      difficulty: "Medium",
      donateGold: true,
      donateTroops: true,
      gameType: "Private",
      gameMode: "Team",
      gameMapSize: "Normal",
      nations: "default",
      bots: 0,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    };
    const ok = (scenario: unknown) =>
      GameConfigSchema.safeParse({ ...base, scenario }).success;
    expect(ok({ id: "europe1939", seats: { france: "PLAYERAA" } })).toBe(true);
    expect(ok({ id: "atlantis1066" })).toBe(false);
    expect(ok({ id: "europe1939", seats: { narnia: "PLAYERAA" } })).toBe(false);
    expect(
      ok({
        id: "europe1939",
        seats: { france: "PLAYERAA", italy: "PLAYERAA" },
      }),
    ).toBe(false);
    expect(ok({ id: "europe1939", seats: { france: "not an id" } })).toBe(
      false,
    );
  });
});
