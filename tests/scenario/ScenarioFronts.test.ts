// SCEN (r25): fronts that hold. Attacks on a nation's own soil cost more (and
// more as it shrinks); attacks far from the attacker's own land cost more.

import { Game } from "@openfront/engine/game/Game";
import {
  FRONT_DEFAULTS,
  frontRules,
  scenarioAttackFactor,
} from "@openfront/engine/scenario/ScenarioFronts";
import { scenarioStartLabels } from "@openfront/engine/scenario/ScenarioLabels";
import { SCENARIO_RULES } from "@openfront/engine/scenario/ScenarioRules";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/** The tile nearest (x, y) that passes `ok`. */
function near(
  game: Game,
  x: number,
  y: number,
  ok: (t: number) => boolean,
): number {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = game.ref(x + dx, y + dy);
        if (ok(t)) return t;
      }
    }
  }
  throw new Error(`nothing near ${x},${y}`);
}

describe("fronts that hold", () => {
  it("costs more on the defender's own soil, more again as it shrinks", async () => {
    const g = await scenarioGame("europe1939");
    const { game } = g;
    const germany = g.nation("germany");
    const poland = g.nation("poland");
    const rules = frontRules(game.scenario()!);
    // Near Warsaw: Polish soil, next door to Germany (inside its free
    // range).
    const warsaw = near(game, 1860, 774, (t) => game.owner(t) === poland);
    const labels = scenarioStartLabels(game, game.scenario()!);
    const polandLabel =
      game.scenario()!.data.nations.findIndex((n) => n.key === "poland") + 1;
    expect(labels[warsaw]).toBe(polandLabel);
    const fresh = scenarioAttackFactor(game, germany, poland, warsaw);
    expect(fresh).toBeGreaterThanOrEqual(1 + rules.homeland);
    expect(fresh).toBeLessThan((1 + rules.homeland) * 1.2);
    // Half of Poland gone: the last stand.
    const tiles = [...poland.tiles()];
    const start = tiles.length;
    for (const t of tiles.slice(0, Math.floor(start / 2))) germany.conquer(t);
    const halved = scenarioAttackFactor(game, germany, poland, warsaw);
    expect(halved / fresh).toBeCloseTo(
      (1 + rules.homeland + rules.lastStand * 0.5) / (1 + rules.homeland),
      1,
    );
  }, 120_000);

  it("costs more the farther the attacker is from home, up to a cap", async () => {
    const g = await scenarioGame("europe1939");
    const { game } = g;
    const germany = g.nation("germany");
    const ussr = g.nation("soviet_union");
    const rules = frontRules(game.scenario()!);
    const homeland = 1 + rules.homeland;
    // Minsk is some 190 tiles from Germany's 1939 land (East Prussia),
    // Moscow some 600, past the cap.
    const minsk = scenarioAttackFactor(
      game,
      germany,
      ussr,
      near(game, 2126, 706, (t) => game.owner(t) === ussr),
    );
    const moscow = scenarioAttackFactor(
      game,
      germany,
      ussr,
      near(game, 2535, 631, (t) => game.owner(t) === ussr),
    );
    expect(minsk / homeland).toBeGreaterThan(1.2);
    expect(moscow / homeland).toBeGreaterThan(minsk / homeland);
    expect(moscow / homeland).toBeCloseTo(rules.supplyMax, 6);
    // The same tile attacked by its neighbour costs only the homeland.
    const finland = g.nation("finland");
    const karelia = near(game, 2238, 461, (t) => game.owner(t) === ussr); // Leningrad
    expect(
      scenarioAttackFactor(game, finland, ussr, karelia) / homeland,
    ).toBeLessThan(1.15);
  }, 120_000);

  it("takes the scenario's own values over the defaults, and its special rule's factor", async () => {
    const g = await scenarioGame("continental1776");
    const scenario = g.game.scenario()!;
    const data = scenario.data;
    expect(frontRules(scenario)).toEqual({
      ...FRONT_DEFAULTS,
      ...(data.fronts ?? {}),
    });
    const before = data.fronts;
    const beforeRule = data.rule;
    data.fronts = { homeland: 0, supplyPer100: 0 };
    data.rule = "test_double";
    SCENARIO_RULES.test_double = { attackFactor: () => 2 };
    try {
      const britain = g.nation("great_britain");
      const colonies = g.nation("united_colonies");
      const tile = [...colonies.tiles()][0];
      expect(scenarioAttackFactor(g.game, britain, colonies, tile)).toBe(2);
    } finally {
      data.fronts = before;
      data.rule = beforeRule;
      delete SCENARIO_RULES.test_double;
    }
  }, 120_000);

  it("is 1 in an ordinary game", () => {
    const game = { scenario: () => null } as unknown as Game;
    expect(scenarioAttackFactor(game, {} as never, {} as never, 0)).toBe(1);
  });
});
