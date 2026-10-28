import { Difficulty, UnitType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { TransportShipExecution } from "@openfront/engine/execution/TransportShipExecution";
import { Execution, Game, Player } from "@openfront/engine/game/Game";
import {
  holdMark,
  holdTargetTiles,
  KOREA_1950_CHINA,
  KOREA_1950_PLACES,
  KOREA_1950_WAVES,
  KOREA_1950_YALU_LINE,
  SCENARIO_RULES,
  scenarioWinner,
} from "@openfront/engine/scenario/ScenarioRules";
import { waveMark } from "@openfront/engine/scenario/ScenarioWaves";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN3 (r27): Korea 1950 rebalanced for a person on Hard. North Korea's
 * head start cut to about a third and its supply running thin in the south;
 * the UN's army and Domes of Alden in Japan; UN waves at Busan and Incheon;
 * China joining past the Yalu line; and the North's win by holding the
 * South for two and a half minutes in a row.
 */

interface News {
  message: string;
  params?: Record<string, string | number>;
}

/**
 * The game as the rule sees it at tick `ticks`, its news kept in `news`
 * (players, map, marks and executions are the game's own).
 */
function at(game: Game, ticks: number, news: News[] = []): Game {
  const view = Object.create(game) as Game;
  view.ticks = () => ticks;
  view.displayMessage = (message: string, _t, _p, _g, params) => {
    news.push({ message, params });
  };
  return view;
}

const rule = SCENARIO_RULES.korea1950;
const busan = KOREA_1950_WAVES.find((w) => w.id === "busan")!;
const incheon = KOREA_1950_WAVES.find((w) => w.id === "incheon")!;

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

describe("Korea 1950's data (SCEN3 r27)", () => {
  it("cuts the North's head start and gives the UN an army and Domes in Japan", () => {
    const data = scenarioData("korea1950")!;
    expect(data.rule).toBe("korea1950");
    const north = data.nations.find((n) => n.key === "north_korea")!;
    const un = data.nations.find((n) => n.key === "un_command")!;
    // Round 25: +4M and every troop at the start. Now it starts with half
    // of a smaller cap (about a third of round 25's army, the test below)
    // and grows into the rest: deep reserves, not a head start.
    expect(north.troopCapBonus).toBeLessThan(4_000_000);
    expect(north.troopsPercent).toBeLessThanOrEqual(50);
    expect(north.troopGrowth ?? 1).toBeGreaterThanOrEqual(1);
    // Its supply runs out sooner than the scenario's.
    expect(north.fronts?.supplyMax).toBeGreaterThan(data.fronts!.supplyMax!);
    expect(un.troopCapBonus).toBeGreaterThanOrEqual(500_000);
    // Nukes stay, dearer than usual; the UN's trade economy is cut back
    // (its Japan is nuke-proof under the Domes, so the bombs are the UN's).
    expect(data.nukePrice).toBeGreaterThan(1);
    expect(un.goldIncome).toBeLessThan(1);
    expect(un.troopsPercent).toBe(100);
    expect(un.structures!.filter((s) => s.type === "Dome")).toHaveLength(5);
    const side = data.sides.find((s) => s.id === "NorthKorea")!;
    // A boat raid under 1000 tiles doesn't break the hold (SCEN3 r27).
    expect(side.winByHolding).toEqual({
      nations: ["south_korea"],
      ignoreUnder: 200,
      seconds: 150,
      breakAt: 1000,
    });
  });

  it("starts the North at about a third of round 25's army, and the UN's Japan under five Domes", async () => {
    const g = await scenarioGame("korea1950", {
      config: { difficulty: Difficulty.Hard },
    });
    const { game } = g;
    const north = g.nation("north_korea");
    const un = g.nation("un_command");
    // Round 25's North had 4.85M on Hard (its 4M bonus and its land).
    expect(north.troops() / 10).toBeLessThan(2_200_000);
    expect(north.troops() / 10).toBeGreaterThan(1_200_000);
    // The UN Command: about 0.9M here, 1.1M once its capital counts.
    expect(un.troops() / 10).toBeGreaterThan(800_000);
    const domes = un.units(UnitType.Dome);
    expect(domes).toHaveLength(5);
    // Every tile of the UN's Japan lies under a Dome.
    const range2 = game.config().domeRange() ** 2;
    let outside = 0;
    un.tiles().forEach((t) => {
      if (
        !domes.some((d) => game.euclideanDistSquared(d.tile(), t) <= range2)
      ) {
        outside++;
      }
    });
    expect(outside).toBe(0);
  }, 120_000);
});

describe("Korea 1950: the North wins by holding the South for 2.5 minutes", () => {
  it("counts down from the moment it holds it all, resets on a retake, and wins after the hold", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const un = g.nation("un_command");
    const big = holdTargetTiles(game, ["south_korea"], 200);
    for (const t of big) north.conquer(t);
    const key = holdMark("NorthKorea");
    const news: News[] = [];

    // The hold begins: no win yet, a countdown for everyone.
    const t0 = 3000;
    expect(scenarioWinner(at(game, t0, news), false)).toBeNull();
    expect(game.scenarioMark(key)).toBe(t0);
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_hold_started_northkorea",
    ]);
    expect(news[0].params?.until).toBe(t0 + 1500);
    expect(news[0].params?.time).toBe("2:30");

    // A raid by boat, a beachhead under `breakAt` tiles: the count goes on.
    const breakAt = scenarioData("korea1950")!.sides.find(
      (s) => s.id === "NorthKorea",
    )!.winByHolding!.breakAt!;
    expect(breakAt).toBeGreaterThan(1);
    const raid = big.slice(0, breakAt - 1);
    for (const t of raid) un.conquer(t);
    expect(scenarioWinner(at(game, t0 + 300, news), false)).toBeNull();
    expect(game.scenarioMark(key)).toBe(t0);

    // A minute in, the UN retakes a counted piece's worth: the hold resets.
    expect(scenarioWinner(at(game, t0 + 600, news), false)).toBeNull();
    const retaken = big.slice(0, breakAt);
    for (const t of retaken) un.conquer(t);
    expect(scenarioWinner(at(game, t0 + 610, news), false)).toBeNull();
    expect(game.scenarioMark(key)).toBeUndefined();
    expect(news[news.length - 1]?.message).toBe(
      "events_display.scenario_hold_broken_northkorea",
    );

    // Taken back: the count starts again from there.
    for (const t of retaken) north.conquer(t);
    const t1 = t0 + 1000;
    expect(scenarioWinner(at(game, t1, news), false)).toBeNull();
    expect(game.scenarioMark(key)).toBe(t1);
    expect(scenarioWinner(at(game, t1 + 1490, news), false)).toBeNull();
    // 2.5 minutes in a row: the North wins, the UN's Japan untouched and
    // South Korea's islets still its own.
    expect(scenarioWinner(at(game, t1 + 1500, news), false)).toBe("NorthKorea");
    expect(un.numTilesOwned()).toBeGreaterThan(0);
    expect(south.numTilesOwned()).toBeGreaterThan(0);
  }, 120_000);

  it("plays it out in the game: the win comes 150 seconds after the hold begins", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const north = g.nation("north_korea");
    for (const t of holdTargetTiles(game, ["south_korea"], 200)) {
      north.conquer(t);
    }
    // Nobody can fight back while we watch.
    const still = () => {
      for (const p of game.players()) p.setTroops(0);
    };
    still();
    g.updates.length = 0;
    g.step(20);
    const started = game.scenarioMark(holdMark("NorthKorea"));
    expect(started).toBeDefined();
    const wins = () => g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
    while (game.ticks() < started! + 1490) {
      still();
      g.step(1);
    }
    expect(game.scenarioMark(holdMark("NorthKorea"))).toBe(started);
    expect(wins()).toHaveLength(0);
    for (let i = 0; i < 20; i++) {
      still();
      g.step(1);
    }
    expect(wins()).toHaveLength(1);
    expect(wins()[0].winner?.[1]).toBe("NorthKorea");
  }, 180_000);

  it("the UN wins by beating the North", async () => {
    const g = await scenarioGame("korea1950");
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    for (const t of [...north.tiles()].slice(50)) south.conquer(t);
    g.updates.length = 0;
    g.step(20);
    const wins = g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
    expect(wins).toHaveLength(1);
    expect(wins[0].winner?.[1]).toBe("UnitedNations");
  }, 120_000);
});

