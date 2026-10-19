// FRIENDS (r25): the page's side of who's online: where a page says it is
// (Mr. Based never named), what DerpyFront reports for its lobbies and
// games, how places read, and the bell's notices.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  derpyJoining,
  derpyLobbyMap,
  derpyPresence,
} from "../../src/client/derpy/DerpyPresence";
import { defaultWhere, social } from "../../src/derpland/Social";
import {
  englishSocial,
  placeText,
  placeTone,
  SOCIAL_TEXT,
} from "../../src/derpland/SocialText";
import type { SocialState } from "../../src/derpland/SocialTypes";

describe("where a page is, until it says", () => {
  test("Mr. Based's pages are only ever 'around Derp Land'", () => {
    expect(defaultWhere("home", "/based")).toEqual({ k: "around" });
    expect(defaultWhere("home", "/based/")).toEqual({ k: "around" });
    expect(defaultWhere("home", "/based/chapter/3")).toEqual({ k: "around" });
    // Nothing a page can say names it.
    expect(JSON.stringify(SOCIAL_TEXT).toLowerCase()).not.toContain("based");
  });

  test("the home page, the store, the games and everything else", () => {
    expect(defaultWhere("home", "/")).toEqual({ k: "home" });
    expect(defaultWhere("store", "/store")).toEqual({ k: "store" });
    expect(defaultWhere("inventory", "/inventory/")).toEqual({ k: "store" });
    expect(defaultWhere("leaderboard", "/leaderboard")).toEqual({
      k: "around",
    });
    expect(defaultWhere("leaderboard", "/player/Pat")).toEqual({
      k: "around",
    });
    expect(defaultWhere("derpyfront", "/game/AbCd1234")).toEqual({
      k: "df-menu",
    });
    expect(defaultWhere("conquest", "/conquest")).toEqual({ k: "cq-front" });
  });
});

