// LABOUR2 (r21): an overseer, and those held in bondage set to work at a
// business of the household's: the model the month runs on and the page
// shows (candidates for the place, what each would do, how the overseer sets
// the work, who may be sent to a business and what it comes to against a
// hired hand). Rolls nothing; the commands and the month are in Labour2.ts.
//
// Told as history: overseers were hired men, paid wages or shares of the
// crop, and many had a name for hardness; enslaved men and women worked in
// colonial shops, smithies, ropewalks, tanyards, inns and ironworks, at their
// holders' businesses or hired out, as LABOUR r15's trades in town are. The
// game shows the human side first: who they are, where they'd live, whom
// they'd be parted from.

import {
  ACRES_EACH,
  acresAt,
  AWAY_FACTOR,
  boundOf,
  CROP_EXCISE,
  deathChance,
  fieldsOf,
  flightChance,
  freedomChance,
  hashOf,
  hireTown,
  isBound,
  keepOf,
  priceOf,
  r1,
  r2,
  workExpected,
} from "./BondCore";
import { colonyOf, holdingLawful, lawOf } from "./BondLaw";
import { handCount } from "./Business";
import { dateOf } from "./Calendar";
import {
  atBusiness,
  BIZ_AGE,
  bizEff,
  MANNERS,
  overseerMind,
  overseerOf,
  sharesAsked,
} from "./Labour2Rules";
import { lifeIsNative, meOf, no, yes, type Check } from "./LifeQueries";
import { BUSINESS_HANDS, EXCISE, HAND_WAGE } from "./LifeRules";
import type { World } from "./Map";
import { NAMES } from "./Names";
import { ageOf } from "./Queries";
import { Rng } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  BondWork,
  Character,
  GameState,
  Life,
  MapDef,
  OverseerManner,
  Property,
} from "./Types";

// ---------------------------------------------------------------- an overseer for hire

/** Someone who'd take the place of overseer, at the household's home this month (the same for everyone). */
export interface OverseerCandidate {
  slot: number;
  first: string;
  family: string;
  age: number;
  manner: OverseerManner;
  /** His skill at the work, 0 to 20. */
  skill: number;
  /** What he asks a month, in wages. */
  wage: number;
  /** Or the shares of the crop he'd take (0: the crop's too small for shares). */
  shares: number;
  /** A line about him. */
  note: string;
}

/** What an overseer asks a month, by his skill (the Lowcountry's absentee planters paid more). */
export function overseerWage(skill: number, lowcountry: boolean): number {
  return r1((1.8 + 0.15 * skill) * (lowcountry ? 1.2 : 1));
}

const NOTES: Record<OverseerManner, string[]> = {
  hard: [
    "has the name of a hard man",
    "lately overseer on an estate where nobody stayed long",
    "an old soldier who likes things done at once",
    "talks of 'keeping them in their place'",
  ],
  steady: [
    "lately overseer on a river estate, three seasons",
    "a planter's younger son, with no land of his own yet",
    "served out his indenture here and stayed",
    "keeps a book of every row and every hogshead",
  ],
  fair: [
    "the minister speaks well of him",
    "a quiet man who grew up among the quarters on his father's farm",
    "a German farmer, careful with people and beasts alike",
    "says he'll not strike anyone, and means it",
  ],
};

/** Whether the household lives in the Lowcountry (where overseers were paid more, and mostly in wages). */
function lowcountry(map: MapDef, p: number): boolean {
  const col = colonyOf(map, p);
  return col === "southcarolina" || col === "georgia";
}

