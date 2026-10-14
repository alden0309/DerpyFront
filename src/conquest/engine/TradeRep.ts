// LABOUR2 (r21): what people think of someone with a house in the trade in
// people, and how that changed over the century. Early on, many planters and
// merchants thought a house in the trade a sound man of business (Henry
// Laurens of Charles Town was one of the richest men in the colonies, and
// later President of Congress); the conscientious objected from the first
// (Samuel Sewall's The Selling of Joseph, Boston, 1700; the Friends of
// Germantown, 1688), and more of them with each decade: the Philadelphia
// Yearly Meeting's minute of 1758 shut Friends who bought or sold people out
// of its business, and from 1774 disowned them; Anthony Benezet's pamphlets
// (1759, 1762, 1766, 1771) and Granville Sharp's (1769) went round; in 1772
// Virginia's burgesses called the trade from Africa "a trade of great
// inhumanity" in their address to the King; Benjamin Rush's Address of 1773;
// and the Continental Association of October 1774 swore "we will neither
// import nor purchase any slave imported after the first day of December
// next", with committees to name anyone who did.
//
// Read by opinionOf (LifeQueries.ts), so it needs nothing but the state.

import { dateOf } from "./Calendar";
import type { Explain } from "./Explain";
import { hasTrait } from "./Queries";
import type { Character, GameState, Life } from "./Types";

/** The colonies where Friends were many and their meetings strong. */
const FRIENDS = new Set(["pennsylvania", "newjersey", "delaware", "rhodeisland"]);

/** Years a house's name lingers after it's wound up (at half). */
export const REP_LINGERS = 3;

/** Whether someone's conscience sets them against the trade: ministers, the just, the devout, the tolerant and kind. */
export function conscientious(c: Character): boolean {
  return (
    c.role === "preacher" ||
    hasTrait(c, "just") ||
    hasTrait(c, "zealous") ||
    (hasTrait(c, "tolerant") && hasTrait(c, "generous"))
  );
}

/** What people think of a house in the trade in a year: the conscientious, everyone else, and its own world. */
export function tradeStanding(
  year: number,
  col: string,
): { conscience: number; others: number; trade: number; why: string } {
  const friends = FRIENDS.has(col);
  if (year < 1740)
    return {
      conscience: -4,
      others: 0,
      trade: 2,
      why: "A few speak against the trade (Sewall, 1700; the Friends of Germantown, 1688); most think it business.",
    };
  if (year < 1758)
    return {
      conscience: -6,
      others: 0,
      trade: 2,
      why: "The Awakening's preachers and John Woolman's Some Considerations (1754) trouble the devout.",
    };
  if (year < 1766)
    return {
      conscience: -10,
      others: friends ? -3 : 0,
      trade: 1,
      why: "The Yearly Meeting's minute of 1758 shuts Friends who buy or sell people out of its business; Benezet's pamphlets go round.",
    };
  if (year < 1772)
    return {
      conscience: -14,
      others: friends ? -4 : -2,
      trade: 0,
      why: "Benezet's A Caution and Warning (1766) and Granville Sharp's Representation (1769) are read in the colonies.",
    };
  return {
    conscience: -18,
    others: friends ? -8 : -5,
    trade: 0,
    why: "Somerset's case (1772), Virginia's address against 'a trade of great inhumanity' (1772), Rush's Address (1773), and the Continental Association (1774).",
  };
}

/** How long ago a house was wound up, and whether its name still clings. */
function weight(s: GameState, life: Life): number {
  const h = life.bondTrade;
  if (!h) return 0;
  if (h.closed === undefined) return 1;
  return s.day - h.closed < REP_LINGERS * 365 ? 0.5 : 0;
}

/** Someone's opinion of a player with a house in the trade (a part of opinionOf). */
export function tradeOpinion(
  s: GameState,
  c: Character,
  life: Life,
  e: Explain,
): void {
  const k = weight(s, life);
  if (!k) return;
  const st = tradeStanding(dateOf(s.day).year, life.bondTrade!.col);
  if (conscientious(c)) {
    e.add("Deals in people (the trade)", Math.round(st.conscience * k));
    return;
  }
  if ((c.role === "planter" || c.role === "merchant") && st.trade > 0) {
    e.add("A house in the trade: a man of business", Math.round(st.trade * k));
    return;
  }
  if (st.others) e.add("Deals in people (the trade)", Math.round(st.others * k));
}
