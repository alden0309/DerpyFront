// BUSINESS (r15): a business that pays when it's run sensibly, and says
// plainly why when it doesn't. One reckoning for every business, a player's
// own and a firm's alike (Property.ts and Firms.ts both call it):
//
//   - the town's custom: how many hands' worth of trade of its kind the town
//     can use (by its size, its port and what the country makes), less what
//     its rivals already take (the innkeeper's inn, another player's store);
//     hands past the custom bring in little;
//   - a new business builds its custom over its first three months;
//   - the season (a farm at the harvest, an inn in the summer, a ship in a
//     northern winter);
//   - who minds it: the master in person (whose own work at the counter or
//     the forge is half the takings of a small place), a manager put in, or
//     nobody (and then it takes 0.6 of what it should);
//   - the hands, their wages, the upkeep and the excise.
//
// Also the advice that says why a business loses money, the plan of a new
// one month by month, setting one up alone, hands taken on from the town and
// let go, a manager put in, and the month's account kept for its page.
// Nothing here rolls dice: a business's month is as its forecast says.

import { dateOf, dayOf } from "./Calendar";
import { followerSkill } from "./Followers";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import {
  BUSINESS_HANDS,
  BUSINESS_UPKEEP,
  EXCISE,
  EXPAND_COST,
  HAND_TAKINGS,
  HAND_WAGE,
  JOBS,
  roleJobs,
  ROLES,
  SHIP_UPKEEP_MULT,
  SKILL_NAMES,
  skillWeight, // LIFE (r21)
  WORK_DAYS,
} from "./LifeRules";
import type { World } from "./Map";
import { bizCost, bizJobs, firmsOf } from "./PartnersCore";
import { charName, people } from "./Queries";
import type {
  AffairItem,
  BizMonth,
  BizState,
  Character,
  Follower,
  GameState,
  JobKind,
  Life,
  Property,
} from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** "+0.5", "−4". */
const sgn = (v: number) =>
  `${r1(v) > 0 ? "+" : r1(v) < 0 ? "−" : ""}${Math.abs(r1(v))}`;

// ---------------------------------------------------------------- the rules' numbers

/** The master's own work a month (at skill 8), when they work the place themselves. */
export const MASTER_TAKINGS = 3;
/** What a business takes with nobody minding it, of what it should. */
export const UNMINDED = 0.6;
/** What a hand past the town's custom brings in, of a hand's takings. */
export const OVERFLOW = 0.3;
/** A new business's custom in its first months (then it's built). */
export const RAMP = [0.5, 0.7, 0.85];
/** Months of a business's account kept. */
export const ACCT_MONTHS = 12;
/** A business that keeps losing warns you at most this often. */
const WARN_DAYS = 90;

/** What a town's custom for a trade is made of. */
interface TradeCustom {
  /** Hands' worth of custom in a middling town, per unit of the town's size. */
  w: number;
  /** When it's busiest. */
  season: SeasonKey;
  /** A port's trade adds this much per level of port (0 for none). */
  port?: number;
  /** Without a port it does a fraction of the trade (a ship inland...). */
  inland?: number;
  /** What the country makes, if it helps: the good, and how much. */
  raw?: { good: string[]; x: number };
  /** In a word, what brings its custom. */
  what: string;
}

type SeasonKey =
  | "harvest"
  | "mill"
  | "sea"
  | "travel"
  | "trade"
  | "furs"
  | "craft";

/** A year of custom by the month (January first), the year's mean 1. */
const SEASON_RAW: Record<SeasonKey, number[]> = {
  harvest: [0.7, 0.7, 0.8, 0.9, 1, 1, 1.05, 1.15, 1.35, 1.35, 1.1, 0.85],
  mill: [0.85, 0.8, 0.8, 0.85, 0.9, 0.95, 1, 1.15, 1.35, 1.3, 1.1, 0.95],
  sea: [0.6, 0.6, 0.8, 1, 1.15, 1.2, 1.2, 1.2, 1.15, 1.1, 1, 0.8],
  travel: [0.85, 0.85, 0.9, 1, 1.05, 1.1, 1.15, 1.15, 1.05, 1, 0.95, 0.95],
  trade: [0.9, 0.85, 0.9, 0.95, 1, 1, 0.95, 1, 1.05, 1.15, 1.15, 1.1],
  furs: [0.8, 0.8, 1, 1.3, 1.3, 1.1, 1, 0.9, 0.9, 1, 1, 0.9],
  craft: [0.85, 0.85, 0.95, 1, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1, 0.95],
};

/** The same, each scaled so its year comes to twelve months of custom. */
export const SEASONS: Record<SeasonKey, number[]> = Object.fromEntries(
  Object.entries(SEASON_RAW).map(([k, v]) => {
    const mean = v.reduce((a, b) => a + b, 0) / 12;
    return [k, v.map((x) => x / mean)];
  }),
) as Record<SeasonKey, number[]>;

/** Each trade's custom: how much a town has for it, and when. */
export const TRADE_CUSTOM: Partial<Record<JobKind, TradeCustom>> = {
  farmer: {
    w: 2.5,
    season: "harvest",
    raw: { good: ["grain", "tobacco", "sugar"], x: 1.3 },
    what: "the colony's markets for its crops",
  },
  millhand: {
    w: 0.8,
    season: "mill",
    raw: { good: ["timber", "grain"], x: 1.25 },
    what: "timber and grain to saw and grind",
  },
  newsman: {
    w: 0.4,
    season: "trade",
    what: "printing for the town and the government",
  },
  sailor: {
    w: 1,
    season: "sea",
    port: 0.5,
    inland: 0.3,
    what: "freight in and out of the port",
  },
  clerk: {
    w: 0.8,
    season: "trade",
    port: 0.4,
    what: "the merchants' business of the port",
  },
  craftsman: { w: 0.9, season: "craft", what: "the townsfolk's orders" },
  trapper: {
    w: 0.6,
    season: "furs",
    raw: { good: ["furs"], x: 2 },
    what: "pelts coming in from the woods",
  },
  innkeeper: {
    w: 1,
    season: "travel",
    what: "travellers and the town's thirst",
  },
  blacksmith: { w: 0.8, season: "craft", what: "horses, tools and ironwork" },
  cooper: {
    w: 0.6,
    season: "craft",
    port: 0.2,
    raw: { good: ["fish", "sugar", "tobacco"], x: 1.4 },
    what: "casks for what the country sends away",
  },
  tanner: { w: 0.6, season: "craft", what: "hides and leather" },
  ropewalker: {
    w: 0.5,
    season: "craft",
    port: 0.4,
    inland: 0.4,
    what: "cordage for the shipping",
  },
  shipwright: {
    w: 0.5,
    season: "craft",
    port: 0.5,
    inland: 0.3,
    raw: { good: ["timber"], x: 1.3 },
    what: "hulls to build and mend",
  },
  carpenter: { w: 0.8, season: "craft", what: "houses and furniture" },
  miller: {
    w: 0.8,
    season: "mill",
    raw: { good: ["grain"], x: 1.4 },
    what: "the country's grain to grind",
  },
  brewer: { w: 0.7, season: "travel", what: "the taverns' beer" },
  distiller: {
    w: 0.6,
    season: "craft",
    raw: { good: ["sugar"], x: 1.6 },
    what: "molasses to still into rum",
  },
  fisherman: {
    w: 1,
    season: "sea",
    raw: { good: ["fish"], x: 1.6 },
    what: "the fishing grounds",
  },
  apothecary: { w: 0.4, season: "trade", what: "the town's sick" },
  shopkeeper: { w: 1, season: "trade", what: "the town's shopping" },
};

