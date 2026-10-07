import type { GameStartInfo } from "@openfront/engine-api/Schemas";
import { EventBus } from "@openfront/shared/EventBus";
import type { ClientMessage } from "@openfront/shared/WireSchemas";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Auth", () => ({
  getPersistentID: vi.fn(() => "123e4567-e89b-12d3-a456-426614174000"),
  setLocalPersistentID: vi.fn(),
}));

vi.mock("src/client/ClientEnv", () => ({
  ClientEnv: {
    turnIntervalMs: vi.fn(() => 100),
    gitCommit: vi.fn(() => "DEV"),
  },
}));

import { LocalServer } from "../../src/client/LocalServer";

// jsdom doesn't provide CompressionStream; use Node's implementation.
if (typeof globalThis.CompressionStream === "undefined") {
  const streamWeb = await import("node:stream/web");
  (globalThis as any).CompressionStream = streamWeb.CompressionStream;
}

const CLIENT_ID = "abCD1234";

function makeGameStartInfo(): GameStartInfo {
  return {
    gameID: "gameID12",
    lobbyCreatedAt: 1000,
    config: {
      gameMap: "Africa",
      difficulty: "Medium",
      donateGold: false,
      donateTroops: false,
      gameType: "Singleplayer",
      gameMode: "Free For All",
      gameMapSize: "Normal",
      nations: "default",
      bots: 400,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
    players: [
      {
        clientID: CLIENT_ID,
        username: "TestUser",
        clanTag: null,
      },
    ],
  } as GameStartInfo;
}

function makeServer(isReplay: boolean): LocalServer {
  const server = new LocalServer(
    {
      gameStartInfo: makeGameStartInfo(),
      playerName: "TestUser",
      playerClanTag: null,
    } as any,
    isReplay,
    new EventBus(),
  );
  server.updateCallback(
    () => {},
    () => {},
  );
  return server;
}

const winnerMsg: ClientMessage = {
  type: "winner",
  winner: ["player", CLIENT_ID],
  allPlayersStats: { [CLIENT_ID]: { attacks: [100n] } },
  awards: [{ kind: "mvp", name: "TestUser", clientID: CLIENT_ID, value: 300 }],
};

// Derpy Front saves singleplayer games to the signed-in account.
// Gzipped normally; plain JSON when sent with keepalive as the page unloads.
function uploaded(call: any) {
  const body = call[1].body as ArrayBuffer | string;
  if (typeof body === "string") return JSON.parse(body);
  return JSON.parse(gunzipSync(Buffer.from(body)).toString());
}

function archivedRecord(call: any) {
  return uploaded(call).record;
}

const saved = () =>
  new Response(JSON.stringify({ coins: 160 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("LocalServer archiving", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => saved());
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("derpy_session_token", "session-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("archives at win time, without keepalive, and not again at endGame", async () => {
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/derpy/api/games/singleplayer");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(false);
    expect(init.headers.Authorization).toBe("Bearer session-token");
    expect(init.headers["Content-Encoding"]).toBe("gzip");

    expect(uploaded(fetchMock.mock.calls[0]).awards).toEqual(winnerMsg.awards);
    const record = archivedRecord(fetchMock.mock.calls[0]);
    expect(record.info.winner).toEqual(["player", CLIENT_ID]);
    expect(record.info.players[0].clientID).toBe(CLIENT_ID);

    // Exiting afterwards must not archive the same game twice.
    server.endGame();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries at endGame with keepalive when the win-time upload failed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Let the failed attempt settle so it is no longer in flight.
    await new Promise((r) => setTimeout(r, 0));

    server.endGame();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, init] = fetchMock.mock.calls[1];
    expect(init.keepalive).toBe(true);
    expect(archivedRecord(fetchMock.mock.calls[1]).info.winner).toEqual([
      "player",
      CLIENT_ID,
    ]);
  });

  it("does not start a second upload while one is in flight", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((r) => (resolveFetch = r)),
    );
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Exit while the win-time upload is still pending.
    server.endGame();
    resolveFetch(saved());
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still archives at endGame when the game had no winner", async () => {
    const server = makeServer(false);
    server.start();

    server.endGame();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.keepalive).toBe(true);
    expect(archivedRecord(fetchMock.mock.calls[0]).info.winner).toBeUndefined();
  });

  it("doesn't upload anything when nobody is signed in", async () => {
    localStorage.clear();
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    server.endGame();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never archives replays", async () => {
    const server = makeServer(true);
    server.start();

    server.onMessage(winnerMsg);
    server.endGame();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
