import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Derpy Front (r24): no XP on our site (derpy/UpstreamFeatures). Dying or the
// game ending must not ask OpenFront's API anything, and the end-of-game
// screen has no XP section, Legend ceremony or share button; our awards and
// Derp Coins show as before.

const api = vi.hoisted(() => ({
  getUserMe: vi.fn(async () => false),
  fetchUserMeUncached: vi.fn(async () => false),
  invalidateUserMe: vi.fn(),
  isLoggedIn: vi.fn(async () => true),
  fetchProgressionConfig: vi.fn(async () => null),
  pollGameXp: vi.fn(async () => null),
}));

vi.mock("../../../../src/client/Utils", () => ({
  translateText: (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  getTranslatedPlayerTeamLabel: (team: string) => team,
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
  homeHref: vi.fn(() => "/"),
  TUTORIAL_VIDEO_URL: "https://example.com/tutorial",
}));

vi.mock("../../../../src/client/Api", () => ({
  getUserMe: api.getUserMe,
  fetchUserMeUncached: api.fetchUserMeUncached,
  invalidateUserMe: api.invalidateUserMe,
}));

vi.mock("../../../../src/client/Auth", () => ({
  getAuthHeader: vi.fn(async () => "Bearer test-token"),
  isLoggedIn: api.isLoggedIn,
}));

vi.mock("../../../../src/client/ApiBase", () => ({
  getApiBase: () => "https://api.test",
}));

vi.mock("../../../../src/client/ProgressionApi", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../src/client/ProgressionApi")
  >()),
  fetchProgressionConfig: api.fetchProgressionConfig,
  pollGameXp: api.pollGameXp,
}));

vi.mock("../../../../src/client/GamePortal", () => ({
  gamePortal: {
    happytime: vi.fn(),
    gameplayStop: vi.fn(),
    isOnGamePortal: vi.fn(() => false),
    getUserProfile: vi.fn(async () => null),
  },
}));

vi.mock("../../../../src/client/derpy/VictoryFanfare", () => ({
  playVictoryFanfare: vi.fn(async () => false),
}));

import { GameType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { EventBus } from "@openfront/shared/EventBus";
import "../../../../src/client/hud/layers/WinModal";
import type { WinModal } from "../../../../src/client/hud/layers/WinModal";
import type { GameView } from "../../../../src/client/view";

const ME = "me";

function makeGame(opts: { alive: boolean; ended: boolean }) {
  const state = { alive: opts.alive, ended: opts.ended, delivered: false };
  const me = {
    isAlive: () => state.alive,
    hasSpawned: () => true,
    team: () => null,
    clientID: () => ME,
    isPlayer: () => true,
    displayName: () => "Me",
  };
  const game = {
    gameID: () => "gNOXP0001",
    myPlayer: () => me,
    inSpawnPhase: () => false,
    ticks: () => 6000,
    numLandTiles: () => 1000,
    updatesSinceLastTick: () => {
      if (!state.ended || state.delivered) return {};
      state.delivered = true;
      return {
        [GameUpdateType.Win]: [
          {
            type: GameUpdateType.Win,
            winner: ["player", ME],
            allPlayersStats: { [ME]: {} },
            awards: [],
          },
        ],
      };
    },
    playerByClientID: () => me,
    config: () => ({
      gameConfig: () => ({
        rankedType: undefined,
        gameType: GameType.Singleplayer,
      }),
      isReplay: () => false,
    }),
  } as unknown as GameView;
  return { game, state };
}

describe("Derpy Front: no XP at death or at the end of a game", () => {
  let modal: WinModal;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    modal?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(game: GameView): Promise<void> {
    modal = document.createElement("win-modal") as WinModal;
    modal.game = game;
    modal.eventBus = new EventBus();
    document.body.appendChild(modal);
    modal.init();
    modal.tick();
    await vi.advanceTimersByTimeAsync(10_000);
    await modal.updateComplete;
  }

  function expectNoXp(): void {
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(modal.querySelector("game-xp-panel")).toBeNull();
    expect(modal.querySelector("legend-ceremony")).toBeNull();
    expect(modal.querySelector("profile-share")).toBeNull();
  }

  it("asks nothing when the player dies, nor when the game then ends", async () => {
    const { game, state } = makeGame({ alive: false, ended: false });
    await mount(game);
    expect(modal.textContent).toContain("win_modal.died");
    expectNoXp();

    state.ended = true;
    modal.tick();
    await vi.advanceTimersByTimeAsync(10_000);
    await modal.updateComplete;
    expectNoXp();
  });

  it("asks nothing on a win, and still shows the Derp Coins", async () => {
    const { game } = makeGame({ alive: true, ended: true });
    await mount(game);
    expect(modal.textContent).toContain("win_modal.you_won");
    expect(modal.textContent).toContain("derpy.coins_");
    expectNoXp();
  });
});
