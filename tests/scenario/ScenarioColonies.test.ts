import {
  Difficulty,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  SCENARIO_EDITION,
  scenarioEdition,
  scenarioReplayable,
} from "@openfront/engine-api/game/Scenarios";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { applyScenarioRules } from "@openfront/engine-lib/scenario/ScenarioConfig";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { TransportShipExecution } from "@openfront/engine/execution/TransportShipExecution";
import { Execution, Game, Player } from "@openfront/engine/game/Game";
import { PlayerImpl } from "@openfront/engine/game/PlayerImpl";
import {
  COLONIES_1776_LOYALISTS_FROM,
  COLONIES_1776_PLACES,
  COLONIES_1776_WAVES,
  SCENARIO_RULES,
  scenarioWinner,
} from "@openfront/engine/scenario/ScenarioRules";
import { waveMark } from "@openfront/engine/scenario/ScenarioWaves";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN (r25, balance follow-up): a scenario's rule hooks that run as the game
 * goes, and Thirteen Colonies 1776's balance ideas.
 */

interface News {
  message: string;
  params?: Record<string, string | number>;
}

/**
 * The game as its rule sees it at tick `ticks`, with the news it sends kept
 * in `news` (the players, the map and the marks are the game's own).
 */
function at(game: Game, ticks: number, news: News[]): Game {
  const view = Object.create(game) as Game;
  view.ticks = () => ticks;
  view.displayMessage = (message: string, _t, _p, _g, params) => {
    news.push({ message, params });
  };
  return view;
}

/** Hands every tile of `from` near full-size pixel `xy` (within r) to `to`. */
function takeNear(
  game: Game,
  from: Player,
  to: Player,
  [x0, y0]: readonly [number, number],
  r: number,
): void {
  for (let y = y0 - r; y <= y0 + r; y++) {
    for (let x = x0 - r; x <= x0 + r; x++) {
      if (!game.isValidCoord(x, y)) continue;
      const t = game.ref(x, y);
      if (game.owner(t) === from) to.conquer(t);
    }
  }
}

/** Runs `body` with scenario `id`'s data naming rule `rule`, then restores it. */
async function withRule<T>(
  id: string,
  rule: string,
  body: () => Promise<T>,
): Promise<T> {
  const data = scenarioData(id)!;
  const before = data.rule;
  data.rule = rule;
  try {
    return await body();
  } finally {
    data.rule = before;
  }
}

describe("a scenario rule's tick", () => {
  it("runs every second, with the side win check", async () => {
    const seen: number[] = [];
    SCENARIO_RULES.tick_probe = {
      tick: (game: Game) => {
        seen.push(game.ticks());
      },
    };
    try {
      await withRule("colonies1776", "tick_probe", async () => {
        const g = await scenarioGame("colonies1776");
        g.step(100);
      });
    } finally {
      delete SCENARIO_RULES.tick_probe;
    }
    expect(seen.length).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i] - seen[i - 1]).toBe(10);
    }
  }, 120_000);
});

/** `p` loses its capital and the spot it started on to `to`. */
function takeCapital(game: Game, p: Player, to: Player): void {
  const spots = [
    p.spawnTile()!,
    ...p.units(UnitType.Capital).map((u) => u.tile()),
  ];
  for (const spot of spots) {
    const cx = game.x(spot);
    const cy = game.y(spot);
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        if (!game.isValidCoord(x, y)) continue;
        const t = game.ref(x, y);
        if (game.owner(t) === p) to.conquer(t);
      }
    }
  }
  for (const u of p.units(UnitType.Capital)) u.delete(false);
}