const customOf = (job: JobKind): TradeCustom =>
  TRADE_CUSTOM[job] ?? { w: 0.8, season: "craft", what: "the town's trade" };

// ---------------------------------------------------------------- the town's custom

/** One rival for a business's custom. */
export interface Rival {
  /** A character (the innkeeper), or -1 for a firm. */
  c: number;
  name: string;
  /** Hands' worth of the custom they take. */
  hands: number;
}

export interface TownCustom {
  /** Hands' worth of custom for the trade in the town, all told. */
  room: number;
  rivals: Rival[];
  /** What's left for this business. */
  free: number;
  /** What makes the room: the town's size, the port, what the country makes. */
  why: string[];
}

/** The business a computer character's trade gives them (their own shop, inn...). */
export function npcBizJob(c: Character | undefined): JobKind | null {
  if (!c?.role) return null;
  const ok = new Set(bizJobs());
  return roleJobs(c.role).find((k) => ok.has(k)) ?? null;
}

/** How big a computer character's own business is, by their means (as Partners.ts). */
export function npcLevel(c: Character): number {
  const wealth = c.role ? ROLES[c.role].wealth : 0;
  return wealth >= 50 ? 3 : wealth >= 25 ? 2 : 1;
}

/** A town's size in the reckoning of custom (a hamlet 2.5, a great port 8). */
export function townSize(s: GameState, p: number): number {
  const pr = s.provinces[p];
  if (!pr) return 2;
  return 2 + Math.sqrt(Math.max(0, people(pr))) / 12;
}

/**
 * The custom a town has for a trade, and who takes it already. `self`: the
 * business being reckoned (so it isn't its own rival). `w` adds what the
 * country makes (without it, that's left out).
 */
export function townCustom(
  s: GameState,
  p: number,
  job: JobKind,
  self: { prop?: number; firm?: number; chars?: number[] } = {},
  w?: World,
): TownCustom {
  const t = customOf(job);
  const why: string[] = [];
  const size = townSize(s, p);
  let room = t.w * size;
  why.push(`the town's size (${Math.round(people(s.provinces[p]))} souls)`);
  const port = s.provinces[p]?.b.port ?? 0;
  if (t.port !== undefined) {
    if (port > 0) {
      room *= 1 + t.port * port;
      why.push(port >= 2 ? "a great port" : "a port");
    } else if (t.inland !== undefined) {
      room *= t.inland;
      why.push("no port to speak of");
    }
  }
  if (w && t.raw && t.raw.good.includes(w.raw[p] as string)) {
    room *= t.raw.x;
    why.push(`the country's ${w.raw[p]}`);
  }
  const rivals: Rival[] = [];
  // Computer characters with a business of this trade in the town (unless
  // their business is in a firm, which counts as itself below).
  const inFirm = new Set<number>();
  for (const f of firmsOf(s))
    if (f.status === "trading" && f.biz && f.prov === p && f.biz.job === job)
      for (const x of f.partners) inFirm.add(x.c);
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (!c?.alive || c.abroad || inFirm.has(c.id) || lifeOfChar(s, c.id))
      continue;
    if (self.chars?.includes(c.id)) continue;
    if (npcBizJob(c) !== job) continue;
    rivals.push({
      c: c.id,
      name: charName(c),
      hands: r1((BUSINESS_HANDS[npcLevel(c)] ?? 2) * 0.5),
    });
  }
  // Players' own businesses of the trade.
  for (const l of s.lives) {
    if (l.watching) continue;
    for (const pr of l.property ?? []) {
      if (pr.kind !== "business" || pr.job !== job || pr.prov !== p) continue;
      if (pr.id === self.prop) continue;
      rivals.push({
        c: l.c,
        name: charName(s.chars[l.c]),
        hands: handCount(pr) + 1,
      });
    }
  }
  // Firms' businesses of the trade.
  for (const f of firmsOf(s)) {
    if (f.status !== "trading" || !f.biz || f.prov !== p) continue;
    if (f.biz.job !== job || f.id === self.firm) continue;
    rivals.push({ c: -1, name: f.name, hands: f.biz.hands + 1 });
  }
  const taken = rivals.reduce((m, x) => m + x.hands, 0);
  return {
    room: r1(room),
    rivals,
    free: r1(Math.max(0.5, room - taken)),
    why,
  };
}

/** A northern town: the winter takes the sea and the roads down. */
export function northern(w: World | undefined, p: number): boolean {
  const def = w?.map.provinces[p];
  return def ? def.lat > 30 : true;
}

/** The season's custom in a month (0 January), in a northern town or not. */
export function seasonFactor(
  job: JobKind,
  month: number,
  north = true,
): number {
  const v = SEASONS[customOf(job).season][((month % 12) + 12) % 12];
  return north ? v : 1 + (v - 1) * 0.4;
}

// ---------------------------------------------------------------- a month's reckoning

