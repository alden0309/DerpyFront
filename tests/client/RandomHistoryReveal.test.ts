// DFX (r26): Random history's reveal ("You are Poland, 1 September 1939"),
// its Reroll, and the solo game it starts: the picked scenario, with the
// player in the picked nation, at the solo screen's usual difficulty.

import { GameMapType, GameMode } from "@openfront/engine-api/game/GameTypes";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/scenario/ScenarioPreview", () => ({}));
vi.mock("../../src/client/Cosmetics", () => ({
  getPlayerCosmetics: vi.fn(async () => ({})),
  prewarmCosmetics: vi.fn(async () => {}),
}));
vi.mock("../../src/client/CrazyGamesSDK", () => ({
  crazyGamesSDK: {
    isOnCrazyGames: vi.fn(() => false),
    requestMidgameAd: vi.fn(async () => {}),
  },
}));
vi.mock("../../src/client/TerrainMapFileLoader", () => ({
  terrainMapFileLoader: {
    getMapData: vi.fn(() => ({
      manifest: () => new Promise(() => {}),
      map16xBin: () => new Promise(() => {}),
    })),
  },
}));
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { isEligible } from "../../src/client/scenario/RandomHistory";
import {
  RANDOM_HISTORY_DIFFICULTY,
  REVEAL_MS,
  showRandomHistory,
} from "../../src/client/scenario/RandomHistoryReveal";
import "../../src/client/SinglePlayerModal";

afterEach(() => {
  document.querySelector("random-history-reveal")?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const FAKE = {
  toFake: [
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "performance",
    "Date",
  ] as const,
};

describe("the reveal", () => {
  it("shows the picked nation and war, then starts it", async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] });
    const el = showRandomHistory();
    const started = vi.fn(async () => {});
    el.startSolo = started;
    await el.updateComplete;
    const d = scenarioData(el.pick.id)!;
    const n = d.nations.find((x) => x.key === el.pick.nation)!;
    expect(isEligible(d, n)).toBe(true);
    expect(el.querySelector("[data-random-history]")).not.toBeNull();
    expect(el.querySelector("#random-history-title")).not.toBeNull();
    // One at a time.
    expect(showRandomHistory()).toBe(el);

    vi.advanceTimersByTime(REVEAL_MS - 200);
    expect(started).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(started).toHaveBeenCalledWith(el.pick);
    await vi.waitFor(() => expect(el.isConnected).toBe(false));
  });

  it("Reroll: another pick, and the moment starts again", async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] });
    const el = showRandomHistory();
    const started = vi.fn(async () => {});
    el.startSolo = started;
    await el.updateComplete;
    const first = el.pick;
    vi.advanceTimersByTime(REVEAL_MS - 500);
    el.reroll();
    expect(el.pick).not.toEqual(first);
    vi.advanceTimersByTime(REVEAL_MS - 500);
    expect(started).not.toHaveBeenCalled();
    // "R" rerolls too.
    const second = el.pick;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    expect(el.pick).not.toEqual(second);
    vi.advanceTimersByTime(REVEAL_MS + 100);
    expect(started).toHaveBeenCalledOnce();
    expect(started).toHaveBeenCalledWith(el.pick);
  });

  it("Escape (or ×) closes it without starting anything", async () => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] });
    const el = showRandomHistory();
    const started = vi.fn(async () => {});
    el.startSolo = started;
    await el.updateComplete;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(el.isConnected).toBe(false);
    vi.advanceTimersByTime(REVEAL_MS * 2);
    expect(started).not.toHaveBeenCalled();
  });
});

describe("the solo game it starts", () => {
  it("plays the picked scenario as the picked nation, at the usual difficulty", async () => {
    const modal = document.createElement("single-player-modal") as any;
    const events: any[] = [];
    modal.addEventListener("join-lobby", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );
    await modal.startScenario({ id: "europe1939", nation: "poland" });
    expect(events).toHaveLength(1);
    const info = events[0].gameStartInfo;
    const me = info.players[0].clientID;
    expect(info.config.scenario).toMatchObject({
      id: "europe1939",
      seats: { poland: me },
    });
    expect(info.config.gameMap).toBe(GameMapType.Europe);
    expect(info.config.gameMode).toBe(GameMode.Team);
    // The reveal says the difficulty: the solo screen's own.
    expect(info.config.difficulty).toBe(RANDOM_HISTORY_DIFFICULTY);
    expect(events[0].source).toBe("singleplayer");
  });

  it("a pick that isn't a scenario starts nothing", async () => {
    const modal = document.createElement("single-player-modal") as any;
    const events: any[] = [];
    modal.addEventListener("join-lobby", (e: Event) => events.push(e));
    await modal.startScenario({ id: "atlantis", nation: "poland" });
    expect(events).toHaveLength(0);
  });
});
