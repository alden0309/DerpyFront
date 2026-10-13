// SITE (r19): watching a DerpyFront game from Derp Land. Whoever arrives
// after a game has begun comes to watch: a spectator with no input and no
// vote, who doesn't count as a player. Public games can be watched; a
// private game only if its host allows watchers ("Allow watchers", off by
// default). Players see how many watch; there's a cap; a watcher never keeps
// a game nobody plays going, and a game nobody watches sends nothing extra.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameType } from "@openfront/engine-api/game/GameTypes";
import { createGameWireContext } from "@openfront/shared/ZbinWire";
import { applyGameConfigPatch } from "../../src/server/ConfigPatch";
import { GamePhase, MAX_WATCHERS } from "../../src/server/GameServer";
import { MasterLobbyService } from "../../src/server/MasterLobbyService";
import {
  cid,
  makeClient,
  makeGame,
  mockLogger,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

const player = (tag: string) =>
  makeClient({ clientID: cid(tag), persistentID: `${tag}-pid` });

/** Counts the "watchers" frames a client was sent, newest last. */
function watcherCounts(c: ReturnType<typeof makeClient>, ids: string[]) {
  const ctx = createGameWireContext(ids.map((clientID) => ({ clientID })));
  return mockWsOf(c)
    .sent(ctx)
    .flatMap((m) => (m.type === "watchers" ? [m.count] : []));
}

describe("watching a DerpyFront game (SITE r19)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const publicGame = () =>
    makeGame({
      config: { gameType: GameType.Public },
      publicGameType: "ffa",
    });
  const privateGame = (allowWatchers?: boolean) =>
    makeGame({ config: { gameType: GameType.Private, allowWatchers } });

  it("anyone can watch a public game once it has begun: no seat, no say", async () => {
    const game = publicGame();
    const p1 = player("p1");
    const p2 = player("p2");
    game.joinClient(p1);
    game.joinClient(p2);
    startGame(game);
    vi.advanceTimersByTime(10_000);

    const w = player("w1");
    expect(game.joinClient(w)).toBe("joined");
    expect(w.spectator).toBe(true);
    expect(w.watcher).toBe(true);
    // Not a player: the game began with two, and the player list is theirs.
    expect(game.numPlayers()).toBe(2);
    const start = mockWsOf(w)
      .sent()
      .find((m) => m.type === "start");
    expect(start?.type === "start" && start.gameStartInfo.players.length).toBe(
      2,
    );
    // No input: an intent from a watcher never reaches the game.
    const handleIntent = vi.spyOn(game, "handleIntent");
    await mockWsOf(w).emit({
      type: "intent",
      intent: { type: "spawn", tile: 1 },
    });
    expect(handleIntent).not.toHaveBeenCalled();
    // Players see "1 watching", and so does the watcher.
    const ids = [cid("p1"), cid("p2")];
    expect(watcherCounts(p1, ids)).toEqual([1]);
    expect(watcherCounts(w, ids)).toEqual([1]);

    // A second comes and the first goes: everyone hears each change.
    const w2 = player("w2");
    game.joinClient(w2);
    await mockWsOf(w).trigger("close");
    expect(watcherCounts(p1, ids)).toEqual([1, 2, 1]);
  });

  it("a game nobody watches sends nothing extra", () => {
    const game = publicGame();
    const p1 = player("p3");
    game.joinClient(p1);
    startGame(game);
    vi.advanceTimersByTime(5_000);
    expect(watcherCounts(p1, [cid("p3")])).toEqual([]);
  });

  it("a private game can be watched only if its host allows watchers", () => {
    const closed = privateGame();
    closed.joinClient(player("p4"));
    startGame(closed);
    vi.advanceTimersByTime(10_000);
    const w = player("w3");
    expect(closed.joinClient(w)).toBe("watch_closed");
    expect(closed.numClients()).toBe(1);
    expect(closed.isWatchable()).toBe(false);
    // Staff can still look in.
    const admin = makeClient({ clientID: cid("adm1"), role: "admin" });
    expect(closed.joinClient(admin)).toBe("joined");

    const open = privateGame(true);
    open.joinClient(player("p5"));
    startGame(open);
    vi.advanceTimersByTime(10_000);
    expect(open.isWatchable()).toBe(true);
    expect(open.joinClient(player("w4"))).toBe("joined");
  });

  it("the host turns it on in the lobby; it never reaches the simulation", () => {
    const config = { gameType: GameType.Private } as Parameters<
      typeof applyGameConfigPatch
    >[0];
    applyGameConfigPatch(config, { allowWatchers: true });
    expect(config.allowWatchers).toBe(true);

    const game = privateGame();
    const host = player("p6");
    game.joinClient(host);
    game.updateGameConfig({ allowWatchers: true });
    startGame(game);
    const start = mockWsOf(host)
      .sent()
      .find((m) => m.type === "start");
    expect(start?.type).toBe("start");
    if (start?.type !== "start") return;
    expect(start.gameStartInfo.config.allowWatchers).toBeUndefined();
    expect(game.isWatchable()).toBe(true);
  });

  it("spectators who were in the lobby still watch a private game", () => {
    // Choosing to watch from inside the lobby is the host's own guests: only
    // newcomers after the start need the host's say-so.
    const game = privateGame();
    game.joinClient(player("p7"));
    const cast = makeClient({ clientID: cid("cast1"), spectator: true });
    expect(game.joinClient(cast)).toBe("joined");
    startGame(game);
    expect(cast.watcher).toBe(false);
    expect(watcherCounts(cast, [cid("p7")])).toEqual([1]);
  });

  it("there's a cap on watchers", () => {
    const game = publicGame();
    game.joinClient(player("p8"));
    startGame(game);
    vi.advanceTimersByTime(10_000);
    const ws = [];
    for (let i = 0; i < MAX_WATCHERS; i++) {
      const w = makeClient();
      expect(game.joinClient(w)).toBe("joined");
      ws.push(w);
    }
    expect(game.joinClient(makeClient())).toBe("watch_full");
    expect(game.liveInfo()).toMatchObject({
      watchers: MAX_WATCHERS,
      full: true,
    });
    // A watcher whose connection blips comes back in their own place.
    expect(game.rejoinClient(mockWsOf(ws[0]) as any, ws[0].persistentID)).toBe(
      true,
    );
  });

  it("a watcher never keeps a game nobody plays going", async () => {
    const game = publicGame();
    const p = player("p9");
    game.joinClient(p);
    startGame(game);
    vi.advanceTimersByTime(10_000);
    const w = player("w5");
    game.joinClient(w);
    await mockWsOf(p).trigger("close");
    // The watcher stays connected and keeps pinging...
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(1_000);
      await mockWsOf(w).emit({ type: "ping", sentAt: Date.now() });
      game.pruneStaleClients();
    }
    // ...but nobody's playing, so the game is reaped as if empty.
    expect(game.phase()).toBe(GamePhase.Finished);
  });

  it("tells Derp Land's front page the map, the time in and the players left", () => {
    const game = makeGame({
      config: { gameType: GameType.Public },
      publicGameType: "ffa",
      id: cid("live1"),
    });
    expect(game.liveInfo()).toBeNull(); // not begun
    game.joinClient(player("pa"));
    game.joinClient(player("pb"));
    game.joinClient(player("pc"));
    startGame(game);
    const began = Date.now();
    vi.advanceTimersByTime(60_000);
    expect(game.liveInfo()).toEqual({
      game: "derpyfront",
      id: cid("live1"),
      map: "World",
      mapKey: "world",
      mode: "Free For All",
      private: false,
      startedAt: began,
      players: 3,
      playersLeft: 3,
      watchers: 0,
      full: false,
    });

    // A private game is listed only if its host allows watchers.
    const shut = privateGame();
    shut.joinClient(player("pd"));
    startGame(shut);
    expect(shut.liveInfo()).toBeNull();
    const open = privateGame(true);
    open.joinClient(player("pe"));
    startGame(open);
    expect(open.liveInfo()).toMatchObject({ private: true });
    // A matchmade game is never advertised.
    const ranked = makeGame({ config: { gameType: GameType.Public } });
    ranked.joinClient(player("pf"));
    startGame(ranked);
    expect(ranked.liveInfo()).toBeNull();
  });
});

