// SCEN (r25): the solo screen opened from the Scenarios screen starts the
// scenario, with the player in the nation they picked.

import {
  GameMapType,
  GameMode,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
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
    });
    expect(info.config.gameMap).toBe(GameMapType.Europe);
    expect(info.config.gameMode).toBe(GameMode.Team);
    expect(info.config.playerTeams).toBe(2);
    expect(info.config.bots).toBe(0);
    expect(info.config.randomSpawn).toBe(false);
    expect(info.config.disabledUnits).toEqual([UnitType.Warship]);
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
