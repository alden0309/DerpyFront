// DLC (r21): the map style you chose, kept in this browser (a per-viewer
// convenience, nothing more). Derpy Conquest draws it only if the server
// says your account owns it (ConquestDlcOwned.styles); Derp Land's
// Inventory sets the same choice. If the browser won't store it, the map
// keeps its usual look.

import { MAP_STYLES, type MapStyleKey } from "../DlcIds";

const KEY = "derpy_conquest_map_style";

/** The style chosen here, or null for the usual look. */
export function chosenMapStyle(): MapStyleKey | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && (MAP_STYLES as readonly string[]).includes(v)
      ? (v as MapStyleKey)
      : null;
  } catch {
    return null;
  }
}

export function chooseMapStyle(key: MapStyleKey | null): void {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore: the usual look holds
  }
}

/** The style to draw: the one chosen, if it's among those owned. */
export function mapStyleToDraw(
  owned: readonly MapStyleKey[],
): MapStyleKey | null {
  const c = chosenMapStyle();
  return c && owned.includes(c) ? c : null;
}
