// SCEN (r25): the solo screen opened from the Scenarios screen starts the
// scenario, with the player in the nation they picked.

import {
  GameMapType,
  GameMode,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { SCENARIO_EDITION } from "@openfront/engine-api/game/Scenarios";
import { describe, expect, it, vi } from "vitest";

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

// The map picker's cards watch their own visibility; jsdom has no observer.
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import "../../src/client/SinglePlayerModal";

function createModal(): any {
  return document.createElement("single-player-modal") as any;
}

async function start(modal: any) {
  const events: any[] = [];
  modal.addEventListener("join-lobby", (e: Event) =>
    events.push((e as CustomEvent).detail),
  );
  await modal.startGame();
  return events;
}

describe("SinglePlayerModal with a scenario", () => {
  it("starts the scenario as the picked nation, on its fixed settings", async () => {
    const modal = createModal();
    modal.onOpen({ scenario: "europe1939", nation: "france" });
    // The player's other options stay theirs.
    modal.disabledUnits = [UnitType.Warship];
    modal.bots = 300;
    const events = await start(modal);
    expect(events).toHaveLength(1);
    const info = events[0].gameStartInfo;
    const me = info.players[0].clientID;
    expect(info.config.scenario).toEqual({
      id: "europe1939",
      seats: { france: me },
      edition: SCENARIO_EDITION,
    });
    expect(info.config.gameMap).toBe(GameMapType.Europe);
    expect(info.config.gameMode).toBe(GameMode.Team);
    expect(info.config.playerTeams).toBe(2);
    expect(info.config.bots).toBe(0);
    expect(info.config.randomSpawn).toBe(false);
    expect(info.config.disabledUnits).toEqual([UnitType.Warship]);
  });

  it("shows a scenario's own Overtime on and locked, and plays it whatever the player set", async () => {
    const overtimeCard = (modal: any) =>
      [...modal.querySelectorAll("toggle-input-card")].find(
        (c: any) => c.labelKey === "game_settings.overtime",
      ) as any;
    const modal = createModal();
    document.body.appendChild(modal);
    try {
      modal.onOpen({ scenario: "colonies1776", nation: "virginia" });
      await modal.updateComplete;
      const card = overtimeCard(modal);
      expect(card.locked).toBe(true);
      expect(card.checked).toBe(true);
      expect(card.inputValue).toBe(40);
      expect(typeof card.note).toBe("string");
      expect(modal.overtime).toBe(false);
      const events = await start(modal);
      expect(events[0].gameStartInfo.config.overtime).toEqual({
        enabled: true,
        startMinutes: 40,
      });
      // A scenario without its own Overtime leaves the option the player's.
      modal.onOpen({ scenario: "europe1939", nation: "france" });
      await modal.updateComplete;
      expect(overtimeCard(modal).locked).toBe(false);
      expect(overtimeCard(modal).note).toBeUndefined();
    } finally {
      modal.remove();
    }
  });

  it("an unknown nation falls back to the first playable one; no scenario, no change", async () => {
    const modal = createModal();
    modal.onOpen({ scenario: "colonies1776", nation: "narnia" });
    const events = await start(modal);
    const info = events[0].gameStartInfo;
    expect(Object.keys(info.config.scenario.seats)).toEqual(["great_britain"]);

    const plain = createModal();
    plain.onOpen({});
    const ordinary = await start(plain);
    expect(ordinary[0].gameStartInfo.config.scenario).toBeUndefined();
    expect(ordinary[0].gameStartInfo.config.gameMode).toBe(GameMode.FFA);
  });
});
