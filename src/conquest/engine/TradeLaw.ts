// LABOUR2 (r21): the law of the trade in people between the colonies.
//
// A house in the trade buys at one port where people were sold and sells at
// another, and both ends' law runs: holding anyone must be lawful at both,
// the colony may forbid bringing people in (Rhode Island and Connecticut in
// 1774, the Continental Association from 1 December 1774), and almost every
// English colony laid a duty on each person brought in, to raise money, to
// "discourage" the trade, or to keep out people sold away from other
// colonies for "ill behaviour". Each colony's duty is reckoned here in its
// own money, act by act, and turned into the game's coins at that money's
// worth against sterling.
//
// Sources (checked for this round; see the FEATURES notes):
// - W. E. B. Du Bois, The Suppression of the African Slave-Trade to the
//   United States of America, 1638-1870 (1896), Appendix A, "A Chronological
//   Conspectus of Colonial and State Legislation", which quotes or abstracts
//   each act below with its citation (Hening's Statutes for Virginia, Bacon's
//   Laws for Maryland, Cooper's Statutes for South Carolina, the Province Laws
//   for Massachusetts, the Laws of New York, Carey and Bioren for
//   Pennsylvania, the New Jersey Archives, Rhode Island's Colonial Records):
//   Virginia's 20s. a head of 1699 (re-enacted 1705, 1710, 1712), 5 per cent
//   of the price paid by the buyer from 1732 (to 1778), 5 more in 1740-44 and
//   from 1754, 10 more in 1755-60 (repealed "inasmuch as the same prevents
//   the importation of slaves") and 10 more from 9 July 1758 to March 1761;
//   Maryland's 10s. (1695), 20s. (1704), 20s. more for the schools (1717),
//   10s. (1754), 20s. (1756, five years), £2 (1763) and £5 (1771, seven
//   years); South Carolina's 10s. and 20s. (1703), £2 more on Africans
//   (1714), £3 and £30 (1716), £10 and £30 (1719), £10 and £50 unless "new
//   negroes ... not six months on shoar in any part of America" (1722), the
//   prohibitive £100 and £150 after Stono (5 April 1740, to April 1745), £10
//   a head by height (1751) with £50 more on any six months in another
//   colony, and £100 more from 1 January 1766 (the act of 25 August 1764: no
//   new Africans were legally landed at Charleston from late 1765 to early
//   1769, per the Charleston County Public Library's Charleston Time
//   Machine); Pennsylvania's duties as Edward Raymond Turner, Slavery in
//   Pennsylvania (1911), ch. I, tells them (20s. in 1700, doubled in 1705,
//   the prohibitive £20 of June 1712 disallowed in 1713, £5 from 1715, £2
//   from 1729 "for a generation", £10 in 1761, £20 from 1773), against Du
//   Bois's act titles (10s. 1705, 40s. 1710, £10 1726, 40s. 1729); New
//   Jersey's £10 for seven years (1713) and £15 proclamation money on the
//   purchaser (16 November 1769); Massachusetts's £4 a head (from 1 May
//   1706); Rhode Island's £3 (1708, repealed 1732); New York's £3 on any not
//   brought "directly from their native country" (1709), 5 and 10 ounces of
//   plate (1716 and 1753), and £2 and £4 (1728, 1732, 1734); Georgia's ban
//   (1735; repealed from 1751, BondLaw.ts).
// - John J. McCusker, Money and Exchange in Europe and America, 1600-1775:
//   A Handbook (1978): each colony's currency against sterling, rounded here
//   to a value for each stretch of years (Virginia about 125 to £100
//   sterling; Pennsylvania and New York 150 to 180; South Carolina about 700
//   from 1731; Massachusetts's old tenor sinking toward 700 to 1000 before
//   the reform of 1750; proclamation money 133⅓).
// - The asiento of 26 March 1713 (Du Bois, Appendix A): Spain's ports took
//   people only from the company holding the contract (Britain's South Sea
//   Company, 1713-1739), so a private house of another crown couldn't sell
//   there lawfully; the Company of the Indies had Louisiana's trade to itself
//   from 1719 until it gave the colony back to the king in 1731.