/** Everything a business's month is reckoned from. */
export interface BizInput {
  job: JobKind;
  level: number;
  hands: number;
  /** Hands paid wages (players working as hands are paid by the day, elsewhere). */
  paid?: number;
  /** Whoever minds it: their skill in the trade (the owner's, if nobody does). */
  skill: number;
  minded: boolean;
  /** Why nobody minds it, if nobody does. */
  away?: string;
  /** The master's own work: worked into the takings, paid as their wage, or none. */
  master: "work" | "wage" | "none";
  /** Who minds it, in a word ("you", "Agnes", "your manager Tom"). */
  who?: string;
  /** The town's custom free for it, in hands' worth (Infinity: unreckoned). */
  custom: number;
  /** The month being worked (0 January); -1 for a year's average. */
  month: number;
  north: boolean;
  /** Months open, while its custom is building. */
  months?: number;
  /** The enemy holds the town. */
  held: boolean;
  /** A native town: no excise. */
  native: boolean;
  /** A manager's wage (paid with your people's, shown here). */
  mgrWage?: number;
}

/** A business's month, line by line. */
export interface BizView {
  takings: number;
  /** Of the takings, the master's own work. */
  master: number;
  wages: number;
  upkeep: number;
  excise: number;
  /** A manager's wage (not in `profit` for a player's own: it's paid with their people). */
  mgr: number;
  /** Takings less wages, upkeep and excise. */
  profit: number;
  /** A hand's takings at full custom this month. */
  perHand: number;
  /** Custom this month (after the months it's taking to build). */
  custom: number;
  /** Hands with custom to serve, and hands past it. */
  served: number;
  idle: number;
  season: number;
  ramp: number;
  skillF: number;
  input: BizInput;
}

/**
 * What a hand brings in, by the skill of whoever minds the place: a novice
 * (0) 0.6 of a hand's takings, a fair hand (8) all of it, a master (20) 1.6.
 */
export function skillFactor(skill: number): number {
  return 0.6 + Math.max(0, Math.min(25, skillWeight(skill))) / 20; // LIFE (r21): to 30, past 20 half
}

/** The master's own work a month, by their skill: little from a novice, much from a master. */
export function masterWork(skill: number): number {
  return MASTER_TAKINGS * Math.min(2, Math.max(0, skill) / 8);
}

/** What a business's place costs to keep a month. */
export function placeUpkeep(job: JobKind, level: number): number {
  return (
    (BUSINESS_UPKEEP[level] ?? 0) * (job === "sailor" ? SHIP_UPKEEP_MULT : 1)
  );
}

/** Reckon a business's month. */
export function bizMonth(i: BizInput): BizView {
  const skillF = skillFactor(i.skill);
  const season = i.month < 0 ? 1 : seasonFactor(i.job, i.month, i.north);
  const ramp =
    i.months !== undefined && i.months < RAMP.length ? RAMP[i.months] : 1;
  const mind = i.minded ? 1 : UNMINDED;
  const custom = Number.isFinite(i.custom) ? i.custom * ramp : Infinity;
  // The master's place at the counter comes first; then the hands.
  const masterHere = i.master !== "none" && i.minded;
  const masterServed = masterHere ? Math.min(1, custom) : 0;
  const served = Math.min(i.hands, Math.max(0, custom - masterServed));
  const idle = i.hands - served;
  const perHand = HAND_TAKINGS * skillF * season * mind;
  let takings = perHand * (served + idle * OVERFLOW);
  let master = 0;
  if (i.master === "work" && i.minded)
    master =
      masterWork(i.skill) *
      season *
      (masterServed + (1 - masterServed) * OVERFLOW);
  if (i.held) {
    takings = 0;
    master = 0;
  }
  takings = r1(takings + master);
  master = r1(master);
  const wages = (i.paid ?? i.hands) * HAND_WAGE;
  const upkeep = r2(placeUpkeep(i.job, i.level));
  const excise = i.native ? 0 : r2(takings * EXCISE);
  return {
    takings,
    master,
    wages,
    upkeep,
    excise,
    mgr: i.mgrWage ?? 0,
    profit: r2(takings - wages - upkeep - excise),
    perHand: r2(HAND_TAKINGS * skillF * season * mind),
    custom: Number.isFinite(custom) ? r1(custom) : 99,
    served: r1(served),
    idle: r1(idle),
    season: r2(season),
    ramp,
    skillF: r2(skillF),
    input: i,
  };
}

/** The hands that pay best, from none to the place's room (a year's average month). */
export function bestHands(i: BizInput): number {
  let best = 0;
  let top = -Infinity;
  for (let h = 0; h <= (BUSINESS_HANDS[i.level] ?? 0); h++) {
    const v = bizMonth({ ...i, hands: h }).profit;
    if (v > top + 0.05) {
      top = v;
      best = h;
    }
  }
  return best;
}

/** What one more hand would add to the month (and one fewer). */
export function marginal(i: BizInput): { more: number; fewer: number } {
  const now = bizMonth(i).profit;
  const room = BUSINESS_HANDS[i.level] ?? 0;
  return {
    more:
      i.hands < room
        ? r2(bizMonth({ ...i, hands: i.hands + 1 }).profit - now)
        : 0,
    fewer:
      i.hands > 0 ? r2(bizMonth({ ...i, hands: i.hands - 1 }).profit - now) : 0,
  };
}

// ---------------------------------------------------------------- a player's own business

/** A business's state, made if need be. */
export function bizStateOf(pr: Property): BizState {
  return (pr.biz ??= {});
}

/** Hands at a business: people taken on by name, and hands from the town. */
export function handCount(pr: Property): number {
  return pr.hands.length + (pr.biz?.extra ?? 0);
}

/** The manager put in to mind a business, if they're still minding it. */
export function managerOf(life: Life, pr: Property): Follower | undefined {
  const id = pr.biz?.mgr;
  if (id === undefined) return undefined;
  return (life.people ?? []).find(
    (f) => f.id === id && f.task?.kind === "wait" && f.task.p === pr.prov,
  );
}

/**
 * A manager's skill in a trade, as one of your people (a clerk knows trade
 * better than they would alone, a mate the sea, a hand the craft).
 */
export function managerSkill(s: GameState, f: Follower, job: JobKind): number {
  return s.chars[f.c] ? followerSkill(s, f, JOBS[job].main) : 0;
}

/**
 * Who minds a business of yours, and how: you in person (your own trade at
 * your post, or with no other work to do and in the town), a manager you've
 * put in, or nobody. `days`: the days worked in the month being settled.
 */
