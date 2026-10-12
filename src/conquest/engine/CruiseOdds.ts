// SEA (r15): a cruise's risk and reward, reckoned from the same table the
// engine rolls from (CruiseData.ts) and the same checks (checkChance), under
// the captain's usual way of going on: give chase to any lawful prize (a
// pirate's any at all) but a galleon too strong for her, call on her to
// strike and board her if she won't, send every prize in with a prize crew,
// and run from a man-of-war. What's shown before you sign is what happens,
// on average and in its odds (the SEA test checks it against hundreds of
// cruises sailed).

import { BOATS } from "./Boats";
import {
  boardDc,
  chaseDc,
  CREW_PARTS,
  CRUISE,
  GROUND_BY_KEY,
  hullPace,
  PREY,
  ROLE_PARTS,
  runDc,
  strikeDc,
  WARSHIP,
  WOUND,
} from "./CruiseData";
import { checkChance } from "./LifeRules";
import { chanceWords, type OddsOutcome, type OddsView } from "./Odds";
import type { BoatKind, CruiseFlag, CruiseRole, GameState } from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** What the odds depend on. */
export interface CruisePlan {
  flag: CruiseFlag;
  /** The commission's nation (a privateer). */
  nation: number;
  kind: BoatKind;
  guns: number;
  hull: number;
  ground: string;
  /** Days on the ground. */
  hunt: number;
  /** The captain's skills. */
  sea: number;
  fight: number;
  lead: number;
  /** In wartime (more men-of-war about, and prizes retaken). */
  war: boolean;
  /** Which nations are lawful prize (a privateer's enemies); a pirate takes anyone. */
  lawful: (nation: number) => boolean;
  /** The flags of the ground, as nations (-1 for nobody's now). */
  flags: number[];
}

/** One chance on the ground: what it comes to, under the captain's usual way. */
export interface ChanceOdds {
  /** A prize taken, of each kind. */
  prize: number;
  byKind: Record<string, number>;
  /** Taken by a man-of-war (the cruise is over). */
  taken: number;
  /** A fight at close quarters (wounds). */
  fight: number;
  /** Of the prizes, what each fetches on average (her fair value). */
  value: number;
  /** The least and most a prize fetches (not a galleon), and a galleon's. */
  lo: number;
  hi: number;
  galleon: number;
}

/** Whether the captain would give chase to this one. */
export function wouldChase(
  plan: Pick<CruisePlan, "flag" | "guns" | "lawful">,
  kind: string,
  flag: number,
): boolean {
  if (plan.flag === "privateer" && !plan.lawful(flag)) return false;
  if (kind === "galleon" && plan.guns < 12) return false;
  return true;
}

/** The odds of a chance, summed over her kind, her flag and her guns. */
export function chanceOdds(plan: CruisePlan): ChanceOdds {
  const ground = GROUND_BY_KEY.get(plan.ground);
  const ours = hullPace(BOATS[plan.kind].speed, plan.hull);
  const kinds = PREY.filter((k) => k.kind !== "galleon" || ground?.galleons);
  const total = kinds.reduce((m, k) => m + k.w, 0);
  const warship = plan.war ? CRUISE.warshipWar : CRUISE.warship;
  const out: ChanceOdds = {
    prize: 0,
    byKind: {},
    taken: 0,
    fight: 0,
    value: 0,
    lo: Infinity,
    hi: 0,
    galleon: 0,
  };
  // A man-of-war: run.
  const escape = checkChance(plan.sea, runDc(ours));
  out.taken = CRUISE.sail * warship * (1 - escape);
  let valueSum = 0;
  for (const k of kinds) {
    const pk = (CRUISE.sail * (1 - warship) * k.w) / total;
    const chase = checkChance(plan.sea, chaseDc(k.speed, ours));
    // Over her flags, as they come.
    let lawful = 0;
    for (const f of plan.flags)
      if (wouldChase(plan, k.kind, f)) lawful += 1 / plan.flags.length;
    if (!lawful) continue;
    // Over her guns, each as likely.
    let take = 0;
    let fight = 0;
    const n = k.guns[1] - k.guns[0] + 1;
    for (let gn = k.guns[0]; gn <= k.guns[1]; gn++) {
      const strike = checkChance(plan.lead, strikeDc(gn, plan.flag));
      const board = checkChance(plan.fight, boardDc(gn, plan.guns));
      take += (strike + (1 - strike) * board) / n;
      fight += (1 - strike) / n;
    }
    const p = pk * lawful * chase * take;
    out.prize += p;
    out.byKind[k.kind] = (out.byKind[k.kind] ?? 0) + p;
    out.fight += pk * lawful * chase * fight;
    valueSum += p * ((k.value[0] + k.value[1]) / 2);
    if (k.kind === "galleon") out.galleon += p;
    else {
      out.lo = Math.min(out.lo, k.value[0]);
      out.hi = Math.max(out.hi, k.value[1]);
    }
  }
  out.value = out.prize ? valueSum / out.prize : 0;
  if (!Number.isFinite(out.lo)) out.lo = 0;
  return out;
}

