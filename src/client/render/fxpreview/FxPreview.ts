/**
 * FX (r28): the entry the store loads, with import(), when a Nuke & Dome
 * effect pack's card first appears (src/derpland/FxLive.ts). It hands back
 * the one preview player of the page (FxPreviewPlayer), or null where the
 * effect can't be drawn live (no WebGL2, or only a software renderer).
 *
 * Two steps, because the game's passes look their sprite atlases up when
 * their modules load: Derp Land's pages carry no asset manifest (only
 * DerpyFront's page does), so the atlases the preview needs are registered
 * first, as bundled copies, and only then is the player loaded.
 */

import { getAssetManifest } from "@openfront/shared/AssetUrls";
import fxAtlasUrl from "resources/atlases/fx-atlas.png?url";
import unitAtlasUrl from "resources/atlases/unit-atlas.png?url";
import type { FxPreviewPlayer } from "./FxPreviewPlayer";

const ATLASES: Record<string, string> = {
  "atlases/fx-atlas.png": fxAtlasUrl,
  "atlases/unit-atlas.png": unitAtlasUrl,
};

let player: Promise<FxPreviewPlayer | null> | null = null;

/** The page's preview player (created once), or null if it can't run. */
export function fxPreviewPlayer(): Promise<FxPreviewPlayer | null> {
  player ??= (async () => {
    const manifest = getAssetManifest();
    const missing = Object.keys(ATLASES).filter((k) => !(k in manifest));
    if (missing.length > 0) {
      globalThis.__ASSET_MANIFEST__ = {
        ...(globalThis.__ASSET_MANIFEST__ ?? {}),
        ...Object.fromEntries(missing.map((k) => [k, ATLASES[k]])),
      };
    }
    const { createFxPreviewPlayer } = await import("./FxPreviewPlayer");
    return createFxPreviewPlayer();
  })().catch((e: unknown) => {
    console.warn("Effect preview unavailable:", e);
    return null;
  });
  return player;
}

export type { FxPreviewPlayer };