export function mindingOf(
  s: GameState,
  life: Life,
  pr: Property,
  days?: number,
): Pick<BizInput, "minded" | "away" | "master" | "skill" | "who"> {
  const job = pr.job!;
  const main = JOBS[job].main;
  const own = skillLevel(s, life, main);
  const work = life.job;
  // Your own trade, worked at your post (LEDGER r15: by the month's days;
  // looking ahead, by being there to work them).
  const present =
    days === undefined && !!work && !life.travel && life.prov === work.prov;
  if (
    work?.own &&
    work.prov === pr.prov &&
    ((days ?? work.worked ?? WORK_DAYS) >= WORK_DAYS / 2 || present)
  )
    return {
      minded: true,
      master: work.kind === job ? "wage" : "none",
      skill: own,
      who: "you",
    };
  const here = !life.travel && life.prov === pr.prov;
  // No other work: you mind it yourself, and your work is half its takings.
  if (here && !work && !isChildLife(s, life)) {
    // One business at a time in person: the first of yours in the town.
    const first = (life.property ?? []).find(
      (x) =>
        x.kind === "business" &&
        x.prov === pr.prov &&
        !managerOf(life, x) &&
        x.job,
    );
    if (!first || first.id === pr.id)
      return { minded: true, master: "work", skill: own, who: "you" };
  }
  const m = managerOf(life, pr);
  if (m) {
    const c = s.chars[m.c];
    return {
      minded: true,
      master: "work",
      skill: managerSkill(s, m, job),
      who: c ? `your manager ${c.first}` : "your manager",
    };
  }
  return {
    minded: false,
    master: "none",
    skill: own,
    away: !here
      ? "you're away from the town"
      : work && !(work.own && work.prov === pr.prov)
        ? `you're busy with other work (${JOBS[work.kind].name.toLowerCase()})`
        : work?.own
          ? "you're away from your own work this month"
          : "you have another business to mind here",
  };
}

/** Everything a player's business's month is reckoned from. */
export function propertyInput(
  s: GameState,
  life: Life,
  pr: Property,
  o: { days?: number; day?: number } = {},
): BizInput {
  const st = pr.biz;
  const mind = mindingOf(s, life, pr, o.days);
  const m = managerOf(life, pr);
  const players = pr.hands.filter((h) => lifeOfChar(s, h)).length;
  return {
    job: pr.job!,
    level: pr.level,
    hands: handCount(pr),
    ...(players ? { paid: handCount(pr) - players } : {}),
    ...mind,
    custom: st?.custom ?? townCustom(s, pr.prov, pr.job!, { prop: pr.id }).free,
    month: dateOf(o.day ?? s.day).month,
    north: st?.north ?? true,
    ...(st?.months !== undefined ? { months: st.months } : {}),
    held: (s.provinces[pr.prov]?.occupier ?? -1) >= 0,
    native: lifeIsNative(s, life),
    ...(m && mind.who?.startsWith("your manager") ? { mgrWage: m.wage } : {}),
  };
}

/** A player's business's month as it stands. */
export function propertyView(
  s: GameState,
  life: Life,
  pr: Property,
  o: { days?: number; day?: number } = {},
): BizView {
  return bizMonth(propertyInput(s, life, pr, o));
}

/** The town's custom for a business, reckoned afresh (at the month's turn). */
export function freshCustom(
  s: GameState,
  w: World,
  p: number,
  job: JobKind,
  self: { prop?: number; firm?: number; chars?: number[] },
): number {
  return townCustom(s, p, job, self, w).free;
}

/**
 * The month's turn for a player's business, after it's paid: its account
 * written, its months counted, the town's custom taken afresh for the month
 * to come, and a warning if it keeps losing money.
 */
export function bizSettled(
  g: ConquestGame,
  life: Life,
  pr: Property,
  v: BizView,
  hands: number,
): void {
  const st = bizStateOf(pr);
  const minded: 0 | 1 | 2 = !v.input.minded
    ? 0
    : v.input.who?.startsWith("your manager")
      ? 2
      : 1;
  const row: BizMonth = {
    day: g.s.day - 1,
    takings: v.takings,
    wages: v.wages,
    upkeep: v.upkeep,
    excise: v.excise,
    ...(v.mgr ? { mgr: v.mgr } : {}),
    profit: r2(v.profit - v.mgr),
    hands,
    minded,
  };
  (st.acct ??= []).push(row);
  if (st.acct.length > ACCT_MONTHS)
    st.acct.splice(0, st.acct.length - ACCT_MONTHS);
  if (st.months !== undefined) {
    st.months++;
    if (st.months >= RAMP.length) delete st.months;
  }
  st.custom = freshCustom(g.s, g.w, pr.prov, pr.job!, { prop: pr.id });
  st.north = northern(g.w, pr.prov);
  warnIfLosing(g, life, pr);
  autoHands(g, life, pr);
}

/** Losses two months running, and the next month no better: say so, and why. */
function warnIfLosing(g: ConquestGame, life: Life, pr: Property): void {
  const st = bizStateOf(pr);
  const acct = st.acct ?? [];
  if (acct.length < 2) return;
  const [a, b] = acct.slice(-2);
  if (a.profit >= 0 || b.profit >= 0) return;
  if ((st.warned ?? -1e9) + WARN_DAYS > g.s.day) return;
  const next = propertyView(g.s, life, pr);
  if (next.profit - next.mgr >= 0) return;
  st.warned = g.s.day;
  const top = bizAdvice(g.s, next, { owner: true }).find(
    (x) => x.tone === "bad",
  );
  withFlow(g, { key: "news", label: "", aff: "property" }, () =>
    journal(
      g,
      life,
      `Your ${pr.name} at ${g.map.provinces[pr.prov]?.name ?? "the town"} has lost money two months running (${r1(a.profit)}, ${r1(b.profit)}).${top ? ` ${top.text}` : ""}`,
      "bad",
    ),
  );
}

// ---------------------------------------------------------------- plain advice

export interface Advice {
  key: string;
  tone: "bad" | "good" | "note";
  text: string;
}

/**
 * Why a business makes or loses money, in plain words, the worst first.
 * `owner`: said to the owner ("you're away"); otherwise of the firm.
 */
