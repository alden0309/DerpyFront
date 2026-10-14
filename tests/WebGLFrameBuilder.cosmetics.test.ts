import { domeStyleIndex } from "@openfront/shared/DerpyFx";
import type { PlayerCosmetics } from "@openfront/shared/WireSchemas";
import { colord } from "colord";
import { describe, expect, it } from "vitest";
import { WebGLFrameBuilder } from "../src/client/WebGLFrameBuilder";
import { STRUCTURES_EFFECT_BLOCK } from "../src/client/render/gl/utils/ColorUtils";
import type { PlayerStatic } from "../src/client/render/types";
import type { CosmeticVisibility } from "../src/client/view/CosmeticVisibility";

const SID = 3;

const EQUIPPED = {
  flag: "https://cdn.example.com/flags/custom.svg",
  skin: { name: "lava", url: "https://cdn.example.com/skins/lava.png" },
  crown: { name: "gold", url: "https://cdn.example.com/crowns/gold.png" },
  derpyDome: "fx_frost", // DFSTORE (r21)
} as PlayerCosmetics;

function setup(visibility: CosmeticVisibility = {}) {
  const skinCalls: Array<[number, string | null]> = [];
  const domeCalls: Array<[number, number]> = [];
  const cosmeticUploads: PlayerStatic[][] = [];
  const effectUploads: Float32Array[] = [];
  const view = {
    initSkinAtlas: () => {},
    addPlayers: () => {},
    setLocalPlayerID: () => {},
    setLocalRailColor: () => {},
    setPlayerSkin: (sid: number, url: string | null) =>
      skinCalls.push([sid, url]),
    setPlayerDomeStyle: (sid: number, style: number) =>
      domeCalls.push([sid, style]),
    updatePlayerCosmetics: (players: PlayerStatic[]) =>
      cosmeticUploads.push(players),
    updateEffectPalette: (palette: Float32Array) => effectUploads.push(palette),
  };
  const builder = new WebGLFrameBuilder(view as never) as unknown as {
    localPlayerSmallID: number;
    effectResolved: Set<number>;
    setEffectOverride: WebGLFrameBuilder["setEffectOverride"];
    syncPlayers(gameView: unknown): void;
    syncLocalPlayer(gameView: unknown): void;
    refreshCosmetics(gameView: unknown): void;
  };
  const player = {
    equippedCosmetics: EQUIPPED,
    cosmetics: EQUIPPED,
    static: { id: "p", smallID: SID },
    smallID: () => SID,
    displayName: () => "p",
    territoryColor: () => colord("#112233"),
    borderColor: () => colord("#445566"),
    railColor: () => colord("#ffffff"),
  };
  const gameView = {
    players: () => [player],
    myPlayer: () => player,
    cosmeticVisibility: () => visibility,
    refreshPlayerCosmetics: () => {
      player.cosmetics = {};
    },
    setNukeTrailSpiral: () => {},
    clearNukeTrailSpiral: () => {},
  };
  return {
    builder,
    gameView,
    skinCalls,
    domeCalls,
    cosmeticUploads,
    effectUploads,
  };
}

describe("WebGLFrameBuilder cosmetics refresh", () => {
  it("clears hidden cosmetics from already-registered players", () => {
    const { builder, gameView, skinCalls, domeCalls, cosmeticUploads } =
      setup();
    builder.syncPlayers(gameView);
    expect(skinCalls).toEqual([[SID, EQUIPPED.skin!.url]]);
    // DFSTORE (r21): the Dome style goes to the renderer, and comes off too.
    expect(domeCalls).toEqual([[SID, domeStyleIndex("fx_frost")]]);
    builder.effectResolved.add(SID);

    builder.refreshCosmetics(gameView);

    expect(skinCalls[1]).toEqual([SID, null]);
    expect(domeCalls[1]).toEqual([SID, 0]);
    expect(cosmeticUploads).toHaveLength(1);
    expect(cosmeticUploads[0][0].flag).toBeUndefined();
    expect(cosmeticUploads[0][0].crown).toBeUndefined();
  });

  it("re-resolves effects during the refresh, without waiting for a tick", () => {
    const { builder, gameView, effectUploads } = setup();
    builder.localPlayerSmallID = SID;
    builder.setEffectOverride("structures", {
      type: "transition",
      colors: ["#ff0000", "#00ff00"],
      frequency: 2,
    });

    builder.refreshCosmetics(gameView);

    expect(effectUploads).toHaveLength(1);
    const PALETTE_SIZE = 4096;
    const MAX_TRAIL_COLORS = 8;
    const count =
      effectUploads[0][
        (STRUCTURES_EFFECT_BLOCK * MAX_TRAIL_COLORS * PALETTE_SIZE + SID) * 4 +
          3
      ];
    expect(count).toBe(2);
  });

  it("skips players the renderer hasn't registered yet", () => {
    const { builder, gameView, cosmeticUploads } = setup();
    builder.refreshCosmetics(gameView);
    expect(cosmeticUploads[0]).toEqual([]);
  });

  it("refreshes registered players once the local player resolves in my-team mode", () => {
    const { builder, gameView, cosmeticUploads } = setup({
      showFrom: "teammates",
    });
    builder.syncPlayers(gameView);
    builder.syncLocalPlayer(gameView);
    expect(cosmeticUploads).toHaveLength(1);
    expect(cosmeticUploads[0][0].flag).toBeUndefined();

    // Same local player next tick: nothing to redo.
    builder.syncLocalPlayer(gameView);
    expect(cosmeticUploads).toHaveLength(1);
  });

  it("leaves cosmetics alone when the local player resolves otherwise", () => {
    const { builder, gameView, cosmeticUploads } = setup();
    builder.syncPlayers(gameView);
    builder.syncLocalPlayer(gameView);
    expect(cosmeticUploads).toHaveLength(0);
  });
});