describe("Thirteen Colonies 1776: Britain's army comes in waves (SCEN3 r27)", () => {
  const rule = SCENARIO_RULES.colonies1776;
  const wave = (id: string) => COLONIES_1776_WAVES.find((w) => w.id === id)!;

  it("Howe's army lands on Staten Island at its minute, once, raising Britain's cap", async () => {
    const g = await scenarioGame("colonies1776", {
      config: { difficulty: Difficulty.Hard },
    });
    const { game } = g;
    const britain = g.nation("great_britain");
    const howe = wave("howe");
    const news: News[] = [];
    britain.setTroops(0);
    const cap = game.config().maxTroops(britain);
    rule.tick!(at(game, howe.minute * 600 - 10, news));
    expect(news).toHaveLength(0);
    rule.tick!(at(game, howe.minute * 600, news));
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_wave_british",
    ]);
    expect(news[0].params?.place).toBe("scenario_place.staten_island");
    // 1.2M troops as the data counts them: 12M in the engine.
    expect(britain.troops()).toBe(howe.troops * 10);
    expect(game.config().maxTroops(britain)).toBe(cap + howe.cap! * 10);
    expect(rule.troopCapBonus!(game, britain)).toBe(howe.cap);
    expect(rule.troopCapBonus!(game, g.nation("georgia"))).toBe(0);
    rule.tick!(at(game, howe.minute * 600 + 10, news));
    expect(news).toHaveLength(1);
  }, 120_000);

  it("sails for Boston, held by the Patriots, and lands on it", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    const boston = wave("boston");
    for (const w of COLONIES_1776_WAVES) {
      if (w.minute < boston.minute) game.setScenarioMark(waveMark(w.id), 0);
    }
    const added: Execution[] = [];
    const news: News[] = [];
    const view = at(game, boston.minute * 600, news);
    view.addExecution = (...e: Execution[]) => {
      added.push(...e);
    };
    rule.tick!(view);
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_wave_british_assault",
    ]);
    expect(news[0].params?.place).toBe("scenario_place.boston");
    const boats = added.filter((e) => e instanceof TransportShipExecution);
    expect(boats).toHaveLength(1);
    // The boat really sails, with the wave's troops.
    const before = britain.troops();
    game.addExecution(...boats);
    g.step(3);
    const ships = britain.units(UnitType.TransportShip);
    expect(ships.length).toBeGreaterThan(0);
    expect(britain.troops()).toBeLessThan(before);
  }, 120_000);

  it("lands at Boston outright if Britain already holds it", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    const mass = g.nation("massachusetts");
    takeNear(game, mass, britain, COLONIES_1776_PLACES.boston, 10);
    const boston = wave("boston");
    for (const w of COLONIES_1776_WAVES) {
      if (w.minute < boston.minute) game.setScenarioMark(waveMark(w.id), 0);
    }
    const news: News[] = [];
    rule.tick!(at(game, boston.minute * 600, news));
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_wave_british",
    ]);
    expect(news[0].params?.place).toBe("scenario_place.boston");
  }, 120_000);

  it("starts Britain with only its garrisons: its army is the waves'", () => {
    const data = scenarioData("colonies1776")!;
    expect(data.rule).toBe("colonies1776");
    const britain = data.nations.find((n) => n.key === "great_britain")!;
    const waves = COLONIES_1776_WAVES.filter((w) => w.side === "British");
    const fromWaves = waves.reduce((s, w) => s + (w.cap ?? 0), 0);
    // Round 25: a 6M cap from the start. Now most of it comes by sea.
    expect(britain.troopCapBonus ?? 0).toBeLessThan(fromWaves);
    const at = new Set(waves.flatMap((w) => w.at ?? []));
    for (const port of ["new_york", "boston", "charleston"]) {
      expect(at.has(port), port).toBe(true);
    }
  });
});

describe("Thirteen Colonies 1776: France enters the war (SCEN3 r27)", () => {
  const rule = SCENARIO_RULES.colonies1776;
  const france = COLONIES_1776_WAVES.find((w) => w.id === "france")!;

  it("lands French troops and a fleet at Yorktown for Virginia at its minute", async () => {
    const g = await scenarioGame("colonies1776", {
      config: { difficulty: Difficulty.Hard },
    });
    const { game } = g;
    const virginia = g.nation("virginia");
    for (const w of COLONIES_1776_WAVES) {
      if (w.id !== "france") game.setScenarioMark(waveMark(w.id), 0);
    }
    const news: News[] = [];
    rule.tick!(at(game, france.minute * 600 - 10, news));
    expect(news).toHaveLength(0);
    virginia.setTroops(0);
    const cap = game.config().maxTroops(virginia);
    const ships = virginia.units(UnitType.Warship).length;
    rule.tick!(at(game, france.minute * 600, news));
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_wave_france",
    ]);
    expect(news[0].params?.place).toBe("scenario_place.yorktown");
    expect(france.side).toBe("Patriots");
    expect(virginia.troops()).toBe(france.troops * 10);
    expect(game.config().maxTroops(virginia)).toBe(cap + france.cap! * 10);
    expect(virginia.units(UnitType.Warship).length).toBe(
      ships + (france.ships ?? 0),
    );
    expect(france.ships).toBeGreaterThan(0);
  }, 120_000);

  it("lands at Newport if Yorktown has fallen", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    takeNear(
      game,
      g.nation("virginia"),
      britain,
      COLONIES_1776_PLACES.yorktown,
      12,
    );
    for (const w of COLONIES_1776_WAVES) {
      if (w.id !== "france") game.setScenarioMark(waveMark(w.id), 0);
    }
    const ri = g.nation("rhode_island");
    const before = ri.troops();
    const news: News[] = [];
    rule.tick!(at(game, france.minute * 600, news));
    expect(news[0].params?.place).toBe("scenario_place.newport");
    expect(ri.troops()).toBeGreaterThan(before);
  }, 120_000);
});

