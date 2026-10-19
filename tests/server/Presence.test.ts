// FRIENDS (r25): who's on Derp Land and where (the board in the master's
// memory): beats, staleness, several pages at once, appearing offline, Mr.
// Based never named, and what others are shown of a lobby or a table.

import { describe, expect, test } from "vitest";
import {
  isAt,
  joinHref,
  MAX_TABS_PER_ACCOUNT,
  placeOf,
  PRESENCE_TTL_MS,
  PresenceBoard,
  readClientWhere,
  targetOf,
  watchHref,
  type ConquestWhere,
} from "../../src/server/derpy/Presence";

function board() {
  let now = 1_800_000_000_000;
  const b = new PresenceBoard(() => now);
  return {
    b,
    pass(ms: number) {
      now += ms;
    },
  };
}

describe("the presence board", () => {
  test("a beat puts someone on the site, and it goes stale within about a minute", () => {
    const { b, pass } = board();
    b.learn(1, "Alden");
    b.beat(1, "tabA", { k: "home" });
    expect(b.snapshot().get(1)).toEqual({ k: "home" });
    expect(b.visible(b.snapshot(), 1)).toBe(true);

    // Pages beat every 15 to 30 seconds: still here between beats.
    pass(45_000);
    expect(b.snapshot().has(1)).toBe(true);
    // No beat for longer than the TTL: gone.
    pass(PRESENCE_TTL_MS - 45_000 + 1);
    expect(b.snapshot().has(1)).toBe(false);
    expect(PRESENCE_TTL_MS).toBeLessThanOrEqual(90_000);
  });

  test("a page that closes leaves at once", () => {
    const { b } = board();
    b.learn(1, "Alden");
    b.beat(1, "tabA", { k: "store" });
    b.beat(1, "tabB", { k: "home" });
    b.leave(1, "tabA");
    expect(b.snapshot().get(1)).toEqual({ k: "home" });
    b.leave(1, "tabB");
    expect(b.snapshot().has(1)).toBe(false);
    // Signing out everywhere.
    b.beat(1, "tabC", { k: "home" });
    b.leave(1);
    expect(b.snapshot().has(1)).toBe(false);
  });

  test("with several pages open, the most they're doing shows", () => {
    const { b, pass } = board();
    b.learn(1, "Alden");
    b.beat(1, "menu", { k: "df-menu" });
    b.beat(1, "game", {
      k: "df-game",
      id: "AbCd1234",
      lobby: "public",
      map: "World",
    });
    pass(1000);
    b.beat(1, "menu", { k: "home" });
    expect(b.snapshot().get(1)?.k).toBe("df-game");
    // The game's page closes: the other one shows.
    b.leave(1, "game");
    expect(b.snapshot().get(1)).toEqual({ k: "home" });
    // Two pages doing as much: the one that beat last.
    b.beat(1, "a", { k: "store" });
    pass(1000);
    b.beat(1, "b", { k: "around" });
    expect(b.snapshot().get(1)).toEqual({ k: "around" });
  });

  test("an account keeps only its last few pages", () => {
    const { b, pass } = board();
    b.learn(1, "Alden");
    b.beat(1, "first", {
      k: "df-lobby",
      id: "AbCd1234",
      lobby: "private",
    });
    for (let i = 0; i < MAX_TABS_PER_ACCOUNT; i++) {
      pass(10);
      b.beat(1, `t${i}`, { k: "home" });
    }
    // The first page was pushed out by the newer ones.
    expect(b.snapshot().get(1)).toEqual({ k: "home" });
  });

  test("appearing offline hides you from everyone, and you can come back", () => {
    const { b } = board();
    b.learn(1, "Alden", true);
    b.beat(1, "tab", { k: "home" });
    const snap = b.snapshot();
    // The board still knows (your own pages and your party use it)...
    expect(snap.get(1)).toEqual({ k: "home" });
    // ...but nobody is shown you.
    expect(b.visible(snap, 1)).toBe(false);
    b.setHidden(1, false);
    expect(b.visible(b.snapshot(), 1)).toBe(true);
    // Signing in again elsewhere keeps the choice unless it says otherwise.
    b.setHidden(1, true);
    b.learn(1, "Alden");
    expect(b.hidden(1)).toBe(true);
  });

  test("someone nobody has a name for isn't shown", () => {
    const { b } = board();
    b.beat(7, "tab", { k: "home" });
    expect(b.visible(b.snapshot(), 7)).toBe(false);
  });

  test("a rename shows at the next sign-in", () => {
    const { b } = board();
    b.learn(1, "Alden");
    b.beat(1, "tab", { k: "home" });
    b.learn(1, "Alden_Two");
    expect(b.username(1)).toBe("Alden_Two");
  });

  test("Conquest's tables come from the rooms and outrank a page's word", () => {
    const { b } = board();
    b.learn(1, "Alden");
    b.learn(2, "Pat");
    const table: ConquestWhere = {
      k: "cq-game",
      code: "ABCD",
      joinable: true,
      private: false,
      solo: false,
      year: 1652,
      colony: "Jamestown",
      power: "England",
    };
    b.setDerived(() => new Map([[1, table]]));
    b.beat(1, "tab", { k: "cq-front" });
    b.beat(2, "tab", { k: "home" });
    expect(b.snapshot().get(1)).toEqual(table);
    // A table that's gone from the rooms is gone from the board.
    b.setDerived(() => new Map());
    expect(b.snapshot().get(1)).toEqual({ k: "cq-front" });
    // A source that fails never takes the board down.
    b.setDerived(() => {
      throw new Error("boom");
    });
    expect(b.snapshot().get(2)).toEqual({ k: "home" });
  });
});

