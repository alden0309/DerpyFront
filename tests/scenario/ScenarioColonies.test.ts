import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game } from "@openfront/engine/game/Game";
import { SCENARIO_RULES } from "@openfront/engine/scenario/ScenarioRules";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN (r25, balance follow-up): a scenario's rule hooks that run as the game
 * goes, and Thirteen Colonies 1776's balance ideas.
 */

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