describe("Korea 1950: UN waves at Busan, then Incheon", () => {
  it("lands at Busan while the UN holds it, raising the holder's cap", async () => {
    // Hard: a computer nation's cap is a person's (Medium's is 3/4 of it).
    const g = await scenarioGame("korea1950", {
      config: { difficulty: Difficulty.Hard },
    });
    const { game } = g;
    const south = g.nation("south_korea");
    const news: News[] = [];
    south.setTroops(0);
    const cap = game.config().maxTroops(south);
    rule.tick!(at(game, busan.minute * 600 - 10, news));
    expect(news).toHaveLength(0);
    rule.tick!(at(game, busan.minute * 600, news));
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_wave_un",
    ]);
    expect(news[0].params?.place).toBe("scenario_place.busan");
    expect(south.troops()).toBe(busan.troops * 10);
    expect(game.config().maxTroops(south)).toBe(cap + busan.cap! * 10);
    // Once: a second later nothing more.
    rule.tick!(at(game, busan.minute * 600 + 10, news));
    expect(news).toHaveLength(1);
  }, 120_000);

  it("goes to Japan if the pocket has fallen: holding Busan pays", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const un = g.nation("un_command");
    takeNear(game, south, north, KOREA_1950_PLACES.busan, 12);
    const news: News[] = [];
    const before = un.troops();
    rule.tick!(at(game, busan.minute * 600, news));
    expect(news[0].params?.place).toBe("scenario_place.sasebo");
    expect(un.troops()).toBe(before + busan.troops * 10);
    expect(game.scenarioMark(waveMark("busan"))).toBe(3); // un_command
  }, 120_000);

  it("lands at Incheon if the UN holds it, else sails from the South's coast and lands on it", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    // The North has taken Seoul and Incheon.
    takeNear(game, south, north, KOREA_1950_PLACES.incheon, 40);
    const added: Execution[] = [];
    const view = at(game, incheon.minute * 600);
    view.addExecution = (...e: Execution[]) => {
      added.push(...e);
    };
    const news: News[] = [];
    view.displayMessage = (message: string, _t, _p, _g, params) => {
      news.push({ message, params });
    };
    rule.tick!(view);
    expect(news.map((n) => n.message)).toContain(
      "events_display.scenario_wave_un_assault",
    );
    const boats = added.filter((e) => e instanceof TransportShipExecution);
    expect(boats).toHaveLength(1);
    // South Korea makes the landing.
    expect(game.scenarioMark(waveMark("incheon"))).toBe(2);
    // And for real: the boat sails, from the South's own coast.
    game.addExecution(...boats);
    g.step(5);
    expect(south.units(UnitType.TransportShip).length).toBeGreaterThan(0);
  }, 120_000);
});

