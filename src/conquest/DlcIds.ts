// DLC (r21): Derpy Conquest's store items, by the names the Derp Store sells
// them under (src/server/derpy/DerpyCatalog.ts) and the server checks an
// account's ownership by (src/server/conquest/ConquestDlc.ts). Shared by the
// server, the engine's tests and the browser, so nothing spells them twice.

/** "1776: The Revolution": a new start date and its campaign. */
export const CAMPAIGN_1776 = "campaign_1776";

/** "Legends": American legends to hunt down. */
export const LEGENDS = "legends";

/**
 * The map styles, in the order the store and the settings list them.
 * CQ24 (r24): Hard Winter ("winter") is no longer sold: it became the base
 * game's own winter, for everyone (client/WinterLook.ts). Whoever bought it
 * had its price back (server/derpy/RetiredRefunds.ts); an account that still
 * owns the old row is simply not shown it, and a browser that had it chosen
 * draws the usual chart.
 */
export const MAP_STYLES = ["antique", "night", "pirate", "woodcut"] as const;
export type MapStyleKey = (typeof MAP_STYLES)[number];

/** CQ24 (r24): map styles once sold and now retired (their store items' keys). */
export const RETIRED_MAP_STYLES: readonly string[] = ["winter"];

/** A map style's name, as the store sells it and the settings list it. */
export const MAP_STYLE_NAMES: Record<MapStyleKey, string> = {
  antique: "Antique Engraving",
  night: "By Candlelight",
  pirate: "Pirate Chart",
  woodcut: "Woodcut",
};

/** A map style's colours: the store's preview and the map drawn in it share them. */
export interface MapStylePalette {
  sea: string;
  land: string;
  ink: string;
  accent: string;
}

export const MAP_STYLE_PALETTES: Record<MapStyleKey, MapStylePalette> = {
  antique: {
    sea: "#c9b48a",
    land: "#efe2c2",
    ink: "#4a3520",
    accent: "#a8573a",
  },
  night: { sea: "#0e1a2b", land: "#2b2a33", ink: "#e7c66a", accent: "#f3b04a" },
  pirate: {
    sea: "#c8b27a",
    land: "#e4cd94",
    ink: "#5a2e14",
    accent: "#a8261c",
  },
  woodcut: {
    sea: "#e9e1cc",
    land: "#f4ecd6",
    ink: "#141210",
    accent: "#b0302a",
  },
};

/**
 * CQ24 (r24): the colours of Hard Winter, now the base game's winter for
 * everyone (client/WinterLook.ts): snow, ice and the frozen rivers.
 */
export const WINTER_PALETTE: MapStylePalette = {
  sea: "#5d7686",
  land: "#eef2f4",
  ink: "#2c3a44",
  accent: "#8fb3c9",
};

/** A map style's store item ("map_antique"). */
export function mapStyleItem(key: MapStyleKey): string {
  return `map_${key}`;
}

/** What an account owns of Conquest's DLC, as the server tells its browser. */
export interface ConquestDlcOwned {
  /** May host (or load) a game that begins in 1776. */
  campaign1776: boolean;
  /** Legends come to this account's characters. */
  legends: boolean;
  /** The map styles it may use. */
  styles: MapStyleKey[];
}

export const NO_DLC: ConquestDlcOwned = {
  campaign1776: false,
  legends: false,
  styles: [],
};

/**
 * What a list of owned rows (derpy_owned's "pack:<item>") comes to. Pure, so
 * the server and the tests reckon it the same way.
 */
export function dlcFromOwned(owned: readonly string[]): ConquestDlcOwned {
  const has = (item: string) => owned.includes(`pack:${item}`);
  return {
    campaign1776: has(CAMPAIGN_1776),
    legends: has(LEGENDS),
    styles: MAP_STYLES.filter((k) => has(mapStyleItem(k))),
  };
}
