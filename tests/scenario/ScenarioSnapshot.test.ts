// SCEN (r25): a scenario game survives a snapshot and restore: the restored
// game knows its scenario and its seats, keeps the sides as they changed in
// play (a neutral that joined), and plays on tick for tick like the
// original.

import { scenarioEdition } from "@openfront/engine-api/game/Scenarios";
import { Intent } from "@openfront/engine-api/Schemas";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { Game } from "@openfront/engine/game/Game";
import { createGameRunnerFromSnapshot } from "@openfront/engine/GameRunner";
import { scenarioDiplomacy } from "@openfront/engine/scenario/ScenarioDiplomacy";
import { decodeSnapshotValue } from "@openfront/engine/snapshot/SnapshotCodec";
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../util/Snapshot";
import { ScenarioGame, scenarioGame } from "./ScenarioTestUtil";

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

/**
 * DIPLO (r27), checked by SCEN3: courting is game state. A reconnect or a
 * rejoin restores from a snapshot, so every part of it (goodwill, the
 * cooldowns, a pending invitation and ask, the computer sides' chests and
 * what they last saw earned, the going rate, its random) must come back
 * exactly, and the restored game must court on exactly like the original.
 * This is the scenario-game coverage that tests/core/snapshot/
 * FullGameSnapshot.test.ts points to for ScenarioDiplomacy (an FFA game has
 * none); ScenarioDiplomacyIntent finishes in init, so it is applied here on
 * both sides of a restore instead.
 */
describe("courting in a scenario game, snapshotted and restored", () => {
  const seats = [
    { clientID: "HUMAN001", username: "Alden", nation: "germany" },
    { clientID: "HUMAN002", username: "Bea", nation: "spain" },
    { clientID: "HUMAN003", username: "Cid", nation: "france" },
  ];

  /** One tick, with intents as sent by these players. */
  function tick(
    runner: ScenarioGame["runner"],
    intents: (Intent & { clientID: string })[] = [],
  ): void {
    runner.addTurn({ turnNumber: runner.game.ticks(), intents });
    if (!runner.executeNextTick()) throw new Error("tick failed");
  }

  it("keeps goodwill, cooldowns, pending asks, chests and the rate exactly, and courts on the same", async () => {
    const id = "europe1939";
    const g = await scenarioGame(id, {
      players: seats,
      config: {
        scenario: {
          id,
          seats: Object.fromEntries(seats.map((p) => [p.nation, p.clientID])),
          edition: scenarioEdition(id),
        },
      },
    });
    const d = scenarioDiplomacy(g.game);
    expect(d).not.toBeNull();
    const spain = g.nation("spain");
    const germany = g.nation("germany");
    germany.setScenarioGold(germany.gold() + 20_000_000n);
    // Past a few of the computer sides' courting rounds, so their chests
    // hold something, and a gift, an invitation and an ask under way.
    g.step(1200);
    tick(g.runner, [
      {
        type: "scenario_gift",
        neutral: spain.id(),
        gold: 2_000_000,
        clientID: "HUMAN001",
      },
    ]);
    tick(g.runner, [
      { type: "scenario_invite", neutral: spain.id(), clientID: "HUMAN001" },
    ]);
    tick(g.runner, [
      { type: "scenario_ask_join", side: "Allies", clientID: "HUMAN002" },
    ]);
    g.step(5);
    const before = d!.toData();
    expect(before.goodwill.length).toBeGreaterThan(0);
    expect(before.invitedAt.length).toBeGreaterThan(0);
    expect(before.askedAt.length).toBeGreaterThan(0);
    expect(before.invites.length).toBeGreaterThan(0);
    expect(before.asks.length).toBeGreaterThan(0);
    expect(before.aiEarned.length).toBeGreaterThan(0);
    expect(before.aiBudget.some(([, gold]) => gold > 0)).toBe(true);

    const bytes = g.runner.snapshot();
    const execs = (decodeSnapshotValue(bytes) as { execs: { t: string }[] })
      .execs;
    expect(execs.map((e) => e.t)).toContain("ScenarioDiplomacy");
    const restored = await createGameRunnerFromSnapshot(
      g.start,
      bytes,
      undefined,
      g.files,
      () => {},
    );
    const rd = scenarioDiplomacy(restored.game);
    expect(rd).not.toBeNull();
    expect(rd!.toData()).toEqual(before);
    // snapshot -> restore -> snapshot is byte-identical.
    expect(diffSnapshots(restored.snapshot(), bytes)).toEqual([]);

    // Both play on, past a fade, a computer courting round and the going
    // rate's update; France answers Spain's ask in both.
    const answer: (Intent & { clientID: string })[] = [
      {
        type: "scenario_join_reply",
        other: spain.id(),
        accept: true,
        clientID: "HUMAN003",
      },
    ];
    tick(g.runner, answer);
    tick(restored, answer);
    for (let i = 0; i < 400; i++) {
      tick(g.runner);
      tick(restored);
    }
    expect(rd!.toData()).toEqual(d!.toData());
    expect(hash(restored.game)).toBe(hash(g.game));
    expect(
      restored.game
        .allPlayers()
        .find((p) => p.name().startsWith("Spain"))
        ?.team(),
    ).toBe(spain.team());
    expect(spain.team()).toBe("Allies");
    expect(diffSnapshots(restored.snapshot(), g.runner.snapshot())).toEqual([]);
  }, 300_000);
});
