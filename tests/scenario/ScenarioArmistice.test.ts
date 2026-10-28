import { GameMapSize } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { scenarioEdition } from "@openfront/engine-api/game/Scenarios";
import {
  armisticeTicks,
  scenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { Game, Player } from "@openfront/engine/game/Game";
import {
  ARMISTICE_TALKS,
  holdMark,
  holdTargetTiles,
  scenarioWinner,
  sideStartTiles,
} from "@openfront/engine/scenario/ScenarioRules";
import { describe, expect, it } from "vitest";
import { ScenarioGame, scenarioGame } from "./ScenarioTestUtil";

/**
 * SCEN3 (r27): Korea 1950's armistice. At minute 60 of the game's clock
 * (30 on a Compact map) the war ends, as in 1953: the side holding more
 * land wins, whatever a hold has left to run. Everyone hears of the talks
 * five minutes before.
 */

interface News {
  message: string;
  params?: Record<string, string | number>;
}

/**
 * The game as the rules see it at tick `ticks`, its news kept in `news`
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

/** The tick the game's clock (the goals', the armistice's) starts from. */
function clockStart(g: ScenarioGame): number {
  while (g.game.inSpawnPhase()) g.step(1);
  return g.game.ticks() - Math.round(g.game.elapsedGameSeconds() * 10);
}

/** Each side's land: all its nations' tiles. */
function sideLand(game: Game): Map<string, number> {
  const land = new Map<string, number>();
  for (const p of game.players()) {
    const side = p.team();
    if (side === null) continue;
    land.set(side, (land.get(side) ?? 0) + p.numTilesOwned());
  }
  return land;
}

function moreLand(game: Game): string {
  const land = sideLand(game);
  const north = land.get("NorthKorea") ?? 0;
  const un = land.get("UnitedNations") ?? 0;
  expect(north).not.toBe(un);
  return north > un ? "NorthKorea" : "UnitedNations";
}

/** `p` gives up its first `n` tiles to nobody. */
function giveUp(p: Player, n: number): void {
  for (const t of [...p.tiles()].slice(0, n)) p.relinquish(t);
}

const NORMAL = { at: 36_000, warnAt: 33_000 };

describe("Korea 1950's armistice: the data", () => {
  it("is at minute 60, its talks five minutes before, half on a Compact map; Korea's edition is 4", () => {
    const data = scenarioData("korea1950")!;
    expect(data.armistice).toEqual({ minute: 60, warnMinutes: 5 });
    expect(armisticeTicks(data, false)).toEqual({ minute: 60, ...NORMAL });
    // Compact: minute 30, its talks at minute 28 (55 halved, rounded up).
    expect(armisticeTicks(data, true)).toEqual({
      minute: 30,
      at: 18_000,
      warnAt: 16_800,
    });
    expect(armisticeTicks({ armistice: { minute: 40 } }, false)).toEqual({
      minute: 40,
      at: 24_000,
      warnAt: 21_000,
    });
    // No other scenario has one.
    for (const id of ["europe1939", "colonies1776", "ww1914"]) {
      expect(armisticeTicks(scenarioData(id)!, false)).toBeNull();
    }
    expect(scenarioEdition("korea1950")).toBe(4);
  });
});

describe("Korea 1950's armistice in the war", () => {
  it("warns everyone at minute 55, then the side holding more land wins at minute 60", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const start = clockStart(g);
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    // The North has taken most of the South, not all of it (no hold).
    const southern = [...south.tiles()];
    for (const t of southern.slice(0, Math.floor(southern.length * 0.7))) {
      north.conquer(t);
    }
    expect(moreLand(game)).toBe("NorthKorea");
    const news: News[] = [];

    expect(
      scenarioWinner(at(game, start + NORMAL.warnAt - 10, news), false),
    ).toBeNull();
    expect(news).toEqual([]);
    // Minute 55: the talks, once.
    expect(
      scenarioWinner(at(game, start + NORMAL.warnAt, news), false),
    ).toBeNull();
    expect(news).toEqual([
      {
        message: "events_display.scenario_armistice_talks",
        params: { minute: 60 },
      },
    ]);
    expect(game.scenarioMark(ARMISTICE_TALKS)).toBe(start + NORMAL.warnAt);
    expect(
      scenarioWinner(at(game, start + NORMAL.warnAt + 10, news), false),
    ).toBeNull();
    expect(
      scenarioWinner(at(game, start + NORMAL.at - 10, news), false),
    ).toBeNull();
    expect(news).toHaveLength(1);
    expect(game.scenarioMark(holdMark("NorthKorea"))).toBeUndefined();
    // Minute 60: the armistice. The North holds more ground and wins.
    expect(scenarioWinner(at(game, start + NORMAL.at, news), false)).toBe(
      "NorthKorea",
    );
    expect(news[news.length - 1]).toEqual({
      message: "events_display.scenario_armistice_northkorea",
      params: { side: "NorthKorea" },
    });
  }, 120_000);

  it("counts Japan: the UN, holding more with it, wins", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const start = clockStart(g);
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const un = g.nation("un_command");
    // The South holds less of Korea than the North, by half the UN's Japan.
    const k = Math.floor(
      (Math.floor(un.numTilesOwned() / 2) -
        (north.numTilesOwned() - south.numTilesOwned())) /
        2,
    );
    if (k > 0) for (const t of [...south.tiles()].slice(0, k)) north.conquer(t);
    else for (const t of [...north.tiles()].slice(0, -k)) south.conquer(t);
    const korea = south.numTilesOwned();
    // ...but with the UN's Japan, more land in all.
    expect(korea).toBeLessThan(north.numTilesOwned());
    expect(un.numTilesOwned() + korea).toBeGreaterThan(north.numTilesOwned());
    expect(moreLand(game)).toBe("UnitedNations");
    const news: News[] = [];
    expect(scenarioWinner(at(game, start + NORMAL.at, news), false)).toBe(
      "UnitedNations",
    );
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_armistice_talks",
      "events_display.scenario_armistice_unitednations",
    ]);
  }, 120_000);

  it("breaks a tie in land for the side holding more of its own starting land", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const start = clockStart(g);
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    // Level the land: the bigger side gives up the difference.
    let land = sideLand(game);
    const d = land.get("NorthKorea")! - land.get("UnitedNations")!;
    expect(d).not.toBe(0);
    if (d > 0) giveUp(north, d);
    else giveUp(south, -d);
    land = sideLand(game);
    expect(land.get("NorthKorea")).toBe(land.get("UnitedNations"));
    // Level land: the side that started with less holds more of its own
    // (land now over land at the start, the time-up rule).
    const started = sideStartTiles(game);
    expect(started.get("NorthKorea")).not.toBe(started.get("UnitedNations"));
    const expected =
      started.get("NorthKorea")! < started.get("UnitedNations")!
        ? "NorthKorea"
        : "UnitedNations";
    const news: News[] = [];
    expect(scenarioWinner(at(game, start + NORMAL.at, news), false)).toBe(
      expected,
    );
    expect(news[news.length - 1]?.message).toBe(
      `events_display.scenario_armistice_${expected.toLowerCase()}`,
    );
  }, 120_000);

  it("comes at minute 30 on a Compact map, its talks at minute 28", async () => {
    const g = await scenarioGame("korea1950", { size: GameMapSize.Compact });
    const { game } = g;
    const start = clockStart(g);
    const news: News[] = [];
    expect(scenarioWinner(at(game, start + 16_790, news), false)).toBeNull();
    expect(news).toEqual([]);
    expect(scenarioWinner(at(game, start + 16_800, news), false)).toBeNull();
    expect(news).toEqual([
      {
        message: "events_display.scenario_armistice_talks",
        params: { minute: 30 },
      },
    ]);
    expect(scenarioWinner(at(game, start + 17_990, news), false)).toBeNull();
    const winner = moreLand(game);
    expect(scenarioWinner(at(game, start + 18_000, news), false)).toBe(winner);
    expect(news[news.length - 1]?.message).toBe(
      `events_display.scenario_armistice_${winner.toLowerCase()}`,
    );
  }, 120_000);

  it("decides a war mid-hold, against the side holding: the hold doesn't run on", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const start = clockStart(g);
    const north = g.nation("north_korea");
    const un = g.nation("un_command");
    const northern = [...north.tiles()];
    // The North holds all of the South...
    for (const t of holdTargetTiles(game, ["south_korea"], 200)) {
      north.conquer(t);
    }
    // ...but the UN has taken most of the North's own land.
    for (const t of northern.slice(0, Math.floor(northern.length * 0.8))) {
      un.conquer(t);
    }
    expect(moreLand(game)).toBe("UnitedNations");
    const news: News[] = [];
    // The hold begins at minute 58 and would win at 60:30.
    const t0 = start + 34_800;
    expect(scenarioWinner(at(game, t0, news), false)).toBeNull();
    expect(game.scenarioMark(holdMark("NorthKorea"))).toBe(t0);
    expect(
      scenarioWinner(at(game, start + NORMAL.at - 10, news), false),
    ).toBeNull();
    // Minute 60: the armistice ends the war; the UN holds more ground.
    expect(scenarioWinner(at(game, start + NORMAL.at, news), false)).toBe(
      "UnitedNations",
    );
    expect(game.scenarioMark(holdMark("NorthKorea"))).toBe(t0);
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_armistice_talks",
      "events_display.scenario_hold_started_northkorea",
      "events_display.scenario_armistice_unitednations",
    ]);
  }, 120_000);

  it("lets a hold that ends sooner win sooner", async () => {
    const g = await scenarioGame("korea1950");
    const { game } = g;
    const start = clockStart(g);
    const north = g.nation("north_korea");
    for (const t of holdTargetTiles(game, ["south_korea"], 200)) {
      north.conquer(t);
    }
    const news: News[] = [];
    const t0 = start + 30_000;
    expect(scenarioWinner(at(game, t0, news), false)).toBeNull();
    expect(scenarioWinner(at(game, t0 + 1500, news), false)).toBe("NorthKorea");
    // Minute 52:30: before the talks, so no armistice news at all.
    expect(news.map((n) => n.message)).toEqual([
      "events_display.scenario_hold_started_northkorea",
    ]);
  }, 120_000);

  it("ends the game in play: the win comes with the armistice's news", async () => {
    const g = await scenarioGame("korea1950", { size: GameMapSize.Compact });
    const { game } = g;
    const start = clockStart(g);
    // Jump the clock to just before minute 30 (the Compact armistice) by
    // moving the game's start back, then play on.
    const impl = game as unknown as { startTick: number };
    impl.startTick = start - (18_000 - 30);
    // Nobody can fight while we watch.
    const still = () => {
      for (const p of game.players()) p.setTroops(0);
    };
    g.updates.length = 0;
    for (let i = 0; i < 60; i++) {
      still();
      g.step(1);
    }
    const wins = g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
    expect(wins).toHaveLength(1);
    const winner = wins[0].winner?.[1];
    expect(winner).toBe(moreLand(game));
    const events = g.updates
      .flatMap((u) => u.updates[GameUpdateType.DisplayEvent])
      .map((e) => e.message);
    expect(events).toContain(
      `events_display.scenario_armistice_${String(winner).toLowerCase()}`,
    );
  }, 120_000);
});
