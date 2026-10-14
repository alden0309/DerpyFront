// DLC (r21): the 1776 campaign's questions that other modules ask (is this
// the campaign, who's who, what the campaign holds still), apart from the
// campaign itself (Campaign1776.ts) so they import nothing heavy.

import type { Campaign76, GameState, Life, RevSide } from "./Types";

// ---------------------------------------------------------------- who's who

/** The year the campaign begins, and the store item that opens it. */
export const CAMPAIGN_YEAR = 1776;

/** A game that began in 1776 (and so is the campaign). */
export function isCampaign(s: GameState): boolean {
  return s.settings.start === CAMPAIGN_YEAR;
}

const byKey = (s: GameState, key: string) =>
  s.nations.findIndex((n) => n.key === key);

/** The United Colonies (from 4 July 1776 the United States): the map's English colony. */
export function usOf(s: GameState): number {
  return isCampaign(s) ? byKey(s, "england") : -1;
}

/** British America: the colonies that stayed loyal. */
export function britainOf(s: GameState): number {
  return isCampaign(s) ? byKey(s, "britain") : -1;
}

/** The King's own forces in America: the United Colonies' crown. */
export function kingOf(s: GameState): number {
  return isCampaign(s) ? byKey(s, "crown-england") : -1;
}

/** The campaign's record (on the United Colonies). */
export function campaignOf(s: GameState): Campaign76 | undefined {
  const n = usOf(s);
  return n >= 0 ? s.nations[n].r76 : undefined;
}

// ---------------------------------------------------------------- the end of the world

/** The words for the end of the world: 1776, or the campaign's peace. */
export function endWords(s: GameState): {
  year: number;
  reached: string;
  lived: string;
  told: string;
  over: string;
} {
  if (!isCampaign(s))
    return {
      year: 1776,
      reached: "The world has reached 1776.",
      lived: "lived to see 1776",
      told: "It is 1776. Whatever comes next, your story ends here.",
      over: "It is 1776. The story ends here.",
    };
  return {
    year: 1784,
    reached: "The war is over and the world has reached 1784.",
    lived: "lived to see the peace",
    told: "It is 1784. The war is over, the peace is signed, and whatever comes next, your story ends here.",
    over: "It is 1784, and the peace is signed. The story ends here.",
  };
}

/** A player's side in the war (GOV r21's rising sides, on the United Colonies). */
export function sideOf(s: GameState, life: Life): RevSide | undefined {
  const us = usOf(s);
  if (us < 0) return undefined;
  return s.nations[us]?.desk?.rev?.sides[life.seat];
}

// ---------------------------------------------------------------- what the campaign holds still

/**
 * In the campaign the war's armies are where the beats put them: the
 * computer doesn't march the King's armies, or the Continental Army's main
 * army (`army`: an army's id; without it, whether all a nation's are held).
 * The United Colonies' other regiments defend the frontier as any colony's
 * would. A player who commands an army marches it as they please.
 */
export function campaignHoldsArmy(
  s: GameState,
  n: number,
  army?: number,
): boolean {
  if (!isCampaign(s)) return false;
  const us = usOf(s);
  if (!s.nations[us]?.rebelling) return false;
  if (n === kingOf(s)) return true;
  return n === us && army !== undefined && army === campaignOf(s)?.armies?.main;
}

/**
 * The war between the Americans and the King is the campaign's: the United
 * Colonies' regiments don't go at the King's garrisons or into British
 * America, and British America's don't come into the United Colonies.
 */
export function campaignForbids(s: GameState, n: number, p: number): boolean {
  if (!isCampaign(s)) return false;
  const us = usOf(s);
  if (!s.nations[us]?.rebelling) return false;
  const pr = s.provinces[p];
  const br = britainOf(s);
  const king = kingOf(s);
  const held = pr.occupier >= 0 ? pr.occupier : pr.owner;
  if (n === br) return pr.owner === us || held === us;
  if (n === us)
    return (
      held === king ||
      held === br ||
      pr.owner === br ||
      s.armies.some((a) => a.prov === p && a.owner === king)
    );
  return false;
}

/** No peace between the United Colonies and British America but the Treaty of Paris. */
export function campaignWar(s: GameState, a: number, b: number): boolean {
  if (!isCampaign(s)) return false;
  const us = usOf(s);
  const br = britainOf(s);
  if (!s.nations[us]?.rebelling) return false;
  return (a === us && b === br) || (a === br && b === us);
}

/** The rising's own rules wait on the campaign's beats. */
export function campaignRising(s: GameState, n: number): boolean {
  return isCampaign(s) && n === usOf(s);
}

/** In the campaign, Europe's wars are history's (no others start, none end early). */
export function campaignEurope(s: GameState): boolean {
  return isCampaign(s);
}

/** A loyalist may serve the King where his army holds the town (a Loyalist regiment). */
export function servesHere(s: GameState, life: Life, holderN: number): boolean {
  if (!isCampaign(s)) return false;
  const side = sideOf(s, life);
  return (
    side === "loyal" && (holderN === kingOf(s) || holderN === britainOf(s))
  );
}

/** The army a soldier serves in, by name (the Continental Army, a Loyalist regiment). */
export function armyName(s: GameState, n: number): string | null {
  if (!isCampaign(s)) return null;
  if (n === usOf(s)) return "the Continental Army";
  if (n === kingOf(s)) return "a Loyalist regiment";
  return null;
}

/** The Continental Congress's committees and boards, for the colony's council seats. */
export const CONGRESS_TITLES: Record<string, string> = {
  spymaster: "Secretary of Congress",
  treasurer: "Board of Treasury",
  attorney: "Judge advocate",
  surveyor: "Geographer of the army",
  marshal: "Board of War",
  envoy: "Committee for Foreign Affairs",
  chaplain: "Chaplain to Congress",
  speaker: "Speaker of the house",
};
