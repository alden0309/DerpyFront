// FRIENDS (r25): a password a host may give a DerpyFront lobby. Every lobby
// is open to anyone; one with a password takes its host, those already in
// it, those who gave the password (POST /api/game/:id/unlock, before the
// join) and those who came by an invite's pass. The password lives only on
// the server: nothing a client is sent carries it.

import { GameEnv } from "@openfront/shared/configuration/Env";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { GameManager } from "../../src/server/GameManager";
import type { GameServer } from "../../src/server/GameServer";
import { ServerEnv } from "../../src/server/ServerEnv";
import {
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// Whether the server has accounts, and which account plays under which id.
const accounts = vi.hoisted(() => ({
  db: false,
  of: new Map<string, number>(),
}));
vi.mock("../../src/server/derpy/DerpyDb", async (orig) => ({
  ...(await orig<typeof import("../../src/server/derpy/DerpyDb")>()),
  derpyDbConfigured: () => accounts.db,
}));
vi.mock("../../src/server/derpy/DerpyAuth", async (orig) => ({
  ...(await orig<typeof import("../../src/server/derpy/DerpyAuth")>()),
  accountsForPlayIds: vi.fn(async (ids: string[]) => {
    const out = new Map<string, number>();
    for (const id of ids) {
      const a = accounts.of.get(id);
      if (a !== undefined) out.set(id.toLowerCase(), a);
    }
    return out;
  }),
}));

const K = await import("../../src/server/derpy/LobbyLock");
const { registerLobbyLockRoutes } =
  await import("../../src/server/derpy/LobbyLockRoutes");
const P = await import("../../src/server/derpy/Presence");

const SECRET = "Banana-Sekrit-42";
const HOST = "11111111-1111-4111-8111-111111111111";
const PAT = "22222222-2222-4222-8222-222222222222";
const GARY = "33333333-3333-4333-8333-333333333333";
const MIKE = "44444444-4444-4444-8444-444444444444";

describe("LobbyLock", () => {
  test("a password: trimmed, 1 to 40 characters", () => {
    expect(K.cleanPassword("  banana  ")).toBe("banana");
    expect(K.cleanPassword("")).toBeNull();
    expect(K.cleanPassword("   ")).toBeNull();
    expect(K.cleanPassword("x".repeat(40))).toBe("x".repeat(40));
    expect(K.cleanPassword("x".repeat(41))).toBeNull();
    expect(K.cleanPassword(42)).toBeNull();
    expect(K.cleanPassword(undefined)).toBeNull();
  });

  test("checks the password, lets in those who gave it, and shows only that there is one", () => {
    const lock = new K.LobbyLock();
    expect(lock.locked).toBe(false);
    expect(lock.admits("anyone")).toBe(true);
    lock.set(SECRET);
    expect(lock.locked).toBe(true);
    expect(lock.check(SECRET)).toBe(true);
    expect(lock.check("banana-sekrit-42")).toBe(false);
    expect(lock.check("")).toBe(false);
    expect(lock.admits("pat")).toBe(false);
    lock.admit("pat");
    expect(lock.admits("pat")).toBe(true);
    expect(lock.admits("gary")).toBe(false);
    // Anything made of it says only whether there is one.
    expect(JSON.stringify(lock)).toBe('{"locked":true}');
    expect(JSON.stringify({ ...lock })).not.toContain(SECRET);
    // A new password is a new one.
    lock.set("another");
    expect(lock.check(SECRET)).toBe(false);
    expect(lock.check("another")).toBe(true);
    lock.set(null);
    expect(lock.locked).toBe(false);
    expect(lock.admits("gary")).toBe(true);
  });

  test("a pass is for one account, into one lobby of one game, for a while", () => {
    const now = 1_800_000_000_000;
    const pass = K.mintPass("derpyfront", "AbCd1234", 7, now);
    expect(K.readPass(pass, "derpyfront", "AbCd1234", now)).toBe(7);
    expect(K.readPass(pass, "derpyfront", "AbCd1234", now + 29 * 60_000)).toBe(
      7,
    );
    // Run out.
    expect(
      K.readPass(pass, "derpyfront", "AbCd1234", now + 36 * 60_000),
    ).toBeNull();
    // Another lobby's, or Conquest's.
    expect(K.readPass(pass, "derpyfront", "ZyXw9876", now)).toBeNull();
    expect(K.readPass(pass, "conquest", "AbCd1234", now)).toBeNull();
    // Someone else's account written in: the signature no longer fits.
    const [, exp, sig] = pass.split(".");
    expect(
      K.readPass(
        `${(8).toString(36)}.${exp}.${sig}`,
        "derpyfront",
        "AbCd1234",
        now,
      ),
    ).toBeNull();
    expect(K.readPass(`${pass}x`, "derpyfront", "AbCd1234", now)).toBeNull();
    expect(K.readPass("", "derpyfront", "AbCd1234", now)).toBeNull();
    expect(K.readPass(null, "derpyfront", "AbCd1234", now)).toBeNull();
    // The same link from one look at who's online to the next (its time
    // is rounded to five minutes).
    const t = now + 60_000;
    expect(K.mintPass("derpyfront", "AbCd1234", 7, t + 15_000)).toBe(
      K.mintPass("derpyfront", "AbCd1234", 7, t),
    );
  });

  test("guesses are limited per address and lobby, and per lobby", () => {
    K.GUESSES.clear();
    K.LOBBY_GUESSES.clear();
    for (let i = 0; i < 8; i++) expect(K.mayGuess("1.2.3.4", "L1")).toBe(true);
    expect(K.mayGuess("1.2.3.4", "L1")).toBe(false);
    // Another address, or another lobby, still may.
    expect(K.mayGuess("5.6.7.8", "L1")).toBe(true);
    expect(K.mayGuess("1.2.3.4", "L2")).toBe(true);
    // Many addresses at one lobby: stopped all the same.
    for (let i = 0; i < 40; i++) K.mayGuess(`9.9.9.${i}`, "L3");
    expect(K.mayGuess("8.8.8.8", "L3")).toBe(false);
    K.GUESSES.clear();
    K.LOBBY_GUESSES.clear();
  });
});

describe("a DerpyFront lobby with a password", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout"] });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("its join takes the host, those let in, and those already in it; not anyone else", () => {
    const game = makeGame({ creatorPersistentID: HOST });
    expect(game.needsPassword()).toBe(false);
    expect(game.joinClient(makeClient({ persistentID: PAT }))).toBe("joined");

    game.lobbyLock.set(SECRET);
    expect(game.needsPassword()).toBe(true);
    // Not given: refused.
    const gary = makeClient({ persistentID: GARY });
    expect(game.joinClient(gary)).toBe("locked");
    expect(game.numClients()).toBe(1);
    // Not as a watcher either, while it's a lobby.
    expect(
      game.joinClient(makeClient({ persistentID: MIKE, spectator: true })),
    ).toBe("locked");
    // The host always.
    expect(game.joinClient(makeClient({ persistentID: HOST }))).toBe("joined");
    // Pat was in it before the password: back in after a reload.
    expect(game.joinClient(makeClient({ persistentID: PAT }))).toBe("joined");
    // Gary gives it (the unlock route marks him let in).
    game.lobbyLock.admit(GARY);
    expect(game.joinClient(makeClient({ persistentID: GARY }))).toBe("joined");
    // Taken away: anyone again.
    game.lobbyLock.set(null);
    expect(game.joinClient(makeClient({ persistentID: MIKE }))).toBe("joined");
  });

  test("once the game has begun, the password no longer stands in the way of watching", () => {
    const game = makeGame({ creatorPersistentID: HOST });
    game.joinClient(makeClient({ persistentID: HOST }));
    game.lobbyLock.set(SECRET);
    startGame(game);
    expect(game.needsPassword()).toBe(false);
  });

  test("nothing a client is sent carries it", () => {
    const game = makeGame({ creatorPersistentID: HOST });
    const host = makeClient({ persistentID: HOST });
    game.joinClient(host);
    game.lobbyLock.set(SECRET);
    game.lobbyLock.admit(PAT);
    const pat = makeClient({ persistentID: PAT });
    game.joinClient(pat);
    expect(JSON.stringify(game.gameInfo())).not.toContain(SECRET);
    expect(JSON.stringify(game.gameConfig)).not.toContain(SECRET);
    expect(JSON.stringify(mockWsOf(host).sent())).not.toContain(SECRET);
    expect(JSON.stringify(mockWsOf(pat).sent())).not.toContain(SECRET);
  });

  test("who's online shows a lock on it (from the workers' word), never its id or password", () => {
    K.setFrontLocks(() => new Set(["AbCd1234"]));
    try {
      const place = P.placeOf({
        k: "df-lobby",
        id: "AbCd1234",
        lobby: "private",
      });
      expect(place).toEqual({ k: "df-lobby", lobby: "private", locked: true });
      expect(
        P.placeOf({ k: "df-lobby", id: "ZyXw9876", lobby: "private" }),
      ).toEqual({ k: "df-lobby", lobby: "private" });
    } finally {
      K.setFrontLocks(() => new Set());
    }
  });
});

