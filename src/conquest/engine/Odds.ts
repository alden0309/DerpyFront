// LEDGER (r15): risk and reward, shown plainly before you commit. What a
// boat's work can bring in a month and what can go wrong; what a clerk's
// trading trip can come to; what a crew or a hired hand costs. Every figure
// is reckoned from the same tables the month's work is rolled from
// (BOAT_WORK in Boats.ts, TRADE_LUCK in Followers.ts), so what's shown is
// what happens, on average and in its odds (the LEDGER test checks it).

import {
  BOAT_WEAR,
  BOAT_WORK,
  boatKnack,
  boatMaster,
  BOATS,
  boatWinter,
  CREW_BOUNTY,
  CREW_WAGE,
  USE_NAMES,
} from "./Boats";
import { isMonthStart } from "./Calendar";
import {
  followerSkill,
  peopleOf,
  SIGNING,
  TRADE_LUCK,
  TRADE_TRIP,
  tradeAtWar,
  tradeShift,
} from "./Followers";
import { meOf, skillLevel } from "./LifeQueries";
import type { World } from "./Map";
import type { Boat, BoatUse, Follower, GameState, Life } from "./Types";

/** One way it can go. */
export interface OddsOutcome {
  /** "a rich voyage". */
  label: string;
  /** Its chance, 0 to 1. */
  p: number;
  /** The coins it brings in (a trip: what comes back), from lo to hi. */
  lo: number;
  hi: number;
  /** What else happens with it ("she's lost with her cargo"). */
  note?: string;
  bad?: boolean;
}

/** Risk and reward of a piece of work, before you put your money to it. */
export interface OddsView {
  /** "Whaling, a month". */
  title: string;
  /** Whether it can be done now, and why not. */
  ok: boolean;
  why?: string;
  /** What it costs: once (signing, a stake) and each month (wages, keep). */
  costNow: number;
  costMonth: number;
  /** A month's work, or a trip. */
  per: "month" | "trip";
  /** A trip's length in days. */
  days?: [number, number];
  outcomes: OddsOutcome[];
  /** Coins it's expected to bring in (a month or a trip), and the range. */
  expected: number;
  lo: number;
  hi: number;
  /** What's expected a month, all told: what it brings in less what it costs. */
  net: number;
  /** Dangers to the boat and crew, or to your money, besides the outcomes. */
  risks: { label: string; p: number; note?: string }[];
  /** What changes the odds, as it stands for you now. */
  factors: string[];
}

// ---------------------------------------------------------------- words

