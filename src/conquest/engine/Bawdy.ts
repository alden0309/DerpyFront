// LIFE (r21): the bawdy house, in a great port or a colony's capital. A
// place to spend an evening: punch, cards and a fiddler in the parlour, or
// company upstairs, behind a door that closes (nothing is described). It
// eases the mind; it carries a small chance of the French pox, which marks
// the body for good; and people talk, the minister first, and a husband or
// wife may hear of it.
//
// Its rules, kept everywhere:
// - only grown people, eighteen and over, on both sides of the door;
// - never anyone held in bondage or bound by indenture: the house is kept by
//   free women and men who work for themselves (and a bound servant has no
//   evenings of his own to spend there);
// - the scene fades out at the door.
//
// The odds the parlour's choices show are the ones rolled here (`BAWDY`).

import { isBound } from "./BondCore";
import type { ConquestGame } from "./Game";
import { touchLife } from "./LifeCore";
import { type Check, meOf, no, skillLevel, yes } from "./LifeQueries";
import { ldice, markOn, r21Of } from "./LifeR21Core";
import type { World } from "./Map";
import { ageOf, settlers } from "./Queries";
import type { GameState, Life } from "./Types";

export const BAWDY = {
  /** A town of this many settlers or more, that's a port or the capital. */
  minFolk: 1500,
  /** Grown people only. */
  minAge: 18,
  /** Days before another evening there. */
  rest: 14,
  /** The parlour: punch, cards and a song. */
  parlour: { cost: 1, stress: -5, seen: 1 / 12 },
  /** Company for the evening: the cost by your station, the cares it takes. */
  company: { cost: [2, 3, 5] as const, stress: -12, seen: 1 / 5, pox: 1 / 25 },
  /** Your stealth makes it less likely you're seen: this much a point, to this least. */
  stealthPer: 0.006,
  seenLeast: 0.03,
  /** Married and seen: the chance your husband or wife hears of it (in the same town). */
  spouseHears: 1 / 2,
  /** Days before the pox shows itself. */
  poxDays: [14, 35] as [number, number],
  /** What the pox takes at once. */
  poxHealth: 15,
  /** A rake's name lasts this long after you're seen. */
  rakeDays: 365,
};

/** Whether a town has a bawdy house: a great port or a colony's capital. */
export function bawdyIn(s: GameState, w: World, p: number): boolean {
  const pr = s.provinces[p];
  const owner = pr?.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!owner || owner.kind !== "power") return false;
  if (settlers(pr) < BAWDY.minFolk) return false;
  const port = w.map.provinces[p]?.coastal && (pr.b.port ?? 0) > 0;
  return port || owner.capital === p;
}

/** Whether you may spend an evening there now. */
export function bawdyCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (ageOf(s, me) < BAWDY.minAge) return no("Not until you're eighteen.");
  if (isBound(me) || life.job?.kind === "servant")
    return no("A bound servant has no evenings of their own.");
  return yes;
}

/** What company costs you: by your station (labouring folk, the middling, the great). */
export function companyCost(level: number): number {
  return BAWDY.company.cost[level >= 3 ? 2 : level >= 1 ? 1 : 0];
}

export interface BawdyOdds {
  /** The chance you're seen and talked of, in the parlour and upstairs. */
  seenParlour: number;
  seenCompany: number;
  /** The French pox, upstairs. */
  pox: number;
  /** Married: your husband or wife hears of it (if you're seen). */
  spouse: number | null;
  /** What makes them. */
  why: { label: string; value: string }[];
}

/** The odds the parlour shows, from the same numbers the evening rolls. */
export function bawdyOdds(s: GameState, life: Life): BawdyOdds {
  const me = meOf(s, life);
  const stealth = skillLevel(s, life, "stealth");
  const off = Math.min(0.15, stealth * BAWDY.stealthPer);
  const seenParlour = Math.max(BAWDY.seenLeast, BAWDY.parlour.seen - off / 2);
  const seenCompany = Math.max(BAWDY.seenLeast, BAWDY.company.seen - off);
  const sp = me ? s.chars[me.spouse] : undefined;
  const spouse =
    sp?.alive && (sp.home ?? life.home) === life.prov
      ? BAWDY.spouseHears
      : sp?.alive
        ? BAWDY.spouseHears / 4
        : null;
  const why = [
    { label: "Seen and talked of, in the parlour", value: pc(seenParlour) },
    { label: "Seen and talked of, upstairs", value: pc(seenCompany) },
    {
      label: `Your stealth (${stealth})`,
      value: off > 0 ? `−${Math.round(off * 100)} in 100` : "nothing",
    },
    { label: "The French pox, upstairs", value: pc(BAWDY.company.pox) },
  ];
  if (spouse !== null)
    why.push({
      label:
        spouse === BAWDY.spouseHears
          ? "Seen, your husband or wife hears of it (at home here)"
          : "Seen, your husband or wife hears of it (from afar)",
      value: pc(spouse),
    });
  return { seenParlour, seenCompany, pox: BAWDY.company.pox, spouse, why };
}

const pc = (p: number) => `${Math.round(p * 1000) / 10} in 100`;

/** The evening's dice: seen, the pox, the spouse (round 21's own stream). */
export function bawdyRoll(
  g: ConquestGame,
  life: Life,
  upstairs: boolean,
): { seen: boolean; pox: boolean; spouse: boolean } {
  const s = g.s;
  const o = bawdyOdds(s, life);
  const r = ldice(s, 0xb4d, life.c, (life.r21?.bawdy ?? []).length);
  const seen = r.chance(upstairs ? o.seenCompany : o.seenParlour);
  const pox = upstairs && !markOn(s, life, "pox") && r.chance(o.pox);
  const spouse = seen && o.spouse !== null && r.chance(o.spouse);
  return { seen, pox, spouse };
}

/** Note the evening (the last year's are kept). */
export function noteVisit(g: ConquestGame, life: Life): void {
  const r = r21Of(touchLife(g, life));
  r.bawdy = [...(r.bawdy ?? []).filter((d) => g.s.day - d < 365), g.s.day];
}