describe("the password and unlock routes", () => {
  let server: http.Server;
  let base = "";
  const games = new Map<string, GameServer>();
  let game: GameServer;
  const ID = "AbCd1234";

  async function post(
    path: string,
    body: unknown,
    token?: string,
  ): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : {}, text };
  }
  const unlock = (body: unknown, who = GARY) =>
    post(`/api/game/${ID}/unlock`, body, who);
  const setPassword = (password: unknown, who = HOST) =>
    post(`/api/game/${ID}/password`, { password }, who);

  beforeAll(async () => {
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Dev);
    const app = express();
    app.use(express.json());
    const gm = {
      game: (id: string) => games.get(id) ?? null,
    } as unknown as GameManager;
    registerLobbyLockRoutes(app, gm);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    K.GUESSES.clear();
    K.LOBBY_GUESSES.clear();
    accounts.db = false;
    accounts.of.clear();
    game = makeGame({ id: ID, creatorPersistentID: HOST });
    game.joinClient(makeClient({ persistentID: HOST }));
    games.set(ID, game);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise((r) => server.close(r));
  });

  test("only its host gives it a password, before it begins", async () => {
    expect((await setPassword(SECRET, "")).status).toBe(401);
    expect((await setPassword(SECRET, PAT)).json).toEqual({
      error: "not_host",
    });
    expect((await setPassword("")).json).toEqual({ error: "invalid" });
    expect((await setPassword("x".repeat(41))).json).toEqual({
      error: "invalid",
    });
    expect(
      (await post(`/api/game/Nope0000/password`, { password: SECRET }, HOST))
        .status,
    ).toBe(404);
    const set = await setPassword(SECRET);
    expect(set.status).toBe(200);
    // The answer says only that there is one.
    expect(set.json).toEqual({ locked: true });
    expect(set.text).not.toContain(SECRET);
    expect(game.needsPassword()).toBe(true);
    // Taken away.
    expect((await setPassword(null)).json).toEqual({ locked: false });
    expect(game.needsPassword()).toBe(false);
  });

  test("missing, wrong and right passwords", async () => {
    await setPassword(SECRET);
    // Missing.
    const none = await unlock({});
    expect(none.status).toBe(403);
    expect(none.json).toEqual({ error: "password_required" });
    expect(game.joinClient(makeClient({ persistentID: GARY }))).toBe("locked");
    // Wrong.
    const wrong = await unlock({ password: "banana" });
    expect(wrong.status).toBe(403);
    expect(wrong.json).toEqual({ error: "wrong_password" });
    expect(wrong.text).not.toContain(SECRET);
    expect(game.joinClient(makeClient({ persistentID: GARY }))).toBe("locked");
    // Right (spaces around it don't matter).
    const right = await unlock({ password: `  ${SECRET} ` });
    expect(right.status).toBe(200);
    expect(right.json).toEqual({ ok: true });
    expect(game.joinClient(makeClient({ persistentID: GARY }))).toBe("joined");
    // Let in once is let in: asking again needs nothing.
    expect((await unlock({})).json).toEqual({ ok: true });
    // The host never needs it; a lobby without one asks nothing.
    expect((await unlock({}, HOST)).json).toEqual({ ok: true });
    await setPassword(null);
    expect((await unlock({}, MIKE)).json).toEqual({ ok: true });
    // Signed out: no.
    await setPassword(SECRET);
    expect((await unlock({ password: SECRET }, "")).status).toBe(401);
  });

  test("wrong guesses are limited", async () => {
    await setPassword(SECRET);
    for (let i = 0; i < 8; i++)
      expect((await unlock({ password: `guess${i}` })).json).toEqual({
        error: "wrong_password",
      });
    const stopped = await unlock({ password: SECRET });
    expect(stopped.status).toBe(429);
    expect(stopped.json).toEqual({ error: "too_many_tries" });
    expect(game.joinClient(makeClient({ persistentID: GARY }))).toBe("locked");
    // A minute on, they may try again.
    K.GUESSES.clear();
    K.LOBBY_GUESSES.clear();
    expect((await unlock({ password: SECRET })).json).toEqual({ ok: true });
  });

  test("an invite's pass lets its own account in without the password", async () => {
    await setPassword(SECRET);
    accounts.db = true;
    accounts.of.set(GARY, 7);
    accounts.of.set(MIKE, 8);
    const pass = K.mintPass("derpyfront", ID, 7);
    // Someone else holding Gary's pass (playing under another account): no.
    const theirs = await unlock({ pass }, MIKE);
    expect(theirs.json).toEqual({ error: "password_required" });
    // Another lobby's pass, or Conquest's: no.
    expect(
      (await unlock({ pass: K.mintPass("derpyfront", "ZyXw9876", 7) })).json,
    ).toEqual({ error: "password_required" });
    expect(
      (await unlock({ pass: K.mintPass("conquest", ID, 7) })).json,
    ).toEqual({ error: "password_required" });
    // Gary's own: in, without typing anything.
    const mine = await unlock({ pass });
    expect(mine.json).toEqual({ ok: true });
    expect(game.joinClient(makeClient({ persistentID: GARY }))).toBe("joined");
    expect(game.joinClient(makeClient({ persistentID: MIKE }))).toBe("locked");
  });

  test("without accounts (a server with no database) the signed pass alone", async () => {
    await setPassword(SECRET);
    accounts.db = false;
    expect(
      (await unlock({ pass: K.mintPass("derpyfront", ID, 7) })).json,
    ).toEqual({ ok: true });
  });
});
