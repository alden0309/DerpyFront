// DFSTORE (r21): which Derp Store looks you wear, kept in this browser like
// your skin, and shared by Derp Land's pages and DerpyFront (same storage).
//  - Nuke style: OpenFront's own effect slots (settings.effects): the nuke
//    trail and the atom, hydrogen and MIRV bursts, all from one pack.
//  - Dome style: its own key, sent with your other cosmetics when you join.

import {
  DERPY_FX_THEMES,
  DerpyFxTheme,
  fxEffectNames,
} from "@openfront/shared/DerpyFx";

export const DOME_STYLE_KEY = "derpyDomeStyle";
/** The same key UserSettings keeps effect selections under (EFFECTS_KEY). */
export const EFFECT_SLOTS_KEY = "settings.effects";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The Dome style you chose (a pack name), if any. */
export function wornDomeStyle(): string | null {
  const v = storage()?.getItem(DOME_STYLE_KEY) ?? null;
  return v !== null && DERPY_FX_THEMES.some((t) => t.name === v) ? v : null;
}

export function wearDomeStyle(name: string | null): void {
  try {
    if (name === null) storage()?.removeItem(DOME_STYLE_KEY);
    else storage()?.setItem(DOME_STYLE_KEY, name);
  } catch {
    // storage blocked
  }
}

/** The effect slots a pack's nuke style fills (slot → effect name). */
export function nukeStyleSlots(theme: DerpyFxTheme): Record<string, string> {
  return { ...fxEffectNames(theme) };
}

/** Which pack's nuke style these effect slots hold, if they hold one. */
export function nukeStyleIn(slots: Record<string, string>): string | null {
  for (const theme of DERPY_FX_THEMES) {
    if (slots.nukeTrail === fxEffectNames(theme).nukeTrail) return theme.name;
  }
  return null;
}

/** The slots with the Derp Store nuke style swapped for `theme` (or none). */
export function withNukeStyle(
  slots: Record<string, string>,
  theme: DerpyFxTheme | null,
): Record<string, string> {
  const out = { ...slots };
  for (const t of DERPY_FX_THEMES) {
    for (const [slot, name] of Object.entries(fxEffectNames(t))) {
      if (out[slot] === name) delete out[slot];
    }
  }
  return theme === null ? out : { ...out, ...nukeStyleSlots(theme) };
}

/** Read the effect slots straight from storage (for Derp Land's pages). */
export function storedEffectSlots(): Record<string, string> {
  try {
    const raw = storage()?.getItem(EFFECT_SLOTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** Write the effect slots straight to storage (for Derp Land's pages). */
export function storeEffectSlots(slots: Record<string, string>): void {
  try {
    if (Object.keys(slots).length === 0) {
      storage()?.removeItem(EFFECT_SLOTS_KEY);
    } else {
      storage()?.setItem(EFFECT_SLOTS_KEY, JSON.stringify(slots));
    }
  } catch {
    // storage blocked
  }
}
