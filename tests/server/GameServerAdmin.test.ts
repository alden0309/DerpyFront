// ADMIN (r26): what a DerpyFront game does for the owner's admin page: say
// what it is (lobbies, private and matched games too), end for everyone
// with the owner's reason on each screen, and take a suspended account's
// players out (they can't come back in).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GamePhase } from "../../src/server/GameServer";
import {
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

describe("a game, for the admin page", () => {
  test("what it is: a private lobby, its players, no password", () => {
    const game = makeGame({ id: "adm00001" });
    game.joinClient(makeClient({ username: "Pat" }));
    game.joinClient(makeClient({ username: "Sam" }));
    const info = game.adminInfo();
    expect(info).toMatchObject({
      id: "adm00001",
      phase: "lobby",
      kind: "private",
      players: ["Pat", "Sam"],
      watchers: 0,
      locked: false,
      startedAt: null,
    });
    expect(typeof info.mapKey).toBe("string");
  });

  test("ended for everyone: each player is told why, and it's finished", () => {
    const game = makeGame({ id: "adm00002" });
    const a = makeClient();
    const b = makeClient();
    game.joinClient(a);
    game.joinClient(b);
    startGame(game);
    expect(game.adminInfo().phase).toBe("playing");
    game.adminEnd("Cheating reported");
    for (const c of [a, b]) {
      const errors = mockWsOf(c)
        .sent()
        .filter((m) => m.type === "error");
      expect(errors.slice(-1)[0]).toMatchObject({
        type: "error",
        error: "kick_reason.derp_ended",
        message: "Cheating reported",
      });
    }
    expect(game.phase()).toBe(GamePhase.Finished);
    // Twice is nothing more.
    game.adminEnd("again");
    expect(
      mockWsOf(a)
        .sent()
        .filter((m) => m.type === "error"),
    ).toHaveLength(1);
  });

  test("a suspended account's players are taken out, and only theirs", () => {
    const game = makeGame({ id: "adm00003" });
    const pat = makeClient({
      persistentID: "AAAAAAAA-1111-2222-3333-444444444444",
    });
    const sam = makeClient({
      persistentID: "bbbbbbbb-1111-2222-3333-444444444444",
    });
    game.joinClient(pat);
    game.joinClient(sam);
    const n = game.adminKick(new Set(["aaaaaaaa-1111-2222-3333-444444444444"]));
    expect(n).toBe(1);
    expect(
      mockWsOf(pat)
        .sent()
        .filter((m) => m.type === "error")
        .slice(-1)[0],
    ).toMatchObject({ error: "kick_reason.derp_suspended" });
    expect(mockWsOf(pat).close).toHaveBeenCalled();
    expect(mockWsOf(sam).close).not.toHaveBeenCalled();
    expect(game.adminInfo().players).toHaveLength(1);
  });
});
