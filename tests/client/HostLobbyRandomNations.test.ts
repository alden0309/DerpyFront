// DFX (r26): the host lobby's "Random nations": the button deals every
// player in the lobby (not spectators) a seat in one intent, and "Keep
// friends on one side" keeps the host's party (or, with no party, their
// Derp Land friends) together.

import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { EventBus } from "@openfront/shared/EventBus";
import { render } from "lit";
import { afterEach, describe, expect, it } from "vitest";
import { HostLobbyModal } from "../../src/client/HostLobbyModal";
import { SendScenarioDealIntentEvent } from "../../src/client/LobbyEvents";
import { social } from "../../src/derpland/Social";
import type { SocialState } from "../../src/derpland/SocialTypes";

const europe = scenarioData("europe1939")!;
const sideOf = (key: string) => europe.nations.find((n) => n.key === key)!.side;

function state(
  party: string[] | null,
  friends: string[],
  me = "Host_Al",
): SocialState {
  return {
    serverTime: 0,
    me: {
      id: 1,
      username: me,
      appearOffline: false,
      place: null,
      canInvite: true,
    },
    online: [],
    friends: friends.map((username, i) => ({
      id: 100 + i,
      username,
      friend: true,
      place: null,
    })),
    requests: { incoming: [], outgoing: [] },
    invites: [],
    party:
      party === null
        ? null
        : {
            id: 9,
            leaderId: 1,
            leading: true,
            members: party.map((username, i) => ({
              id: 200 + i,
              username,
              leader: i === 0,
              place: null,
            })),
            invited: [],
            max: 8,
          },
    partyInvites: [],
  };
}

function lobby() {
  const modal = new HostLobbyModal();
  const m = modal as unknown as {
    clients: {
      clientID: string;
      username: string;
      clanTag: null;
      spectator?: boolean;
    }[];
    lobbyCreatorClientID: string;
    scenario: { id: string; nation: string };
    keepFriendsTogether: boolean;
    renderRandomNations(pick: { id: string; nation: string }): unknown;
    friendClientIDs(): Set<string>;
  };
  m.lobbyCreatorClientID = "HOSTAAAA";
  m.clients = [
    { clientID: "HOSTAAAA", username: "Host_Al", clanTag: null },
    { clientID: "PATAAAAA", username: "pat", clanTag: null },
    { clientID: "GARYAAAA", username: "Gary", clanTag: null },
    { clientID: "XAAAAAAA", username: "Stranger", clanTag: null },
    { clientID: "YAAAAAAA", username: "Other", clanTag: null },
    {
      clientID: "WATCHAAA",
      username: "Watcher",
      clanTag: null,
      spectator: true,
    },
  ];
  m.scenario = { id: "europe1939", nation: "" };
  const bus = new EventBus();
  const deals: Record<string, string>[] = [];
  bus.on(SendScenarioDealIntentEvent, (e) => deals.push(e.seats));
  modal.eventBus = bus;
  const container = document.createElement("div");
  const draw = () =>
    render(m.renderRandomNations(m.scenario) as never, container);
  draw();
  return { modal, m, container, deals, draw };
}

afterEach(() => {
  social.state = null;
});

describe("Random nations in the host lobby", () => {
  it("deals every player (not watchers) a seat in one intent", () => {
    const { container, deals } = lobby();
    container
      .querySelector<HTMLButtonElement>("[data-random-nations-button]")!
      .click();
    expect(deals).toHaveLength(1);
    const holders = Object.values(deals[0]).sort();
    expect(holders).toEqual(
      ["GARYAAAA", "HOSTAAAA", "PATAAAAA", "XAAAAAAA", "YAAAAAAA"].sort(),
    );
  });

  it("friends: the party when there is one, else Derp Land friends, by name", () => {
    const { m } = lobby();
    social.state = state(["Host_Al", "Pat"], ["Gary"]);
    expect([...m.friendClientIDs()].sort()).toEqual(["HOSTAAAA", "PATAAAAA"]);
    social.state = state(null, ["Gary", "PAT"]);
    expect([...m.friendClientIDs()].sort()).toEqual([
      "GARYAAAA",
      "HOSTAAAA",
      "PATAAAAA",
    ]);
    // Signed out: just the host.
    social.state = null;
    expect([...m.friendClientIDs()]).toEqual(["HOSTAAAA"]);
  });

  it("Keep friends on one side: the party lands on one side, every time", () => {
    const { m, container, deals, draw } = lobby();
    social.state = state(["Host_Al", "Pat", "Gary"], []);
    const box = container.querySelector<HTMLInputElement>(
      "[data-random-nations] input[type=checkbox]",
    )!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(m.keepFriendsTogether).toBe(true);
    draw();
    for (let i = 0; i < 25; i++) {
      container
        .querySelector<HTMLButtonElement>("[data-random-nations-button]")!
        .click();
    }
    for (const deal of deals) {
      const sideOfPlayer = (c: string) =>
        sideOf(Object.keys(deal).find((k) => deal[k] === c)!);
      const sides = new Set(
        ["HOSTAAAA", "PATAAAAA", "GARYAAAA"].map(sideOfPlayer),
      );
      expect(sides.size).toBe(1);
      // The other two go to the other side.
      const theirs = [...sides][0];
      expect(sideOfPlayer("XAAAAAAA")).not.toBe(theirs);
      expect(sideOfPlayer("YAAAAAAA")).not.toBe(theirs);
    }
  });

  it("locked once the start is counting down", () => {
    const { m, container } = lobby();
    (m as unknown as { lobbyStartAt: number | null }).lobbyStartAt = 123;
    render(m.renderRandomNations(m.scenario) as never, container);
    expect(
      container.querySelector<HTMLButtonElement>(
        "[data-random-nations-button]",
      )!.disabled,
    ).toBe(true);
  });
});