describe("what a page may say", () => {
  test("Mr. Based is never named: its pages, and anything unknown, are 'around'", () => {
    expect(readClientWhere({ k: "based" })).toEqual({ k: "around" });
    expect(readClientWhere({ k: "mr-based", chapter: 3 })).toEqual({
      k: "around",
    });
    expect(readClientWhere("Mr. Based")).toEqual({ k: "around" });
    expect(readClientWhere(undefined)).toEqual({ k: "around" });
    expect(readClientWhere({ k: "around" })).toEqual({ k: "around" });
  });

  test("a page can't claim a Conquest table (only the rooms know those)", () => {
    expect(
      readClientWhere({
        k: "cq-game",
        code: "ABCD",
        joinable: true,
        year: 1650,
        colony: "x",
        power: "y",
      }),
    ).toEqual({ k: "around" });
  });

  test("DerpyFront's lobbies and games are read, with their ids checked", () => {
    expect(
      readClientWhere({ k: "df-lobby", id: "AbCd1234", lobby: "private" }),
    ).toEqual({ k: "df-lobby", id: "AbCd1234", lobby: "private" });
    expect(
      readClientWhere({ k: "df-lobby", id: "../x", lobby: "private" }),
    ).toEqual({ k: "around" });
    expect(
      readClientWhere({
        k: "df-game",
        id: "AbCd1234",
        lobby: "solo",
        map: "x".repeat(300),
      }),
    ).toEqual({ k: "around" });
  });
});

describe("lobbies and tables", () => {
  const lobby = {
    k: "df-lobby" as const,
    id: "AbCd1234",
    lobby: "private" as const,
  };

  test("a private or public DerpyFront lobby can be joined; solo can't", () => {
    expect(targetOf(lobby)).toEqual({
      game: "derpyfront",
      id: "AbCd1234",
      private: true,
    });
    expect(targetOf({ ...lobby, lobby: "public" })?.private).toBe(false);
    expect(targetOf({ ...lobby, lobby: "solo" })).toBeNull();
    expect(targetOf({ ...lobby, lobby: "matched" })).toBeNull();
    // A game in progress is watched, not joined.
    expect(
      targetOf({ k: "df-game", id: "AbCd1234", lobby: "public", map: "World" }),
    ).toBeNull();
    expect(joinHref(targetOf(lobby)!)).toBe("/game/AbCd1234");
  });

  test("a Conquest table with a seat free can be joined", () => {
    const room: ConquestWhere = {
      k: "cq-room",
      code: "WXYZ",
      joinable: true,
      private: true,
      solo: false,
    };
    expect(targetOf(room)).toEqual({
      game: "conquest",
      id: "WXYZ",
      private: true,
    });
    expect(targetOf({ ...room, joinable: false })).toBeNull();
    expect(joinHref(targetOf(room)!)).toBe("/conquest?join=WXYZ");
    expect(isAt(room, targetOf(room)!)).toBe(true);
    expect(isAt({ k: "home" }, targetOf(room)!)).toBe(false);
  });

  test("a game in progress may be watched when its server says so", () => {
    const game = {
      k: "df-game" as const,
      id: "AbCd1234",
      lobby: "public" as const,
      map: "World",
    };
    expect(watchHref(game, new Set(["AbCd1234"]))).toBe(
      "/game/AbCd1234?spectate",
    );
    // A singleplayer game (no server), or one closed to watchers.
    expect(watchHref(game, new Set())).toBeUndefined();
    // Someone watching isn't offered to watch them watch.
    expect(
      watchHref({ ...game, watching: true }, new Set(["AbCd1234"])),
    ).toBeUndefined();
    expect(
      watchHref(
        {
          k: "cq-game",
          code: "WXYZ",
          joinable: false,
          private: false,
          solo: false,
          year: 1700,
          colony: "Jamestown",
          power: "England",
          watchId: "w1",
        },
        new Set(),
      ),
    ).toBe("/conquest?watch=w1");
  });

  test("others see where you are, never the lobby id or the table's code", () => {
    expect(placeOf(lobby)).toEqual({ k: "df-lobby", lobby: "private" });
    expect(
      placeOf({
        k: "cq-game",
        code: "WXYZ",
        joinable: true,
        private: true,
        solo: false,
        year: 1652,
        colony: "Jamestown",
        power: "England",
        watchId: "secret",
      }),
    ).toEqual({
      k: "cq-game",
      year: 1652,
      colony: "Jamestown",
      power: "England",
      private: true,
      solo: false,
    });
    expect(
      JSON.stringify(
        placeOf({
          k: "df-game",
          id: "AbCd1234",
          lobby: "public",
          map: "World",
        }),
      ),
    ).not.toContain("AbCd1234");
  });
});