describe("DerpyFront says where its player is", () => {
  let said: unknown[] = [];
  beforeEach(() => {
    said = [];
    vi.spyOn(social, "setWhere").mockImplementation((w) => {
      said.push(w);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    derpyPresence({ state: "menu" });
  });
  const last = () => said[said.length - 1];

  test("a private lobby (a link: the map comes with the lobby's details), then the game", () => {
    derpyJoining({ gameID: "AbCd1234" });
    derpyPresence({ state: "lobby" });
    expect(last()).toEqual({ k: "df-lobby", id: "AbCd1234", lobby: "private" });
    derpyLobbyMap("World");
    derpyPresence({ state: "lobby", gameType: "Private" });
    expect(last()).toEqual({
      k: "df-lobby",
      id: "AbCd1234",
      lobby: "private",
      map: "World",
    });
    derpyPresence({ state: "game", gameType: "Private" });
    expect(last()).toEqual({
      k: "df-game",
      id: "AbCd1234",
      lobby: "private",
      map: "World",
    });
    derpyPresence({ state: "menu" });
    expect(last()).toEqual({ k: "df-menu" });
  });

  test("public, solo, matched, watching and replays", () => {
    derpyJoining({ gameID: "Pub12345", source: "public" }, "Europe");
    derpyPresence({ state: "lobby", gameType: "Public" });
    expect(last()).toMatchObject({ k: "df-lobby", lobby: "public" });

    derpyJoining({ gameID: "Solo1234", source: "singleplayer" }, "Oceania");
    derpyPresence({ state: "game", gameType: "Singleplayer" });
    expect(last()).toEqual({
      k: "df-game",
      id: "Solo1234",
      lobby: "solo",
      map: "Oceania",
    });

    derpyJoining({ gameID: "Rank1234", source: "matchmaking" });
    derpyPresence({ state: "lobby", gameType: "Public" });
    expect(last()).toMatchObject({ lobby: "matched" });

    derpyJoining({ gameID: "Watch123" }, "World");
    derpyPresence({ state: "spectating", gameType: "Public" });
    expect(last()).toMatchObject({ k: "df-game", watching: true });

    derpyJoining({ gameID: "Repl1234", gameRecord: {} }, "World");
    derpyPresence({ state: "game", gameType: "Public" });
    expect(last()).toEqual({ k: "df-menu" });
  });

  test("the menu's pages: the store, and setting up a solo game", () => {
    window.dispatchEvent(
      new CustomEvent("showPage", { detail: "page-item-store" }),
    );
    expect(last()).toEqual({ k: "store" });
    window.dispatchEvent(
      new CustomEvent("showPage", { detail: "page-single-player" }),
    );
    expect(last()).toEqual({ k: "df-lobby", lobby: "solo" });
    window.dispatchEvent(new CustomEvent("showPage", { detail: "page-play" }));
    expect(last()).toEqual({ k: "df-menu" });
  });
});

describe("how places read", () => {
  const t = englishSocial;
  test("every place in the list", () => {
    expect(placeText({ k: "home" }, t)).toBe("On the home page");
    expect(placeText({ k: "store" }, t)).toBe("In the store");
    expect(placeText({ k: "around" }, t)).toBe("Around Derp Land");
    expect(placeText({ k: "df-lobby", lobby: "solo" }, t)).toBe(
      "In a DerpyFront lobby (Solo)",
    );
    expect(placeText({ k: "df-lobby", lobby: "private" }, t)).toBe(
      "In a DerpyFront lobby (private)",
    );
    expect(placeText({ k: "df-lobby", lobby: "public" }, t)).toBe(
      "In a DerpyFront lobby (public)",
    );
    expect(placeText({ k: "df-game", lobby: "public", map: "World" }, t)).toBe(
      "Playing DerpyFront: World",
    );
    expect(
      placeText(
        { k: "df-game", lobby: "public", map: "World", watching: true },
        t,
      ),
    ).toBe("Watching DerpyFront: World");
    expect(
      placeText(
        { k: "cq-game", year: 1652, colony: "Jamestown", power: "England" },
        t,
      ),
    ).toBe("Playing Derpy Conquest: 1652, Jamestown (England)");
    expect(placeText({ k: "cq-game", year: 1700 }, t)).toBe(
      "Playing Derpy Conquest: 1700",
    );
    expect(placeText({ k: "cq-room" }, t)).toBe("In a Conquest lobby");
    expect(placeText(null, t)).toBe("Offline");
    expect(placeTone({ k: "cq-game" })).toBe("play");
    expect(placeTone({ k: "df-lobby" })).toBe("lobby");
    expect(placeTone(null)).toBe("off");
  });

  test("DerpyFront's translations have every word", async () => {
    const en = (await import("../../resources/lang/en.json")).default as {
      derp_social: Record<string, string>;
    };
    expect(Object.keys(en.derp_social).sort()).toEqual(
      Object.keys(SOCIAL_TEXT).sort(),
    );
    for (const [k, v] of Object.entries(SOCIAL_TEXT))
      expect(en.derp_social[k]).toBe(v);
  });
});

describe("the bell", () => {
  const state = (over: Partial<SocialState> = {}): SocialState => ({
    serverTime: 0,
    me: {
      id: 1,
      username: "Alden",
      appearOffline: false,
      place: { k: "home" },
      canInvite: false,
    },
    online: [],
    friends: [],
    requests: { incoming: [], outgoing: [] },
    invites: [],
    party: null,
    partyInvites: [],
    ...over,
  });
  const party = {
    id: 9,
    leaderId: 2,
    leading: false,
    members: [],
    invited: [],
    max: 8,
    pull: {
      key: "derpyfront:AbCd1234",
      href: "/game/AbCd1234",
      leader: "Pat",
      place: { k: "df-lobby" as const, lobby: "private" as const },
    },
  };
  afterEach(() => {
    social.state = null;
  });

  test("invites, the party's leader, party invites and friend requests", () => {
    social.state = state({
      party,
      partyInvites: [
        {
          partyId: 4,
          fromId: 3,
          from: "Gary",
          leader: "Gary",
          size: 2,
          at: "x",
        },
      ],
      requests: {
        incoming: [{ id: 5, username: "Kim", at: "y" }],
        outgoing: [],
      },
    });
    expect(social.notices().map((n) => n.kind)).toEqual([
      "pull",
      "party",
      "request",
    ]);
    // Once seen as a toast, not again.
    expect(social.fresh().length).toBe(3);
    expect(social.fresh().length).toBe(0);
    // "Not now" to the leader's lobby: not asked again for it.
    social.notNowTo(social.notices()[0].key);
    expect(social.notices().map((n) => n.kind)).toEqual(["party", "request"]);
  });

  test("the leader who also invited you to the same lobby: one notice", () => {
    social.state = state({
      party: {
        ...party,
        pull: {
          ...party.pull,
          key: "derpyfront:Other123",
          href: "/game/Other123",
        },
      },
      invites: [
        {
          id: 7,
          fromId: 2,
          from: "Pat",
          game: "derpyfront",
          place: { k: "df-lobby", lobby: "private" },
          href: "/game/Other123",
          at: "z",
        },
      ],
    });
    expect(social.notices().map((n) => n.kind)).toEqual(["invite"]);
  });
});