describe("Korea 1950: the Incheon landing needs the pocket", () => {
  it("doesn't come at all if the UN has lost Busan", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const un = g.nation("un_command");
    takeNear(game, south, north, KOREA_1950_PLACES.busan, 12);
    takeNear(game, south, north, KOREA_1950_PLACES.incheon, 40);
    game.setScenarioMark(waveMark("busan"), 0);
    const before = [south.troops(), un.troops()];
    const added: Execution[] = [];
    const news: News[] = [];
    const view = at(game, incheon.minute * 600, news);
    view.addExecution = (...e: Execution[]) => {
      added.push(...e);
    };
    rule.tick!(view);
    expect(news).toEqual([]);
    expect(added).toEqual([]);
    expect([south.troops(), un.troops()]).toEqual(before);
    expect(game.scenarioMark(waveMark("incheon"))).toBe(0);
  }, 120_000);
});

describe("Korea 1950: the North's war aim", () => {
  it("sends the computer's North after the South first, islands too, while it lives", async () => {
    const g = await scenarioGame("korea1950");
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    expect(rule.target!(g.game, north)).toBe(south);
    expect(rule.target!(g.game, g.nation("un_command"))).toBeNull();
    for (const t of [...south.tiles()]) north.conquer(t);
    expect(rule.target!(g.game, north)).toBeNull();
  }, 120_000);
});

describe("Korea 1950: China joins only past the Yalu line", () => {
  it("stays out while the UN is south of the line, and comes in waves after", async () => {
    const g = await scenarioGame("korea1950", {
      config: { difficulty: Difficulty.Hard },
    });
    const { game } = g;
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    // The UN takes Pyongyang's south and the capital's latitude: not yet.
    takeNear(game, north, south, [300, 1000], 60);
    const news: News[] = [];
    rule.tick!(at(game, 20 * 600, news));
    expect(game.scenarioMark(KOREA_1950_CHINA)).toBeUndefined();
    expect(news.filter((n) => n.message.includes("china"))).toHaveLength(0);
    // Past the line (toward the Yalu): China comes in, a wave at once.
    takeNear(game, north, south, [300, KOREA_1950_YALU_LINE - 30], 25);
    north.setTroops(0);
    const cap = game.config().maxTroops(north);
    const t = 20 * 600 + 10;
    news.length = 0; // (the UN's waves landed at minute 20 too)
    rule.tick!(at(game, t, news));
    expect(game.scenarioMark(KOREA_1950_CHINA)).toBe(t);
    const china = KOREA_1950_WAVES.filter((w) => w.after === KOREA_1950_CHINA);
    expect(china.length).toBeGreaterThan(1);
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_wave_china_arrive",
    ]);
    expect(north.troops()).toBe(china[0].troops * 10);
    expect(game.config().maxTroops(north)).toBe(cap + china[0].cap! * 10);
    // The rest follow at their minutes after the mark.
    for (const w of china.slice(1)) {
      rule.tick!(at(game, t + w.minute * 600 - 10, news));
      const n = news.length;
      rule.tick!(at(game, t + w.minute * 600, news));
      expect(news.length).toBe(n + 1);
    }
    // Not overpowered: all of China's waves together are smaller than the
    // North's starting army.
    const total = china.reduce((s, w) => s + w.troops, 0);
    expect(total).toBeLessThan(2_000_000);
  }, 120_000);

  it("shows the cap raise in the player's update (the troop bar)", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const south = g.nation("south_korea");
    rule.tick!(at(game, busan.minute * 600));
    g.updates.length = 0;
    g.step(1);
    const mine = g.updates
      .flatMap((u) => u.updates[GameUpdateType.Player])
      .filter((u) => u.id === south.id());
    expect(mine.some((u) => u.scenarioCap === busan.cap! * 10)).toBe(true);
  }, 120_000);
});
