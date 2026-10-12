// LABOUR (r15): bondage, treated as history. The model the month is rolled
// from and the page shows: who is held, what they're paid nothing for and
// what they cost to keep, how they bear it, the chance each one flees (and
// reaches freedom), of a rising, of a death; the sales at the ports where
// people were sold, and what freeing someone costs under the law that runs.
//
// Everything here is read by both the engine (Bondage.ts rolls from it) and
// the page (the odds it shows), so what's shown is what happens.
//
// The game's voice says "enslaved people" and "those held in bondage"; the
// period's legal words appear only where the law is quoted (BondLaw.ts).
// Harsh treatment saves a little on provisions and buys nothing else: it
// lowers health and spirits, and so the work, and raises the chance of
// flight and of a rising. Cruelty is never rewarded.

import {
  bondLaw,
  colonyOf,
  DEED_FEE,
  holdingLawful,
  importBan,
  indenturesAt,
  lawOf,
  PASSAGE,
  POUND,
  REFUGE_SHORT,
  refugesFrom,
  saleChance,
  type BondLaw,
  type Colony,
  type FreeRule,
} from "./BondLaw";
import { dateOf } from "./Calendar";
import { Explain } from "./Explain";
import {
  isChildLife,
  lifeIsNative,
  meOf,
  no,
  yes,
  type Check,
} from "./LifeQueries";
import { LAND_LOT } from "./LifeRules";
import type { World } from "./Map";
import { chanceWords, type OddsOutcome, type OddsView } from "./Odds";
import { landOf, propertyOf } from "./Property";
import { ageOf, settlers } from "./Queries";
import { Rng } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  Bondage,
  BondMark,
  BondNote,
  BondOrigin,
  BondPolicy,
  BondRefuge,
  BondWork,
  Breakdown,
  Character,
  GameDelta,
  GameState,
  Life,
  MapDef,
  Part,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- who

export function bondageOf(life: Life): Bondage | undefined {
  return life.bondage;
}

/** Held for life (not indentured, not free). */
export function isHeld(c: Character | undefined): boolean {
  return c?.bond?.status === "held";
}

/** Held, or bound by indenture: in someone's household and not free. */
export function isBound(c: Character | undefined): boolean {
  return c?.bond?.status === "held" || c?.bond?.status === "indenture";
}

/** Those this household holds or has bound, alive, in the order they came. */
export function boundOf(s: GameState, life: Life): Character[] {
  const b = life.bondage;
  if (!b) return [];
  return b.people
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive && isBound(c) && c.bond!.seat === life.seat,
    );
}

/** The household's people of working age (twelve and over, under seventy). */
export function adultsOf(s: GameState, life: Life): Character[] {
  return boundOf(s, life).filter((c) => {
    const a = ageOf(s, c);
    return a >= 12 && a < 70;
  });
}

/** Has this household anyone in bondage or under indenture now. */
export function hasBound(s: GameState, life: Life): boolean {
  return boundOf(s, life).length > 0;
}

/** The household's people grown and held for life. */
export function heldAdults(s: GameState, life: Life): Character[] {
  return adultsOf(s, life).filter((c) => isHeld(c) && ageOf(s, c) >= 16);
}

// ---------------------------------------------------------------- dice

/**
 * The track's own dice, from the seed, the day and a salt: so the world's
 * main dice are never disturbed, and a household with no one in it rolls
 * nothing at all.
 */
export function bdice(s: GameState, salt: number): Rng {
  return worldRng(s, (salt ^ 0x1abc0d) | 0);
}