describe("Thirteen Colonies 1776: Loyalist colonies (idea C)", () => {
  // SCEN3 (r27): on in the scenario's own rule (edition 5).
  it("turn in the scenario's own rule: New York declares for the King when its capital falls", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    expect(scenarioData("colonies1776")!.rule).toBe("colonies1776");
    const rule = SCENARIO_RULES.colonies1776;
    const britain = g.nation("great_britain");
    const newYork = g.nation("new_york");
    const news: News[] = [];
    rule.tick!(at(game, 60, news));
    expect(newYork.team()).toBe("Patriots");
    expect(news).toEqual([]);
    takeCapital(game, newYork, britain);
    rule.tick!(at(game, 70, news));
    expect(newYork.team()).toBe("British");
    expect(news).toEqual([
      {
        message: "events_display.scenario_loyalists",
        params: { name: newYork.displayName(), side: "British" },
      },
    ]);
  }, 120_000);

  it("count for Britain under the win rule once they have turned", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    const georgia = g.nation("georgia");
    // Every other Patriot colony beaten: Georgia alone still holds the
    // Patriots' war, while it is a Patriot colony.
    for (const p of game.players()) {
      if (p === georgia || p.team() !== "Patriots") continue;
      for (const t of [...p.tiles()]) britain.conquer(t);
    }
    expect(georgia.numTilesOwned()).toBeGreaterThan(
      Math.ceil(game.numLandTiles() / 500),
    );
    expect(scenarioWinner(at(game, 600, []), false)).toBeNull();
    // Its capital falls and it declares for the King: its land is Britain's
    // side now, and Britain has won.
    takeCapital(game, georgia, britain);
    SCENARIO_RULES.colonies1776.tick!(at(game, 610, []));
    expect(georgia.team()).toBe("British");
    expect(georgia.numTilesOwned()).toBeGreaterThan(0);
    expect(scenarioWinner(at(game, 620, []), false)).toBe("British");
  }, 120_000);

  it("a Loyalist colony whose capital falls to Britain joins Britain for good", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    const georgia = g.nation("georgia");
    const rule = SCENARIO_RULES.colonies1776_loyalists;
    const news: News[] = [];
    // Its capital standing, nothing happens.
    rule.tick!(at(game, 600, news));
    expect(georgia.team()).toBe("Patriots");
    takeCapital(game, georgia, britain);
    rule.tick!(at(game, 610, news));
    expect(georgia.team()).toBe("British");
    expect(georgia.isFriendly(britain)).toBe(true);
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_loyalists",
    ]);
    // For good: the Patriots taking the spot back changes nothing.
    g.nation("south_carolina").conquer(georgia.spawnTile()!);
    rule.tick!(at(game, 620, news));
    expect(georgia.team()).toBe("British");
    expect(news.length).toBe(1);
  }, 120_000);

  it("leave the other colonies, and a player's colony, on their side", async () => {
    const g = await scenarioGame("colonies1776", {
      players: [{ clientID: "PLAYERAA", username: "Alden", nation: "georgia" }],
    });
    const { game } = g;
    const britain = g.nation("great_britain");
    const georgia = g.nation("georgia");
    const massachusetts = g.nation("massachusetts");
    expect(georgia.type()).toBe(PlayerType.Human);
    takeCapital(game, georgia, britain);
    takeCapital(game, massachusetts, britain);
    const news: News[] = [];
    SCENARIO_RULES.colonies1776_loyalists.tick!(at(game, 600, news));
    expect(georgia.team()).toBe("Patriots");
    expect(massachusetts.team()).toBe("Patriots");
    // The scenario's own rule too (SCEN3 r27, edition 5).
    SCENARIO_RULES.colonies1776.tick!(at(game, 610, news));
    expect(georgia.team()).toBe("Patriots");
    expect(massachusetts.team()).toBe("Patriots");
    expect(news).toEqual([]);
  }, 120_000);

  it("rise only from their minute, if one is set", async () => {
    const g = await scenarioGame("colonies1776");
    const georgia = g.nation("georgia");
    takeCapital(g.game, georgia, g.nation("great_britain"));
    COLONIES_1776_LOYALISTS_FROM.minute = 15;
    try {
      const rule = SCENARIO_RULES.colonies1776_loyalists;
      rule.tick!(at(g.game, 15 * 600 - 10, []));
      expect(georgia.team()).toBe("Patriots");
      rule.tick!(at(g.game, 15 * 600, []));
      expect(georgia.team()).toBe("British");
    } finally {
      COLONIES_1776_LOYALISTS_FROM.minute = 0;
    }
  }, 120_000);
});