export function bizAdvice(
  s: GameState,
  v: BizView,
  o: { owner?: boolean; rivals?: Rival[]; room?: number } = {},
): Advice[] {
  const i = v.input;
  const out: Advice[] = [];
  const losing = v.profit - v.mgr < 0;
  const name = JOBS[i.job].business ?? "business";
  if (i.held)
    out.push({
      key: "held",
      tone: "bad",
      text: "The enemy holds the town: nothing comes in, and the hands and the rent are still to pay.",
    });
  if (!i.minded)
    out.push({
      key: "away",
      tone: "bad",
      text: `${losing ? "Losing money: n" : "N"}obody minds it (${i.away ?? "nobody to run it"}), so it takes ${UNMINDED} of its takings${i.master === "none" ? "" : ""}. ${o.owner ? "Work it yourself, or put a manager in." : "The managing partner must be in the town and free to work it."}`,
    });
  if (v.idle >= 0.5)
    out.push({
      key: "idle",
      tone: losing ? "bad" : "note",
      text:
        v.ramp < 1
          ? `Too many hands for its custom yet: it's new, and has custom for about ${v.custom} hand${v.custom === 1 ? "" : "s"} this month (it builds over ${RAMP.length} months). The rest bring in little.`
          : `Too many hands for the trade here: the town's custom keeps about ${v.custom} busy${o.rivals?.length ? `, after its rivals' share` : ""}; the rest bring in ${Math.round(OVERFLOW * 100)} in a hundred of a hand's takings.`,
    });
  // Too big: a smaller place would make more here, once it's going (judged
  // as if it were minded, so it's the size that's said, not who minds it).
  if (i.level >= 2) {
    const going = (lv: number) => {
      const x: BizInput = {
        ...i,
        level: lv,
        month: -1,
        months: undefined,
        minded: true,
        master: i.minded ? i.master : "work",
      };
      x.hands = bestHands(x);
      const b = bizMonth(x);
      return b.profit - b.mgr;
    };
    const here = going(i.level);
    const smaller = Math.max(...[1, 2].filter((lv) => lv < i.level).map(going));
    if (smaller > here + 0.5)
      out.push({
        key: "toobig",
        tone: here < 0 ? "bad" : "note",
        text: `Too big for the town: a ${["", "small", "middling", "great"][i.level]} ${name} costs ${placeUpkeep(i.job, i.level)} a month to keep, and the custom here keeps about ${r1(Number.isFinite(i.custom) ? i.custom : 0)} hands busy. A smaller place would make about ${sgn(smaller)} a month here to its ${sgn(here)}; a bigger town would pay.`,
      });
  }
  if (i.skill < 4)
    out.push({
      key: "skill",
      tone: losing ? "bad" : "note",
      text: `Not ${o.owner && i.who === "you" ? "your" : "its master's"} trade: ${SKILL_NAMES[JOBS[i.job].main].toLowerCase()} ${i.skill}. Each hand brings in ${v.perHand} at that skill (${r1(HAND_TAKINGS * skillFactor(10))} at 10), against a wage of ${HAND_WAGE}.`,
    });
  if (o.rivals?.length) {
    const top = [...o.rivals].sort((a, b) => b.hands - a.hands)[0];
    out.push({
      key: "rivals",
      tone: "note",
      text: `Rivals: ${o.rivals.length === 1 ? top.name : `${top.name} and ${o.rivals.length - 1} more`} take${o.rivals.length === 1 ? "s" : ""} ${r1(o.rivals.reduce((m, x) => m + x.hands, 0))} hands' worth of the custom${o.room ? ` (the town has ${o.room})` : ""}.`,
    });
  }
  if (v.ramp < 1)
    out.push({
      key: "ramp",
      tone: "note",
      text: `New: custom is still building (${Math.round(v.ramp * 100)} in a hundred of it this month; all of it from the ${["first", "second", "third", "fourth"][RAMP.length]} month).`,
    });
  if (i.month >= 0 && v.season <= 0.9)
    out.push({
      key: "season",
      tone: "note",
      text: `The season: custom is down to ${Math.round(v.season * 100)} in a hundred this month; it comes back.`,
    });
  else if (i.month >= 0 && v.season >= 1.12)
    out.push({
      key: "season",
      tone: "good",
      text: `The season: a busy month, ${Math.round(v.season * 100)} in a hundred of the usual custom.`,
    });
  const mg = marginal({ ...i, month: -1, months: undefined });
  if (mg.more > 0.3 && i.minded)
    out.push({
      key: "more",
      tone: "good",
      text: `Another hand would pay: about +${mg.more} a month.`,
    });
  else if (mg.fewer > 0.3)
    out.push({
      key: "fewer",
      tone: losing ? "bad" : "note",
      text: `A hand fewer would save about ${mg.fewer} a month.`,
    });
  // No hands where hands would pay (unminded, they wouldn't: that's said above).
  if (i.hands === 0 && i.master !== "work" && i.minded)
    out.push({
      key: "nohands",
      tone: "bad",
      text: `No hands: the ${name} costs ${v.upkeep} a month to keep and nobody works it. Take on a hand or two.`,
    });
  if (!out.some((x) => x.tone === "bad") && v.profit - v.mgr > 0)
    out.unshift({
      key: "paying",
      tone: "good",
      text: `Paying its way: ${v.profit - v.mgr > 0 ? "+" : ""}${r1(v.profit - v.mgr)} a month as it stands.`,
    });
  const order = { bad: 0, good: 1, note: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ---------------------------------------------------------------- a new business's plan

/** One month of a plan. */
export interface PlanMonth {
  /** The month's name ("Mar 1701"). */
  day: number;
  hands: number;
  takings: number;
  costs: number;
  profit: number;
  /** All told since it was set up, the setting up included. */
  cum: number;
}

export interface BizPlan {
  cost: number;
  months: PlanMonth[];
  /** The month it's paid back what it cost (1-based), or 0 if not within the plan. */
  breakEven: number;
  /** The first month it makes money (1-based), or 0. */
  paysFrom: number;
  /** A month once it's going (custom built, the year's average). */
  going: BizView;
  /** The hands it would take on at the start, and once it's going. */
  startHands: number;
  goingHands: number;
}

/**
 * A new business's months, as they'd go if run sensibly: hands taken on as
 * custom builds (each month, the hands that pay), the season as it comes.
 */
export function bizPlan(
  s: GameState,
  base: BizInput,
  cost: number,
  months = 24,
): BizPlan {
  const out: PlanMonth[] = [];
  let cum = -cost;
  let breakEven = 0;
  let paysFrom = 0;
  let day = s.day;
  let hands = -1;
  for (let m = 0; m < months; m++) {
    const i: BizInput = {
      ...base,
      months: m < RAMP.length ? m : undefined,
      month: dateOf(day).month,
    };
    // Hands as it takes them on: the ones that pay at first, then one more
    // (or fewer) a month as its custom builds, as autoHands does.
    const want = bestHands({ ...i, month: -1 });
    hands =
      hands < 0
        ? want
        : want > hands
          ? hands + 1
          : want < hands
            ? hands - 1
            : hands;
    i.hands = hands;
    const v = bizMonth(i);
    cum = r2(cum + v.profit - v.mgr);
    out.push({
      day,
      hands: i.hands,
      takings: v.takings,
      costs: r2(v.wages + v.upkeep + v.excise + v.mgr),
      profit: r2(v.profit - v.mgr),
      cum,
    });
    if (!paysFrom && v.profit - v.mgr > 0) paysFrom = m + 1;
    if (!breakEven && cum >= 0) breakEven = m + 1;
    // The first of the next month.
    const d = dateOf(day);
    day =
      d.month === 11 ? dayOf(d.year + 1, 0, 1) : dayOf(d.year, d.month + 1, 1);
  }
  const goingIn: BizInput = { ...base, month: -1, months: undefined };
  goingIn.hands = bestHands(goingIn);
  return {
    cost,
    months: out,
    breakEven,
    paysFrom,
    going: bizMonth(goingIn),
    startHands: out[0]?.hands ?? 0,
    goingHands: goingIn.hands,
  };
}

// ---------------------------------------------------------------- setting up alone

/** Trades whose business could be set up in a province (as Partners.foundable). */
export function bizTradesAt(s: GameState, w: World, p: number): JobKind[] {
  const owner = s.provinces[p]?.owner ?? -1;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  return bizJobs().filter((k) => {
    const def = JOBS[k];
    if (def.native === false && native) return false;
    if (def.native === true && !native) return false;
    return hasPlace(s, w, p, def.places[0]);
  });
}

/** Who'd mind a business you set up here, and how (before it exists). */
export function startInput(
  s: GameState,
  w: World,
  life: Life,
  job: JobKind,
  level: number,
  p = life.prov,
): BizInput {
  const pseudo: Property = {
    id: -1,
    kind: "business",
    prov: p,
    level,
    job,
    place: JOBS[job].places[0],
    hands: [],
    since: s.day,
    name: JOBS[job].business ?? "business",
  };
  const mind = mindingOf(s, { ...life, property: [pseudo] }, pseudo);
  return {
    job,
    level,
    hands: 0,
    ...mind,
    custom: townCustom(s, p, job, {}, w).free,
    month: dateOf(s.day).month,
    north: northern(w, p),
    months: 0,
    held: (s.provinces[p]?.occupier ?? -1) >= 0,
    native: lifeIsNative(s, life),
  };
}

/** Whether you could set up a business of a trade here, alone. */
export function foundCheck(
  s: GameState,
  w: World,
  life: Life,
  job: JobKind,
  level: number,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.travel) return no("Not from the road.");
  if (!bizJobs().includes(job)) return no("No such business.");
  if (!Number.isInteger(level) || level < 1 || level > 3) return no("How big?");
  if ((s.provinces[life.prov]?.occupier ?? -1) >= 0)
    return no("Not while the enemy holds the town.");
  if ((life.job?.army ?? -1) >= 0)
    return no("Not while you march with the army.");
  if (!bizTradesAt(s, w, life.prov).includes(job))
    return no(
      `${w.map.provinces[life.prov]?.name ?? "The town"} has no ${JOBS[job].places[0]} for it.`,
    );
  const mine = (life.property ?? []).filter((x) => x.kind === "business");
  if (mine.some((x) => x.prov === life.prov && x.job === job))
    return no("You have one here already: grow it instead.");
  if (mine.length >= 3)
    return no("Three businesses are as many as one can run.");
  const cost = bizCost(job, level);
  if (life.purse < cost) return no(`Setting it up costs ${cost}.`);
  return yes;
}