/** Chances on the ground in a cruise of `hunt` days. */
export function chancesIn(hunt: number): number {
  return Math.max(1, Math.floor(hunt / CRUISE.chanceDays));
}

/**
 * How many prizes a cruise takes, as a chance of each count (0, 1, 2, ...),
 * and the chance she's taken herself before her time is up.
 */
export function prizeCounts(
  plan: CruisePlan,
  chances = chancesIn(plan.hunt),
): { counts: number[]; taken: number; c: ChanceOdds } {
  const c = chanceOdds(plan);
  const none = 1 - c.prize - c.taken;
  // alive[n]: still cruising with n prizes; done[n]: taken with n.
  let alive = [1];
  const done: number[] = [];
  for (let i = 0; i < chances; i++) {
    const next = new Array(alive.length + 1).fill(0);
    alive.forEach((p, n) => {
      next[n] += p * none;
      next[n + 1] += p * c.prize;
      done[n] = (done[n] ?? 0) + p * c.taken;
    });
    alive = next;
  }
  const counts = alive.map((p, n) => p + (done[n] ?? 0));
  const taken = done.reduce((m, p) => m + p, 0);
  return { counts, taken, c };
}

/** The parts of the crew's share: hers and the players', all told. */
export function totalParts(
  kind: BoatKind,
  flag: CruiseFlag,
  roles: CruiseRole[],
): number {
  const parts = ROLE_PARTS[flag];
  // The captain's parts are there whoever commands (a player or not).
  let n = CREW_PARTS[kind] + parts.captain;
  for (const r of roles) if (r !== "captain") n += parts[r];
  return n;
}

/** What of a prize's fair value comes to you: your parts, and the owners' half if she's yours. */
export function shareFraction(o: {
  flag: CruiseFlag;
  kind: BoatKind;
  role: CruiseRole;
  /** The other players' roles aboard (besides yours). */
  others: CruiseRole[];
  /** She's your own boat (or your part of a company's ship, 0 to 1). */
  owner: number;
  /** A pirate's sale: what the fence pays (haven, den, quay). */
  fence: number;
}): number {
  const parts = ROLE_PARTS[o.flag];
  const total = totalParts(o.kind, o.flag, [o.role, ...o.others]);
  const mine = parts[o.role] / total;
  if (o.flag === "privateer") {
    const net = 1 - CRUISE.court;
    return net * ((1 - CRUISE.owners) * mine + CRUISE.owners * o.owner);
  }
  const ship = o.owner > 0 ? CRUISE.pirateShip : 0;
  return o.fence * ((1 - ship) * mine + ship * o.owner);
}

export interface CruiseOddsOpts {
  plan: CruisePlan;
  role: CruiseRole;
  others: CruiseRole[];
  owner: number;
  fence: number;
  /** The passage out and home, in days (for the cruise's whole length). */
  passage: number;
  /** Victuals and powder you find (owning her), once. */
  outfit: number;
  title: string;
}