import {
  colonyOf,
  holdingLawful,
  importBan,
  lawOf,
  MARKETS,
  POUND,
  type Colony,
  type LawOf,
} from "./BondLaw";
import { dateOf } from "./Calendar";
import type { GameState, MapDef } from "./Types";

// ---------------------------------------------------------------- money

/** Virginia's pounds to £100 sterling: the game's coins are reckoned in Chesapeake money. */
export const VIRGINIA_RATE = 125;

/** A colony's money: its pounds to £100 sterling, in a year (rounded from McCusker). */
export function currencyRate(col: Colony, year: number): number {
  switch (col) {
    case "virginia":
      return year >= 1755 && year <= 1764 ? 135 : 125;
    case "maryland":
      return year < 1733 ? 133 : year < 1760 ? 150 : 166;
    case "pennsylvania":
    case "delaware":
      return year < 1723 ? 133 : year < 1740 ? 155 : 170;
    case "newjersey":
      return year < 1723 ? 133 : 170;
    case "newyork":
      return year < 1715 ? 150 : 175;
    case "massachusetts":
    case "maine":
    case "newhampshire":
    case "rhodeisland":
    case "connecticut":
      // Old tenor sank until the reform of 1750 put it at 133⅓ ("lawful money").
      return year < 1712
        ? 135
        : year < 1722
          ? 160
          : year < 1732
            ? 250
            : year < 1741
              ? 400
              : year < 1750
                ? 800
                : 133;
    case "southcarolina":
    case "georgia":
      return year < 1715 ? 150 : year < 1723 ? 400 : year < 1731 ? 650 : 700;
    case "northcarolina":
      return 200;
    case "jamaica":
      return 140;
    case "islands":
    case "bermuda":
    case "bahamas":
      return 135;
    default:
      return VIRGINIA_RATE;
  }
}

/** What a sum in a colony's own pounds comes to in the game's coins (Virginia money). */
export function localCoins(col: Colony, year: number, pounds: number): number {
  return (pounds * POUND * VIRGINIA_RATE) / currencyRate(col, year);
}

/** An ounce of silver plate, in sterling (New York laid its duty by the ounce). */
export const PLATE_OUNCE = 0.27;

// ---------------------------------------------------------------- the duties

/** One act's part of the duty on someone brought in. */
export interface DutyPart {
  /** "Virginia's act of 1732 (5 in 100 of the price, paid by the buyer)". */
  law: string;
  /** The coins it comes to, for this person. */
  coins: number;
}

/** The duty on one person brought into a colony for sale. */
export interface Duty {
  coins: number;
  parts: DutyPart[];
  /** Meant to stop the trade, not to tax it. */
  prohibitive: boolean;
}

/** Someone brought in: their price at the sale, and whether they came lately from Africa. */
export interface DutyOn {
  price: number;
  /** Lately from Africa (not six months ashore in America). */
  fresh: boolean;
}

const ym = (y: number, m = 1) => y * 12 + (m - 1);

/** Whether [from, to) holds a month (`to` left out: still in force). */
const inForce = (now: number, from: number, to?: number) =>
  now >= from && (to === undefined || now < to);

/**
 * The duty a colony laid on one person brought in by sea for sale, in a
 * month: every act then in force, each in the colony's own money, turned
 * into coins. Only English colonies laid them in the sources used; French
 * and Spanish ports' charges aren't reckoned.
 */
