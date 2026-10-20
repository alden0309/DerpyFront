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

function makeGame(myTeam: string): GameView {
  const winUpdate = {
    winner: ["team", "Allies", "HUMAN001"],
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
    updatesSinceLastTick: () => ({ [GameUpdateType.Win]: [winUpdate] }),
    config: () => ({ gameConfig: () => ({ rankedType: undefined }) }),
    scenario: () => ({ data: { id: "europe1939" }, seats: new Map() }),
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
});
