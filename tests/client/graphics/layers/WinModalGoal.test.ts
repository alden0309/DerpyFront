// DFX (r26): the win screen's coin line shows a Scenario goal met: "Goal
// met: +75" (the server's word, signed in; what it would pay, signed out),
// or that it was collected before; nothing when none was met.

import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedIn: false,
  goal: null as null | {
    recorded: boolean;
    goal: { key: string; coins: number } | null;
  },
}));

const WORDS: Record<string, string> = {
  "scenario_goal.coin_line": "Goal met: +{coins}",
  "scenario_goal.collected": "Goal met (collected before)",
  "derpy.coins_earned": "Earned {coins}",
  "derpy.coins_would_earn": "Would earn {coins}",
};

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string, params?: Record<string, string>) => {
    let t = WORDS[key] ?? key;
    for (const [k, v] of Object.entries(params ?? {})) {
      t = t.replace(`{${k}}`, String(v));
    }
    return t;
  }),
  getTranslatedPlayerTeamLabel: vi.fn((team: string | null) => team ?? ""),
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
  homeHref: vi.fn(() => "/"),
  showToast: vi.fn(),
  TUTORIAL_VIDEO_URL: "https://example.com/tutorial",
}));
vi.mock("../../../../src/client/Api", () => ({
  getUserMe: vi.fn(async () => null),
}));
vi.mock("../../../../src/client/GamePortal", () => ({
  gamePortal: { happytime: vi.fn(), gameplayStop: vi.fn() },
}));
vi.mock("../../../../src/client/derpy/DerpySession", async (orig) => ({
  ...(await orig<object>()),
  isDerpySignedIn: () => mocks.signedIn,
}));
vi.mock("../../../../src/client/derpy/DerpyAccount", async (orig) => ({
  ...(await orig<object>()),
  derpyGameChallenges: vi.fn(async () => null),
  derpyGameGoal: vi.fn(async () => mocks.goal),
}));
vi.mock("../../../../src/derpland/Watch", () => ({
  replaySaved: vi.fn(async () => false),
}));

import "../../../../src/client/hud/layers/WinModal";
import type { WinModal } from "../../../../src/client/hud/layers/WinModal";
import type { GameView } from "../../../../src/client/view";

function makeGame(goal: number | undefined): GameView {
  const winUpdate = {
    winner: ["team", "Axis", "OTHER001"],
    allPlayersStats: {
      HUMAN001: {
        tiles: [300n, 0n, 0n],
        ...(goal !== undefined ? { goal } : {}),
      },
    },
  };
  return {
    myPlayer: () => ({
      isAlive: () => true,
      hasSpawned: () => true,
      team: () => "Allies",
      clientID: () => "HUMAN001",
    }),
    gameID: () => "GOALGAME",
    ticks: () => 18_000,
    numLandTiles: () => 1000,
    inSpawnPhase: () => false,
    updatesSinceLastTick: () => ({ [GameUpdateType.Win]: [winUpdate] }),
    config: () => ({
      gameConfig: () => ({ rankedType: undefined }),
      isReplay: () => false,
    }),
    scenario: () => ({ data: { id: "europe1939" }, seats: new Map() }),
    playerViews: () => [],
  } as unknown as GameView;
}

async function open(goal: number | undefined): Promise<WinModal> {
  const modal = document.createElement("win-modal") as WinModal;
  modal.game = makeGame(goal);
  modal.eventBus = new EventBus();
  modal.tick();
  document.body.appendChild(modal);
  await vi.waitFor(() => expect(modal.isVisible).toBe(true));
  await modal.updateComplete;
  return modal;
}

describe("a Scenario goal on the win screen's coin line", () => {
  let modal: WinModal | undefined;
  afterEach(() => {
    modal?.remove();
    modal = undefined;
    mocks.signedIn = false;
    mocks.goal = null;
    vi.useRealTimers();
  });

  it("signed out: what it would pay", async () => {
    modal = await open(9000);
    const chip = modal.querySelector("[data-goal-line]");
    expect(chip?.textContent?.trim()).toBe("Goal met: +75");
    const headline = modal.querySelector("section span")?.textContent ?? "";
    const plain = await open(undefined);
    const without = plain.querySelector("section span")?.textContent ?? "";
    plain.remove();
    const n = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? NaN);
    expect(n(headline) - n(without)).toBe(75);
  });

  it("signed in: the server's word, once it has saved the game", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mocks.signedIn = true;
    mocks.goal = {
      recorded: true,
      goal: { key: "europe1939:poland", coins: 75 },
    };
    modal = await open(9000);
    expect(modal.querySelector("[data-goal-line]")).toBeNull();
    await vi.advanceTimersByTimeAsync(2100);
    await modal.updateComplete;
    expect(modal.querySelector("[data-goal-line]")?.textContent?.trim()).toBe(
      "Goal met: +75",
    );
  });

  it("signed in, met in an earlier game: collected before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mocks.signedIn = true;
    mocks.goal = {
      recorded: true,
      goal: { key: "europe1939:poland", coins: 0 },
    };
    modal = await open(9000);
    await vi.advanceTimersByTimeAsync(2100);
    await modal.updateComplete;
    expect(modal.querySelector("[data-goal-line]")?.textContent?.trim()).toBe(
      "Goal met (collected before)",
    );
  });

  it("no goal met: no line", async () => {
    modal = await open(undefined);
    expect(modal.querySelector("[data-goal-line]")).toBeNull();
  });
});
