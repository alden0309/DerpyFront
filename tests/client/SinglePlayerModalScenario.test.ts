// SCEN (r25): the solo screen opened from the Scenarios screen starts the
// scenario, with the player in the nation they picked.

import {
  GameMapType,
  GameMode,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  NUCLEAR_UNITS,
  SCENARIO_EDITION,
} from "@openfront/engine-api/game/Scenarios";
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
    // SCEN3 (r27): 1939 is before nukes, so they are left out too.
    expect(info.config.disabledUnits).toEqual([
      UnitType.Warship,
      ...NUCLEAR_UNITS,
    ]);
  });

  it("shows the nuclear units off and locked in a scenario before 1945, not in Korea 1950 (SCEN3 r27)", async () => {
    const locked = (modal: any) =>
      [...modal.querySelectorAll("[data-locked-unit]")].map(
        (b: any) => b.dataset.lockedUnit,
      );
    const modal = createModal();
    document.body.appendChild(modal);
    try {
      modal.onOpen({ scenario: "colonies1776", nation: "virginia" });
      await modal.updateComplete;
      await modal.querySelector("game-config-settings")?.updateComplete;
      expect(locked(modal).sort()).toEqual(
        [
          UnitType.AtomBomb,
          UnitType.HydrogenBomb,
          UnitType.MIRV,
          UnitType.MissileSilo,
          UnitType.SAMLauncher,
          UnitType.Dome,
        ].sort(),
      );
      expect(modal.querySelector("[data-units-locked]")).not.toBeNull();
      // Clicking one doesn't turn it on (or off).
      const silo = modal.querySelector(
        `[data-locked-unit="${UnitType.MissileSilo}"]`,
      ) as HTMLButtonElement;
      expect(silo.disabled).toBe(true);
      expect(silo.getAttribute("aria-pressed")).toBe("false");
      silo.click();
      expect(modal.disabledUnits).toEqual([]);

      modal.onOpen({ scenario: "korea1950", nation: "north_korea" });
      await modal.updateComplete;
      await modal.querySelector("game-config-settings")?.updateComplete;
      expect(locked(modal)).toEqual([]);
      expect(modal.querySelector("[data-units-locked]")).toBeNull();
      const events = await start(modal);
      expect(events[0].gameStartInfo.config.disabledUnits).toEqual([]);
    } finally {
      modal.remove();
    }
  });

  it("has no Overtime in a scenario (SCEN3 r27: no land bar to lower), whatever the player set", async () => {
    const overtimeCard = (modal: any) =>
      [...modal.querySelectorAll("toggle-input-card")].find(
        (c: any) => c.labelKey === "game_settings.overtime",
      ) as any;
    const modal = createModal();
    document.body.appendChild(modal);
    try {
      // An ordinary game shows the option.
      await modal.updateComplete;
      expect(overtimeCard(modal)).toBeDefined();
      modal.overtime = true;
      modal.onOpen({ scenario: "colonies1776", nation: "virginia" });
      modal.overtime = true;
      await modal.updateComplete;
      expect(overtimeCard(modal)).toBeUndefined();
      const events = await start(modal);
      expect(events[0].gameStartInfo.config.overtime).toEqual({
        enabled: false,
      });
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