/** Who'd take the place this month at the household's home. */
export function overseerCandidates(
  s: GameState,
  map: MapDef,
  life: Life,
): OverseerCandidate[] {
  const home = life.bondage?.home ?? life.home;
  const owner = s.nations[s.provinces[home]?.owner ?? -1];
  if (!owner || owner.kind === "native") return [];
  const month = Math.floor(s.day / 30);
  const rng = new Rng({
    rng: hashOf(s.settings.seed, home, month, 0x0e5ee),
  });
  const names = NAMES[owner.culture] ?? NAMES.english;
  const low = lowcountry(map, home);
  // The fields as they stand, and what they're expected to make (after the duty).
  const workers = fieldsOf(s, map, life).workers.length;
  const crop = workExpected(s, map, life).fields * (1 - CROP_EXCISE);
  const out: OverseerCandidate[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const r = rng.next();
    const manner: OverseerManner =
      r < 0.4 ? "hard" : r < 0.8 ? "steady" : "fair";
    const skill = Math.min(16, 3 + rng.int(0, 8) + (rng.chance(0.2) ? 4 : 0));
    const wage = overseerWage(skill, low);
    out.push({
      slot,
      first: rng.pick(names.male)!,
      family: rng.pick(names.family)!,
      age: 24 + rng.int(0, 28),
      manner,
      skill,
      wage,
      shares: sharesAsked(wage, workers, crop),
      note: rng.pick(NOTES[manner])!,
    });
  }
  return out;
}

/** Whether you can take an overseer on now, and why not. */
export function hireOverseerCheck(
  s: GameState,
  life: Life,
  cand: OverseerCandidate | undefined,
  pay: "wage" | "share" = "wage",
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (ageOf(s, me) < 16) return no("Not until you're sixteen.");
  if (lifeIsNative(s, life))
    return no("Your people's ways have nothing to do with this.");
  if (!life.bondage || !boundOf(s, life).length)
    return no("Your household holds no one to oversee.");
  if (overseerOf(s, life)) return no("You have an overseer already.");
  if (!cand) return no("He's taken another place.");
  if (pay === "share" && !cand.shares)
    return no("The fields make too small a crop to pay him by shares.");
  if (life.purse < cand.wage) return no(`His first month: ${cand.wage} coins.`);
  return yes;
}

// ---------------------------------------------------------------- how the overseer sets the work

/** What someone is set to by the overseer's reckoning (or yours). */
export interface WorkPlan {
  c: number;
  work: BondWork;
  biz?: number;
}

/** Hands a business of yours still has room for. */
export function bizRoom(pr: Property): number {
  return Math.max(0, (BUSINESS_HANDS[pr.level] ?? 0) - handCount(pr));
}

/**
 * How an overseer would set the household's work: the fields while there are
 * acres for them (the best field hands first), a business of yours in the
 * same town with room (the best at a trade), a trade hired out where the town
 * is big enough, the house for two, and rest for children and the old. He
 * never sends anyone to another town: that parts families.
 */
export function overseerPlan(
  s: GameState,
  map: MapDef,
  life: Life,
): WorkPlan[] {
  const b = life.bondage;
  if (!b) return [];
  const home = b.home;
  const people = boundOf(s, life).filter((c) => c.bond!.at === home);
  const out: WorkPlan[] = [];
  const free: Character[] = [];
  for (const c of people) {
    const age = ageOf(s, c);
    if (age < 12 || age >= 70 || c.bond!.health < 25)
      out.push({ c: c.id, work: "rest" });
    else free.push(c);
  }
  // The fields, while there are acres to work.
  let fields = Math.floor(acresAt(life, home) / ACRES_EACH);
  const byField = [...free].sort(
    (a, c) => c.bond!.sk.field - a.bond!.sk.field || a.id - c.id,
  );
  const left: Character[] = [];
  for (const c of byField) {
    if (fields > 0 && ageOf(s, c) < 60) {
      out.push({ c: c.id, work: "fields" });
      fields--;
    } else left.push(c);
  }
  // A business of yours in the same town with room, then a trade hired out.
  const shops = (life.property ?? []).filter(
    (pr) =>
      pr.kind === "business" &&
      pr.job &&
      pr.job !== "sailor" &&
      pr.prov === home &&
      holdingLawful(s, map, home),
  );
  // (Those at a business already keep their places: they're in its hands.)
  const room = new Map(shops.map((pr) => [pr.id, bizRoom(pr)]));
  const byCraft = [...left].sort(
    (a, c) => c.bond!.sk.craft - a.bond!.sk.craft || a.id - c.id,
  );
  let house = 2;
  const town = hireTown(s, life);
  for (const c of byCraft) {
    const age = ageOf(s, c);
    if (atBusiness(c)) {
      out.push({ c: c.id, work: "biz", biz: c.bond!.biz });
      continue;
    }
    const shop =
      age >= BIZ_AGE
        ? shops.find((pr) => (room.get(pr.id) ?? 0) > 0)
        : undefined;
    if (shop && c.bond!.sk.craft >= 3) {
      room.set(shop.id, (room.get(shop.id) ?? 0) - 1);
      out.push({ c: c.id, work: "biz", biz: shop.id });
    } else if (town && c.bond!.sk.craft >= 4 && age < 60)
      out.push({ c: c.id, work: "craft" });
    else if (house > 0) {
      out.push({ c: c.id, work: "house" });
      house--;
    } else out.push({ c: c.id, work: "rest" });
  }
  return out;
}

