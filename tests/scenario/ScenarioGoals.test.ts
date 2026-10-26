// DFX (r26): Scenario goals. Every playable nation has one, and each is
// checkable: its place is land on both map sizes, a goal to take a place
// isn't met at the start, one to hold your own place is held then, its side
// exists, and its words are in en.json. The rules (hold, take, keep, a
// side's hold, being on a side, a Compact map's minutes being half), that
// goals pay on Hard and Impossible only, and the engine's checks: a goal met
// is written into the player's stats, once, and never changes the game.

import { Difficulty, GameMapSize } from "@openfront/engine-api/game/GameTypes";
import {
  allScenarioData,
  isPlayable,
  scenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import {
  allScenarioGoals,
  GOAL_COINS,
  goalDueMinute,
  goalMetAt,
  goalMinute,
  goalMissed,
  goalPaysOn,
  goalPlaceAt,
  goalPlaceOf,
  goalTextKey,
  goalTileXY,
  scenarioGoal,
  type ScenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals";
import { describe, expect, it, vi } from "vitest";
import en from "../../resources/lang/en.json";
import tilesFile from "../../resources/scenarios/goal-tiles.json";
import { allScenarioGoalTiles } from "../../scripts/scenario-goal-tiles";
import { scenarioBoard } from "../../scripts/scenario-sizes";
import { scenarioGame } from "./ScenarioTestUtil";

/** A scenario's map at a size, with each tile's nation at the start. */
function board(id: string, size: "map" | "map4x") {
  const d = scenarioData(id)!;
  return { d, ...scenarioBoard(d, size) };
}

const text = (sid: string, nation: string): unknown =>
  goalTextKey(sid, nation)
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);

describe("the goals' data", () => {
  it("every playable nation has one goal, and only scenario nations have goals", () => {
    let count = 0;
    for (const d of allScenarioData()) {
      for (const n of d.nations) {
        const g = scenarioGoal(d.id, n.key);
        if (isPlayable(n)) expect(g, `${d.id}/${n.key}`).not.toBeNull();
        if (g !== null) count++;
      }
      for (const key of Object.keys(allScenarioGoals()[d.id] ?? {}))
        expect(d.nations.map((n) => n.key)).toContain(key);
    }
    expect(Object.keys(allScenarioGoals()).sort()).toEqual(
      allScenarioData()
        .map((d) => d.id)
        .sort(),
    );
    expect(count).toBe(158);
    expect(GOAL_COINS).toBe(200);
  });

  it("each goal's tile is the one its place stands for (run scripts/scenario-goal-tiles.ts if not)", () => {
    expect(tilesFile).toEqual(allScenarioGoalTiles());
  }, 120_000);

  it("each is checkable: well formed, its tile near its place, held or not as it should be at the start", () => {
    for (const d0 of allScenarioData()) {
      for (const size of ["map", "map4x"] as const) {
        const { d, width: W, labels, scale } = board(d0.id, size);
        for (const n of d.nations) {
          const g = scenarioGoal(d.id, n.key)!;
          const where = `${d.id}/${n.key} (${size})`;
          expect(["hold", "take", "keep"], where).toContain(g.kind);
          if (g.kind === "hold") expect(g.minute, where).toBeGreaterThan(0);
          if (g.minute !== undefined)
            expect(g.minute, where).toBeLessThanOrEqual(60);
          if (g.onSide !== undefined && g.onSide !== "any")
            expect(
              d.sides.map((s) => s.id),
              where,
            ).toContain(g.onSide);
          if (g.side === true)
            expect(n.side, `${where}: a side goal needs a side`).not.toBeNull();
          expect(typeof text(d.id, n.key), where).toBe("string");
          // Its minute goes into its words, as the map's (goalDueMinute).
          expect(
            String(text(d.id, n.key)).includes("{minute}"),
            `${where}: {minute} in its words`,
          ).toBe(g.minute !== undefined && g.kind !== "keep");
          const of = d.nations.find((x) => x.key === goalPlaceOf(g));
          expect(of, `${where}: whose place?`).toBeDefined();

          const at = goalPlaceAt(d, g)!;
          const xy = goalTileXY(d.id, n.key, size === "map4x")!;
          expect(xy, where).not.toBeNull();
          // Near the place (a few tiles off at most: a coast, a river bank).
          const off = Math.max(
            Math.abs(xy[0] - Math.floor(at[0] / scale)),
            Math.abs(xy[1] - Math.floor(at[1] / scale)),
          );
          expect(off, `${where}: far from its place`).toBeLessThanOrEqual(12);
          // Its nation's at the start.
          const owner = d.nations[labels[xy[1] * W + xy[0]] - 1];
          expect(owner?.key, where).toBe(of!.key);
          const mine = owner.key === n.key;
          const ours = mine || (n.side !== null && owner.side === n.side);
          if (g.kind === "take")
            // Not met before the war starts.
            expect(g.side ? ours : mine, `${where}: already held`).toBe(false);
          else if ("capitalOf" in g.place && g.place.capitalOf === n.key)
            expect(mine, `${where}: its own place isn't its own`).toBe(true);
          if (g.kind === "keep")
            expect(g.side ? ours : mine, `${where}: nothing to keep`).toBe(
              true,
            );
        }
      }
    }
  }, 120_000);
});

describe("the rules", () => {
  it("a goal met pays on Hard and Impossible only", () => {
    expect(goalPaysOn(Difficulty.Hard)).toBe(true);
    expect(goalPaysOn(Difficulty.Impossible)).toBe(true);
    expect(goalPaysOn(Difficulty.Medium)).toBe(false);
    expect(goalPaysOn(Difficulty.Easy)).toBe(false);
    expect(goalPaysOn(undefined)).toBe(false);
  });

  const at = (elapsed: number, holds: boolean, team: string | null = "A") => ({
    elapsed,
    holds,
    team,
  });
  const M = 600; // ticks a minute
  const hold: ScenarioGoal = {
    kind: "hold",
    place: { capitalOf: "x" },
    minute: 20,
  };
  const take: ScenarioGoal = {
    kind: "take",
    place: { capitalOf: "x" },
    minute: 25,
  };
  const keep: ScenarioGoal = { kind: "keep", place: { capitalOf: "x" } };

  it("hold: judged at its minute (or when the war ends first, won)", () => {
    expect(goalMetAt(hold, at(20 * M - 10, true), false, 10)).toBe(false);
    expect(goalMetAt(hold, at(20 * M, true), false, 10)).toBe(true);
    expect(goalMetAt(hold, at(20 * M, false), false, 10)).toBe(false);
    expect(goalMetAt(hold, at(20 * M + 10, true), false, 10)).toBe(false);
    expect(goalMissed(hold, 20 * M + 10, false, 10)).toBe(true);
    expect(goalMissed(hold, 20 * M, false, 10)).toBe(false);
    // The war ended at minute 12, won, with the place held: met.
    expect(goalMetAt(hold, { ...at(12 * M, true), won: true }, true, 10)).toBe(
      true,
    );
    // Lost at minute 12 with the place still held: not holding out.
    expect(goalMetAt(hold, { ...at(12 * M, true), won: false }, true, 10)).toBe(
      false,
    );
    expect(goalMetAt(hold, at(12 * M, true), true, 10)).toBe(false);
    // Won, but the place lost: no.
    expect(goalMetAt(hold, { ...at(12 * M, false), won: true }, true, 10)).toBe(
      false,
    );
    // Ended at its minute: judged as at its minute, won or not.
    expect(goalMetAt(hold, at(20 * M, true), true, 10)).toBe(true);
    // ...but not after its minute had gone by.
    expect(goalMetAt(hold, { ...at(30 * M, true), won: true }, true, 10)).toBe(
      false,
    );
  });

  it("take: any moment before its minute; one without a minute, any time", () => {
    expect(goalMetAt(take, at(5, true), false, 10)).toBe(true);
    expect(goalMetAt(take, at(25 * M - 1, true), false, 10)).toBe(true);
    expect(goalMetAt(take, at(25 * M, true), false, 10)).toBe(false);
    expect(goalMissed(take, 25 * M, false, 10)).toBe(true);
    const ever: ScenarioGoal = { ...take, minute: undefined };
    expect(goalMetAt(ever, at(170 * M, true), false, 10)).toBe(true);
    expect(goalMissed(ever, 170 * M, false, 10)).toBe(false);
    expect(goalMissed(ever, 170 * M, true, 10)).toBe(true);
  });

  it("keep: only when the war ends", () => {
    expect(goalMetAt(keep, at(40 * M, true), false, 10)).toBe(false);
    expect(goalMetAt(keep, at(40 * M, true), true, 10)).toBe(true);
    expect(goalMetAt(keep, at(40 * M, false), true, 10)).toBe(false);
  });

  it("on a Compact map a goal's minute is half its own, rounded up", () => {
    expect(goalDueMinute(hold, false)).toBe(20);
    expect(goalDueMinute(hold, true)).toBe(10);
    expect(goalDueMinute({ minute: 25 }, true)).toBe(13);
    expect(goalDueMinute({}, true)).toBeUndefined();
    expect(goalMinute(take, true)).toBe(13);
    expect(goalMinute(take, false)).toBe(25);
    expect(goalMinute(keep, true)).toBeNull();
    const c = (elapsed: number, holds: boolean) => ({
      ...at(elapsed, holds),
      compact: true,
    });
    // hold: judged at minute 10, not 20.
    expect(goalMetAt(hold, c(10 * M, true), false, 10)).toBe(true);
    expect(goalMetAt(hold, c(20 * M, true), false, 10)).toBe(false);
    expect(goalMissed(hold, 10 * M + 10, false, 10, true)).toBe(true);
    expect(goalMissed(hold, 10 * M + 10, false, 10)).toBe(false);
    // take: before minute 13, not 25.
    expect(goalMetAt(take, c(13 * M - 1, true), false, 10)).toBe(true);
    expect(goalMetAt(take, c(13 * M, true), false, 10)).toBe(false);
    expect(goalMissed(take, 13 * M, false, 10, true)).toBe(true);
    // keep has no minute: the same on both.
    expect(goalMetAt(keep, c(40 * M, true), true, 10)).toBe(true);
  });

  it('onSide: on that side (or on any, for "any") when it\'s checked', () => {
    const join: ScenarioGoal = { ...hold, onSide: "Union" };
    expect(goalMetAt(join, at(20 * M, true, "Union"), false, 10)).toBe(true);
    expect(goalMetAt(join, at(20 * M, true, "Confederacy"), false, 10)).toBe(
      false,
    );
    expect(goalMetAt(join, at(20 * M, true, null), false, 10)).toBe(false);
    const war: ScenarioGoal = { ...hold, onSide: "any" };
    expect(goalMetAt(war, at(20 * M, true, "Wu"), false, 10)).toBe(true);
    expect(goalMetAt(war, at(20 * M, true, null), false, 10)).toBe(false);
  });
});

describe("the engine's checks", () => {
  const P = "PLAYERAA";

  async function korea(nation: string) {
    const g = await scenarioGame("korea1950", {
      players: [{ clientID: P, username: "Pat", nation }],
      size: GameMapSize.Compact,
    });
    const goal = scenarioGoal("korea1950", nation)!;
    const [x, y] = goalTileXY("korea1950", nation, true)!;
    const tile = g.game.ref(x, y);
    const me = g.nation(nation);
    const goalStat = () => g.game.stats().getPlayerStats(me)?.goal;
    return { g, goal, tile, me, goalStat };
  }

  it("take: met the moment the place is yours, written once", async () => {
    const { g, tile, me, goalStat } = await korea("un_command");
    g.step(20);
    expect(goalStat()).toBeUndefined();
    me.conquer(tile); // Pyongyang
    g.step(10);
    const met = goalStat();
    expect(met).toBeGreaterThan(0);
    g.step(20);
    expect(goalStat()).toBe(met);
  }, 60_000);

  it("hold: judged at its minute (the Compact map's); held, it's met, lost, it isn't", async () => {
    // "Hold Seoul past minute 20": minute 10 on this Compact map.
    const due = goalDueMinute(scenarioGoal("korea1950", "south_korea")!, true)!;
    expect(due).toBe(10);
    const { g, goalStat } = await korea("south_korea");
    // Seoul is the South's at the start; at its minute it still is.
    vi.spyOn(g.game, "elapsedGameSeconds").mockReturnValue(due * 60);
    g.step(10);
    expect(goalStat()).toBeDefined();

    // Its own minute (20) is too late on a Compact map.
    const late = await korea("south_korea");
    vi.spyOn(late.g.game, "elapsedGameSeconds").mockReturnValue(20 * 60);
    late.g.step(10);
    expect(late.goalStat()).toBeUndefined();

    const lost = await korea("south_korea");
    lost.g.nation("north_korea").conquer(lost.tile); // Seoul falls
    vi.spyOn(lost.g.game, "elapsedGameSeconds").mockReturnValue(due * 60);
    lost.g.step(10);
    expect(lost.goalStat()).toBeUndefined();
    // Too late to hold it again after its minute.
    lost.me.conquer(lost.tile);
    vi.spyOn(lost.g.game, "elapsedGameSeconds").mockReturnValue((due + 1) * 60);
    lost.g.step(10);
    expect(lost.goalStat()).toBeUndefined();
  }, 60_000);

  it("the war ending early, won with the place held, meets a hold goal; computer nations have none", async () => {
    const { g, me, goalStat } = await korea("south_korea");
    g.step(10);
    expect(goalStat()).toBeUndefined();
    g.game.setWinner(me.team(), g.game.stats().stats());
    expect(goalStat()).toBeDefined();
    const nk = g.nation("north_korea");
    expect(g.game.stats().getPlayerStats(nk)?.goal).toBeUndefined();
  }, 60_000);

  it("the war lost early, the place still held, doesn't meet a hold goal", async () => {
    const { g, goalStat } = await korea("south_korea");
    g.step(10);
    g.game.setWinner(g.nation("north_korea").team(), g.game.stats().stats());
    expect(goalStat()).toBeUndefined();
    const draw = await korea("south_korea");
    draw.g.step(10);
    draw.g.game.setWinner(null, draw.g.game.stats().stats());
    expect(draw.goalStat()).toBeUndefined();
  }, 60_000);

  it("never changes the game: the same war, ticked with and without goals", async () => {
    const run = async (goals: boolean) => {
      const { g, me, tile } = await korea("north_korea");
      if (!goals)
        vi.spyOn(g.game.stats(), "recordScenarioGoal").mockImplementation(
          () => {},
        );
      me.conquer(tile);
      g.step(60);
      return g.game.allPlayers().map((p) => [p.numTilesOwned(), p.troops()]);
    };
    expect(await run(true)).toEqual(await run(false));
  }, 120_000);
});
