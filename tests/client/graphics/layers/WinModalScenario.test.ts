// SCEN (r25): a scenario's win screen names the side that won ("The Allies
// win") and lists who was on it.

import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../../src/client/hud/layers/WinModal";
import type { WinModal } from "../../../../src/client/hud/layers/WinModal";
import { SendWinnerEvent } from "../../../../src/client/Transport";
import type { GameView } from "../../../../src/client/view";

const WORDS: Record<string, string> = {
  "scenarios.win.allies": "The Allies win",
  "scenarios.win.unitednations": "The United Nations win",
  "scenarios.win_armistice.unitednations":
    "The United Nations win at the armistice",
  "scenarios.winning_side": "On the winning side: {names}",
};

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string, params?: Record<string, string>) => {
    let t = WORDS[key] ?? key;
    for (const [k, v] of Object.entries(params ?? {})) {
      t = t.replace(`{${k}}`, v);
    }
    return t;
  }),
  getTranslatedPlayerTeamLabel: vi.fn((team: string | null) => team ?? ""),
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
  homeHref: vi.fn(() => "/"),
  TUTORIAL_VIDEO_URL: "https://example.com/tutorial",
}));

vi.mock("../../../../src/client/Api", () => ({
  getUserMe: vi.fn(async () => null),
}));

vi.mock("../../../../src/client/Cosmetics", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../src/client/Cosmetics")
  >()),
  fetchCosmetics: vi.fn(async () => null),
  resolveCosmetics: vi.fn(() => []),
}));

vi.mock("../../../../src/client/GamePortal", () => ({
  gamePortal: { happytime: vi.fn(), gameplayStop: vi.fn() },
}));

function view(name: string, team: string | null) {
  return { displayName: () => name, team: () => team };
}

function makeGame(
  myTeam: string,
  opts: {
    side?: string;
    scenario?: string;
    events?: { message: string; params?: Record<string, unknown> }[];
  } = {},
): GameView {
  const winUpdate = {
    winner: ["team", opts.side ?? "Allies", "HUMAN001"],
    allPlayersStats: {},
  };
  return {
    myPlayer: () => ({
      isAlive: () => true,
      hasSpawned: () => true,
      team: () => myTeam,
      clientID: () => "HUMAN001",
    }),
    inSpawnPhase: () => false,
    updatesSinceLastTick: () => ({
      [GameUpdateType.Win]: [winUpdate],
      [GameUpdateType.DisplayEvent]: opts.events ?? [],
    }),
    config: () => ({
      gameConfig: () => ({ rankedType: undefined }),
      isReplay: () => false,
    }),
    scenario: () => ({
      data: { id: opts.scenario ?? "europe1939" },
      seats: new Map(),
    }),
    playerViews: () => [
      view("France (Alden)", "Allies"),
      view("Germany", "Axis"),
      view("United Kingdom", "Allies"),
      view("Spain", null),
    ],
  } as unknown as GameView;
}

describe("a scenario's win screen", () => {
  let modal: WinModal | undefined;

  afterEach(() => {
    modal?.remove();
    modal = undefined;
    vi.clearAllMocks();
  });

  it("names the winning side and its nations", async () => {
    const eventBus = new EventBus();
    const sent: SendWinnerEvent[] = [];
    eventBus.on(SendWinnerEvent, (e) => sent.push(e));
    modal = document.createElement("win-modal") as WinModal;
    modal.game = makeGame("Allies");
    modal.eventBus = eventBus;
    modal.tick();
    // The side's win is the winner sent to the server, as in team games.
    expect(sent[0].winner).toEqual(["team", "Allies", "HUMAN001"]);
    document.body.appendChild(modal);
    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
    await modal.updateComplete;
    expect(modal.querySelector("h2")?.textContent?.trim()).toBe(
      "The Allies win",
    );
    expect(
      modal.querySelector("[data-scenario-winners]")?.textContent?.trim(),
    ).toBe("On the winning side: France (Alden), United Kingdom");
  });

  // SCEN3 (r27): Korea 1950's war ended by its armistice says so.
  it("says the war ended at the armistice", async () => {
    const title = async (events: { message: string }[]) => {
      modal = document.createElement("win-modal") as WinModal;
      modal.game = makeGame("UnitedNations", {
        side: "UnitedNations",
        scenario: "korea1950",
        events,
      });
      modal.eventBus = new EventBus();
      modal.tick();
      document.body.appendChild(modal);
      await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
      await modal.updateComplete;
      const t = modal.querySelector("h2")?.textContent?.trim();
      modal.remove();
      return t;
    };
    expect(
      await title([
        { message: "events_display.scenario_armistice_unitednations" },
      ]),
    ).toBe("The United Nations win at the armistice");
    // Won by beating the North: the plain line.
    expect(await title([])).toBe("The United Nations win");
  });
});
