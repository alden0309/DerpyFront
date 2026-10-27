// SCEN (r25): a scenario game survives a snapshot and restore: the restored
// game knows its scenario and its seats, keeps the sides as they changed in
// play (a neutral that joined), and plays on tick for tick like the
// original.

import { createGameRunnerFromSnapshot } from "@openfront/engine/GameRunner";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

const hash = (game: Game) => (game as unknown as { hash(): number }).hash();

describe("a scenario game, snapshotted and restored", () => {
  it("restored before its first tick, lays out the same board", async () => {
    const g = await scenarioGame("continental1776", { unstarted: true });
    const restored = await createGameRunnerFromSnapshot(
      g.start,
      g.runner.snapshot(),
      undefined,
      g.files,
      () => {},
    );
    for (let i = 0; i < 12; i++) {
      g.step(1);
      restored.addTurn({ turnNumber: restored.game.ticks(), intents: [] });
      restored.executeNextTick();
      expect(hash(restored.game)).toBe(hash(g.game));
    }
    expect(g.nation("great_britain").numTilesOwned()).toBeGreaterThan(1000);
  }, 180_000);

  it("plays on exactly as the original", async () => {
    const g = await scenarioGame("europe1939", {
      players: [{ clientID: "HUMAN001", username: "Alden", nation: "france" }],
    });
    const germany = g.nation("germany");
    const swiss = g.nation("switzerland");
    g.game.addExecution(
      new AttackExecution(germany.troops() / 4, germany, swiss.id()),
    );
    g.step(40);
    expect(swiss.team()).toBe("Allies");
    // SCEN3 (r27): a rule's memory (a scenario mark) is game state.
    g.game.setScenarioMark("test:a", 1234);
    g.game.setScenarioMark("test:b", 7);
    g.game.setScenarioMark("test:b", null);

    const restored = await createGameRunnerFromSnapshot(
      g.start,
      g.runner.snapshot(),
      undefined,
      g.files,
      () => {},
    );
    const r = restored.game;
    expect(r.scenario()?.data.id).toBe("europe1939");
    expect(r.playerByClientID("HUMAN001")?.name()).toBe("France (Alden)");
    expect(
      r
        .allPlayers()
        .find((p) => p.name() === "Switzerland")
        ?.team(),
    ).toBe("Allies");
    expect(r.scenarioMark("test:a")).toBe(1234);
    expect(r.scenarioMark("test:b")).toBeUndefined();
    expect(hash(r)).toBe(hash(g.game));
    for (let i = 0; i < 60; i++) {
      g.step(1);
      restored.addTurn({ turnNumber: r.ticks(), intents: [] });
      restored.executeNextTick();
      expect(hash(r)).toBe(hash(g.game));
    }
  }, 180_000);
});
