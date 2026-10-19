import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAL (r25): DerpyFront's win screen asks the server which weekly
// challenges the game finished (until the game is saved), toasts each, and
// shows them on the coin line, adding their coins to the total.

const toasts = vi.hoisted(() => [] as string[]);

vi.mock("../../../../src/client/Utils", () => ({
  translateText: (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  getTranslatedPlayerTeamLabel: (team: string) => team,
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
  homeHref: vi.fn(() => "/"),
  showToast: (message: string) => toasts.push(message),
  TUTORIAL_VIDEO_URL: "https://example.com/tutorial",
}));

vi.mock("../../../../src/client/Api", () => ({
  getUserMe: vi.fn(async () => false),
  fetchUserMeUncached: vi.fn(async () => false),
  invalidateUserMe: vi.fn(),
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

function makeGame() {
  let delivered = false;
  const me = {
    isAlive: () => true,
    hasSpawned: () => true,
    team: () => null,
    clientID: () => ME,
    isPlayer: () => true,
    displayName: () => "Me",
  };
  return {
    gameID: () => "gCHAL0001",
    myPlayer: () => me,
    inSpawnPhase: () => false,
    ticks: () => 6000,
    numLandTiles: () => 1000,
    updatesSinceLastTick: () => {
      if (delivered) return {};
      delivered = true;
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
}

describe("DerpyFront's win screen: weekly challenges", () => {
  let modal: WinModal;
  let answers: unknown[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    toasts.length = 0;
    localStorage.setItem("derpy_session_token", "tok");
    localStorage.setItem("derpy_username", "Alden");
    answers = [];
    fetchMock = vi.fn(async (url: string) => {
      if (!String(url).includes("/derpy/api/challenges/game/gCHAL0001"))
        return new Response("", { status: 404 });
      const next = answers.shift() ?? { recorded: true, done: [] };
      return new Response(JSON.stringify(next), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    modal?.remove();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(): Promise<void> {
    modal = document.createElement("win-modal") as WinModal;
    modal.game = makeGame();
    modal.eventBus = new EventBus();
    document.body.appendChild(modal);
    modal.init();
    modal.tick();
    await modal.updateComplete;
  }

  it("asks until the game is saved, toasts what it finished, and adds it to the coins", async () => {
    answers = [
      { recorded: false, done: [] },
      {
        recorded: true,
        done: [
          { key: "df-win", name: "A win's a win", coins: 100 },
          { key: "df-win-3", name: "Hat trick", coins: 250, bonus: 150 },
        ],
      },
    ];
    await mount();
    // Played 600 s and won: 7 + 70 of its own.
    expect(modal.textContent).toContain('derpy.coins_earned:{"coins":77}');
    await vi.advanceTimersByTimeAsync(2_100);
    expect(toasts).toEqual([]);
    await vi.advanceTimersByTimeAsync(3_100);
    await modal.updateComplete;
    // (A name with no translation here falls back to the server's.)
    expect(toasts).toEqual([
      'derpy.challenge_toast:{"name":"A win\'s a win","coins":100}',
      'derpy.challenge_toast:{"name":"Hat trick","coins":250}',
      'derpy.challenge_bonus_toast:{"coins":150}',
    ]);
    expect(modal.textContent).toContain('derpy.coins_earned:{"coins":577}');
    const chips = modal.querySelector("[data-challenges]")!.textContent!;
    expect(chips).toContain("derpy.challenges_title");
    expect(chips).toContain('"coins":100');
    expect(chips).toContain('derpy.challenge_bonus_line:{"coins":150}');
    // Saved: it stops asking, and nothing is toasted twice.
    const asked = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock.mock.calls.length).toBe(asked);
    expect(toasts.length).toBe(3);
  });

  it("signed out, it asks nothing", async () => {
    localStorage.clear();
    await mount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(modal.querySelector("[data-challenges]")).toBeNull();
  });
});