export function hashOf(...xs: (number | string)[]): number {
  let h = 2166136261 | 0;
  for (const x of xs) {
    const v =
      typeof x === "number"
        ? x | 0
        : [...x].reduce((m, ch) => Math.imul(m ^ ch.charCodeAt(0), 31), 7);
    h = Math.imul(h ^ v, 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}

/** A number for a seat, for salting dice. */
export function seatSalt(seat: string): number {
  return hashOf(seat);
}

// ---------------------------------------------------------------- the peoples

export const ORIGIN_NAMES: Record<BondOrigin, string> = {
  akan: "Akan, from the Gold Coast",
  igbo: "Igbo, from the Bight of Biafra",
  kongo: "Kongo, from West Central Africa",
  mande: "Mande, from Senegambia",
  wolof: "Wolof, from Senegambia",
  fon: "Fon, from the Bight of Benin",
  yoruba: "Yoruba, from the Bight of Benin",
  malagasy: "Malagasy, from Madagascar",
  creole: "born in the Americas",
  europe: "from Europe, under indenture",
};

/** The places a ship had come from, for a sale's notice. */
const ORIGIN_COAST: Record<BondOrigin, string> = {
  akan: "the Gold Coast",
  igbo: "the Bight of Biafra",
  kongo: "Angola",
  mande: "the Gambia",
  wolof: "Senegal",
  fon: "Whydah",
  yoruba: "the Bight of Benin",
  malagasy: "Madagascar",
  creole: "the islands",
  europe: "Europe",
};

interface NamePair {
  m: string[];
  f: string[];
}

/**
 * Names people were given at birth by their own families, in the forms the
 * period's records kept (Akan day names: Kwadwo, written Cudjoe; Igbo
 * market-day names; Kongo, Mande, Wolof, Fon, Yoruba and Malagasy names).
 */
const OWN_NAMES: Record<Exclude<BondOrigin, "creole" | "europe">, NamePair> = {
  akan: {
    m: ["Kwadwo", "Kwabena", "Kwaku", "Yaw", "Kofi", "Kwame", "Kwasi"],
    f: ["Adwoa", "Abena", "Akua", "Yaa", "Afua", "Ama", "Akosua"],
  },
  igbo: {
    m: ["Okeke", "Okafor", "Okoye", "Okonkwo", "Nwoye", "Ekwueme"],
    f: ["Mgbeke", "Mgbafor", "Mgboye", "Mgbankwo", "Adaeze", "Nneka"],
  },
  kongo: {
    m: [
      "Mbemba",
      "Nkanga",
      "Mpanzu",
      "Nsaku",
      "Nlaza",
      "Lukeni",
      "Antonio",
      "Pedro",
      "Manuel",
    ],
    f: ["Nzinga", "Kimpa", "Nsimba", "Nzuzi", "Mafuta", "Maria", "Isabel"],
  },
  mande: {
    m: [
      "Samba",
      "Moussa",
      "Bakary",
      "Ibrahima",
      "Mamadou",
      "Ayuba",
      "Suleiman",
      "Lamine",
    ],
    f: ["Fatoumata", "Aminata", "Mariama", "Hawa", "Binta", "Nyima"],
  },
  wolof: {
    m: ["Demba", "Samba", "Mbaye", "Malick", "Modou", "Omar"],
    f: ["Kumba", "Penda", "Ndeye", "Awa", "Fatou", "Yacine"],
  },
  fon: {
    m: ["Dossou", "Sossou", "Agossou", "Kodjo", "Komla", "Kokou"],
    f: ["Dossi", "Sossi", "Abla", "Akouvi", "Afiwa", "Adjowa"],
  },
  yoruba: {
    m: ["Ojo", "Ige", "Dada", "Taiwo", "Kehinde", "Idowu", "Oke"],
    f: ["Aina", "Taiwo", "Kehinde", "Alaba", "Idowu", "Abeni"],
  },
  malagasy: {
    m: ["Rakoto", "Rabe", "Rasolo"],
    f: ["Rasoa", "Ravao", "Ranoro"],
  },
};

/** The forms English records wrote Akan day names in (Kwadwo: Cudjoe). */
const AKAN_RECORDED: Record<string, string> = {
  Kwadwo: "Cudjoe",
  Kwabena: "Cubbenah",
  Kwaku: "Quaco",
  Yaw: "Quao",
  Kofi: "Cuffee",
  Kwame: "Quamina",
  Kwasi: "Quashee",
  Adwoa: "Juba",
  Abena: "Beneba",
  Akua: "Cuba",
  Yaa: "Abba",
  Afua: "Phibbah",
  Ama: "Mimba",
  Akosua: "Quasheba",
};

/** Names enslavers gave, by the colony's people: classical, biblical, everyday. */
const GIVEN_NAMES: Record<string, NamePair> = {
  english: {
    m: [
      "Caesar",
      "Pompey",
      "Cato",
      "Scipio",
      "Jupiter",
      "Hercules",
      "Prince",
      "Jack",
      "Tom",
      "Will",
      "Harry",
      "Ned",
      "Sam",
      "Abraham",
      "Isaac",
      "Moses",
      "Peter",
      "Robin",
      "Toby",
      "London",
    ],
    f: [
      "Venus",
      "Phoebe",
      "Dido",
      "Diana",
      "Flora",
      "Chloe",
      "Dinah",
      "Hagar",
      "Sarah",
      "Rachel",
      "Bess",
      "Nan",
      "Sukey",
      "Jenny",
      "Peg",
      "Betty",
      "Lucy",
      "Hannah",
      "Patience",
      "Grace",
    ],
  },
  french: {
    m: [
      "Jean",
      "Pierre",
      "Louis",
      "César",
      "Pompée",
      "Jupiter",
      "Joseph",
      "François",
      "Jacques",
      "Baptiste",
      "Augustin",
      "Hercule",
    ],
    f: [
      "Marie",
      "Marguerite",
      "Jeanne",
      "Catherine",
      "Louison",
      "Rose",
      "Angélique",
      "Victoire",
      "Françoise",
      "Thérèse",
    ],
  },
  spanish: {
    m: [
      "Francisco",
      "Juan",
      "Antonio",
      "Pedro",
      "Domingo",
      "Manuel",
      "José",
      "Miguel",
    ],
    f: ["María", "Juana", "Isabel", "Ana", "Rosa", "Catalina", "Francisca"],
  },
  dutch: {
    m: [
      "Pieter",
      "Jan",
      "Claes",
      "Anthony",
      "Paulo",
      "Simon",
      "Manuel",
      "Frans",
    ],
    f: ["Maria", "Mayken", "Susanna", "Lucretia", "Isabel", "Catharina"],
  },
};

/** Names of those bound by indenture, by where they came from. */
const SERVANT_NAMES: { m: string[]; f: string[]; fam: string[] }[] = [
  {
    m: [
      "John",
      "Thomas",
      "William",
      "Richard",
      "Robert",
      "Edward",
      "Henry",
      "James",
    ],
    f: ["Mary", "Elizabeth", "Anne", "Margaret", "Jane", "Alice"],
    fam: [
      "Smith",
      "Jones",
      "Taylor",
      "Brown",
      "Harris",
      "Cooke",
      "Ward",
      "Hale",
      "Pratt",
      "Webb",
    ],
  },
  {
    m: ["Patrick", "Owen", "Darby", "Bryan", "Dennis", "Cornelius"],
    f: ["Bridget", "Honora", "Mary", "Margaret", "Catherine"],
    fam: ["Murphy", "Kelly", "Sullivan", "Connor", "Dunn", "Byrne", "Walsh"],
  },
  {
    m: ["Duncan", "Angus", "Malcolm", "Alexander", "Hugh", "Andrew"],
    f: ["Janet", "Isobel", "Agnes", "Marion", "Christian"],
    fam: ["Campbell", "MacDonald", "Fraser", "Grant", "Murray", "Ross"],
  },
  {
    m: ["Johann", "Jacob", "Conrad", "Heinrich", "Georg", "Peter"],
    f: ["Anna Maria", "Catharina", "Elisabeth", "Barbara", "Margaretha"],
    fam: ["Müller", "Schmidt", "Weber", "Hoffmann", "Becker", "Koch"],
  },
];

const ENGAGE_NAMES = {
  m: ["Jean", "Pierre", "Louis", "Jacques", "Nicolas", "Antoine", "Étienne"],
  f: ["Marie", "Anne", "Jeanne", "Marguerite"],
  fam: ["Martin", "Bernard", "Roy", "Gagnon", "Lefebvre", "Girard", "Morel"],
};

/** Surnames freed people took (Paul Cuffe took his father's Akan name, Kofi). */
const FREE_NAMES: Record<string, string[]> = {
  english: [
    "Freeman",
    "Liberty",
    "Hope",
    "Freedom",
    "Peace",
    "Newport",
    "Prince",
    "Lew",
  ],
  french: ["Liberté", "Lafortune", "Bonhomme", "Beaulieu", "Jolicoeur"],
  spanish: ["de la Cruz", "Libre", "de Mose", "de la Rosa"],
  dutch: ["Vrij", "de Vries", "Manuel", "Angola"],
};

/** The people whose law a colony's naming follows. */
function namingOf(culture: string): string {
  return GIVEN_NAMES[culture]
    ? culture
    : culture === "portuguese"
      ? "spanish"
      : "english";
}

// ---------------------------------------------------------------- money

/** An adult in their prime, in pounds, by the year (Chesapeake prices). */
const ADULT_POUNDS: [number, number][] = [
  [1620, 20],
  [1660, 22],
  [1690, 25],
  [1710, 28],
  [1730, 32],
  [1750, 36],
  [1765, 45],
  [1776, 50],
];

/** An adult's price in coins in a year (before the colony's own market). */
export function basePrice(year: number): number {
  const t = ADULT_POUNDS;
  if (year <= t[0][0]) return t[0][1] * POUND;
  for (let i = 1; i < t.length; i++)
    if (year <= t[i][0]) {
      const [y0, p0] = t[i - 1];
      const [y1, p1] = t[i];
      return (p0 + ((p1 - p0) * (year - y0)) / (y1 - y0)) * POUND;
    }
  return t[t.length - 1][1] * POUND;
}

/** How a colony's market prices people against the Chesapeake's. */
export function marketFactor(col: Colony, law: string): number {
  if (law === "spanish") return 1.25;
  if (law === "dutch") return 0.95;
  if (col === "islands" || col === "jamaica") return 0.85;
  if (col === "hispaniola") return 0.9;
  if (col === "southcarolina" || col === "georgia") return 1.05;
  return 1;
}

/** How age weighs on a price (the period's own grim arithmetic). */
function ageFactor(age: number): number {
  if (age < 10) return 0.3;
  if (age < 16) return 0.65;
  if (age <= 35) return 1;
  if (age <= 45) return 0.75;
  if (age <= 55) return 0.45;
  return 0.2;
}

/** A person's price at a place now. */
export function priceOf(
  s: GameState,
  map: MapDef,
  p: number,
  o: { age: number; female: boolean; health: number; craft: number },
  day: number = s.day,
): number {
  const year = dateOf(day).year;
  const col = colonyOf(map, p);
  const { law } = lawOf(s, p);
  const v =
    basePrice(year) *
    marketFactor(col, law) *
    ageFactor(o.age) *
    (o.female ? 0.9 : 1) *
    (0.7 + (0.3 * o.health) / 100) *
    (o.craft >= 6 ? 1.2 : 1);
  return Math.max(2, Math.round(v));
}

/** Coins a year of an indenture costs to buy (a servant's passage, as sold). */
export const INDENTURE_YEAR = 4.5;
/** Freedom dues at the end of an indenture: clothes, tools, corn (in coins). */
export const FREEDOM_DUES = 6;
/** What a sale pays of a person's price (the dealer's and the auction's cut). */
export const SALE_SHARE = 0.7;

/** Provisions and clothes, and quarters, a month, by the policy (a child half). */
export const FOOD_COST = [0.22, 0.38, 0.6] as const;
export const HOUSING_COST = [0.04, 0.1, 0.2] as const;

export const FOOD_NAMES = ["Scant", "As is customary", "Ample"] as const;
export const HOUSING_NAMES = [
  "Rough cabins",
  "Customary quarters",
  "Sound houses",
] as const;
export const PUNISH_NAMES = [
  "Restraint",
  "As the neighbours do",
  "Harshly",
] as const;

/** What keeping someone costs a month. */
export function keepOf(s: GameState, policy: BondPolicy, c: Character): number {
  const half = ageOf(s, c) < 12 ? 0.5 : 1;
  return r2((FOOD_COST[policy.food] + HOUSING_COST[policy.housing]) * half);
}

/** The household's keep a month, all told. */
export function householdKeep(s: GameState, life: Life): number {
  const b = life.bondage;
  if (!b) return 0;
  return r2(boundOf(s, life).reduce((m, c) => m + keepOf(s, b.policy, c), 0));
}

// ---------------------------------------------------------------- the work

export type Crop = "tobacco" | "rice" | "indigo" | "sugar" | "grain" | "mixed";

export interface CropDef {
  name: string;
  /** Coins a month a field worker's work brings in, at the ordinary. */
  value: number;
  /** What the work does to health (sugar and the rice swamps were deadly). */
  health: number;
  /** And to the chance of dying. */
  death: number;
}

export const CROPS: Record<Crop, CropDef> = {
  tobacco: { name: "tobacco", value: 2.6, health: 0, death: 1 },
  rice: { name: "rice", value: 3.0, health: -5, death: 1.2 },
  indigo: { name: "rice and indigo", value: 3.3, health: -5, death: 1.2 },
  sugar: { name: "sugar", value: 3.5, health: -10, death: 1.5 },
  grain: { name: "wheat and corn", value: 2.2, health: 0, death: 1 },
  mixed: { name: "mixed farming", value: 2.0, health: 0, death: 1 },
};

/** What the fields grow at a place in a year. */
export function cropAt(
  s: GameState,
  map: MapDef,
  p: number,
  day = s.day,
): Crop {
  const year = dateOf(day).year;
  const col = colonyOf(map, p);
  const coastal = map.provinces[p]?.coastal ?? false;
  switch (col) {
    case "virginia":
    case "maryland":
      return "tobacco";
    case "northcarolina":
      return coastal ? "tobacco" : "mixed";
    case "southcarolina":
    case "georgia":
      if (!coastal) return "mixed";
      return year >= 1745 ? "indigo" : year >= 1695 ? "rice" : "mixed";
    case "louisiana":
      return year >= 1730 ? "indigo" : "tobacco";
    case "islands":
    case "jamaica":
    case "hispaniola":
    case "cuba":
    case "puertorico":
      return "sugar";
    case "pennsylvania":
    case "newjersey":
    case "newyork":
    case "delaware":
      return "grain";
    default:
      return "mixed";
  }
}

/** A month's luck in the fields: the weather, the worm, the market. */
export const CROP_LUCK = [
  { label: "a good month", p: 0.2, mul: 1.3 },
  { label: "a fair month", p: 0.6, mul: 1 },
  { label: "a poor month", p: 0.2, mul: 0.6 },
] as const;

/** A trade worked in town for hire: what it brings a month, and its luck. */
export const HIRE_VALUE = 1.6;
export const HIRE_LUCK = [
  { label: "a good contract", p: 0.1, mul: 1.5 },
  { label: "steady work", p: 0.7, mul: 1 },
  { label: "little work", p: 0.2, mul: 0.5 },
] as const;
/** Settlers a town needs before anyone can be hired out there. */
export const HIRE_TOWN = 600;
/** Work goes slower when nobody minds the place (you're away). */
export const AWAY_FACTOR = 0.75;
/** The duty on what the fields and the trades bring in. */
export const CROP_EXCISE = 0.08;

/** Acres to work at a place: your land there and your farm. */
export function acresAt(life: Life, p: number): number {
  let acres = (landOf(life, p)?.level ?? 0) * 10;
  for (const pr of propertyOf(life))
    if (pr.kind === "business" && pr.prov === p && pr.job === "farmer")
      acres += [0, 50, 100, 250][pr.level] ?? 0;
  return acres;
}

/** Acres one field worker works (a share of a crop, and the corn to feed them). */
export const ACRES_EACH = 10;

/** How much of a full hand's work someone can do, by age. */
export function workShare(age: number): number {
  if (age < 12) return 0;
  if (age < 16) return 0.5;
  if (age >= 60) return 0.5;
  return 1;
}

/** Whether someone is minding the place: you're at home, not on the road. */
export function minding(life: Life): boolean {
  const b = life.bondage;
  return !!b && !life.travel && life.prov === b.home;
}

/** One worker's part of a month: before the season's luck and the duty. */
export function workOf(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
  as: BondWork = c.bond!.work,
): number {
  const b = life.bondage!;
  const m = c.bond!;
  const share = workShare(ageOf(s, c));
  if (!share || as === "rest" || as === "house") return 0;
  const skill = as === "fields" ? m.sk.field : m.sk.craft;
  const base =
    as === "fields" ? CROPS[cropAt(s, map, b.home)].value : HIRE_VALUE;
  const v =
    base *
    share *
    (0.8 + skill / 25) *
    (0.4 + (0.6 * m.health) / 100) *
    (0.85 + (0.25 * m.mood) / 100) *
    (as === "fields" && b.policy.regime === "gang" ? 1.08 : 1) *
    (minding(life) ? 1 : AWAY_FACTOR);
  return v;
}

/** The household's fields this month: who works them, and what's left idle. */
export function fieldsOf(
  s: GameState,
  map: MapDef,
  life: Life,
): { workers: Character[]; idle: Character[]; acres: number; crop: Crop } {
  const b = life.bondage!;
  const acres = acresAt(life, b.home);
  let room = Math.floor(acres / ACRES_EACH);
  const workers: Character[] = [];
  const idle: Character[] = [];
  for (const c of boundOf(s, life)) {
    if (c.bond!.work !== "fields" || !workShare(ageOf(s, c))) continue;
    if (room > 0) {
      workers.push(c);
      room--;
    } else idle.push(c);
  }
  return { workers, idle, acres, crop: cropAt(s, map, b.home) };
}

/**
 * The tenants' rent no longer coming from lots of your land the household
 * works (a farm's own acres were never let): a month, on average.
 */
export function rentForgone(life: Life, workers: number): number {
  const b = life.bondage;
  if (!b || !workers) return 0;
  const lots = landOf(life, b.home)?.level ?? 0;
  const farm = Math.floor((acresAt(life, b.home) - lots * 10) / ACRES_EACH);
  const used = Math.max(0, Math.min(lots, workers - farm));
  return r2(used * LAND_LOT.rent);
}

/** Whether the household's home is a town big enough to hire people out in. */
export function hireTown(s: GameState, life: Life): boolean {
  const b = life.bondage;
  const pr = b ? s.provinces[b.home] : undefined;
  return !!pr && settlers(pr) >= HIRE_TOWN;
}

/** Those hired out in town this month (only in a town of a size). */
export function hiredOf(s: GameState, life: Life): Character[] {
  if (!hireTown(s, life)) return [];
  return boundOf(s, life).filter(
    (c) => c.bond!.work === "craft" && workShare(ageOf(s, c)) > 0,
  );
}

/** What the fields and the hired-out are expected to bring a month, before the duty. */
export function workExpected(
  s: GameState,
  map: MapDef,
  life: Life,
): { fields: number; hire: number } {
  const f = fieldsOf(s, map, life);
  const fields = f.workers.reduce((m, c) => m + workOf(s, map, life, c), 0);
  const hire = hiredOf(s, life).reduce(
    (m, c) => m + workOf(s, map, life, c, "craft"),
    0,
  );
  const meanCrop = CROP_LUCK.reduce((m, x) => m + x.p * x.mul, 0);
  const meanHire = HIRE_LUCK.reduce((m, x) => m + x.p * x.mul, 0);
  return { fields: fields * meanCrop, hire: hire * meanHire };
}

// ---------------------------------------------------------------- how they bear it, and their health

export const DEFAULT_POLICY: BondPolicy = {
  food: 1,
  housing: 1,
  regime: "gang",
  families: false,
  passes: false,
  church: false,
  letters: false,
  punish: 1,
};

/** The household's customary policy where it lives (the task system in the Lowcountry). */
export function customaryPolicy(
  s: GameState,
  map: MapDef,
  p: number,
): BondPolicy {
  const crop = cropAt(s, map, p);
  const law = bondLaw(s, map, p);
  return {
    ...DEFAULT_POLICY,
    regime: crop === "rice" || crop === "indigo" ? "task" : "gang",
    church: law.church === "required",
    families: !law.apart,
  };
}

/** A new arrival from Africa, in their first year (the "seasoning"). */
export function seasoning(s: GameState, c: Character): boolean {
  const m = c.bond;
  if (!m || m.origin === "creole" || m.origin === "europe") return false;
  return s.day - m.since < DAYS_PER_YEAR;
}

/** Their family: a husband or wife, children, parents (alive). */
export function familyOf(s: GameState, c: Character): Character[] {
  const ids = [c.spouse, c.father, c.mother, ...c.children];
  return ids
    .map((id) => s.chars[id])
    .filter((x): x is Character => !!x?.alive && x.id !== c.id);
}

/** Family who live on another estate (or elsewhere), not with them. */
export function familyAway(s: GameState, c: Character): Character[] {
  const at = c.bond?.at;
  return familyOf(s, c).filter((x) => {
    const where = x.bond ? x.bond.at : x.home;
    return where !== at || x.bond?.seat !== c.bond?.seat;
  });
}

function hereWith(
  s: GameState,
  c: Character,
  x: Character | undefined,
): boolean {
  return (
    !!x?.alive &&
    !!x.bond &&
    x.bond.at === c.bond?.at &&
    x.bond.seat === c.bond?.seat &&
    isBound(x)
  );
}

/** What their spirits are tending to, and why. */
export function moodTarget(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
): Breakdown {
  const b = life.bondage!;
  const pol = b.policy;
  const m = c.bond!;
  const e = new Explain(40);
  e.add("Provisions", [-12, 0, 8][pol.food]);
  e.add("Quarters", [-8, 0, 6][pol.housing]);
  if (workShare(ageOf(s, c)) > 0)
    e.add(
      pol.regime === "task"
        ? "The task system: their own time"
        : "Gangs under a driver",
      pol.regime === "task" ? 8 : -6,
    );
  if (pol.families) e.add("Families never sold apart", 5);
  const away = familyAway(s, c).length > 0;
  if (pol.passes) e.add(away ? "Passes to see family" : "Passes", away ? 6 : 2);
  else if (away) e.add("Family elsewhere, and no passes", -4);
  if (pol.church) e.add("Church allowed", m.faith === "christian" ? 4 : 1);
  if (pol.letters && bondLaw(s, map, b.home).reading)
    e.add("Letters taught", 4);
  e.add("Punishment", [6, -4, -16][pol.punish]);
  if (hereWith(s, c, s.chars[c.spouse])) e.add("Husband or wife here", 6);
  if (c.children.some((k) => hereWith(s, c, s.chars[k])))
    e.add("Children here", 4);
  if ((m.grief ?? 0) > s.day) e.add("Grieving", -22);
  if (seasoning(s, c)) e.add("Newly come, after the passage", -10);
  if (m.status === "indenture") e.add("A term that ends", 10);
  const freed = b.log.some(
    (n) => n.k === "freed" && s.day - n.day < 2 * DAYS_PER_YEAR,
  );
  if (freed) e.add("Someone freed lately: hope", 4);
  return e.done(0, 0, 100);
}

/** What their health is tending to, and why. */
export function healthTarget(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
): Breakdown {
  const b = life.bondage!;
  const pol = b.policy;
  const e = new Explain(68);
  e.add("Provisions", [-16, 0, 10][pol.food]);
  e.add("Quarters", [-10, 0, 7][pol.housing]);
  const works = workShare(ageOf(s, c)) > 0 && c.bond!.work === "fields";
  if (works) {
    if (pol.regime === "gang") e.add("Gang labour", -5);
    else e.add("The task system", 2);
    e.add("The work", CROPS[cropAt(s, map, b.home)].health);
  }
  if (pol.punish === 2) e.add("Harsh punishment", -8);
  const age = ageOf(s, c);
  if (age > 50) e.add("Age", -Math.round((age - 50) / 2));
  if (seasoning(s, c)) e.add("Seasoning: a strange country's fevers", -8);
  return e.done(0, 5, 100);
}

// ---------------------------------------------------------------- the risks

/** The chance a month someone dies, and why. */
export function deathChance(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
): number {
  const age = ageOf(s, c);
  let p =
    age < 2
      ? 0.012
      : age < 6
        ? 0.004
        : age < 16
          ? 0.0012
          : age <= 40
            ? 0.0018
            : age <= 55
              ? 0.003
              : age <= 65
                ? 0.006
                : 0.015;
  const h = c.bond!.health;
  if (h < 70) p *= 1 + (70 - h) / 25;
  if (seasoning(s, c)) p *= 3;
  if (c.bond!.work === "fields" && workShare(age) > 0)
    p *= CROPS[cropAt(s, map, life.bondage!.home)].death;
  return Math.min(0.2, p);
}

/** How strongly the refuges near a place draw those who'd flee. */
export function refugePull(s: GameState, map: MapDef, p: number): number {
  const total = refugesFrom(s, map, p).reduce((m, r) => m + r.w, 0);
  return 0.5 + total / 8;
}

export const FLIGHT_BASE = 0.0003;
export const FLIGHT_DESPAIR = 0.006;
export const FLIGHT_GRIEF = 0.004;

/** The chance a month that someone flees, and why. */
export function flightChance(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
): Breakdown {
  const b = life.bondage!;
  const age = ageOf(s, c);
  const e = new Explain(0);
  if (age < 12 || age >= 70) return e.done(5);
  const m = c.bond!;
  const despair = (100 - m.mood) / 100;
  e.add("Always", FLIGHT_BASE);
  e.add("How they bear it", FLIGHT_DESPAIR * despair * despair);
  if ((m.grief ?? 0) > s.day)
    e.add("Grief: family taken from them", FLIGHT_GRIEF);
  e.mul("Refuges near", refugePull(s, map, b.home));
  const law = bondLaw(s, map, b.home);
  if (law.patrols) e.mul("Patrols ride at night", 0.8);
  if (b.policy.passes) e.mul("Passes: more on the roads", 1.1);
  if (age >= 16 && age <= 35) e.mul("Young and strong", 1.3);
  else if (age > 45) e.mul("Older", 0.5);
  if (
    c.female &&
    c.children.some(
      (k) => hereWith(s, c, s.chars[k]) && ageOf(s, s.chars[k]) < 10,
    )
  )
    e.mul("Young children to think of", 0.6);
  if (m.status === "indenture") e.mul("A term that ends", 0.6);
  return e.done(5);
}

/** The chance someone who flees from here reaches freedom, by where they make for. */
export const REFUGE_ODDS: Record<BondRefuge, number> = {
  florida: 0.5,
  swamp: 0.45,
  nations: 0.35,
  town: 0.3,
  sea: 0.35,
  maroons: 0.5,
  dunmore: 0.55,
  north: 0.25,
};

/** Where they'd make for from a place: each refuge with its chance of being chosen, and of reaching it. */
export function refugeOdds(
  s: GameState,
  map: MapDef,
  life: Life,
  c?: Character,
): { to: BondRefuge; pick: number; free: number }[] {
  const b = life.bondage!;
  const list = refugesFrom(s, map, b.home);
  const total = list.reduce((m, r) => m + r.w, 0) || 1;
  const law = bondLaw(s, map, b.home);
  const lit = (c?.bond?.lit ?? 0) >= 2 ? 1.2 : 1;
  const indent = c?.bond?.status === "indenture" ? 1.5 : 1;
  return list.map((r) => ({
    to: r.to,
    pick: r.w / total,
    free: Math.min(
      0.85,
      REFUGE_ODDS[r.to] * (law.patrols ? 0.8 : 1) * lit * indent,
    ),
  }));
}

/** The chance someone who flees reaches freedom, all told. */
export function freedomChance(
  s: GameState,
  map: MapDef,
  life: Life,
  c?: Character,
): number {
  return refugeOdds(s, map, life, c).reduce((m, r) => m + r.pick * r.free, 0);
}

export const RISE_BASE = 0.0001;
/** Grown people held, before a rising can be thought of. */
export const RISE_MIN = 4;

/** The chance a month of a rising in the household, and why. */
export function riseChance(s: GameState, map: MapDef, life: Life): Breakdown {
  const e = new Explain(0);
  const adults = heldAdults(s, life);
  if (adults.length < RISE_MIN) return e.done(6);
  const b = life.bondage!;
  const d =
    adults.reduce((m, c) => m + (100 - c.bond!.mood) / 100, 0) / adults.length;
  e.add(
    `${adults.length} grown people held`,
    RISE_BASE * Math.min(30, adults.length),
  );
  e.mul("How they bear it", d * d * d * d);
  e.mul("Refuges near", refugePull(s, map, b.home));
  if (bondLaw(s, map, b.home).patrols) e.mul("Patrols and the militia", 0.7);
  return e.done(6);
}

/** What comes of a rising, and its chances. */
export const RISE_OUTCOMES = [
  { key: "betrayed", label: "found out before it begins", p: 0.45 },
  { key: "rose", label: "they rise, fire the barns, and go", p: 0.55 },
] as const;

/** A month to a year: the chance it happens at least once in twelve months. */
export function yearly(p: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 12);
}

/** The chance a woman gives birth this month. */
export function birthChance(s: GameState, c: Character): number {
  if (!c.female) return 0;
  const age = ageOf(s, c);
  if (age < 18 || age > 42) return 0;
  if (s.day - c.lastBirth < 600) return 0;
  const sp = s.chars[c.spouse];
  if (!sp?.alive) return 0;
  const together = sp.bond?.at === c.bond?.at || sp.home === c.bond?.at;
  const p = together ? 0.011 : 0.004;
  return c.bond!.health >= 60 ? p : p * 0.6;
}

// ---------------------------------------------------------------- the risks, for the page

export interface BondRisks {
  /** Chance a year that anyone flees (at least one). */
  flightYear: number;
  /** Expected flights a year. */
  flightsYear: number;
  /** Of those who flee, the chance of reaching freedom. */
  freeOdds: number;
  refuges: { to: BondRefuge; name: string; pick: number; free: number }[];
  /** Chance a year of a rising. */
  riseYear: number;
  /** Expected deaths a year. */
  deathsYear: number;
  /** Per person: their flight and death a year. */
  each: { c: number; flight: number; death: number }[];
  factors: string[];
}

export function bondRisks(s: GameState, map: MapDef, life: Life): BondRisks {
  const people = boundOf(s, life);
  let none = 1;
  let flights = 0;
  let deaths = 0;
  const each = people.map((c) => {
    const f = flightChance(s, map, life, c).total;
    const d = deathChance(s, map, life, c);
    none *= Math.pow(1 - f, 12);
    flights += yearly(f);
    deaths += yearly(d);
    return { c: c.id, flight: yearly(f), death: yearly(d) };
  });
  const refs = life.bondage ? refugeOdds(s, map, life) : [];
  const law = life.bondage ? bondLaw(s, map, life.bondage.home) : undefined;
  const factors = [
    "Spirits above all: provisions, quarters, the task system rather than gangs, families never sold apart, passes to see family, and restraint in punishment raise them. Harsh treatment saves a little on provisions and costs far more.",
    "Grief: anyone whose husband, wife, child or parent has been sold away, or has died, is far likelier to go for a year.",
    "The young and strong go most often; mothers of young children least.",
    `Refuges near: ${refs.map((r) => REFUGE_SHORT[r.to]).join(", ") || "none"}.`,
    law?.patrols
      ? "Patrols ride at night here: fewer get away, and fewer get far."
      : "No patrols ride here.",
    "A rising needs four grown people or more, and comes of despair: it is rare, and it is grave.",
    "New arrivals from Africa are weak from the passage and die often in their first year (the seasoning).",
  ];
  return {
    flightYear: people.length ? 1 - none : 0,
    flightsYear: flights,
    freeOdds: life.bondage ? freedomChance(s, map, life) : 0,
    refuges: refs.map((r) => ({ ...r, name: REFUGE_SHORT[r.to] })),
    riseYear: life.bondage ? yearly(riseChance(s, map, life).total) : 0,
    deathsYear: deaths,
    each,
    factors,
  };
}

/** The fields' month as an odds view (the same table the month is rolled from). */
export function fieldsOdds(s: GameState, w: World, life: Life): OddsView {
  const b = life.bondage!;
  const f = fieldsOf(s, w.map, life);
  const gross = f.workers.reduce((m, c) => m + workOf(s, w.map, life, c), 0);
  const net = (v: number) => r1(v * (1 - CROP_EXCISE));
  const less = rentForgone(life, f.workers.length);
  const outcomes: OddsOutcome[] = CROP_LUCK.map((x) => ({
    label: x.label,
    p: x.p,
    lo: r1(net(gross * x.mul) - less),
    hi: r1(net(gross * x.mul) - less),
    bad: x.mul < 1,
  }));
  const rent = rentForgone(life, f.workers.length);
  const expected = r1(
    net(gross * CROP_LUCK.reduce((m, x) => m + x.p * x.mul, 0)) - rent,
  );
  const keep = householdKeep(s, life);
  return {
    title: `The fields: ${f.workers.length} at work on ${f.acres} acres (${CROPS[f.crop].name})`,
    ok: true,
    costNow: 0,
    costMonth: keep,
    per: "month",
    outcomes,
    expected,
    lo: outcomes[2].lo,
    hi: outcomes[0].hi,
    net: r1(expected - keep),
    risks: [],
    factors: [
      `Each worker needs ${ACRES_EACH} acres: land (Estate › House & land) or your farm at ${w.map.provinces[b.home]?.name ?? "home"}.`,
      "Their skill, their health and their spirits: a worker who is ill-fed, grieving or in despair does far less.",
      "Gangs under a driver get a little more from the day than the task system, and wear people down for it.",
      `Away from home, nobody minds the place: ${Math.round(AWAY_FACTOR * 100)}% of the work.`,
      `What the fields bring pays the duty (${Math.round(CROP_EXCISE * 100)}%); land the household works isn't let, so its tenants' rent (${LAND_LOT.rent} a lot) no longer comes in.`,
    ],
  };
}

// ---------------------------------------------------------------- the sales

export interface SalePerson {
  first: string;
  /** Their own name, if they're known here by another. */
  born?: string;
  family?: string;
  female: boolean;
  age: number;
  origin: BondOrigin;
  faith: BondMark["faith"];
  sk: BondMark["sk"];
  health: number;
  /** The first in a lot, their husband or wife, or a child. */
  rel: "self" | "partner" | "child";
  /** An indenture: years to serve. */
  term?: number;
}

export interface SaleLot {
  key: string;
  kind: "held" | "indenture";
  people: SalePerson[];
  price: number;
  /** How the notice put it. */
  note: string;
  sold: boolean;
}

/** The month a sale belongs to (a sale lasts the month). */
export function saleMonth(day: number): number {
  const d = dateOf(day);
  return d.year * 12 + d.month;
}

const ORIGIN_MIX: Record<string, [BondOrigin, number][]> = {
  chesapeake: [
    ["igbo", 40],
    ["akan", 15],
    ["mande", 12],
    ["wolof", 6],
    ["kongo", 15],
    ["creole", 12],
  ],
  lowcountry: [
    ["kongo", 40],
    ["mande", 15],
    ["wolof", 10],
    ["akan", 10],
    ["igbo", 10],
    ["creole", 15],
  ],
  islands: [
    ["akan", 35],
    ["igbo", 25],
    ["kongo", 12],
    ["fon", 10],
    ["yoruba", 5],
    ["creole", 13],
  ],
  french: [
    ["fon", 25],
    ["yoruba", 10],
    ["kongo", 30],
    ["wolof", 10],
    ["mande", 10],
    ["creole", 15],
  ],
  spanish: [
    ["kongo", 40],
    ["akan", 15],
    ["fon", 10],
    ["yoruba", 5],
    ["mande", 10],
    ["creole", 20],
  ],
  dutch: [
    ["kongo", 60],
    ["akan", 15],
    ["creole", 25],
  ],
  north: [
    ["creole", 40],
    ["akan", 20],
    ["kongo", 12],
    ["mande", 10],
    ["malagasy", 8],
    ["igbo", 10],
  ],
};

function mixFor(
  col: Colony,
  law: string,
  year: number,
): [BondOrigin, number][] {
  if (law === "spanish") return ORIGIN_MIX.spanish;
  if (law === "dutch") return ORIGIN_MIX.dutch;
  if (law === "french") return ORIGIN_MIX.french;
  if (col === "islands" || col === "jamaica") return ORIGIN_MIX.islands;
  if (col === "southcarolina" || col === "georgia" || col === "northcarolina")
    return ORIGIN_MIX.lowcountry;
  if (col === "virginia" || col === "maryland")
    // The charter generation came by way of the islands, before the ships from Africa.
    return year < 1680
      ? [
          ["creole", 60],
          ["kongo", 20],
          ["akan", 20],
        ]
      : ORIGIN_MIX.chesapeake;
  const north = ORIGIN_MIX.north;
  // Madagascar ships came to New York from about 1680 to 1720.
  return year >= 1680 && year <= 1721
    ? north
    : north.filter(([o]) => o !== "malagasy");
}

function pickWeighted<T>(rng: Rng, list: [T, number][]): T {
  const total = list.reduce((m, [, w]) => m + w, 0);
  let r = rng.next() * total;
  for (const [x, w] of list) {
    r -= w;
    if (r <= 0) return x;
  }
  return list[list.length - 1][0];
}

/** A name for someone: the one they're known by here, and their own if it differs. */
export function nameFor(
  rng: Rng,
  origin: BondOrigin,
  female: boolean,
  culture: string,
): { first: string; born?: string } {
  const given = GIVEN_NAMES[namingOf(culture)];
  if (origin === "creole")
    return { first: rng.pick(female ? given.f : given.m)! };
  if (origin === "europe") return { first: "" };
  const own = OWN_NAMES[origin];
  const born = rng.pick(female ? own.f : own.m)!;
  // Akan day names were kept, in the form the clerks wrote them.
  if (origin === "akan" && rng.chance(0.5))
    return { first: AKAN_RECORDED[born] ?? born, born };
  if (rng.chance(0.3)) return { first: born };
  return { first: rng.pick(female ? given.f : given.m)!, born };
}

function faithFor(rng: Rng, origin: BondOrigin): BondMark["faith"] {
  if (origin === "creole") return rng.chance(0.4) ? "christian" : "own";
  if (origin === "mande" || origin === "wolof")
    return rng.chance(0.55) ? "islam" : "own";
  if (origin === "kongo") return rng.chance(0.5) ? "christian" : "own";
  return "own";
}

function skillsFor(rng: Rng, origin: BondOrigin, age: number): BondMark["sk"] {
  const grown = age >= 16 ? 1 : 0.4;
  const sk = {
    field: Math.round((2 + rng.int(0, 4)) * grown),
    house: Math.round((1 + rng.int(0, 3)) * grown),
    craft: Math.round((1 + rng.int(0, 3)) * grown),
  };
  // Senegambia's rice growers knew the crop better than those who bought them.
  if (origin === "mande" || origin === "wolof") sk.field += 2;
  if (origin === "creole") sk.house += 2;
  if (origin === "akan" || origin === "kongo") sk.craft += 1;
  if (rng.chance(0.12)) sk.craft += 4;
  return {
    field: Math.min(10, sk.field),
    house: Math.min(10, sk.house),
    craft: Math.min(10, sk.craft),
  };
}

/** The sale at a port this month, if there is one: its lots, the same for everyone. */
export function saleAt(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): SaleLot[] {
  const month = saleMonth(day);
  const out: SaleLot[] = [];
  const rng = new Rng({ rng: hashOf(s.settings.seed, p, month, 0x5a1e) });
  const year = dateOf(day).year;
  const col = colonyOf(map, p);
  const { law } = lawOf(s, p);
  const owner = s.nations[s.provinces[p]?.owner ?? -1];
  const culture = owner?.culture ?? "english";
  const chance = saleChance(s, map, p, day);
  const banned = importBan(s, map, p, day);
  if (chance > 0 && rng.chance(chance)) {
    const lots = 2 + rng.int(0, 3);
    for (let i = 0; i < lots; i++) {
      // An estate sale (people born here, families) or a ship's.
      const estate = banned !== null || rng.chance(year < 1680 ? 0.6 : 0.3);
      const origin = estate
        ? "creole"
        : pickWeighted(
            rng,
            mixFor(col, law, year).filter(([o]) => o !== "creole"),
          );
      const shape = rng.next();
      const people: SalePerson[] = [];
      const person = (
        rel: SalePerson["rel"],
        female: boolean,
        age: number,
        o: BondOrigin,
      ) => {
        const n = nameFor(rng, o, female, culture);
        const health =
          estate || o === "creole" ? 60 + rng.int(0, 30) : 45 + rng.int(0, 25);
        people.push({
          first: n.first,
          ...(n.born ? { born: n.born } : {}),
          female,
          age,
          origin: o,
          faith: faithFor(rng, o),
          sk: skillsFor(rng, o, age),
          health,
          rel,
        });
      };
      if (estate && shape < 0.3) {
        // A family: husband, wife and their children.
        const m = 22 + rng.int(0, 14);
        person("self", false, m, "creole");
        person("partner", true, m - rng.int(0, 5), "creole");
        const kids = 1 + rng.int(0, 2);
        for (let k = 0; k < kids; k++)
          person("child", rng.chance(0.5), 1 + rng.int(0, 10), "creole");
      } else if (shape < 0.5) {
        // A mother and her child.
        person("self", true, 19 + rng.int(0, 12), origin);
        person(
          "child",
          rng.chance(0.5),
          rng.int(0, 7),
          estate ? "creole" : origin,
        );
      } else {
        const female = rng.chance(0.35);
        person("self", female, 15 + rng.int(0, 20), origin);
      }
      const price = people.reduce(
        (m, x) =>
          m +
          priceOf(
            s,
            map,
            p,
            {
              age: x.age,
              female: x.female,
              health: x.health,
              craft: x.sk.craft,
            },
            day,
          ),
        0,
      );
      const ship = rng.pick([
        "a Bristol ship",
        "a Liverpool ship",
        "a London ship",
        "a Newport sloop",
        "a ship from Barbados",
        "the ship",
      ])!;
      const note = estate
        ? rng.pick([
            "from the estate of a planter lately dead, sold to settle his debts",
            "sold by a neighbour leaving the colony",
            "brought up from the islands",
          ])!
        : `lately brought from ${ORIGIN_COAST[origin]} in ${law === "french" ? "a ship of the Company" : law === "spanish" ? "an asiento ship" : law === "dutch" ? "a West India Company ship" : ship}; weak from the passage`;
      out.push({
        key: `${p}:${month}:${i}`,
        kind: "held",
        people,
        price,
        note,
        sold: false,
      });
    }
  }
  if (indenturesAt(s, map, p, day)) {
    const n = rng.chance(0.6) ? 1 + rng.int(0, 2) : 0;
    for (let i = 0; i < n; i++) {
      const french = law === "french";
      const list = french
        ? ENGAGE_NAMES
        : SERVANT_NAMES[
            pickWeighted(rng, [
              [0, 50],
              [1, year >= 1700 ? 25 : 15],
              [2, year >= 1715 ? 15 : 5],
              [
                3,
                year >= 1720 &&
                (col === "pennsylvania" ||
                  col === "newjersey" ||
                  col === "maryland")
                  ? 30
                  : 0,
              ],
            ] as [number, number][])
          ];
      const female = rng.chance(french ? 0.1 : 0.25);
      const age = 15 + rng.int(0, 13);
      const term = french ? 3 : age < 18 ? 7 : 4 + rng.int(0, 1);
      const sp: SalePerson = {
        first: rng.pick(female ? list.f : list.m)!,
        family: rng.pick(list.fam)!,
        female,
        age,
        origin: "europe",
        faith: "christian",
        sk: {
          field: 1 + rng.int(0, 4),
          house: 1 + rng.int(0, 3),
          craft: 1 + rng.int(0, 5),
        },
        health: 60 + rng.int(0, 25),
        rel: "self",
        term,
      };
      out.push({
        key: `${p}:${month}:i${i}`,
        kind: "indenture",
        people: [sp],
        price: Math.round(term * INDENTURE_YEAR),
        note: french
          ? `an engagé, bound for ${term} years for the passage`
          : `${term} years to serve for the passage over${list === SERVANT_NAMES[3] ? " (a redemptioner, from the Palatinate)" : ""}`,
        sold: false,
      });
    }
  }
  for (const lot of out) lot.sold = lotSold(s, lot.key);
  return out;
}

/** Whether anyone has bought a lot already. */
export function lotSold(s: GameState, key: string): boolean {
  return s.lives.some((l) => l.bondage?.bought?.includes(key));
}

// ---------------------------------------------------------------- checks

function holdsNow(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  return yes;
}

/** Where people bought now would live: the household's home, or yours. */
export function homeFor(life: Life): number {
  return life.bondage?.home ?? life.home;
}

/** Whether a lot at a sale here can be bought, and why not. */
export function buyCheck(
  s: GameState,
  map: MapDef,
  life: Life,
  lot: SaleLot | undefined,
): Check {
  const ok = holdsNow(s, life);
  if (!ok.ok) return ok;
  if (!lot) return no("Gone.");
  if (lot.sold) return no("Sold already.");
  if (life.travel) return no("You're on the road.");
  if (lifeIsNative(s, life))
    return no("Your people's ways have nothing to do with this trade.");
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("You're under indenture yourself.");
  const [pStr] = lot.key.split(":");
  if (Number(pStr) !== life.prov) return no("The sale is elsewhere.");
  const home = homeFor(life);
  if (lot.kind === "held" && !holdingLawful(s, map, home))
    return no(
      `The law at your home (${map.provinces[home]?.name ?? "home"}) doesn't allow anyone to be held: ${bondLaw(s, map, home).code}.`,
    );
  if (lot.kind === "indenture" && lawOf(s, home).law === "native")
    return no("Your home is in the people's own country.");
  if (life.purse < lot.price) return no(`Costs ${lot.price} coins.`);
  return yes;
}

/** What freeing someone costs, and how the law lets it be done here. */
export interface FreeCost {
  rule: FreeRule;
  law: BondLaw;
  /** Fees paid now. */
  fee: number;
  /** Their passage out of the colony, if the law sends the freed away. */
  passage: number;
  /** A bond you must be good for (not paid unless they come to want). */
  security: number;
  /** A yearly allowance the law has you pay them. */
  allowance: number;
  /** All you must have in hand. */
  need: number;
}

export function freeCost(s: GameState, map: MapDef, life: Life): FreeCost {
  const home = homeFor(life);
  const law = bondLaw(s, map, home);
  const rule = law.freeing;
  const fee = rule.fee;
  const passage = rule.leave ? PASSAGE : 0;
  const security = rule.security ?? 0;
  const allowance = rule.allowance ?? 0;
  return {
    rule,
    law,
    fee,
    passage,
    security,
    allowance,
    need: fee + passage + security,
  };
}

/** Whether someone can be freed now (or a petition filed for them), and why not. */
export function freeCheck(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character | undefined,
): Check {
  const ok = holdsNow(s, life);
  if (!ok.ok) return ok;
  if (!c || !isBound(c) || c.bond!.seat !== life.seat)
    return no("Not in your household.");
  if (c.bond!.status === "indenture") return yes;
  const fc = freeCost(s, map, life);
  const r = fc.rule;
  if (r.kind === "none") return no(r.text);
  if ((life.bondage?.petitions ?? []).some((x) => x.c === c.id))
    return no("A petition for them is before the council already.");
  const me = meOf(s, life)!;
  if (r.minAge && ageOf(s, me) < r.minAge)
    return no(
      `Under ${r.law}, only a master of ${r.minAge} or more may free anyone.`,
    );
  if (r.maxAge && ageOf(s, c) > r.maxAge)
    return no(`Under ${r.law}, no one over ${r.maxAge} may be freed.`);
  if (life.purse < fc.need)
    return no(
      fc.security
        ? `You must have ${fc.need} coins in hand: ${fc.fee} in fees${fc.passage ? `, ${fc.passage} for their passage` : ""} and ${fc.security} as security.`
        : `Costs ${fc.need} coins.`,
    );
  return yes;
}

/** Whether a will can free someone here, and why not. */
export function willCheck(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character | undefined,
): Check {
  const ok = holdsNow(s, life);
  if (!ok.ok) return ok;
  if (!c || !isHeld(c) || c.bond!.seat !== life.seat)
    return no("Not held in your household.");
  if (c.bond!.will) return yes;
  const r = freeCost(s, map, life).rule;
  if (!r.will) return no(`${r.law}: ${r.text}`);
  return yes;
}

/** Those who'd go with someone sold "with their family": a husband or wife and children under fourteen, held here. */
export function saleFamily(
  s: GameState,
  life: Life,
  c: Character,
): Character[] {
  const out = [c];
  const sp = s.chars[c.spouse];
  if (sp && hereWith(s, c, sp) && isHeld(sp)) out.push(sp);
  for (const k of c.children) {
    const kid = s.chars[k];
    if (kid && hereWith(s, c, kid) && isHeld(kid) && ageOf(s, kid) < 14)
      out.push(kid);
  }
  // A child is sold with its mother (and her husband), not alone.
  const mother = s.chars[c.mother];
  if (ageOf(s, c) < 14 && mother && hereWith(s, c, mother) && isHeld(mother))
    return saleFamily(s, life, mother);
  return out;
}

/** Those left behind if someone is sold alone: family here. */
export function leftBehind(
  s: GameState,
  life: Life,
  sold: Character[],
): Character[] {
  const ids = new Set(sold.map((c) => c.id));
  const out = new Map<number, Character>();
  for (const c of sold)
    for (const f of familyOf(s, c))
      if (!ids.has(f.id) && hereWith(s, c, f)) out.set(f.id, f);
  return [...out.values()];
}

export function sellCheck(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character | undefined,
  withFamily: boolean,
): Check {
  const ok = holdsNow(s, life);
  if (!ok.ok) return ok;
  if (!c || !isHeld(c) || c.bond!.seat !== life.seat)
    return no("Not held in your household.");
  if (life.travel) return no("You're on the road.");
  const law = bondLaw(s, map, life.bondage!.home);
  const lot = withFamily ? saleFamily(s, life, c) : [c];
  const apart = leftBehind(s, life, lot).length > 0;
  if (apart && !law.apart)
    return no(
      `${law.code}: a husband, a wife and their young children may not be sold apart. Such a sale is void.`,
    );
  if (apart && life.bondage!.policy.families)
    return no("Your household never sells a family apart.");
  if (ageOf(s, c) < 14 && !withFamily)
    return no("A child is not sold from its mother.");
  return yes;
}

/** What selling someone (and those going with them) brings. */
export function sellWorth(
  s: GameState,
  map: MapDef,
  life: Life,
  list: Character[],
): number {
  const p = life.bondage!.home;
  return Math.round(
    list.reduce(
      (m, c) =>
        m +
        priceOf(s, map, p, {
          age: ageOf(s, c),
          female: c.female,
          health: c.bond!.health,
          craft: c.bond!.sk.craft,
        }) *
          SALE_SHARE,
      0,
    ),
  );
}

/** What someone would need to buy their own freedom (their price as it's reckoned now). */
export function selfPrice(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
): number {
  return Math.round(
    priceOf(s, map, life.bondage!.home, {
      age: ageOf(s, c),
      female: c.female,
      health: c.bond!.health,
      craft: c.bond!.sk.craft,
    }) * 0.8,
  );
}

// ---------------------------------------------------------------- words

export function moodWord(mood: number): string {
  if (mood < 20) return "in despair";
  if (mood < 38) return "bitter";
  if (mood < 55) return "guarded";
  if (mood < 72) return "steady";
  return "hopeful";
}

export function healthWord(h: number): string {
  if (h < 30) return "very ill";
  if (h < 50) return "poorly";
  if (h < 70) return "worn";
  if (h < 85) return "well";
  return "strong";
}

export const WORK_NAMES: Record<BondWork, string> = {
  fields: "the fields",
  house: "the house",
  craft: "a trade, hired out",
  rest: "no work",
};

/** "Cato (born Kwaku)". */
export function bondName(c: Character | undefined): string {
  if (!c) return "nobody";
  return c.family ? `${c.first} ${c.family}` : c.first;
}

/** Their name, and the one their family gave them if they're called another. */
export function bondFullName(c: Character): string {
  const own = c.bond?.born;
  return own && own !== c.first ? `${bondName(c)} (born ${own})` : bondName(c);
}

/** A surname a freed person takes. */
export function freeSurname(rng: Rng, c: Character, culture: string): string {
  const own = c.bond?.born;
  if (own && rng.chance(0.4)) return AKAN_RECORDED[own] ?? own;
  const list = FREE_NAMES[namingOf(culture)] ?? FREE_NAMES.english;
  return rng.pick(list)!;
}

/** A note in the household's record (the last 60 kept). */
export function note(b: Bondage, n: BondNote): void {
  b.log.push(n);
  if (b.log.length > 60) b.log.splice(0, b.log.length - 60);
}

/** Chances in words, for sentences ("1 in 12"). */
export function oddsWords(p: number): string {
  return chanceWords(p);
}

// ---------------------------------------------------------------- the month's money

/** The month's forecast lines (LEDGER's conventions: the same keys as the flows). */
export function bondForecast(s: GameState, life: Life, w?: World): Part[] {
  const b = life.bondage;
  if (!b || life.c < 0) return [];
  const people = boundOf(s, life);
  const out: Part[] = [];
  if (people.length)
    out.push({
      key: "bond:keep",
      label: `Provisions and quarters: ${people.length} in your household`,
      value: -householdKeep(s, life),
    });
  for (const id of b.allowance ?? []) {
    const c = s.chars[id];
    if (!c?.alive) continue;
    out.push({
      key: `bond:allow:${id}`,
      label: `Allowance to ${bondName(c)}, freed (the act of 1712)`,
      value: -allowanceOf(),
    });
  }
  if (w && people.length) {
    const ex = workExpected(s, w.map, life);
    const f = fieldsOf(s, w.map, life);
    if (f.workers.length) {
      const g = f.workers.reduce((m, c) => m + workOf(s, w.map, life, c), 0);
      const k = 1 - CROP_EXCISE;
      const rent = rentForgone(life, f.workers.length);
      out.push({
        key: "bond:fields",
        label: `The fields: ${f.workers.length} at work (${CROPS[f.crop].name})${rent ? ", less the tenants' rent on their acres" : ""}`,
        value: r2(ex.fields * k - rent),
        chance: [
          r2(g * CROP_LUCK[2].mul * k - rent),
          r2(g * CROP_LUCK[0].mul * k - rent),
        ],
      });
    }
    const hired = hiredOf(s, life);
    if (hired.length) {
      const g = hired.reduce(
        (m, c) => m + workOf(s, w.map, life, c, "craft"),
        0,
      );
      const k = 1 - CROP_EXCISE;
      out.push({
        key: "bond:hire",
        label: `Hired out in town: ${hired.length}`,
        value: r2(ex.hire * k),
        chance: [r2(g * HIRE_LUCK[2].mul * k), r2(g * HIRE_LUCK[0].mul * k)],
      });
    }
  }
  return out;
}

/** The yearly allowance to someone freed under New York's act of 1712, a month. */
export function allowanceOf(): number {
  return r2((20 * POUND) / 12);
}

// ---------------------------------------------------------------- secrets in multiplayer

/** Scenes that are a household's own business (harbouring someone who fled). */
export function labourSecretKey(key: string): boolean {
  return key.startsWith("bond-door");
}

/** Journal lines that are a household's own business. */
export const SECRET_MARK = String.fromCharCode(0x2060);

/**
 * Another player's life as this one may be sent it: whoever they sheltered
 * at their door stays their own business. A copy; nothing is touched.
 */
export function labourForOthers<T extends Partial<Life>>(l: T): T {
  const secret = [
    l.events?.some((e) => labourSecretKey(e.key)),
    l.journal?.some((j) => j.text.startsWith(SECRET_MARK)),
    !!l.outcome && labourSecretKey(l.outcome.key),
    !!l.cooldowns && "ev:bond-door" in l.cooldowns,
    !!l.evSeen && "bond-door" in l.evSeen,
  ].some((x) => x === true);
  if (!secret) return l;
  const out: T = { ...l };
  if (l.events) out.events = l.events.filter((e) => !labourSecretKey(e.key));
  if (l.journal)
    out.journal = l.journal.filter((j) => !j.text.startsWith(SECRET_MARK));
  if (l.outcome && labourSecretKey(l.outcome.key)) out.outcome = null;
  if (l.cooldowns && "ev:bond-door" in l.cooldowns)
    out.cooldowns = Object.fromEntries(
      Object.entries(l.cooldowns).filter(([k]) => k !== "ev:bond-door"),
    );
  if (l.evSeen && "bond-door" in l.evSeen)
    out.evSeen = Object.fromEntries(
      Object.entries(l.evSeen).filter(([k]) => k !== "bond-door"),
    );
  return out;
}

/** Whether a delta has anything in it that must be sent differently to each seat. */
export function labourDeltaSecret(d: GameDelta): boolean {
  for (const l of [
    ...Object.values(d.lives ?? {}),
    ...Object.values(d.lifePatch ?? {}),
  ])
    if (labourForOthers(l as Partial<Life>) !== l) return true;
  return false;
}

/** A delta as one seat may be sent it: other households' secrets taken out. */
export function labourDeltaForSeat(
  d: GameDelta,
  seat: string | null,
): GameDelta {
  const strip = (rec: Record<string, unknown> | undefined) =>
    rec &&
    Object.fromEntries(
      Object.entries(rec).map(([k, l]) => [
        k,
        k === seat ? l : labourForOthers(l as Partial<Life>),
      ]),
    );
  const out: GameDelta = { ...d };
  if (d.lives) out.lives = strip(d.lives) as GameDelta["lives"];
  if (d.lifePatch) out.lifePatch = strip(d.lifePatch) as GameDelta["lifePatch"];
  return out;
}

/** The whole game as one seat may see it (on joining): other households' secrets taken out. */
export function labourStateForSeat(
  s: GameState,
  seat: string | null,
): GameState {
  return {
    ...s,
    lives: s.lives.map((l) => (l.seat === seat ? l : labourForOthers(l))),
  };
}

// ---------------------------------------------------------------- small things

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** The deed's fee, for the page. */
export const DEED = DEED_FEE;

/** Whether a game's touched life has any bondage worth a look this month. */
export function bondActive(life: Life): boolean {
  return (
    !!life.bondage &&
    (life.bondage.people.length > 0 ||
      (life.bondage.petitions?.length ?? 0) > 0 ||
      (life.bondage.allowance?.length ?? 0) > 0 ||
      (life.bondage.bonds?.length ?? 0) > 0)
  );
}

/** The name of someone, for the journal: "Cato" or "Mary Kelly". */
export const who = (c: Character | undefined) => (c ? bondName(c) : "someone");
