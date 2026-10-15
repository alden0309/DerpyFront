import { GameAwards } from "@openfront/engine-api/game/Awards";
import { GameType } from "@openfront/engine-api/game/GameTypes";
import { Winner } from "@openfront/engine-api/Schemas";
import { PartialGameRecord } from "@openfront/shared/WireSchemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "../../src/server/Client";
import { defaultGameServerDeps } from "../../src/server/GameServer";
import { winnerReplayMetrics } from "../../src/server/WinnerReplay";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// Derpy Front (r24): upstream settles a disputed or one-IP winner vote by
// replaying the whole game on the server. Our server doesn't: the vote's
// result is saved straight away, as it was before upstream's replays.
describe("Derpy Front: no server-side winner replays", () => {
  const A = cid("alice");
  const B = cid("bob");
  const C = cid("carol");
  let archive: ReturnType<
    typeof vi.fn<(r: PartialGameRecord, awards?: GameAwards) => Promise<void>>
  >;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    archive = vi.fn(async () => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function play(ids: string[], ips?: string[]) {
    const game = makeGame({
      config: { gameType: GameType.Public },
      deps: { archive, replayWinner: null },
    });
    const clients = ids.map((clientID, i) =>
      makeClient({
        clientID,
        ip: ips?.[i] ?? `1.1.1.${i + 1}`,
        publicId: `pub-${clientID}`,
      }),
    );
    clients.forEach((c) => game.joinClient(c));
    startGame(game);
    return { game, clients };
  }

  const vote = (client: Client, winner: Winner) =>
    mockWsOf(client).emit({ type: "winner", winner, allPlayersStats: {} });
  const archived = () => archive.mock.calls.map(([record]) => record);

  it("is off by default", () => {
    expect(defaultGameServerDeps().replayWinner).toBeNull();
  });

  it("saves a split vote's majority straight away", async () => {
    const before = { ...winnerReplayMetrics.outcomes };
    const { clients } = play([A, B, C]);
    await vote(clients[2], ["player", C]);
    await vote(clients[0], ["player", A]);
    await vote(clients[1], ["player", A]);

    await vi.waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    expect(archived()[0].info.winner).toEqual(["player", A]);
    // Two IPs sent it.
    expect(archived()[0].info.statsAgreed).toBe(true);
    // Nothing was replayed, skipped or failed.
    expect(winnerReplayMetrics.outcomes).toEqual(before);
  });

  it("saves a one-IP vote unconfirmed", async () => {
    const { clients } = play([A]);
    await vote(clients[0], ["player", A]);

    await vi.waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    expect(archived()[0].info.winner).toEqual(["player", A]);
    expect(archived()[0].info.statsAgreed).toBe(false);
  });
});