export function importDuty(
  col: Colony,
  law: LawOf,
  year: number,
  month: number,
  on: DutyOn,
): Duty {
  const now = year * 12 + month;
  const parts: DutyPart[] = [];
  let prohibitive = false;
  if (law !== "english") return { coins: 0, parts, prohibitive };
  const L = (pounds: number) => localCoins(col, year, pounds);
  const add = (text: string, coins: number) =>
    parts.push({ law: text, coins: Math.round(coins * 100) / 100 });
  const pct = (text: string, p: number) => add(text, on.price * p);
  switch (col) {
    case "virginia": {
      if (inForce(now, ym(1699, 4), ym(1723, 5)))
        add("Virginia's act of 1699 and its renewals (20s. a head)", L(1));
      if (inForce(now, ym(1732, 5), ym(1778)))
        pct("Virginia's act of 1732 (5 in 100 of the price, from the buyer)", 0.05);
      if (inForce(now, ym(1740, 5), ym(1744, 7)))
        pct("the act of 1740 (5 in 100 more, for the war)", 0.05);
      if (inForce(now, ym(1754, 2), ym(1778)))
        pct("the act of 1754 (5 in 100 more, for the settlers on the Mississippi's waters)", 0.05);
      if (inForce(now, ym(1755, 5), ym(1760, 5))) {
        pct("the act of 1755 (10 in 100 more; repealed in 1760 because it stopped the trade)", 0.1);
        prohibitive = true;
      }
      if (inForce(now, ym(1758, 7), ym(1761, 3)))
        pct("the act of 1757, from July 1758 (10 in 100 more)", 0.1);
      break;
    }
    case "maryland": {
      if (inForce(now, ym(1695, 5), ym(1704, 10)))
        add("Maryland's act of 1695 (10s. a head)", L(0.5));
      if (inForce(now, ym(1704, 10), ym(1778)))
        add("the act of 1704 and its renewals (20s. a head)", L(1));
      if (inForce(now, ym(1717, 6), ym(1778)))
        add("the act of 1717 (20s. more, for the public schools)", L(1));
      if (inForce(now, ym(1754, 7), ym(1778)))
        add("the act of 1754 (10s. more)", L(0.5));
      if (inForce(now, ym(1756, 3), ym(1761, 3)))
        add("the act of 1756 (20s. more, for five years)", L(1));
      if (inForce(now, ym(1763, 11), ym(1778)))
        add("the act of 1763 (£2 more)", L(2));
      if (inForce(now, ym(1771, 1), ym(1778)))
        add("the act of 1771 (£5 more, for seven years)", L(5));
      break;
    }
    case "southcarolina": {
      const america = !on.fresh;
      if (inForce(now, ym(1703, 5), ym(1716, 6)))
        add(
          "South Carolina's act of 1703 (10s. on Africans, 20s. on others)",
          L(america ? 1 : 0.5),
        );
      if (inForce(now, ym(1715, 6), ym(1716, 6)) && !america)
        add("the act of 1714 (£2 more on Africans)", L(2));
      if (inForce(now, ym(1716, 6), ym(1719, 3)))
        add(
          "the act of 1716 (£3 on Africans, £30 on any from America)",
          L(america ? 30 : 3),
        );
      if (inForce(now, ym(1719, 3), ym(1722, 2)))
        add(
          "the act of 1719 (£10 on Africans, £30 on any from America)",
          L(america ? 30 : 10),
        );
      if (
        inForce(now, ym(1722, 2), ym(1740, 4)) ||
        inForce(now, ym(1745, 4), ym(1751, 6))
      )
        add(
          america
            ? "the act of 1722 (£50 on any who've been six months in another colony: they might be sent off for 'ill behaviour')"
            : "the act of 1722 (£10 a head)",
          L(america ? 50 : 10),
        );
      if (inForce(now, ym(1740, 4), ym(1745, 4))) {
        add(
          "the act of April 1740, after the rising at Stono (£100 on Africans, £150 on any from America)",
          L(america ? 150 : 100),
        );
        prohibitive = true;
      }
      if (inForce(now, ym(1751, 6), ym(1775))) {
        add("the act of 1751 (£10 a head, for settling white Protestants)", L(10));
        if (america)
          add("the act of 1751 (£50 more on any six months in another colony)", L(50));
      }
      if (inForce(now, ym(1766, 1), ym(1769, 1))) {
        add(
          "the act of 25 August 1764 (£100 more, from 1 January 1766 for three years)",
          L(100),
        );
        prohibitive = true;
      }
      break;
    }
    case "pennsylvania": {
      // As Turner tells it (Slavery in Pennsylvania, 1911, ch. I): 20s. in
      // 1700, doubled in 1705, the £20 of 1712 disallowed, £5 from 1715
      // (disallowed in 1719 and passed again and again), £2 from 1729.
      if (inForce(now, ym(1700, 6), ym(1705, 1)))
        add("Pennsylvania's act of 1700 (20s. a head)", L(1));
      if (
        inForce(now, ym(1705, 1), ym(1712, 6)) ||
        inForce(now, ym(1713, 2), ym(1715, 5))
      )
        add("the acts of 1705 and 1710 (40s. a head)", L(2));
      if (inForce(now, ym(1712, 6), ym(1713, 2))) {
        add(
          "the act of June 1712 'to prevent the Importation of Negroes' (£20; disallowed in 1713)",
          L(20),
        );
        prohibitive = true;
      }
      if (inForce(now, ym(1715, 5), ym(1729, 5)))
        add("the act of 1715 and its renewals (£5)", L(5));
      if (inForce(now, ym(1729, 5), ym(1761, 3)))
        add("the act of 1729 (£2)", L(2));
      if (inForce(now, ym(1761, 3), ym(1773, 2)))
        add("the act of 1761 (£10)", L(10));
      if (inForce(now, ym(1773, 2))) {
        add("the act of 1773 (£20 in all: few ships come)", L(20));
        prohibitive = true;
      }
      break;
    }
    case "newjersey": {
      if (inForce(now, ym(1713, 3), ym(1720, 3)))
        add("New Jersey's act of 1713 (£10, for seven years)", L(10));
      if (inForce(now, ym(1769, 11)))
        add(
          "the act of November 1769 (£15 proclamation money, from the purchaser)",
          (15 * POUND * VIRGINIA_RATE) / 133,
        );
      break;
    }
    case "massachusetts":
    case "maine":
    case "newhampshire": {
      if (inForce(now, ym(1706, 5)))
        add(
          "Massachusetts' act of 1705 (£4 a head, from 1 May 1706; paid back if they're sold on within the year)",
          L(4),
        );
      break;
    }
    case "rhodeisland": {
      if (inForce(now, ym(1708, 2), ym(1732, 5)))
        add("Rhode Island's act of 1708 (£3 a head; repealed in 1732)", L(3));
      break;
    }
    case "newyork": {
      // Brought from another colony: never "directly from their native country".
      if (inForce(now, ym(1709, 9), ym(1716, 6)))
        add(
          "New York's act of 1709 (£3 on any not brought directly from Africa)",
          L(3),
        );
      if (inForce(now, ym(1716, 6), ym(1728, 9)))
        add(
          "the act of 1716 (10 ounces of plate on any brought from elsewhere)",
          10 * PLATE_OUNCE * POUND * (VIRGINIA_RATE / 100),
        );
      if (inForce(now, ym(1728, 9), ym(1753, 12)))
        add(
          "the act of 1728 (£4 on any brought from elsewhere; £2 from Africa)",
          L(4),
        );
      if (inForce(now, ym(1753, 12), ym(1775)))
        add(
          "the act of 1753 (10 ounces of plate on any brought from elsewhere)",
          10 * PLATE_OUNCE * POUND * (VIRGINIA_RATE / 100),
        );
      break;
    }
    default:
      break;
  }
  const coins = Math.round(parts.reduce((m, x) => m + x.coins, 0) * 100) / 100;
  return { coins, parts, prohibitive };
}

