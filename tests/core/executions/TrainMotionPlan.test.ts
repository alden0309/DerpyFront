import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { unpackMotionPlans } from "@openfront/engine-lib/game/MotionPlans";
import { TrainExecution } from "@openfront/engine/execution/TrainExecution";
import { Railroad } from "@openfront/engine/game/Railroad";
import { TrainStation } from "@openfront/engine/game/TrainStation";
import { describe, expect, it } from "vitest";
import { MotionPlanResolver } from "../../../src/client/view/MotionPlanResolver";
import { setup } from "../../util/Setup";

// Derpy Front (r24): the client draws trains from the motion plan the engine
// records when a train sets off. A train starting on a tile that isn't the
// first rail tile (its station's own tile) used to be drawn one tile behind
// where the game had it, cars included. Played tick by tick here, the client's
// positions must be the game's.
async function trainOnRails(opts: { stationOnRails: boolean }) {
  const game = await setup("plains", { instantBuild: true }, [
    new PlayerInfo("p1", PlayerType.Human, null, "p1"),
  ]);
  const player = game.player("p1")!;
  const tiles = Array.from({ length: 24 }, (_, i) => (i + 1) as TileRef);
  tiles.forEach((tile) => player.conquer(tile));

  const first = tiles[0];
  const last = tiles[tiles.length - 1];
  const stationA = new TrainStation(
    game,
    player.buildUnit(UnitType.City, first, {}),
  );
  const stationB = new TrainStation(
    game,
    player.buildUnit(UnitType.City, last, {}),
  );
  const net = game.railNetwork();
  net.stationManager().addStation(stationA);
  net.stationManager().addStation(stationB);
  // Rails from next to station A to next to station B, or through both.
  const rails = opts.stationOnRails ? tiles : tiles.slice(1, -1);
  const railroad = new Railroad(stationA, stationB, rails, 1);
  stationA.addRailroad(railroad);
  stationB.addRailroad(railroad);

  // Drop whatever was recorded while setting up.
  game.drainPackedMotionPlans();
  const exec = new TrainExecution(net, player, stationA, stationB, 3);
  exec.init(game, 0);
  expect(exec.isActive()).toBe(true);
  return { game, player, exec, start: first, rails };
}

async function playAndCompare(opts: { stationOnRails: boolean }) {
  const { game, player, exec, start, rails } = await trainOnRails(opts);
  const packed = game.drainPackedMotionPlans();
  expect(packed).not.toBeNull();
  const records = unpackMotionPlans(packed!);
  expect(records).toHaveLength(1);
  const plan = records[0];
  if (plan.kind !== "train") throw new Error("expected a train plan");
  // Off the station's own tile, the train starts on it.
  expect(plan.path[0]).toBe(start);
  expect(rails[0] === start).toBe(opts.stationOnRails);

  const units = new Map(player.units(UnitType.Train).map((u) => [u.id(), u]));
  const ids = [plan.engineUnitId, ...plan.carUnitIds.filter((id) => id !== 0)];
  expect(ids.every((id) => units.has(id))).toBe(true);

  // What the client shows, starting where the units were built.
  const shown = new Map(ids.map((id) => [id, units.get(id)!.tile()]));
  const resolver = new MotionPlanResolver();
  resolver.applyRecords(records);
  const view = {
    tileOf: (id: number) => shown.get(id),
    move: (id: number, tile: number) => shown.set(id, tile),
    rest: () => {},
  };

  let moves = 0;
  // The engine runs tick k; its update carries tick k + 1 (GameRunner).
  for (let tick = 1; tick < 40; tick++) {
    exec.tick(tick);
    if (!exec.isActive()) break;
    resolver.advance(tick + 1, view);
    for (const id of ids) {
      expect(shown.get(id), `unit ${id} after tick ${tick}`).toBe(
        units.get(id)!.tile(),
      );
    }
    moves++;
  }
  // It really went down the line (and arrived).
  expect(moves).toBeGreaterThan(5);
  expect(exec.isActive()).toBe(false);
}

describe("Derpy Front: trains drawn where the game has them", () => {
  it("leaving from a station's own tile, next to the rails", async () => {
    await playAndCompare({ stationOnRails: false });
  });

  it("leaving from a station on the rails", async () => {
    await playAndCompare({ stationOnRails: true });
  });
});
