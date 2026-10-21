import { PlayerType, UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  SCENARIO_EDITION,
  scenarioEdition,
  scenarioReplayable,
} from "@openfront/engine-api/game/Scenarios";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { applyScenarioRules } from "@openfront/engine-lib/scenario/ScenarioConfig";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game, Player } from "@openfront/engine/game/Game";
import { PlayerImpl } from "@openfront/engine/game/PlayerImpl";
import {
  COLONIES_1776_LOYALISTS_FROM,
  COLONIES_1776_PLACES,
  COLONIES_1776_WAVES,
  SCENARIO_RULES,
  scenarioRule,
} from "@openfront/engine/scenario/ScenarioRules";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN (r25, balance follow-up): a scenario's rule hooks that run as the game
 * goes, and Thirteen Colonies 1776's balance ideas.
 */

/**
 * The game as its rule sees it at tick `ticks`, with the news it sends kept
 * in `news` (the players and the map are the game's own).
 */
function at(game: Game, ticks: number, news: string[]): Game {
  const view = Object.create(game) as Game;
  view.ticks = () => ticks;
  view.displayMessage = (message: string) => {
    news.push(message);
  };
  return view;
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

describe("Thirteen Colonies 1776: reinforcement waves (idea B)", () => {
  it("land at Staten Island at minute 10, once, as troops for Britain", async () => {
    const g = await scenarioGame("colonies1776");
    const britain = g.nation("great_britain");
    const rule = SCENARIO_RULES.colonies1776_waves;
    const news: string[] = [];
    const before = britain.troops();
    rule.tick!(at(g.game, 10 * 600 - 10, news));
    expect(britain.troops()).toBe(before);
    rule.tick!(at(g.game, 10 * 600, news));
    // 1M troops as the data counts them: 10M in the engine.
    expect(britain.troops()).toBe(before + 10_000_000);
    expect(news).toEqual(["events_display.scenario_landing_staten_island"]);
    rule.tick!(at(g.game, 10 * 600 + 10, news));
    expect(britain.troops()).toBe(before + 10_000_000);
    expect(news.length).toBe(1);
  }, 120_000);

  it("land at Quebec when Britain has lost the landing places", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    const newYork = g.nation("new_york");
    // New York takes every British tile near Staten Island and the city.
    for (const key of ["staten_island", "new_york"]) {
      const [cx, cy] = COLONIES_1776_PLACES[key];
      for (let y = cy - 8; y <= cy + 8; y++) {
        for (let x = cx - 8; x <= cx + 8; x++) {
          const t = game.ref(x, y);
          if (game.owner(t) === britain) newYork.conquer(t);
        }
      }
    }
    const news: string[] = [];
    SCENARIO_RULES.colonies1776_waves.tick!(at(game, 20 * 600, news));
    expect(news).toEqual(["events_display.scenario_landing_quebec"]);
  }, 120_000);

  it("is played by no scenario yet: the owner hasn't picked", async () => {
    for (const id of ["colonies1776", "continental1776"]) {
      const g = await scenarioGame(id);
      expect(scenarioRule(g.game), id).toBeNull();
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

describe("Thirteen Colonies 1776: waves that raise Britain's cap (idea B2)", () => {
  it("raise Britain's troop cap from their minute on, and nobody else's", async () => {
    const saved = COLONIES_1776_WAVES.map((w) => ({ ...w }));
    COLONIES_1776_WAVES.forEach((w) => (w.cap = 500_000));
    try {
      const g = await scenarioGame("colonies1776");
      const britain = g.nation("great_britain");
      const georgia = g.nation("georgia");
      const cap = SCENARIO_RULES.colonies1776_waves.troopCapBonus!;
      expect(cap(at(g.game, 10 * 600 - 1, []), britain)).toBe(0);
      expect(cap(at(g.game, 10 * 600, []), britain)).toBe(500_000);
      expect(cap(at(g.game, 40 * 600, []), britain)).toBe(2_000_000);
      expect(cap(at(g.game, 40 * 600, []), georgia)).toBe(0);
    } finally {
      COLONIES_1776_WAVES.splice(0, COLONIES_1776_WAVES.length, ...saved);
    }
  }, 120_000);

  it("count in the engine's troop cap when the data names the rule", async () => {
    const saved = COLONIES_1776_WAVES.map((w) => ({ ...w }));
    COLONIES_1776_WAVES.splice(0, COLONIES_1776_WAVES.length, {
      minute: 0,
      troops: 0,
      cap: 1_000_000,
      at: [],
    });
    try {
      const plain = (await scenarioGame("colonies1776")).nation(
        "great_britain",
      );
      const base = plain.scenarioTroopCap!();
      await withRule("colonies1776", "colonies1776_waves", async () => {
        const g = await scenarioGame("colonies1776");
        const britain = g.nation("great_britain");
        expect(britain.scenarioTroopCap!()).toBe(base + 10_000_000);
        expect(g.nation("georgia").scenarioTroopCap!()).toBe(0);
      });
    } finally {
      COLONIES_1776_WAVES.splice(0, COLONIES_1776_WAVES.length, ...saved);
    }
  }, 120_000);
});

describe("Thirteen Colonies 1776: Loyalist colonies (idea C)", () => {
  it("a Loyalist colony whose capital falls to Britain joins Britain for good", async () => {
    const g = await scenarioGame("colonies1776");
    const { game } = g;
    const britain = g.nation("great_britain");
    const georgia = g.nation("georgia");
    const rule = SCENARIO_RULES.colonies1776_loyalists;
    const news: string[] = [];
    // Its capital standing, nothing happens.
    rule.tick!(at(game, 600, news));
    expect(georgia.team()).toBe("Patriots");
    takeCapital(game, georgia, britain);
    rule.tick!(at(game, 610, news));
    expect(georgia.team()).toBe("British");
    expect(georgia.isFriendly(britain)).toBe(true);
    expect(news).toEqual(["events_display.scenario_loyalists"]);
    // For good: the Patriots taking the spot back changes nothing.
    g.nation("south_carolina").conquer(georgia.spawnTile()!);
    rule.tick!(at(game, 620, news));
    expect(georgia.team()).toBe("British");
    expect(news.length).toBe(1);
  }, 120_000);

  it("leaves the other colonies, and a player's colony, on their side", async () => {
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
    const news: string[] = [];
    SCENARIO_RULES.colonies1776_loyalists.tick!(at(game, 600, news));
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

  it("both ideas together: the colonies1776 rule", async () => {
    const g = await scenarioGame("colonies1776");
    const britain = g.nation("great_britain");
    const georgia = g.nation("georgia");
    takeCapital(g.game, georgia, britain);
    const news: string[] = [];
    SCENARIO_RULES.colonies1776.tick!(at(g.game, 10 * 600, news));
    expect(georgia.team()).toBe("British");
    expect(news).toEqual([
      "events_display.scenario_landing_staten_island",
      "events_display.scenario_loyalists",
    ]);
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

describe("a scenario's own Overtime (overtimeFrom; idea G)", () => {
  it("turns Overtime on from its minute, whatever the host picked", () => {
    const plain = applyScenarioRules({
      scenario: { id: "continental1776" },
      overtime: { enabled: false },
    });
    expect(plain.overtime).toEqual({ enabled: false });
    const config = applyScenarioRules({
      scenario: { id: "colonies1776" },
      overtime: { enabled: false },
    });
    expect(config.overtime).toEqual({ enabled: true, startMinutes: 40 });
  });
});

describe("Thirteen Colonies 1776 as the owner picked it (idea E3)", () => {
  it("has the blockade on every colony and Overtime from minute 40, and nothing else", () => {
    const data = scenarioData("colonies1776")!;
    expect(data.overtimeFrom).toBe(40);
    expect(data.rule).toBeUndefined();
    for (const n of data.nations) {
      expect(n.goldIncome, n.key).toBe(n.side === "Patriots" ? 0.6 : undefined);
    }
    expect(data.nations.filter((n) => n.goldIncome === 0.6).length).toBe(13);
    // Britain as in round 2.
    const britain = data.nations.find((n) => n.key === "great_britain")!;
    expect(britain.troopCapBonus).toBe(6_000_000);
    expect(britain.troopGrowth).toBe(2);
    expect(data.sides.find((s) => s.id === "British")!.winPercent).toBe(55);
  });

  it("leaves every other scenario as it was", () => {
    for (const id of ["continental1776", "europe1939"]) {
      const data = scenarioData(id)!;
      expect(data.overtimeFrom, id).toBeUndefined();
      for (const n of data.nations) {
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

  it("refuses its old games' replays, but not the other scenarios'", () => {
    expect(scenarioEdition("colonies1776")).toBe(3);
    expect(scenarioEdition("europe1939")).toBe(SCENARIO_EDITION);
    expect(
      scenarioReplayable({ scenario: { id: "colonies1776", edition: 2 } }),
    ).toBe(false);
    expect(
      scenarioReplayable({ scenario: { id: "colonies1776", edition: 3 } }),
    ).toBe(true);
    expect(
      scenarioReplayable({ scenario: { id: "europe1939", edition: 2 } }),
    ).toBe(true);
    const config: Partial<GameConfig> = applyScenarioRules({
      scenario: { id: "colonies1776" },
    });
    expect(config.scenario!.edition).toBe(3);
  });
});