/** A hand from the town, taken on at a business of yours (none to be had: why). */
export function takeHandCheck(life: Life, pr: Property | undefined): Check {
  if (!pr || pr.kind !== "business") return no("No such business.");
  if (handCount(pr) >= (BUSINESS_HANDS[pr.level] ?? 0))
    return no(
      `It has all the hands it has room for (${BUSINESS_HANDS[pr.level]}).`,
    );
  if (life.purse < HAND_WAGE)
    return no(`You couldn't pay their first month (${HAND_WAGE}).`);
  return yes;
}

/** Take on a hand from the town's labouring folk at a business of yours. */
export function takeOnHand(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const pr = (life.property ?? []).find((x) => x.id === id);
  const check = takeHandCheck(life, pr);
  if (!check.ok) return check.why;
  touchLife(g, life);
  const st = bizStateOf(pr!);
  st.extra = (st.extra ?? 0) + 1;
  journal(
    g,
    life,
    `A hand from the town comes to work at your ${pr!.name}, for ${HAND_WAGE} coins a month.`,
  );
  return null;
}

/** Let a hand go (one taken on from the town, or a named one). */
export function letHandGo(
  g: ConquestGame,
  life: Life,
  id: number,
  c?: number,
): string | null {
  const pr = (life.property ?? []).find((x) => x.id === id);
  if (!pr || pr.kind !== "business") return "No such business.";
  touchLife(g, life);
  if (c !== undefined && c >= 0) {
    if (!pr.hands.includes(c)) return "They don't work there.";
    pr.hands = pr.hands.filter((x) => x !== c);
    const ch = g.s.chars[c];
    if (ch?.alive) remembers(g, life, g.char(c), "Turned me off", -15, 2);
    const other = g.s.lives.find((l) => l.c === c);
    if (other?.job && other.job.employer === life.c) {
      touchLife(g, other).job = null;
      journal(g, other, `${charName(meOf(g.s, life))} has let you go.`, "bad");
    }
    journal(g, life, `You let ${charName(ch)} go from the ${pr.name}.`);
    return null;
  }
  const st = bizStateOf(pr);
  if (!(st.extra ?? 0)) return "No hands from the town to let go.";
  st.extra = (st.extra ?? 0) - 1;
  if (!st.extra) delete st.extra;
  journal(g, life, `You let a hand go from the ${pr.name}.`);
  return null;
}