/** The duty at a port on a day, for one person (the colony and crown from the map). */
export function dutyAt(
  s: GameState,
  map: MapDef,
  p: number,
  on: DutyOn,
  day: number = s.day,
): Duty {
  const d = dateOf(day);
  return importDuty(colonyOf(map, p), lawOf(s, p).law, d.year, d.month, on);
}

// ---------------------------------------------------------------- where a house may trade

/** A house's crown: it trades between its own crown's ports. */
export type HouseLaw = "english" | "french" | "spanish";

/** Whether a port has a sale of people at all (one of the trade's ports, for this crown, now). */
export function tradePort(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): boolean {
  const id = map.provinces[p]?.id;
  if (!id) return false;
  const year = dateOf(day).year;
  const { law } = lawOf(s, p);
  return MARKETS.some(
    (x) =>
      x.id === id &&
      x.law === law &&
      year >= x.from &&
      (x.to === undefined || year < x.to),
  );
}

/** Whether a house of a crown may buy at a port now, and why not. */
export function buyAt(
  s: GameState,
  map: MapDef,
  house: HouseLaw,
  p: number,
  day: number = s.day,
): { ok: boolean; why: string } {
  const name = map.provinces[p]?.name ?? "There";
  if (!tradePort(s, map, p, day))
    return { ok: false, why: `${name} has no sale of people.` };
  const { law } = lawOf(s, p);
  if (law !== house)
    return {
      ok: false,
      why: `${name} is under ${law === "spanish" ? "Spain's" : law === "french" ? "France's" : law === "dutch" ? "the Dutch" : "another crown's"} law: its sales are for its own crown's merchants.`,
    };
  if (!holdingLawful(s, map, p, day))
    return { ok: false, why: `The law at ${name} doesn't allow anyone to be held.` };
  const ban = importBan(s, map, p, day);
  if (ban) return { ok: false, why: `No ships bring people to ${name} now. ${ban}` };
  return { ok: true, why: "" };
}

