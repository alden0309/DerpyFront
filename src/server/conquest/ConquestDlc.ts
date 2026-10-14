// DLC (r21): Derpy Conquest's store items, checked here on the server, item
// by item, from the account's own rows in derpy_owned (never from anything
// the browser says):
// - "1776: The Revolution": only its owner may host a game that begins in
//   1776 (create it, set it, start it, or load a saved one). Anyone may join
//   one: the host's copy is the game, and friends play in it for free.
// - "Legends": come to the characters of a seat whose account owns it, in
//   any game, whoever hosts (the server marks the seat's life when it sits
//   down: Legends.ts setLegendsOwned).
// - Map styles: the server tells the browser which the account owns, and
//   the browser draws only those (they change nothing in the game).

import {
  CAMPAIGN_1776,
  type ConquestDlcOwned,
  dlcFromOwned,
  NO_DLC,
} from "../../conquest/DlcIds";
import { STARTS } from "../../conquest/engine/Starts";
import type { StartYear } from "../../conquest/engine/Types";
import { ownedItems } from "../derpy/DerpyAuth";
import { derpyDbConfigured } from "../derpy/DerpyDb";

/** An account's owned rows (derpy_owned): the database, or a test's stand-in. */
export type OwnedLookup = (accountId: number) => Promise<string[]>;

export const ownedFromDb: OwnedLookup = (id) => ownedItems(id);

/** What an account owns of Conquest's DLC (nothing for a guest, or without a database). */
export async function dlcOf(
  accountId: number | null,
  lookup: OwnedLookup,
  dbReady: () => boolean = derpyDbConfigured,
): Promise<ConquestDlcOwned> {
  if (accountId === null || !dbReady()) return NO_DLC;
  try {
    return dlcFromOwned(await lookup(accountId));
  } catch {
    return NO_DLC;
  }
}

/** Why an account can't host a game that begins in `start` (null: it may). */
export function hostProblem(
  start: StartYear | undefined,
  dlc: ConquestDlcOwned,
): string | null {
  const need = start !== undefined ? STARTS[start]?.dlc : undefined;
  if (!need) return null;
  if (need === CAMPAIGN_1776 && dlc.campaign1776) return null;
  return "1776: The Revolution is in the Derp Store. Only someone who owns it can host a game that begins in 1776; anyone can join one.";
}

/** Why an account can't load a saved game that began in `start` (null: it may). */
export function loadProblem(
  start: StartYear | undefined,
  dlc: ConquestDlcOwned,
): string | null {
  return hostProblem(start, dlc)
    ? "This game began in 1776. Only someone who owns 1776: The Revolution can pick it up again: ask them to load it, then join."
    : null;
}