/**
 * After the month's turn: hands from the town taken on or let go, one at a
 * time, as one more (or one fewer) would pay, on the custom as it is now
 * and a year's average month (so the seasons don't hire and fire).
 */
export function autoHands(g: ConquestGame, life: Life, pr: Property): void {
  const st = pr.biz;
  // On unless you've turned it off (a business from before r15 too).
  if (!st || st.auto === false) return;
  const i = { ...propertyInput(g.s, life, pr), month: -1 };
  const mg = marginal(i);
  if (mg.more > 0.05 && life.purse >= HAND_WAGE * 2 && handRoomOf(pr) > 0) {
    st.extra = (st.extra ?? 0) + 1;
    journal(
      g,
      life,
      `Custom at your ${pr.name} keeps another hand busy: one is taken on from the town.`,
    );
  } else if (mg.fewer > 0.05 && (st.extra ?? 0) > 0) {
    st.extra = (st.extra ?? 0) - 1;
    if (!st.extra) delete st.extra;
    journal(
      g,
      life,
      `Your ${pr.name} has a hand more than its custom keeps busy: you let one go.`,
    );
  }
}

/** Hands a business has room for still (as Property.handRoom). */
function handRoomOf(pr: Property): number {
  return Math.max(0, (BUSINESS_HANDS[pr.level] ?? 0) - handCount(pr));
}

/** Set up a business of a trade here, alone: it's yours, with the hands that pay. */
export function foundBusiness(
  g: ConquestGame,
  life: Life,
  job: JobKind,
  level: number,
): string | null {
  const s = g.s;
  const check = foundCheck(s, g.w, life, job, level);
  if (!check.ok) return check.why;
  const cost = bizCost(job, level);
  spend(g, life, cost);
  touchLife(g, life);
  const name = JOBS[job].business ?? "business";
  const pr: Property = {
    id: g.nextId(),
    kind: "business",
    prov: life.prov,
    level,
    job,
    place: JOBS[job].places[0],
    hands: [],
    since: s.day,
    name: job === "farmer" && level >= 3 ? "plantation" : name,
    biz: {
      custom: freshCustom(s, g.w, life.prov, job, {}),
      north: northern(g.w, life.prov),
      months: 0,
      auto: true,
    },
  };
  (life.property ??= []).push(pr);
  const start = bestHands({ ...propertyInput(s, life, pr), month: -1 });
  if (start > 0) pr.biz!.extra = start;
  const here = g.map.provinces[life.prov]?.name ?? "the town";
  journal(
    g,
    life,
    `You set up a ${pr.name} at ${here} for ${cost} coins${start ? `, and take on ${start === 1 ? "a hand" : `${start} hands`} from the town at ${HAND_WAGE} a month` : ""}. Custom takes a few months to build.`,
    "good",
  );
  milestone(g, life, "business", `Set up a ${pr.name} at ${here}`, life.prov); // STORY (r17): was "job"
  addRenown(g, life, 1);
  return null;
}

// ---------------------------------------------------------------- the start-a-business flow

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Everything the "Start a business" window shows for a trade and size here. */
export interface StartView {
  job: JobKind;
  level: number;
  cost: number;
  check: Check;
  input: BizInput;
  plan: BizPlan;
  town: TownCustom;
  /** What drives its takings, in plain words. */
  drivers: string[];
  /** What could go wrong. */
  risks: string[];
  /** Why it would lose money, if it would (the worst first). */
  advice: Advice[];
}

/** The months a trade is busiest and quietest ("August to October"). */
function busiest(job: JobKind): { high: string; low: string } {
  const v = SEASONS[customOf(job).season];
  const top = Math.max(...v);
  const bottom = Math.min(...v);
  const names = (want: number) =>
    v
      .map((x, i) => (Math.abs(x - want) < 0.06 ? MONTH_NAMES[i] : ""))
      .filter(Boolean);
  const say = (list: string[]) =>
    list.length > 2
      ? `${list[0]} to ${list[list.length - 1]}`
      : list.join(" and ");
  return { high: say(names(top)), low: say(names(bottom)) };
}

/** A business of a trade and size you could set up here: its plan, drivers and risks. */
export function startView(
  s: GameState,
  w: World,
  life: Life,
  job: JobKind,
  level: number,
): StartView {
  const cost = bizCost(job, level);
  const input = startInput(s, w, life, job, level);
  const plan = bizPlan(s, input, cost);
  const town = townCustom(s, life.prov, job, {}, w);
  const def = JOBS[job];
  const sk = SKILL_NAMES[def.main].toLowerCase();
  const g = plan.going;
  const drivers: string[] = [];
  drivers.push(
    `Your skill: ${sk} ${input.skill}. Each hand brings in about ${r1(HAND_TAKINGS * skillFactor(input.skill))} a month at full custom (${r1(HAND_TAKINGS * skillFactor(10))} for a master of 10), against a wage of ${HAND_WAGE}.`,
  );
  drivers.push(
    input.minded
      ? input.master === "work"
        ? `Being there: you'd mind it yourself, and your own work at it brings in about ${r1(masterWork(input.skill))} a month more.`
        : "Being there: you'd mind it yourself, at your own trade."
      : `Being there: nobody would mind it (${input.away}), so it would take ${UNMINDED} of its takings. Mind it yourself, or put one of your people in to manage it.`,
  );
  drivers.push(
    `The hands: it takes on ${plan.startHands} from the town at first and about ${plan.goingHands} once its custom is built, as many as pay. A hand past the custom brings in ${Math.round(OVERFLOW * 100)} in a hundred of a hand's takings.`,
  );
  drivers.push(
    `The town: ${town.why.join(", ")}: custom for about ${town.room} hands' worth of ${def.business ?? "business"}${
      town.rivals.length
        ? `; rivals take ${r1(town.rivals.reduce((m, x) => m + x.hands, 0))} of it (${town.rivals
            .map((x) => x.name)
            .slice(0, 3)
            .join(", ")})`
        : ", and no rivals"
    }. What's free for you: about ${town.free}.`,
  );
  const sb = busiest(job);
  drivers.push(
    `The season: busiest ${sb.high}, quietest ${sb.low}${input.north ? "" : " (less so in the south)"}.`,
  );
  drivers.push(
    `Custom builds: ${RAMP.map((x) => `${Math.round(x * 100)}`).join(", ")} in a hundred of it in its first ${RAMP.length} months, then all of it.`,
  );
  const risks: string[] = [
    `Leave the town or take other work and nobody minds it: it takes ${UNMINDED} of its takings, and the hands may not pay their wages. A manager (one of your people) can mind it for you.`,
    "A rival opening in the town takes some of its custom.",
    "In a war the enemy may take the town: nothing comes in, and the wages and keep are still due.",
    "Fire, thieves, bad debts and lucky orders come now and then as events.",
  ];
  if (job === "sailor" || job === "fisherman")
    risks.push("The sea: little freight or fish in a northern winter.");
  if (job === "farmer")
    risks.push(
      "The harvest is most of a farm's year: the winter months bring in little.",
    );
  if (level >= 2)
    risks.push(
      `A bigger place costs more to keep (${placeUpkeep(job, level)} a month) whether or not the town has the custom for it.`,
    );
  const advice = bizAdvice(s, g, {
    owner: true,
    rivals: town.rivals,
    room: town.room,
  });
  return {
    job,
    level,
    cost,
    check: foundCheck(s, w, life, job, level),
    input,
    plan,
    town,
    drivers,
    risks,
    advice,
  };
}