// ---------------------------------------------------------------- at a business

/** The household's bound people working at a business, alive and still the household's. */
export function boundAt(s: GameState, life: Life, pr: Property): Character[] {
  return (pr.biz?.bound ?? [])
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        isBound(c) &&
        c.bond!.seat === life.seat &&
        c.bond!.work === "biz" &&
        c.bond!.biz === pr.id,
    );
}

/** The bound workers' part in a business's month (Business.ts asks it). */
export function bizBoundInput(
  s: GameState,
  life: Life,
  pr: Property,
): { n: number; eff: number; keep: number } | undefined {
  const list = boundAt(s, life, pr);
  if (!list.length || !life.bondage) return undefined;
  return {
    n: list.length,
    eff: r2(list.reduce((m, c) => m + bizEff(c.bond!), 0)),
    keep: r2(list.reduce((m, c) => m + keepOf(s, life.bondage!.policy, c), 0)),
  };
}

/** The businesses of yours someone could be set to work at. */
export function bizChoices(life: Life): Property[] {
  return (life.property ?? []).filter(
    (pr) => pr.kind === "business" && !!pr.job && pr.job !== "sailor",
  );
}

/** Whether someone of the household can be set to work at a business of yours, and why not. */
export function bizWorkCheck(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character | undefined,
  pr: Property | undefined,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (!c || !isBound(c) || c.bond!.seat !== life.seat)
    return no("Not in your household.");
  if (!pr || pr.kind !== "business" || !pr.job)
    return no("No such business of yours.");
  if (pr.job === "sailor")
    return no("A ship's company is hired on her own card (Estate › Boats).");
  if (c.bond!.biz === pr.id && c.bond!.work === "biz")
    return no("Works there already.");
  if (ageOf(s, c) < BIZ_AGE)
    return no(`Too young: not before ${BIZ_AGE}, as an apprentice would be.`);
  if (c.bond!.health < 25) return no("Too ill to work.");
  if (c.bond!.status === "held" && !holdingLawful(s, map, pr.prov))
    return no(
      `The law at ${map.provinces[pr.prov]?.name ?? "that town"} doesn't allow anyone to be held there.`,
    );
  if (lawOf(s, pr.prov).law === "native")
    return no("That's in the people's own country.");
  if (bizRoom(pr) <= 0)
    return no(
      `Its ${BUSINESS_HANDS[pr.level] ?? 0} places are full: let a hand go first.`,
    );
  return yes;
}

/** Those someone would be parted from if they worked at a business in another town. */
export function partedBy(
  s: GameState,
  c: Character,
  pr: Property,
): Character[] {
  const kin = [c.spouse, c.mother, c.father, ...c.children]
    .map((id) => s.chars[id])
    .filter((x): x is Character => !!x?.alive && isBound(x));
  return kin.filter((x) => x.bond!.at !== pr.prov);
}