describe("a nation's gold income (goldIncome; idea F, the blockade)", () => {
  it("multiplies a scenario nation's trade, train and steady income, and nobody else's", async () => {
    const g = await scenarioGame("colonies1776");
    const config = g.game.config();
    const virginia = g.nation("virginia");
    const britain = g.nation("great_britain");
    const n = scenarioData("colonies1776")!.nations.find(
      (x) => x.key === "virginia",
    )!;
    const before = n.goldIncome;
    try {
      n.goldIncome = undefined;
      const ship = config.tradeShipGold(200, virginia);
      const train = config.trainGold("ally", 0, virginia);
      const steady = config.goldAdditionRate(virginia);
      const britainShip = config.tradeShipGold(200, britain);
      n.goldIncome = 0.5;
      expect(virginia.scenarioGoldIncome!()).toBe(0.5);
      expect(Number(config.tradeShipGold(200, virginia))).toBeCloseTo(
        Number(ship) / 2,
        -1,
      );
      expect(Number(config.trainGold("ally", 0, virginia))).toBeCloseTo(
        Number(train) / 2,
        -1,
      );
      expect(config.goldAdditionRate(virginia)).toBe(steady / 2n);
      expect(config.tradeShipGold(200, britain)).toBe(britainShip);
    } finally {
      n.goldIncome = before;
    }
  }, 120_000);

  it("is 1 for a player in an ordinary game", () => {
    const ordinary = { mg: { scenario: () => null } };
    expect(PlayerImpl.prototype.scenarioGoldIncome.call(ordinary)).toBe(1);
  });
});

describe("Thirteen Colonies 1776 as the owner picked it (idea E3)", () => {
  it("has the blockade on every colony", () => {
    const data = scenarioData("colonies1776")!;
    for (const n of data.nations) {
      expect(n.goldIncome, n.key).toBe(n.side === "Patriots" ? 0.6 : undefined);
    }
    expect(data.nations.filter((n) => n.goldIncome === 0.6).length).toBe(13);
  });

  it("leaves every other scenario as it was (but 1939's Soviet industry, SCEN3 r27)", () => {
    for (const id of ["continental1776", "europe1939"]) {
      const data = scenarioData(id)!;
      for (const n of data.nations) {
        if (id === "europe1939" && n.key === "soviet_union") {
          expect(n.goldIncome).toBe(2);
          continue;
        }
        expect(n.goldIncome, `${id} ${n.key}`).toBeUndefined();
      }
    }
  });

  it("plays a colony's income at 60%, Britain's as usual", async () => {
    const g = await scenarioGame("colonies1776");
    const config = g.game.config();
    expect(config.goldAdditionRate(g.nation("virginia"))).toBe(60n);
    expect(config.goldAdditionRate(g.nation("great_britain"))).toBe(100n);
  }, 120_000);

  it("refuses its old games' replays (SCEN3 r27: every scenario's)", () => {
    // 5 (SCEN3 r27): the Loyalist colonies.
    expect(scenarioEdition("colonies1776")).toBe(5);
    expect(SCENARIO_EDITION).toBe(3);
    // Europe 1939 and Continental Army 1776 have their own editions since
    // their tuning went on (SCEN3 r27).
    expect(scenarioEdition("europe1939")).toBe(4);
    expect(scenarioEdition("continental1776")).toBe(4);
    expect(scenarioEdition("napoleon1812")).toBe(SCENARIO_EDITION);
    // Edition 4's games had no Loyalist colonies.
    for (const old of [2, 3, 4]) {
      expect(
        scenarioReplayable({ scenario: { id: "colonies1776", edition: old } }),
      ).toBe(false);
    }
    expect(
      scenarioReplayable({ scenario: { id: "colonies1776", edition: 5 } }),
    ).toBe(true);
    // Round 25's games of the other scenarios (edition 2) are refused too:
    // the win rule changed for every scenario.
    expect(
      scenarioReplayable({ scenario: { id: "napoleon1812", edition: 2 } }),
    ).toBe(false);
    expect(
      scenarioReplayable({ scenario: { id: "napoleon1812", edition: 3 } }),
    ).toBe(true);
    // Europe 1939's edition-3 games had no cap on Germany's cities.
    expect(
      scenarioReplayable({ scenario: { id: "europe1939", edition: 3 } }),
    ).toBe(false);
    expect(
      scenarioReplayable({ scenario: { id: "europe1939", edition: 4 } }),
    ).toBe(true);
    const config: Partial<GameConfig> = applyScenarioRules({
      scenario: { id: "colonies1776" },
    });
    expect(config.scenario!.edition).toBe(5);
  });
});
