// SITE (r19): Derp Land's /derpy/api/live: the games of both kinds being
// played now that anyone may watch. No account (or database) needed, and the
// list is made at most every couple of seconds however many pages ask.

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { LiveRoom } from "../../src/conquest/Protocol";
import type { LiveFrontGame } from "../../src/derpland/LiveTypes";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
const { forgetLiveGames, liveGames, LIVE_CACHE_MS, setLiveSources } =
  await import("../../src/server/derpy/LiveGames");

const front: LiveFrontGame = {
  game: "derpyfront",
  id: "abcd1234",
  map: "World",
  mapKey: "world",
  mode: "Free For All",
  private: false,
  startedAt: 1_000,
  players: 6,
  playersLeft: 4,
  watchers: 1,
  full: false,
};
const room: LiveRoom = {
  watchId: "w-1",
  title: "The Drackleys, from 1650",
  open: true,
  solo: false,
  year: 1661,
  date: "3 May 1661",
  difficulty: "normal",
  startedAt: 2_000,
  paused: false,
  players: [
    {
      name: "Alden",
      character: "Alden Drackley",
      origin: "england",
      online: true,
    },
  ],
  watchers: 0,
  full: false,
};

describe("the games being played now (SITE r19)", () => {
  let server: http.Server;
  let base = "";
  const asked = { front: 0, conquest: 0 };

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    setLiveSources({
      derpyfront: () => {
        asked.front++;
        return [front];
      },
      conquest: () => {
        asked.conquest++;
        return [room];
      },
    });
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  test("served to anyone, with no accounts set up", async () => {
    forgetLiveGames();
    const res = await fetch(`${base}/live`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.derpyfront).toEqual([front]);
    expect(body.conquest).toEqual([room]);
    expect(typeof body.serverTime).toBe("number");
    // The rest of the API still needs its database.
    expect((await fetch(`${base}/leaderboard`)).status).toBe(503);
  });

  test("made at most every couple of seconds, however many ask", () => {
    forgetLiveGames();
    asked.front = asked.conquest = 0;
    const t = 1_000_000;
    liveGames(t);
    liveGames(t + 10);
    liveGames(t + LIVE_CACHE_MS - 1);
    expect(asked).toEqual({ front: 1, conquest: 1 });
    liveGames(t + LIVE_CACHE_MS);
    expect(asked).toEqual({ front: 2, conquest: 2 });
  });
});