// ---------------------------------------------------------------- a manager

/** Your people who could mind a business there (with their skill in its trade). */
export function managerChoices(
  s: GameState,
  life: Life,
  pr: Property,
): { f: Follower; skill: number }[] {
  return (life.people ?? [])
    .filter(
      (f) =>
        f.kind !== "rogue" &&
        f.kind !== "officer" &&
        !(f.task && !(f.task.kind === "wait" && f.task.p === pr.prov)) &&
        !(life.property ?? []).some((x) => x !== pr && x.biz?.mgr === f.id),
    )
    .map((f) => ({ f, skill: managerSkill(s, f, pr.job!) }))
    .sort((a, b) => b.skill - a.skill || a.f.id - b.f.id);
}

/** Put one of your people in to mind a business (they stay there to do it). */
export function putManager(
  g: ConquestGame,
  life: Life,
  id: number,
  fid: number,
): string | null {
  const pr = (life.property ?? []).find((x) => x.id === id);
  if (!pr || pr.kind !== "business") return "No such business.";
  const f = managerChoices(g.s, life, pr).find((x) => x.f.id === fid)?.f;
  if (!f) return "Choose one of your people who's free.";
  touchLife(g, life);
  const st = bizStateOf(pr);
  // The old one comes back to you.
  const old = managerOf(life, pr);
  if (old && old !== f) old.task = null;
  f.task = {
    kind: "wait",
    p: pr.prov,
    back: g.s.day + 365 * 200,
    what: `minding your ${pr.name}`,
  };
  st.mgr = f.id;
  journal(
    g,
    life,
    `${charName(g.s.chars[f.c])} minds your ${pr.name} at ${g.map.provinces[pr.prov]?.name ?? "the town"} now.`,
  );
  return null;
}

/** Take a manager off a business: they come back to your side. */
export function recallManager(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const pr = (life.property ?? []).find((x) => x.id === id);
  if (!pr) return "No such business.";
  const m = managerOf(life, pr);
  touchLife(g, life);
  if (m) m.task = null;
  if (pr.biz) delete pr.biz.mgr;
  journal(g, life, `You take the running of your ${pr.name} back.`);
  return null;
}

// ---------------------------------------------------------------- the commands

function businessCommand(
  g: ConquestGame,
  life: Life,
  c: import("./Types").LifeCommand,
): string | null | undefined {
  if (c.k !== "business") return undefined;
  if (!meOf(g.s, life) || life.watching) return "You're watching.";
  switch (c.act) {
    case "found":
      return withFlow(
        g,
        { key: "biz:found", label: "Setting up a business" },
        () => foundBusiness(g, life, c.job as JobKind, c.level ?? 1),
      );
    case "hand":
      return takeOnHand(g, life, c.id ?? -1);
    case "unhand":
      return letHandGo(g, life, c.id ?? -1, c.c);
    case "manager":
      return putManager(g, life, c.id ?? -1, c.c ?? -1);
    case "unmanager":
      return recallManager(g, life, c.id ?? -1);
    case "auto": {
      const pr = (life.property ?? []).find((x) => x.id === c.id);
      if (!pr || pr.kind !== "business") return "No such business.";
      touchLife(g, life);
      bizStateOf(pr).auto = c.level === 1;
      return null;
    }
  }
  return undefined;
}
hooks.command.push(businessCommand);

// ---------------------------------------------------------------- your affairs

/** "Your store at Jamestown". */
export function bizTitle(
  map: { provinces: { name: string }[] },
  pr: Property,
): string {
  return `Your ${pr.name} at ${map.provinces[pr.prov]?.name ?? "the town"}`;
}

/** Who minds a business, in a few words ("you mind it", "nobody minds it"). */
export function mindWords(v: BizView): string {
  const i = v.input;
  if (!i.minded) return `nobody minds it (${i.away ?? "nobody to run it"})`;
  return i.who === "you" ? "you mind it" : `${i.who ?? "a manager"} minds it`;
}

/** Each business of yours, for the tracker (Estate › Ledger, "Out working"). */
function bizAffairs(s: GameState, w: World, life: Life): AffairItem[] {
  const out: AffairItem[] = [];
  for (const pr of life.property ?? []) {
    if (pr.kind !== "business" || !pr.job) continue;
    const v = propertyView(s, life, pr);
    const net = r2(v.profit - v.mgr);
    const bad = bizAdvice(s, v, { owner: true }).find((x) => x.tone === "bad");
    const hands = handCount(pr);
    out.push({
      kind: "property",
      id: `biz:${pr.id}`,
      title: bizTitle(w.map, pr),
      what: `${hands} hand${hands === 1 ? "" : "s"}; ${mindWords(v)}`,
      status: v.input.held
        ? "the enemy holds the town"
        : net >= 0
          ? "paying"
          : "losing money",
      ...(bad ? { warn: bad.text.replace(/^Losing money: /, "") } : {}),
      p: pr.prov,
      cost: -r2(v.wages + v.upkeep + v.excise + v.mgr),
      expected: { value: net, lo: net, hi: net, per: "month" },
      go: { tab: "estate", sub: "business" },
    });
  }
  return out;
}
hooks.affairs.push(bizAffairs);

/** The rest of a business's rules, for other modules that sell or buy one. */
export { bizCost, EXPAND_COST };
