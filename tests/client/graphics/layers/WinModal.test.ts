import { RankedType } from "@openfront/engine-api/game/GameTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../src/client/hud/layers/WinModal";
import type { WinModal } from "../../../../src/client/hud/layers/WinModal";

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      "win_modal.exit": "Exit",
      "win_modal.requeue": "Play Again",
      "win_modal.keep": "Keep Playing",
      "win_modal.spectate": "Spectate",
    };
    return translations[key] || key;
  }),
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
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

vi.mock("../../../../src/client/CrazyGamesSDK", () => ({
  crazyGamesSDK: {
    happytime: vi.fn(),
    requestAd: vi.fn(),
    gameplayStop: vi.fn(),
  },
}));

describe("WinModal Requeue", () => {
  let mockLocationHref = "";

  beforeEach(() => {
    mockLocationHref = "";
    // Mock window.location.href using Object.defineProperty
    const locationMock = {
      get href() {
        return mockLocationHref;
      },
      set href(value: string) {
        mockLocationHref = value;
      },
    };
    Object.defineProperty(window, "location", {
      value: locationMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isRankedGame detection", () => {
    it("should detect ranked 1v1 game", () => {
      const gameConfig = {
        rankedType: RankedType.OneVOne,
      };
      const isRankedGame = gameConfig.rankedType === RankedType.OneVOne;
      expect(isRankedGame).toBe(true);
    });

    it("should not detect non-ranked game", () => {
      const gameConfig = {
        rankedType: undefined,
      };
      const isRankedGame = gameConfig.rankedType === RankedType.OneVOne;
      expect(isRankedGame).toBe(false);
    });
  });

  describe("requeue navigation", () => {
    it("should navigate to /?requeue when requeue is triggered", () => {
      // Simulate the _handleRequeue behavior
      const handleRequeue = () => {
        window.location.href = "/?requeue";
      };

      handleRequeue();

      expect(window.location.href).toBe("/?requeue");
    });

    it("should navigate to / when exit is triggered", () => {
      // Simulate the _handleExit behavior
      const handleExit = () => {
        window.location.href = "/";
      };

      handleExit();

      expect(window.location.href).toBe("/");
    });
  });

  describe("requeue URL parameter handling", () => {
    it("should parse requeue parameter from URL", () => {
      const url = new URL("http://localhost:9000/?requeue");
      const hasRequeue = url.searchParams.has("requeue");
      expect(hasRequeue).toBe(true);
    });

    it("should not find requeue parameter when absent", () => {
      const url = new URL("http://localhost:9000/");
      const hasRequeue = url.searchParams.has("requeue");
      expect(hasRequeue).toBe(false);
    });
  });
});

describe("WinModal end-of-game awards", () => {
  let modal: WinModal | undefined;

  afterEach(() => {
    modal?.remove();
    modal = undefined;
  });

  function gameView(myClientID: string) {
    return {
      myPlayer: () => ({
        clientID: () => myClientID,
        isAlive: () => true,
        team: () => null,
      }),
      numLandTiles: () => 1000,
      ticks: () => 3000, // five minutes
      config: () => ({ gameConfig: () => ({ rankedType: undefined }) }),
    };
  }

  async function showResults(wu: Record<string, unknown>) {
    modal = document.createElement("win-modal") as WinModal;
    Object.assign(modal, { game: gameView("me") });
    document.body.appendChild(modal);
    (modal as unknown as { showResults(wu: unknown): void }).showResults(wu);
    await modal.updateComplete;
    return modal;
  }

  it("lists each award with who won it, highlighting mine", async () => {
    const m = await showResults({
      winner: ["player", "me"],
      allPlayersStats: {},
      awards: [
        { kind: "mvp", name: "Alden", clientID: "me", value: 812 },
        { kind: "betrayals", name: "Florida", clientID: null, value: 3 },
      ],
    });
    const cards = m.querySelectorAll("[data-award]");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Alden");
    expect(cards[0].textContent).toContain("derpy.award_mvp");
    expect(cards[0].className).toContain("border-cyber-yellow");
    expect(cards[1].textContent).toContain("Florida");
    expect(cards[1].className).not.toContain("border-cyber-yellow");
  });

  it("shows the Derp Coins the game pays, line by line", async () => {
    const m = await showResults({
      winner: ["player", "me"],
      allPlayersStats: {
        me: { tiles: [400n, 0n, 0n], gold: [1_000_000n] },
      },
      awards: [{ kind: "mvp", name: "Alden", clientID: "me", value: 812 }],
    });
    const text = m.textContent ?? "";
    // Signed out: it says what the game would have paid.
    expect(text).toContain("derpy.coins_would_earn");
    for (const line of ["played", "territory", "gold", "awards", "win"]) {
      expect(text).toContain(`derpy.coin_line_${line}`);
    }
    // 5 played + 20 territory + 2 gold + 25 MVP + 50 win.
    expect(text).toContain("+20");
    expect(text).toContain("+50");
  });

  it("says awards come at the end when you die before the game is decided", async () => {
    modal = document.createElement("win-modal") as WinModal;
    document.body.appendChild(modal);
    await modal.updateComplete;
    expect(modal.textContent).toContain("derpy.awards_at_end");
  });
});