/** "1 in 5", "2 in 3", "7 in 20", "all but 1 in 80" for a chance. */
export function chanceWords(p: number): string {
  if (p <= 0) return "never";
  if (p >= 0.995) return "certain";
  for (const b of [2, 3, 4, 5, 6, 8, 10])
    for (let a = 1; a < b; a++)
      if (Math.abs(p - a / b) < 0.006) return `${a} in ${b}`;
  if (p < 0.25) return `1 in ${Math.max(2, Math.round(1 / p))}`;
  if (p > 0.9) return `all but 1 in ${Math.round(1 / (1 - p))}`;
  const n = Math.round(p * 20);
  for (const d of [2, 4, 5, 10])
    if (n % (20 / d) === 0) return `${n / (20 / d)} in ${d}`;
  return `${n} in 20`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The first day of the next month (when the month's work is reckoned). */
export function nextTurn(day: number): number {
  let d = day + 1;
  while (!isMonthStart(d)) d++;
  return d;
}

/** A month's luck between two multipliers, split into thirds: poor, fair, good. */
function thirds(
  amount: number,
  spread: readonly [number, number],
  p: number,
  names: [string, string, string],
): OddsOutcome[] {
  const [lo, width] = spread;
  const step = width / 3;
  return names.map((label, i) => ({
    label,
    p: p / 3,
    lo: r1(amount * (lo + step * i)),
    hi: r1(amount * (lo + step * (i + 1))),
  }));
}

// ---------------------------------------------------------------- boats

export interface BoatOddsOpts {
  /** Reckon with this many hands aboard (a full crew to show before hiring). */
  crew?: number;
  /** Her master's skill (a mate you'd give her to), else whoever commands her now. */
  skill?: number;
  /** The day her month is reckoned (the next month's turn by default). */
  day?: number;
}

/** What a boat's work comes to in a month, and its dangers. */
export function boatJobOdds(
  s: GameState,
  w: World,
  life: Life,
  b: Boat,
  use: BoatUse,
  o: BoatOddsOpts = {},
): OddsView {
  const def = BOATS[b.kind];
  const map = w.map;
  const prov = map.provinces[b.prov];
  const crew = o.crew ?? b.crew;
  const m = boatMaster(s, life, b);
  // Her skipper's wages are part of what she costs a month.
  const skipper = peopleOf(life).find(
    (f) => f.task?.kind === "boat" && f.task.boat === b.id,
  );
  const costMonth = r1(
    def.upkeep +
      crew * CREW_WAGE +
      (o.skill === undefined ? (skipper?.wage ?? 0) : 0),
  );
  const hire = Math.max(0, crew - b.crew) * CREW_BOUNTY;
  const skill = o.skill ?? m?.skill ?? skillLevel(s, life, "seamanship");
  const knack = boatKnack(skill);
  const day = o.day ?? nextTurn(s.day);
  const winter = boatWinter(map, b.prov, day);
  const wear =
    (use === "idle" ? BOAT_WEAR.idle : BOAT_WEAR.work) +
    (b.quirk === "leaks a little" ? BOAT_WEAR.leak : 0);
  const repairs = r1((wear * def.price) / 250);
  const who =
    o.skill !== undefined
      ? `her master's seamanship ${skill}`
      : m?.you
        ? `your seamanship ${skill} (you command her)`
        : m
          ? `her skipper's seamanship ${skill}`
          : `your seamanship ${skill}`;
  const factors = [
    `Her master: ${who}, ×${r2(knack)} on what she brings in (×0.7 with none, ×1.5 at 20).`,
    ...(skipper && o.skill === undefined
      ? [`Her skipper's wages, ${skipper.wage} a month, are in what she costs.`]
      : []),
  ];
  const risks: OddsView["risks"] = [
    {
      label: `Wear: −${wear} to her soundness a month, about ${repairs} in repairs at a yard`,
      p: 1,
    },
  ];
  const view: OddsView = {
    title: `${USE_NAMES[use]}, a month`,
    ok: true,
    costNow: hire,
    costMonth,
    per: "month",
    outcomes: [],
    expected: 0,
    lo: 0,
    hi: 0,
    net: -costMonth,
    risks,
    factors,
  };
  if (!def.uses.includes(use)) {
    view.ok = false;
    view.why = `A ${def.name.toLowerCase()} can't be used for that.`;
    return view;
  }
  if (crew < def.crew) {
    view.ok = false;
    view.why = `She needs ${def.crew} hands to sail (she has ${crew}).`;
  } else if (use !== "idle" && !m && o.skill === undefined) {
    view.ok = false;
    view.why =
      "She only works with you aboard in port, or a mate of yours as her skipper.";
  }
  const done = (exp: number, lo: number, hi: number) => {
    view.expected = r1(exp);
    view.lo = r1(lo);
    view.hi = r1(hi);
    view.net = r1(exp - costMonth);
    return view;
  };
  switch (use) {
    case "idle":
      view.title = "Laid up, a month";
      return done(0, 0, 0);
    case "fishing": {
      const F = BOAT_WORK.fishing;
      const fishy = (w.raw[b.prov] as string) === "fish";
      const a =
        F.base[b.kind] *
        (fishy ? F.grounds : 1) *
        knack *
        (winter ? F.winter : 1);
      view.outcomes = thirds(a, F.spread, 1, [
        "a thin month",
        "a fair month",
        "a full hold",
      ]);
      risks.push({
        label: `A squall on the banks: −${F.squall.damage} to her soundness`,
        p: F.squall.p,
      });
      factors.push(
        fishy
          ? `The fishing grounds: fish are thick off ${prov.name} (×${F.grounds}).`
          : `The fishing grounds: ordinary off ${prov.name} (×${F.grounds} where fish is the country's good).`,
        winter
          ? `The season: winter here, ×${F.winter} until the spring.`
          : `The season: a northern winter takes it down to ×${F.winter}.`,
        `Her size: a ${def.name.toLowerCase()} brings in ${F.base[b.kind]} a month at the start.`,
      );
      return done(
        a * (F.spread[0] + F.spread[1] / 2),
        a * F.spread[0],
        a * (F.spread[0] + F.spread[1]),
      );
    }
    case "whaling": {
      const W = BOAT_WORK.whaling;
      if (prov.lat < W.minLat) {
        view.ok = false;
        view.why = `No whales this far south: whalers sail from north of New York.`;
      }
      const a = W.base[b.kind] * knack;
      view.outcomes = [
        { label: "an empty voyage", p: W.empty, lo: 0, hi: 0, bad: true },
        ...thirds(a, W.luck, 1 - W.empty, [
          "a poor voyage",
          "a fair voyage",
          "a rich voyage",
        ]),
      ];
      risks.push({
        label: `A boat stove in by a whale: −${W.stove.damage} to her soundness, and a man lost`,
        p: W.stove.p,
      });
      factors.push(
        `The whaling grounds: only north of ${W.minLat}° (Long Island, New England, the Banks).`,
        `Her size: a ${def.name.toLowerCase()} takes ${W.base[b.kind]} a voyage at the start.`,
      );
      return done(
        (1 - W.empty) * a * (W.luck[0] + W.luck[1] / 2),
        0,
        a * (W.luck[0] + W.luck[1]),
      );
    }
    case "trading": {
      const T = BOAT_WORK.trading;
      const a = def.loads * T.perLoad * knack;
      view.outcomes = [
        ...thirds(a, T.spread, 1 - T.lost, [
          "a poor run",
          "a fair run",
          "a good run",
        ]),
        {
          label: "lost with her cargo",
          p: T.lost,
          lo: 0,
          hi: 0,
          note: "she's gone",
          bad: true,
        },
      ];
      risks.push({ label: "Lost at sea with her cargo", p: T.lost });
      factors.push(
        `Her hold: ${def.loads} loads (the bigger the hold, the more she carries).`,
      );
      return done(
        (1 - T.lost) * a * (T.spread[0] + T.spread[1] / 2),
        0,
        a * (T.spread[0] + T.spread[1]),
      );
    }
    case "smuggling": {
      const S = BOAT_WORK.smuggling;
      const a = def.loads * S.perLoad * knack;
      view.outcomes = [
        ...thirds(a, S.spread, 1 - S.seized, [
          "a poor run",
          "a fair run",
          "a good run",
        ]),
        {
          label: "seized by the customs",
          p: S.seized,
          lo: 0,
          hi: 0,
          note: `she's gone, and +${S.seizedHeat} heat`,
          bad: true,
        },
      ];
      risks.push(
        { label: `The law's heat: +${S.heat} every month`, p: 1 },
        {
          label: `Seized, cargo and all (+${S.seizedHeat} heat)`,
          p: S.seized,
        },
      );
      factors.push(
        `Her hold: ${def.loads} loads (twice a coaster's profit on each).`,
        "The heat: a red heat badge means the watch is looking for you.",
      );
      return done(
        (1 - S.seized) * a * (S.spread[0] + S.spread[1] / 2),
        0,
        a * (S.spread[0] + S.spread[1]),
      );
    }
    case "privateering": {
      const P = BOAT_WORK.privateering;
      const me = meOf(s, life);
      const war =
        !!me && s.wars.some((x) => x.a === me.nation || x.b === me.nation);
      const a = def.guns * P.perGun * knack;
      const kept = 1 - P.taken;
      view.outcomes = [
        {
          label: "no prize this month",
          p: (1 - P.prize) * kept,
          lo: 0,
          hi: 0,
        },
        ...thirds(a, P.spread, P.prize * kept, [
          "a small prize",
          "a fair prize",
          "a rich prize",
        ]),
        {
          label: `taken by a ${war ? "enemy" : "navy"} frigate`,
          p: P.taken,
          lo: 0,
          hi: 0,
          note: "she's gone, prize and all",
          bad: true,
        },
      ];
      risks.push(
        {
          label: `A fight with a merchantman: −${P.fight.damage} to her soundness, a fifth of her crew lost`,
          p: P.fight.p,
        },
        { label: "Taken by a frigate", p: P.taken },
      );
      if (!war)
        risks.push({
          label: `With no war on it's piracy: +${P.pirateHeat} heat every month`,
          p: 1,
        });
      factors.push(
        war
          ? "War: your nation is at war, so her prizes are lawful (and +1 renown each)."
          : "War: there's no war on, so it's piracy (the law's heat, no renown).",
        `Her guns: ${def.guns} (a prize is worth ${P.perGun} a gun at the start).`,
      );
      return done(
        P.prize * kept * a * (P.spread[0] + P.spread[1] / 2),
        0,
        a * (P.spread[0] + P.spread[1]),
      );
    }
  }
}

/** Every use a boat can be put to, side by side (for choosing). */
export function boatChoices(
  s: GameState,
  w: World,
  life: Life,
  b: Boat,
  o: BoatOddsOpts = {},
): { use: BoatUse; view: OddsView }[] {
  return BOATS[b.kind].uses.map((use) => ({
    use,
    view: boatJobOdds(s, w, life, b, use, o),
  }));
}

/** Hands to sign: what it costs now and every month after. */
export function crewOdds(b: Boat, n: number): { now: number; month: number } {
  const more = Math.max(0, n - b.crew);
  return {
    now: more * CREW_BOUNTY,
    month: r1(Math.max(0, n) * CREW_WAGE + BOATS[b.kind].upkeep),
  };
}

// ---------------------------------------------------------------- a trader's trip

export interface TradeOddsOpts {
  /** The trader's skill at trade (their own work). */
  skill: number;
  loyalty?: number;
  war?: boolean;
  /** Their wage a month (to set against what they make). */
  wage?: number;
}

/** What a trading trip with this stake can come to. */
export function tradeOdds(stake: number, o: TradeOddsOpts): OddsView {
  const shift = tradeShift(o.skill, !!o.war);
  const cum = (c: number) => Math.max(0, Math.min(1, c - shift));
  let edge = 0;
  let acc = 0;
  const run = (o.loyalty ?? 100) < TRADE_TRIP.disloyal ? TRADE_TRIP.runs : 0;
  const rest = 1 - run;
  const outcomes: OddsOutcome[] = [];
  TRADE_LUCK.forEach((luck, i) => {
    acc += luck.p;
    const top = i === TRADE_LUCK.length - 1 ? 1 : cum(acc);
    const p = (top - edge) * rest;
    edge = top;
    const back = r1(stake * luck.x);
    outcomes.push({
      label: luck.text.replace(/:.*/, ""),
      p,
      lo: back,
      hi: back,
      note: luck.x === 0 ? `${stake} lost` : `${back} back for ${stake}`,
      bad: luck.x < 1,
    });
  });
  if (run)
    outcomes.unshift({
      label: "they never come back",
      p: run,
      lo: 0,
      hi: 0,
      note: `a disloyal clerk keeps your ${stake}`,
      bad: true,
    });
  const backEv = outcomes.reduce((m, x) => m + x.p * x.lo, 0);
  const [d0, d1] = TRADE_TRIP.days;
  const months = (d0 + d1) / 2 / 30.4;
  const gain = backEv - stake;
  const wage = o.wage ?? 0;
  const factors = [
    `Their trade: ${o.skill}, which turns the odds ${Math.round(Math.min(TRADE_TRIP.skillMax, o.skill * TRADE_TRIP.skillStep) * 100)} in 100 your way (at most ${Math.round(TRADE_TRIP.skillMax * 100)}).`,
    o.war
      ? `War: the roads and the sea are worse, ${Math.round(TRADE_TRIP.war * 100)} in 100 the wrong way.`
      : `War would turn the odds ${Math.round(TRADE_TRIP.war * 100)} in 100 the wrong way.`,
    run
      ? `Loyalty ${Math.round(o.loyalty ?? 0)}: below ${TRADE_TRIP.disloyal}, ${chanceWords(TRADE_TRIP.runs)} they keep the stake. A bonus or a promotion mends it.`
      : `Loyalty: a clerk below ${TRADE_TRIP.disloyal} may run off with the stake.`,
    "The stake: what comes back is in proportion to it, losses too.",
  ];
  return {
    title: `A trading trip with ${stake}`,
    ok: true,
    costNow: stake,
    costMonth: wage,
    per: "trip",
    days: [d0, d1],
    outcomes,
    expected: r1(gain),
    lo: -stake,
    hi: r1(stake * TRADE_LUCK[TRADE_LUCK.length - 1].x - stake),
    net: r1(gain / months - wage),
    risks: [
      {
        label: "Robbed on the road, or the cargo lost",
        p: outcomes.find((x) => x.label === "lost")?.p ?? 0,
      },
      ...(run ? [{ label: "Runs off with the stake", p: run }] : []),
    ],
    factors,
  };
}

/** A clerk of yours, trading with a stake. */
export function clerkOdds(s: GameState, f: Follower, stake: number): OddsView {
  return tradeOdds(stake, {
    skill: followerSkill(s, f),
    loyalty: f.loyalty,
    war: tradeAtWar(s, f),
    wage: f.wage,
  });
}

/** Expected coins a trip makes, a month (less nothing: wages are their own line). */
export function tripPerMonth(v: OddsView): number {
  const [d0, d1] = v.days ?? TRADE_TRIP.days;
  return r1(v.expected / ((d0 + d1) / 2 / 30.4));
}

// ---------------------------------------------------------------- hiring

/** What taking someone into your service costs: signing money now, then wages. */
export function hireCost(wage: number): { now: number; month: number } {
  return { now: SIGNING, month: wage };
}
