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
    expect(hash(r)).toBe(hash(g.game));
    for (let i = 0; i < 60; i++) {
      g.step(1);
      restored.addTurn({ turnNumber: r.ticks(), intents: [] });
      restored.executeNextTick();
      expect(hash(r)).toBe(hash(g.game));
    }
  }, 180_000);
});
