import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game } from "@openfront/engine/game/Game";
import {
  COLONIES_1776_PLACES,
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
    const rule = SCENARIO_RULES.colonies1776;
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
    SCENARIO_RULES.colonies1776.tick!(at(game, 20 * 600, news));
    expect(news).toEqual(["events_display.scenario_landing_quebec"]);
  }, 120_000);

  it("is played by no scenario yet: the owner hasn't picked", async () => {
    for (const id of ["colonies1776", "continental1776"]) {
      const g = await scenarioGame(id);
      expect(scenarioRule(g.game), id).toBeNull();
    }
  }, 120_000);
});