// ---------------------------------------------------------------- against a hired hand

/** One way of filling a place at a business, a month, all told. */
export interface HandWay {
  label: string;
  /** What their work brings in (less the excise). */
  takings: number;
  /** Wages, or provisions and quarters. */
  cost: number;
  /** Their price spread over twelve years, and the interest it would earn lent out (6 in 100). */
  capital: number;
  /** What flight and death take of their price, a month, on average. */
  risk: number;
  net: number;
}

/** The lawful rate of interest the capital would earn, lent out on bond. */
export const CAPITAL_RATE = 0.06;
/** Years a price is spread over (as LABOUR r15 reckoned it). */
export const CAPITAL_YEARS = 12;
/** The health a price is reckoned at, for the comparison. */
export const PRICE_HEALTH = 70;

/**
 * A place at a business, a month: a hired hand against someone of the
 * household held there, from the business's own takings a hand and their
 * own trade, health and spirits; after the price and the risk. The same
 * numbers the month runs on (bizEff, keepOf, flightChance, deathChance).
 */
export function handWays(
  s: GameState,
  map: MapDef,
  life: Life,
  pr: Property,
  perHand: number,
  c?: Character,
): { hired: HandWay; bound?: HandWay; price?: number } {
  const net = (v: number) => r2(v * (1 - EXCISE));
  const hired: HandWay = {
    label: "A hired hand",
    takings: net(perHand),
    cost: HAND_WAGE,
    capital: 0,
    risk: 0,
    net: r2(net(perHand) - HAND_WAGE),
  };
  if (!c || !life.bondage) return { hired };
  // Their price as someone of their age and trade in ordinary health (so how
  // they're kept shows in the work and the risk, not in a price).
  const price = priceOf(s, map, pr.prov, {
    age: ageOf(s, c),
    female: c.female,
    health: PRICE_HEALTH,
    craft: c.bond!.sk.craft,
  });
  const takings = net(perHand * bizEff(c.bond!));
  const cost = keepOf(s, life.bondage.policy, c);
  const capital = r2(
    price / (CAPITAL_YEARS * 12) + (price * CAPITAL_RATE) / 12,
  );
  // As they'd be at the business: in town, among free people. Of those who
  // flee, those who get clear are lost; the rest are taken up and brought back.
  const there: Character = {
    ...c,
    bond: { ...c.bond!, work: "biz", biz: pr.id, at: pr.prov },
  };
  const flight = flightChance(s, map, life, there).total;
  const lost = flight * freedomChance(s, map, life, there);
  const death = deathChance(s, map, life, there);
  const risk = r2((lost + death) * price);
  return {
    hired,
    price,
    bound: {
      label: `${c.first}, held in your household`,
      takings,
      cost,
      capital,
      risk,
      net: r2(takings - cost - capital - risk),
    },
  };
}

/** The household's overseer's minding, in words (for the page). */
export function mindingWords(s: GameState, life: Life): string {
  const o = overseerOf(s, life);
  if (!o) return "";
  const c = s.chars[o.c];
  return `${c ? `${c.first} ${c.family}` : "Your overseer"} minds the place while you're away: ${Math.round(overseerMind(o.skill) * 100)}% of the work gets done, against ${Math.round(AWAY_FACTOR * 100)}% with nobody.`;
}

/** How long someone has been in the household, in years (for the page). */
export function yearsWith(s: GameState, c: Character): number {
  return Math.max(
    0,
    Math.floor((s.day - (c.bond?.since ?? s.day)) / DAYS_PER_YEAR),
  );
}

/** Manners' words, for the page. */
export const MANNER_WORDS = MANNERS;

/** The year now. */
export const yearNow = (s: GameState) => dateOf(s.day).year;

/** A province's name. */
export function provName(w: World, p: number): string {
  return w.map.provinces[p]?.name ?? "somewhere";
}