/** Whether a house of a crown may sell at a port now, and why not. */
export function sellAt(
  s: GameState,
  map: MapDef,
  house: HouseLaw,
  p: number,
  day: number = s.day,
): { ok: boolean; why: string } {
  const name = map.provinces[p]?.name ?? "There";
  if (!tradePort(s, map, p, day))
    return {
      ok: false,
      why: `Nobody sells people at ${name}: the trade went through particular ports.`,
    };
  const { law } = lawOf(s, p);
  if (law !== house)
    return {
      ok: false,
      why:
        law === "spanish"
          ? `${name} is Spain's: its ports take people only from the company that holds the asiento (Britain's South Sea Company, 1713 to 1739). Anything else is smuggling.`
          : `${name} is under another crown's law: its colonies take people only in their own ships.`,
    };
  if (!holdingLawful(s, map, p, day))
    return { ok: false, why: `The law at ${name} doesn't allow anyone to be held.` };
  const ban = importBan(s, map, p, day);
  if (ban) return { ok: false, why: ban };
  const col = colonyOf(map, p);
  const year = dateOf(day).year;
  if (house === "french" && col === "louisiana" && year < 1731)
    return {
      ok: false,
      why: "The Company of the Indies alone brings people to Louisiana (1719 to 1731).",
    };
  return { ok: true, why: "" };
}

/** The ports a house of a crown could buy at, or sell at, now. */
export function housePorts(
  s: GameState,
  map: MapDef,
  house: HouseLaw,
  side: "buy" | "sell",
  day: number = s.day,
): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  for (const m of MARKETS) {
    if (seen.has(m.id)) continue;
    const p = map.provinces.findIndex((x) => x.id === m.id);
    if (p < 0) continue;
    const ok =
      side === "buy"
        ? buyAt(s, map, house, p, day).ok
        : sellAt(s, map, house, p, day).ok;
    if (ok) {
      seen.add(m.id);
      out.push(p);
    }
  }
  return out;
}

/** The crown whose law a house would trade under, from where its holder lives. */
export function houseLawOf(law: LawOf): HouseLaw | null {
  return law === "english" || law === "french" || law === "spanish"
    ? law
    : null;
}