/** Risk and reward of a cruise, before you sign: the shape LEDGER's odds panel shows. */
export function cruiseOdds(s: GameState, o: CruiseOddsOpts): OddsView {
  const { plan } = o;
  const K = chancesIn(plan.hunt);
  const { counts, taken, c } = prizeCounts(plan, K);
  const frac = shareFraction({
    flag: plan.flag,
    kind: plan.kind,
    role: o.role,
    others: o.others,
    owner: o.owner,
    fence: o.fence,
  });
  const retake = plan.war ? CRUISE.retakeWar : CRUISE.retake;
  const keep = 1 - retake;
  const each = c.value * keep * frac;
  const meanCount = counts.reduce((m, p, n) => m + p * n, 0);
  const share = (v: number) => r1(v * keep * frac);
  const outcomes: OddsOutcome[] = [];
  const p0 = counts[0] ?? 0;
  outcomes.push({ label: "nothing taken", p: p0, lo: 0, hi: 0, bad: true });
  const p1 = counts[1] ?? 0;
  if (p1 > 0)
    outcomes.push({
      label: "one prize",
      p: p1,
      lo: share(c.lo),
      hi: share(c.hi),
    });
  const p2 = counts[2] ?? 0;
  if (p2 > 0)
    outcomes.push({
      label: "two prizes",
      p: p2,
      lo: share(c.lo * 2),
      hi: share(c.hi * 2),
    });
  const p3 = counts.slice(3).reduce((m, p) => m + p, 0);
  if (p3 > 0.001)
    outcomes.push({
      label: "three or more",
      p: p3,
      lo: share(c.lo * 3),
      hi: share(c.hi * Math.max(3, K)),
    });
  const galleonP = 1 - Math.pow(1 - c.galleon, K);
  const gal = PREY.find((k) => k.kind === "galleon")!;
  if (galleonP > 0.001)
    outcomes.push({
      label: "a treasure galleon among them",
      p: galleonP,
      lo: share(gal.value[0]),
      hi: share(gal.value[1]),
      note: "the plate fleet's stragglers, or a galleon of the Main",
    });
  const expected = r1(meanCount * each);
  const months = Math.max(1, (plan.hunt + o.passage) / 30);
  const wound = 1 - Math.pow(1 - c.fight * WOUND[o.role], K);
  const risks: OddsView["risks"] = [
    {
      label: `Taken by a man-of-war (${WARSHIP.guns} guns)`,
      p: taken,
      note:
        plan.flag === "pirate"
          ? "taken for piracy: the gaol, a trial, and the rope"
          : `prisoners${o.owner > 0 ? ", and she's lost" : ""}, exchanged in time`,
    },
    {
      label: "Wounded boarding a prize",
      p: wound,
      note: "a cutlass, a splinter, a pistol ball",
    },
    {
      label: "A prize retaken before she makes port",
      p: retake,
      note: "each prize sent in",
    },
  ];
  if (plan.hunt + o.passage > CRUISE.scurvyAfter)
    risks.push({
      label: "Scurvy, on a long cruise",
      p: Math.min(0.9, (plan.hunt + o.passage - CRUISE.scurvyAfter) / 40),
      note: "limes and fresh water cure it, if you'll put in for them",
    });
  const ours = hullPace(BOATS[plan.kind].speed, plan.hull);
  const factors = [
    `Her pace ${r1(ours)} (a ${BOATS[plan.kind].name.toLowerCase()}${plan.hull < 90 ? `, her hull at ${Math.round(plan.hull)}` : ""}): a snow is 1.05, a schooner 1.4, a man-of-war ${WARSHIP.speed}.`,
    `The captain's seamanship ${plan.sea} (the chase, and running), leadership ${plan.lead} (making her strike), fighting ${plan.fight} (boarding her if she won't).`,
    `${plan.guns} guns: a galleon is chased only with 12 or more; more guns, an easier boarding.`,
    plan.war
      ? "War: more men-of-war about (1 in 10 sails), and more prizes retaken."
      : "Peace: fewer men-of-war about (1 in 16 sails).",
    plan.flag === "privateer"
      ? "A privateer takes only her commission's enemies: the rest are let go."
      : "Pirates take any ship at all, and every prize draws the law's heat.",
  ];
  const lawful = plan.flags.filter((f) =>
    plan.flag === "pirate" ? true : plan.lawful(f),
  ).length;
  if (plan.flag === "privateer" && !lawful)
    factors.unshift("No enemy of your commission sails these waters now.");
  return {
    title: o.title,
    ok: true,
    costNow: r1(o.outfit),
    costMonth: 0,
    per: "trip",
    days: [plan.hunt + o.passage, plan.hunt + o.passage + 10],
    outcomes,
    expected,
    lo: 0,
    hi: share(c.hi * Math.max(3, K)),
    net: r1((expected - o.outfit) / months),
    risks,
    factors,
  };
}

/** "1 in 3" for a chance, from LEDGER's words. */
export { chanceWords };