describe("the master's list of games being played (SITE r19)", () => {
  it("keeps each worker's last report, checks each game, and forgets a dead worker", async () => {
    const { default: EventEmitter } = await import("events");
    const playlist = { gameConfig: vi.fn(async () => ({})) };
    const log = mockLogger();
    const service = new MasterLobbyService(playlist as any, log);
    const w0 = new EventEmitter() as any;
    w0.send = vi.fn();
    service.registerWorker(0, w0);
    const game = {
      game: "derpyfront",
      id: "abcd1234",
      map: "World",
      mapKey: "world",
      mode: "Free For All",
      private: false,
      startedAt: 1000,
      players: 8,
      playersLeft: 5,
      watchers: 2,
      full: false,
    };
    w0.emit("message", {
      type: "lobbyList",
      lobbies: [],
      running: [game, { game: "derpyfront", id: 7 }],
    });
    expect(service.runningGames()).toEqual([game]);
    // A report without the list means nothing changed.
    w0.emit("message", { type: "lobbyList", lobbies: [] });
    expect(service.runningGames()).toEqual([game]);
    w0.emit("message", { type: "lobbyList", lobbies: [], running: [] });
    expect(service.runningGames()).toEqual([]);
    w0.emit("message", { type: "lobbyList", lobbies: [], running: [game] });
    service.removeWorker(0);
    expect(service.runningGames()).toEqual([]);
  });
});
