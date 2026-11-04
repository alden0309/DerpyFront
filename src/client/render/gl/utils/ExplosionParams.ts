/**
 * Nuke-explosion cosmetics → render params. Shared by the game
 * (WebGLFrameBuilder) and the store's effect preview (render/fxpreview), so
 * both draw a burst from the same numbers.
 */

import type {
  NukeExplosionAttributes,
  NukeExplosionType,
} from "@openfront/shared/CosmeticSchemas";
import {
  type DerpyFxTheme,
  domeBurstAttributes,
  fxExplosionAttributes,
} from "@openfront/shared/DerpyFx";
import { colord } from "colord";
import {
  DEFAULT_NUKE_EXPLOSION_COLOR,
  MAX_NUKE_EXPLOSION_COLORS,
  type NukeExplosionRenderParams,
} from "../../types/Renderer";
import {
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV_WARHEAD,
} from "../../types/UnitType";

// Attribute → render-param mappings:
//   size      = the ring's final WIDTH (diameter) in world tiles when it fades
//               out — absolute, so maxRadius = size / 2 regardless of bomb type.
//   speed     = world tiles/s the ring's width grows, so the effect lasts
//               size / speed seconds (the pass clamps the duration).
//   thickness = the ring band's thickness in world tiles.
//   transitionSpeed passes through as the palette step rate (colors/s).

/**
 * Detonating bomb → nuke-explosion slot. Only these unit types produce a
 * shockwave; plain MIRV splits and never detonates.
 */
export const UNIT_TYPE_TO_NUKE_TYPE: Readonly<
  Record<string, NukeExplosionType>
> = {
  [UT_ATOM_BOMB]: "atom",
  [UT_HYDROGEN_BOMB]: "hydro",
  [UT_MIRV_WARHEAD]: "mirvWarhead",
};

export function toRgb01(s: string): [number, number, number] | null {
  const c = colord(s);
  if (!c.isValid()) return null;
  const { r, g, b } = c.toRgb();
  return [r / 255, g / 255, b / 255];
}

/** Resolve a nuke-explosion cosmetic's catalog attributes into render params. */
export function attributesToExplosionParams(
  attrs: NukeExplosionAttributes,
): NukeExplosionRenderParams {
  // The shader cycles through the whole palette; the instance layout carries
  // at most MAX_NUKE_EXPLOSION_COLORS, extras are dropped.
  const colors = attrs.colors
    .map(toRgb01)
    .filter((c): c is [number, number, number] => c !== null)
    .slice(0, MAX_NUKE_EXPLOSION_COLORS);
  const base = {
    colors: colors.length > 0 ? colors : [DEFAULT_NUKE_EXPLOSION_COLOR],
    maxRadius: attrs.size / 2,
    speed: attrs.speed,
    thickness: attrs.thickness,
    transitionSpeed: attrs.transitionSpeed ?? 0,
  };
  return attrs.type === "sparkles"
    ? { ...base, type: "sparkles", density: attrs.density }
    : attrs.type === "embers"
      ? { ...base, type: "embers", density: attrs.density }
      : { ...base, type: "shockwave" };
}

/** A Derp Store pack's burst for one bomb (what its catalog entry holds). */
export function derpyExplosionParams(
  theme: DerpyFxTheme,
  nukeType: NukeExplosionType,
): NukeExplosionRenderParams {
  return attributesToExplosionParams(fxExplosionAttributes(theme, nukeType));
}

/** A Derp Store pack's Dome burst, over a nuke the Dome stopped. */
export function derpyDomeBurstParams(
  theme: DerpyFxTheme,
): NukeExplosionRenderParams {
  return attributesToExplosionParams(domeBurstAttributes(theme.dome));
}
