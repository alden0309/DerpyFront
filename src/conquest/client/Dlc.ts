// DLC (r21): what this browser's account owns of Conquest's store items, as
// the server said in its welcome (the server checks ownership itself before
// anything that matters: this is only so the lobby can show a locked start
// and the settings can offer the map styles you own).

import { type ConquestDlcOwned, NO_DLC } from "../DlcIds";

let owned: ConquestDlcOwned = NO_DLC;

/** Fired on window whenever the server tells us again what we own. */
export const DLC_EVENT = "cq-dlc";

export function setDlcOwned(d: ConquestDlcOwned | undefined): void {
  owned = d ?? NO_DLC;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DLC_EVENT));
}

export function dlcOwned(): ConquestDlcOwned {
  return owned;
}

/** Where the store keeps an item's tab. */
export const STORE_CAMPAIGNS = "/store#conquest/campaigns";
export const STORE_LEGENDS = "/store#conquest/legends";
export const STORE_MAP_STYLES = "/store#conquest/mapstyles";
