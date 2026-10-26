// DFX (r26): upstream's public lobby rotation, as Derp Land runs it (dev
// mode: 5 s countdowns, so with nobody on a lobby is made and an old one
// reaped every 2 s), logs at debug, not info. The rotation itself is
// unchanged: a lobby still counts down, and still ends when nobody joined.

import EventEmitter from "events";
import { describe, expect, it, vi } from "vitest";
import { MapPlaylist } from "../../src/server/MapPlaylist";
import { WorkerLobbyService } from "../../src/server/WorkerLobbyService";
import { makeGame, mockLogger } from "../util/GameServerHarness";

describe("public lobby churn in the logs", () => {
  it("a public game made at the master's word is logged at debug", async () => {
    const log = mockLogger();
    const createGame = vi.fn(() => ({}));
    const gm = {
      publicLobbies: vi.fn().mockReturnValue([]),
      listedLobbies: vi.fn().mockReturnValue([]),
      game: vi.fn().mockReturnValue(null),
      activeGames: vi.fn().mockReturnValue(0),
      liveGames: vi.fn().mockReturnValue([]),
      lockedLobbies: vi.fn().mockReturnValue([]),
      createGame,
    };
    const service = new WorkerLobbyService(
      new EventEmitter() as never,
      { handleUpgrade: vi.fn() } as never,
      gm as never,
      log,
    );
    (service as unknown as { sendToMaster: unknown }).sendToMaster = vi.fn();
    const gameConfig = await new MapPlaylist().gameConfig("ffa");
    (
      service as unknown as { handleMasterMessage(m: unknown): void }
    ).handleMasterMessage({
      type: "createGame",
      gameID: "CHURN001",
      gameConfig,
      publicGameType: "ffa",
    });
    // Still made, as upstream makes it.
    expect(createGame).toHaveBeenCalledTimes(1);
    expect(createGame.mock.calls[0]).toContain("CHURN001");
    expect(log.debug).toHaveBeenCalledWith(
      "Creating public game CHURN001 from master",
    );
    expect(log.info).not.toHaveBeenCalled();
  });

  it("a lobby that ends unstarted is logged at debug", async () => {
    const log = mockLogger();
    const game = makeGame({ log });
    await game.end();
    expect(log.debug).toHaveBeenCalledWith(
      "game not started, not archiving game",
    );
    expect(log.info).not.toHaveBeenCalledWith(
      "game not started, not archiving game",
    );
  });
});
