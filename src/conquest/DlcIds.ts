// DLC (r21): Derpy Conquest's store items, by the names the Derp Store sells
// them under (src/server/derpy/DerpyCatalog.ts) and the server checks an
// account's ownership by (src/server/conquest/ConquestDlc.ts). Shared by the
// server, the engine's tests and the browser, so nothing spells them twice.

/** "1776: The Revolution": a new start date and its campaign. */
export const CAMPAIGN_1776 = "campaign_1776";

/** "Legends": American legends to hunt down. */
export const LEGENDS = "legends";

/** The map styles, in the order the store and the settings list them. */
export const MAP_STYLES = [
  "antique",
  "winter",
  "night",
  "pirate",
  "woodcut",
] as const;
export type MapStyleKey = (typeof MAP_STYLES)[number];

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
