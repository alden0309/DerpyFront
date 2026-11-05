// SCEN (r25): fronts that hold. Attacks on a nation's own soil cost more (and
// more as it shrinks); attacks far from the attacker's own land cost more.

import { scenarioEdition } from "@openfront/engine-api/game/Scenarios";
import { Game } from "@openfront/engine/game/Game";
import {
  FRONT_DEFAULTS,
  frontRules,
  scenarioAttackFactor,
} from "@openfront/engine/scenario/ScenarioFronts";
import { scenarioStartLabels } from "@openfront/engine/scenario/ScenarioLabels";
import {
  EUROPE_1939_BLITZ_TICKS,
  SCENARIO_RULES,
} from "@openfront/engine/scenario/ScenarioRules";
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
    // After the opening minutes, when Germany's help against a computer-run
    // Poland is over (SCEN3 r27: EUROPE_1939_BLITZ_TICKS).
    const view = Object.create(game) as Game;
    view.ticks = () => EUROPE_1939_BLITZ_TICKS;
    const fresh = scenarioAttackFactor(view, germany, poland, warsaw);
    expect(fresh).toBeGreaterThanOrEqual(1 + rules.homeland);
    expect(fresh).toBeLessThan((1 + rules.homeland) * 1.2);
    // Half of Poland gone: the last stand.
    const tiles = [...poland.tiles()];
    const start = tiles.length;
    for (const t of tiles.slice(0, Math.floor(start / 2))) germany.conquer(t);
    const halved = scenarioAttackFactor(view, germany, poland, warsaw);
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
    const scenario = game.scenario()!;
    const rules = frontRules(scenario);
    // The Soviet Union's own homeland rule (SCEN3 r27: a wall at home).
    const own = frontRules(
      scenario,
      scenario.data.nations.findIndex((n) => n.key === "soviet_union"),
    );
    const homeland = 1 + own.homeland;
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

  it("lets a special rule's factor go below 1 (SCEN3 r27: cheaper attacks)", async () => {
    const g = await scenarioGame("continental1776");
    const data = g.game.scenario()!.data;
    const beforeRule = data.rule;
    data.rule = "test_half";
    SCENARIO_RULES.test_half = { attackFactor: () => 0.5 };
    try {
      const britain = g.nation("great_britain");
      const colonies = g.nation("united_colonies");
      const tile = [...colonies.tiles()][0];
      const withHalf = scenarioAttackFactor(g.game, britain, colonies, tile);
      data.rule = beforeRule;
      const plain = scenarioAttackFactor(g.game, britain, colonies, tile);
      expect(withHalf / plain).toBeCloseTo(0.5, 6);
    } finally {
      data.rule = beforeRule;
      delete SCENARIO_RULES.test_half;
    }
  }, 120_000);

  it("takes a nation's own front rules over its scenario's (SCEN3 r27)", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const scenario = game.scenario()!;
    const data = scenario.data;
    const ni = data.nations.findIndex((n) => n.key === "north_korea");
    const own = data.nations[ni].fronts!;
    expect(frontRules(scenario, ni)).toEqual({
      ...FRONT_DEFAULTS,
      ...data.fronts,
      ...own,
    });
    // The North's supply runs thin sooner than the South's: deep in the
    // South (Busan) its attacks cost more than the scenario's cap allows.
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const busan = near(game, 823, 1708, (t) => game.owner(t) === south);
    expect(scenarioAttackFactor(game, north, south, busan)).toBeGreaterThan(
      (1 + data.fronts!.homeland!) * data.fronts!.supplyMax!,
    );
    // The South at home is untouched by the North's own rules (it has its
    // own: it holds less hard at home, SCEN3 r27).
    const ri = data.nations.findIndex((n) => n.key === "south_korea");
    expect(frontRules(scenario, ri)).toEqual({
      ...FRONT_DEFAULTS,
      ...data.fronts,
      ...data.nations[ri].fronts,
    });
    expect(frontRules(scenario, ri).supplyMax).toBe(data.fronts!.supplyMax);
  }, 120_000);

  it("has the defaults resources/scenarios/README.md's table gives", () => {
    expect(FRONT_DEFAULTS).toEqual({
      homeland: 0.5,
      lastStand: 2.0,
      supplyFreeRange: 40,
      supplyPer100: 0.5,
      supplyMax: 2.5,
    });
  });

  it("is 1 in an ordinary game", () => {
    const game = { scenario: () => null } as unknown as Game;
    expect(scenarioAttackFactor(game, {} as never, {} as never, 0)).toBe(1);
  });
});

// SCEN3 (r27): the Civil War's Confederate states hold harder at home (the
// Union had won 7 of 8 balance games; now about 5 of 12 go to the South).
describe("the American Civil War's Confederate home fronts", () => {
  it("make an attack on a Confederate state at home cost more, and nobody else's", async () => {
    const g = await scenarioGame("civilwar1861");
    const { game } = g;
    const scenario = game.scenario()!;
    const data = scenario.data;
    for (const [i, n] of data.nations.entries()) {
      const rules = frontRules(scenario, i);
      if (n.side === "Confederacy") {
        expect(n.fronts, n.key).toEqual({ homeland: 1, lastStand: 3 });
        expect(rules.homeland).toBe(1);
        expect(rules.lastStand).toBe(3);
      } else {
        expect(n.fronts, n.key).toBeUndefined();
        expect(rules.homeland).toBe(data.fronts!.homeland);
      }
    }
    const virginia = g.nation("virginia_nc");
    const union = g.nation("mid_atlantic");
    const [x, y] = data.nations.find((n) => n.key === "virginia_nc")!.capital;
    const tile = near(game, x, y, (t) => game.owner(t) === virginia);
    const harder = scenarioAttackFactor(game, union, virginia, tile);
    // The same attack in a game without Virginia's own rules (a game keeps
    // its front rules once worked out).
    const n = data.nations.find((m) => m.key === "virginia_nc")!;
    const own = n.fronts;
    delete n.fronts;
    try {
      const h = await scenarioGame("civilwar1861");
      const plain = scenarioAttackFactor(
        h.game,
        h.nation("mid_atlantic"),
        h.nation("virginia_nc"),
        tile,
      );
      // Untouched, at the start: (1 + 1) against the scenario's (1 + 0.5).
      expect(harder / plain).toBeCloseTo(2 / 1.5, 2);
    } finally {
      n.fronts = own;
    }
    expect(scenarioEdition("civilwar1861")).toBe(4);
  }, 120_000);
});
