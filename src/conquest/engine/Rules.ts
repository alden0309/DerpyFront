// Derpy Conquest: the rulebook's numbers. Everything the game balances on
// lives here so it can be tuned in one place.

import {
  BuildingKind,
  Difficulty,
  Good,
  MapGood,
  PopClass,
  RawGood,
  RegType,
  Religion,
  Seat,
  Stat,
  Terrain,
  TraitId,
} from "./Types";

export const START_YEAR = 1607;
export const DAYS_PER_YEAR = 365;
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Game days per real second at each speed: 1x is a day every three seconds,
 * then 2x, 4x and 8x. Quiet stretches can be skipped (Pace.ts).
 */
export const SPEED_DAYS_PER_SECOND = [0, 1 / 3, 2 / 3, 4 / 3, 8 / 3];
export const SPEED_LABELS = ["", "1×", "2×", "4×", "8×"];
export const MAX_SPEED = 4;
export const DEFAULT_SPEED = 1;
/** Every game ends on 1 January of this year. */
export const END_YEAR = 1776;

/**
 * Game days before an unanswered letter is decided by the council. Players'
 * letters are timed in real seconds by the server (LETTER_SECONDS); this is a
 * backstop for games run without one.
 */
export const EVENT_DAYS = 1095;
/** Seconds of unpaused play a player has to answer a letter (or a life's event). */
export const LETTER_SECONDS = 60;

// ---------------------------------------------------------------- goods

/** What each good fetches on the home markets in Europe, before gluts. */
export const EUROPE_PRICE: Record<Good, number> = {
  grain: 1.2,
  fish: 1.6,
  furs: 4.5,
  tobacco: 5,
  sugar: 6,
  timber: 1,
  silver: 10,
  tools: 4,
  guns: 8,
  cloth: 3.5,
};

/** How many units reaching Europe in a year halve the price. */
export const EUROPE_DEPTH: Record<Good, number> = {
  grain: 3000,
  fish: 2500,
  furs: 900,
  tobacco: 900,
  sugar: 1200,
  timber: 3000,
  silver: 1500,
  tools: 4000,
  guns: 4000,
  cloth: 4000,
};

/** Freight and insurance per unit across the Atlantic. */
export const SHIPPING_PER_UNIT = 0.7;

/** Units a month per 1,000 laborers working the land. */
export const RESOURCE_YIELD: Record<RawGood, number> = {
  grain: 9,
  fish: 9,
  furs: 5,
  tobacco: 6,
  sugar: 5,
  timber: 10,
  silver: 2,
};

/** The building that multiplies a resource, and by how much a level. */
export const RESOURCE_BUILDING: Record<RawGood, BuildingKind> = {
  grain: "farm",
  fish: "port",
  furs: "tradingpost",
  tobacco: "plantation",
  sugar: "plantation",
  timber: "lumbercamp",
  silver: "mine",
};
export const RESOURCE_BUILDING_BONUS = 0.4;

/** Food (grain) a month per 1,000 laborers, by terrain, before season. */
export const FOOD_YIELD: Record<Terrain, number> = {
  plains: 15,
  forest: 12,
  hills: 11.5,
  mountains: 8,
  jungle: 11.5,
  desert: 6,
  marsh: 10,
  tundra: 4,
};
/** Fish a coastal province's laborers land on top, per 1,000. */
export const COASTAL_FISH = 2.5;
/** Each farm level adds this share to food. */
export const FARM_FOOD_BONUS = 0.25;

/** Workshops: what 1,000 artisans make a month and what it takes. */
export const WORKSHOPS: Partial<
  Record<
    BuildingKind,
    { out: Good; per: number; inputs: Partial<Record<Good, number>> }
  >
> = {
  smithy: { out: "tools", per: 6, inputs: { timber: 8 } },
  gunsmith: { out: "guns", per: 3, inputs: { tools: 2, timber: 2 } },
  weaver: { out: "cloth", per: 6, inputs: { grain: 6 } },
};

/** Units each class wants a month per 1,000 people: [food, everyday, luxury]. */
export const NEEDS: Record<
  PopClass,
  [
    Partial<Record<Good, number>>,
    Partial<Record<Good, number>>,
    Partial<Record<Good, number>>,
  ]
> = {
  laborers: [{ grain: 10 }, { cloth: 0.6, tools: 0.3 }, { tobacco: 0.4 }],
  artisans: [
    { grain: 10 },
    { cloth: 1.5, tools: 1 },
    { tobacco: 0.6, sugar: 0.5 },
  ],
  merchants: [
    { grain: 10 },
    { cloth: 2.5, tools: 0.5 },
    { sugar: 1.5, tobacco: 1.2, furs: 0.6 },
  ],
  gentry: [
    { grain: 12 },
    { cloth: 4, tools: 1 },
    { sugar: 2.5, tobacco: 2, furs: 1.5, silver: 0.4 },
  ],
  clergy: [{ grain: 10 }, { cloth: 1.5 }, { sugar: 0.5 }],
  tribe: [{ grain: 10 }, { tools: 0.6, cloth: 0.6 }, { guns: 0.2 }],
};

/** Fish stands in for grain at the dinner table. */
export const FOOD_GOODS: readonly Good[] = ["grain", "fish"];

/** How a month of production is shared out, before taxes. */
export const INCOME_SHARE: Record<
  "laborers" | "gentry" | "merchants" | "clergy",
  number
> = {
  laborers: 0.6,
  gentry: 0.25,
  merchants: 0.1,
  clergy: 0.05,
};

/** Taxes taken from incomes at each level, and the unrest they cause. */
export const TAX_RATE = [0.08, 0.15, 0.25] as const;
export const TAX_UNREST = [0, 4, 14] as const;
export const TAX_NAMES = ["Low", "Normal", "High"] as const;

/** Customs on goods leaving or entering a colony. */
export const CUSTOMS = 0.1;

/** Goods kept back in the warehouses: this many months of demand. */
export const RESERVE_MONTHS = 2;
/** Grain and fish spoil in storage, this share a month. */
export const SPOILAGE = 0.12;

/** Prices move this share of the way to where supply and demand put them. */
export const PRICE_SPEED = 0.35;
export const PRICE_MIN = 0.35;
export const PRICE_MAX = 3;

/** Old map goods: cattle ranches feed people; cotton grows like the rest. */
export function rawGood(g: MapGood, lat: number): RawGood {
  if (g === "cattle") return "grain";
  if (g === "cotton") return Math.abs(lat) < 24 ? "sugar" : "tobacco";
  return g;
}

// ---------------------------------------------------------------- land

export interface TerrainRules {
  /** Settlers 60,000 km² of it can hold before growth stops. */
  capacity: number;
  /** Movement speed, 1 = open plains. */
  speed: number;
  /** Bonus for whoever defends here. */
  defense: number;
  /** Days added to founding a colony here. */
  colonizeDays: number;
  /** Men a month of fever and hardship, per 1,000, for armies here. */
  attrition: number;
  /** Supply an army can live off here, in thousands of men. */
  supply: number;
}

export const TERRAIN: Record<Terrain, TerrainRules> = {
  plains: {
    capacity: 9000,
    speed: 1,
    defense: 0,
    colonizeDays: 0,
    attrition: 0,
    supply: 3,
  },
  forest: {
    capacity: 6000,
    speed: 0.8,
    defense: 0.1,
    colonizeDays: 20,
    attrition: 4,
    supply: 2,
  },
  hills: {
    capacity: 5000,
    speed: 0.75,
    defense: 0.2,
    colonizeDays: 25,
    attrition: 4,
    supply: 2,
  },
  mountains: {
    capacity: 2500,
    speed: 0.55,
    defense: 0.35,
    colonizeDays: 45,
    attrition: 10,
    supply: 1,
  },
  jungle: {
    capacity: 3500,
    speed: 0.6,
    defense: 0.15,
    colonizeDays: 40,
    attrition: 18,
    supply: 1.5,
  },
  desert: {
    capacity: 1200,
    speed: 0.8,
    defense: 0.05,
    colonizeDays: 35,
    attrition: 12,
    supply: 0.6,
  },
  marsh: {
    capacity: 2500,
    speed: 0.55,
    defense: 0.15,
    colonizeDays: 40,
    attrition: 15,
    supply: 1,
  },
  tundra: {
    capacity: 600,
    speed: 0.6,
    defense: 0.05,
    colonizeDays: 50,
    attrition: 12,
    supply: 0.4,
  },
};

export function provinceCapacity(terrain: Terrain, areaKm2: number): number {
  const areaFactor = Math.max(0.5, Math.min(2.5, areaKm2 / 60_000));
  return Math.round(TERRAIN[terrain].capacity * areaFactor);
}

/** Natives living in a nation's own provinces and in open country. */
export const NATIVE_DENSITY_OWNED = 0.7;
export const NATIVE_DENSITY_WILD = 0.22;
export const NATIVE_STRONG_FACTOR = 2.5;

/** Each farm level lets a province hold this much more. */
export const FARM_CAPACITY_BONUS = 0.25;

/** Yearly births less deaths for settlers with enough to eat. */
export const GROWTH_PER_YEAR = 0.025;
/** Yearly deaths from fevers in hot, wet places. */
export const TROPICAL_DEATHS = 0.02;
/** Hungry people: share who die a month at no food at all. */
export const STARVATION = 0.04;

// ---------------------------------------------------------------- colonies

export const COLONY_DAYS = 90;
export const COLONY_GOLD = 30;
/** Settlers who leave a nearby colony to found a new one. */
export const COLONY_SETTLERS = 150;
/** A province needs at least this many settlers to send some off. */
export const COLONY_MIN_SOURCE = 300;
/** Colonists can sail this far from one of your ports to found a colony. */
export const COLONIZE_SEA_KM = 1800;

/** Days a newly won or bought province takes to become fully yours. */
export const INTEGRATE_DAYS = 365;

// ---------------------------------------------------------------- buildings

export interface BuildingRules {
  gold: number;
  days: number;
  max: number;
  /** Goods used up in building it (per level). */
  goods: Partial<Record<Good, number>>;
  /** Gold a month to keep each level up. */
  upkeep: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingRules> = {
  farm: { gold: 25, days: 90, max: 3, goods: { tools: 4 }, upkeep: 0.1 },
  plantation: { gold: 45, days: 120, max: 3, goods: { tools: 6 }, upkeep: 0.2 },
  tradingpost: {
    gold: 30,
    days: 60,
    max: 2,
    goods: { cloth: 4, tools: 2 },
    upkeep: 0.15,
  },
  mine: { gold: 60, days: 180, max: 2, goods: { tools: 10 }, upkeep: 0.3 },
  lumbercamp: { gold: 20, days: 60, max: 2, goods: { tools: 4 }, upkeep: 0.1 },
  port: { gold: 40, days: 120, max: 3, goods: { timber: 20 }, upkeep: 0.2 },
  fort: {
    gold: 50,
    days: 150,
    max: 3,
    goods: { timber: 15, tools: 4 },
    upkeep: 0.4,
  },
  smithy: { gold: 35, days: 90, max: 2, goods: { timber: 10 }, upkeep: 0.15 },
  gunsmith: { gold: 50, days: 120, max: 2, goods: { tools: 6 }, upkeep: 0.25 },
  weaver: { gold: 30, days: 90, max: 2, goods: { timber: 8 }, upkeep: 0.15 },
  church: { gold: 30, days: 120, max: 2, goods: { timber: 10 }, upkeep: 0.15 },
  courthouse: {
    gold: 40,
    days: 120,
    max: 1,
    goods: { timber: 10 },
    upkeep: 0.3,
  },
};

/** A courthouse adds this much administration. */
export const COURTHOUSE_ADMIN = 2;

// ---------------------------------------------------------------- armies

export interface RegimentRules {
  /** Gold to raise one. */
  gold: number;
  /** Goods to equip one. */
  goods: Partial<Record<Good, number>>;
  /** Men taken from the province's laborers (or warriors from a tribe). */
  men: number;
  days: number;
  /** Gold a month to keep. */
  upkeep: number;
  /** Fighting value of each man. */
  fight: number;
  /** Shock: how hard it hits a breaking line. */
  shock: number;
  /** Days to cross plains. */
  speed: number;
  natives: boolean;
}

export const REGIMENTS: Record<RegType, RegimentRules> = {
  militia: {
    gold: 8,
    goods: {},
    men: 100,
    days: 30,
    upkeep: 0.6,
    fight: 0.8,
    shock: 0.5,
    speed: 1,
    natives: false,
  },
  regulars: {
    gold: 20,
    goods: { guns: 10 },
    men: 100,
    days: 60,
    upkeep: 1.6,
    fight: 1.25,
    shock: 0.8,
    speed: 1,
    natives: false,
  },
  dragoons: {
    gold: 35,
    goods: { guns: 8 },
    men: 100,
    days: 75,
    upkeep: 2.4,
    fight: 1.15,
    shock: 1.3,
    speed: 1.6,
    natives: false,
  },
  artillery: {
    gold: 45,
    goods: { tools: 10, guns: 12 },
    men: 50,
    days: 90,
    upkeep: 3,
    fight: 1.8,
    shock: 0.4,
    speed: 0.7,
    natives: false,
  },
  warriors: {
    gold: 0,
    goods: {},
    men: 100,
    days: 20,
    upkeep: 0.3,
    fight: 0.8,
    shock: 0.8,
    speed: 1.2,
    natives: true,
  },
  riders: {
    gold: 0,
    goods: {},
    men: 100,
    days: 25,
    upkeep: 0.5,
    fight: 0.9,
    shock: 1.2,
    speed: 1.8,
    natives: true,
  },
};

export const REG_NAMES: Record<RegType, string> = {
  militia: "Militia",
  regulars: "Regulars",
  dragoons: "Dragoons",
  artillery: "Artillery",
  warriors: "Warriors",
  riders: "Riders",
};

/** Food an army eats a month per 1,000 men. */
export const ARMY_FOOD = 12;
/** Kilometres an army marches a day across open plains. */
export const MARCH_KM_PER_DAY = 22;
/** Kilometres a day by sea. */
export const SAIL_KM_PER_DAY = 110;
/** Most men a tribe can send to war: this share of its people. */
/** Timber a month per 1,000 laborers from clearing land, by terrain. */
export const WOODLOT_TIMBER: Record<Terrain, number> = {
  forest: 1.4,
  jungle: 0.9,
  hills: 0.9,
  mountains: 0.6,
  marsh: 0.5,
  plains: 0.35,
  tundra: 0.35,
  desert: 0,
};

export const WARRIOR_SHARE = 0.12;
/** Days of hard fighting before an attacker gives up. */
export const BATTLE_MAX_DAYS = 5;
/** Morale lost each day of battle per share of men lost (×). */
export const MORALE_SHOCK = 2.2;
/** Men lost a day per point of the enemy's strength. */
export const DAILY_LOSS = 0.06;
/** A side breaks when its morale falls below this. */
export const BREAK_MORALE = 0.25;

/** Siege progress (out of 100) each day, before its causes. */
export const SIEGE_BASE = 2.4;
/** Days to take control of a province with no fort. */
export const CONTROL_DAYS = 20;

// ---------------------------------------------------------------- people

export const CLASS_NAMES: Record<PopClass, string> = {
  laborers: "Laborers",
  artisans: "Artisans",
  merchants: "Merchants",
  gentry: "Gentry",
  clergy: "Clergy",
  tribe: "Tribe",
};

/** The class mix of a new colony (and of immigrants). */
export const SETTLER_MIX: Partial<Record<PopClass, number>> = {
  laborers: 0.74,
  artisans: 0.1,
  merchants: 0.06,
  gentry: 0.06,
  clergy: 0.04,
};

export const RELIGION_NAMES: Record<Religion, string> = {
  anglican: "Anglican",
  puritan: "Puritan",
  catholic: "Catholic",
  reformed: "Dutch Reformed",
  lutheran: "Lutheran",
  native: "Native faith",
};

/** How unhappy each unmet need makes people: [food, everyday, luxury]. */
export const UNMET_UNREST: [number, number, number] = [40, 8, 4];

// ---------------------------------------------------------------- characters

export const STAT_NAMES: Record<Stat, string> = {
  dip: "Diplomacy",
  mar: "Martial",
  ste: "Stewardship",
  int: "Intrigue",
  lea: "Learning",
};

/** Points a player has to spend on a new governor. */
export const GOVERNOR_POINTS = 12;
export const STAT_START = 5;
export const STAT_MIN = 1;
export const STAT_MAX = 18;
export const MAX_TRAITS = 4;
/**
 * Traits come from their own small purse, apart from stat points: virtues
 * cost from it, flaws put back into it.
 */
export const TRAIT_POINTS = 2;

/** Points it costs to raise a stat from `level` to `level + 1`. */
export function statStepCost(level: number): number {
  if (level < STAT_START) return 1;
  if (level < 10) return 1;
  if (level < 14) return 2;
  return 3;
}

export const AGE_CHOICES = {
  young: { years: 24, points: 0, label: "Young (24)" },
  prime: { years: 34, points: 1, label: "In their prime (34)" },
  seasoned: { years: 46, points: 3, label: "Seasoned (46)" },
} as const;

export interface TraitRules {
  name: string;
  /** Points it costs at creation (negative: it gives points back). */
  cost: number;
  opposite: TraitId | null;
  /** Plain words: what it does. */
  text: string;
  stats: Partial<Record<Stat, number>>;
  /** What it does when they lead an expedition or outpost party. */
  trail?: string;
  /** Only picked up in a life (a scar, a habit), never born with. */
  acquired?: boolean;
}

export const TRAITS: Record<TraitId, TraitRules> = {
  ambitious: {
    name: "Ambitious",
    cost: 2,
    opposite: "content",
    text: "+1 Martial and Stewardship. Courtiers who want your job resent you, and the crown watches you (−5 crown favor).",
    stats: { mar: 1, ste: 1 },
    trail:
      "Pushes the party hard: journeys 15% quicker, but more men lost to hardship.",
  },
  content: {
    name: "Content",
    cost: -1,
    opposite: "ambitious",
    text: "−1 Martial. The crown trusts you (+5 crown favor) and rivals scheme less.",
    stats: { mar: -1 },
    trail: "Turns back rather than gamble: safer when things go wrong.",
  },
  honest: {
    name: "Honest",
    cost: 1,
    opposite: "deceitful",
    text: "−2 Intrigue. Natives and the crown believe you (+10 native opinion, +5 crown favor).",
    stats: { int: -2 },
    trail: "Natives met on the trail trust the party (+15% to win them over).",
  },
  deceitful: {
    name: "Deceitful",
    cost: -1,
    opposite: "honest",
    text: "+3 Intrigue. Natives don't trust your word (−10 native opinion).",
    stats: { int: 3 },
    trail:
      "Talks the party out of trouble with natives (+10%), but they remember being lied to.",
  },
  brave: {
    name: "Brave",
    cost: 1,
    opposite: "craven",
    text: "+2 Martial. Leading troops: +10% morale, but you may fall in battle.",
    stats: { mar: 2 },
    trail: "Forces a way through rapids, passes and ambushes (+15%).",
  },
  craven: {
    name: "Craven",
    cost: -2,
    opposite: "brave",
    text: "−2 Martial. Leading troops: −10% morale. You never fall in battle.",
    stats: { mar: -2 },
    trail: "Avoids every risk: slower, but the party rarely meets disaster.",
  },
  greedy: {
    name: "Greedy",
    cost: -1,
    opposite: "generous",
    text: "+10% taxes. People resent it (+5 unrest everywhere).",
    stats: { ste: 1 },
    trail: "Pockets a share of what's found.",
  },
  generous: {
    name: "Generous",
    cost: 1,
    opposite: "greedy",
    text: "−5% taxes. Your council and natives like you (+10 opinion).",
    stats: { dip: 1 },
    trail: "Gifts to natives on the trail go further (+10%).",
  },
  diligent: {
    name: "Diligent",
    cost: 2,
    opposite: "lazy",
    text: "+2 Stewardship. +15% administration.",
    stats: { ste: 2 },
    trail: "Careful planning: journeys 20% quicker.",
  },
  lazy: {
    name: "Lazy",
    cost: -2,
    opposite: "diligent",
    text: "−1 Stewardship. −15% administration.",
    stats: { ste: -1 },
    trail: "Dawdles: journeys 25% slower.",
  },
  zealous: {
    name: "Zealous",
    cost: 0,
    opposite: "tolerant",
    text: "+2 Learning. Missions convert faster; other faiths grow restless (+10 unrest) and natives wary (−10 opinion).",
    stats: { lea: 2 },
    trail: "Preaches to every village: natives on the trail grow wary (−10%).",
  },
  tolerant: {
    name: "Tolerant",
    cost: 1,
    opposite: "zealous",
    text: "No unrest from other faiths. Natives warm to you (+10 opinion). The church at home frowns (−3 crown favor).",
    stats: {},
    trail: "Natives on the trail warm to the party (+10%).",
  },
  just: {
    name: "Just",
    cost: 2,
    opposite: "cruel",
    text: "+1 Stewardship. Less corruption (−50% tax lost to overreach), −5 unrest everywhere.",
    stats: { ste: 1 },
    trail: "Keeps the party together: fewer desertions.",
  },
  cruel: {
    name: "Cruel",
    cost: -1,
    opposite: "just",
    text: "+2 Intrigue. Revolts are put down hard (−10 unrest in occupied land); everyone likes you less (−10 opinion).",
    stats: { int: 2 },
    trail:
      "Forces guides at gunpoint: finds the way (+10%) but angers the natives.",
  },
  robust: {
    name: "Robust",
    cost: 2,
    opposite: "sickly",
    text: "Half the risk of dying of illness or age.",
    stats: {},
    trail: "Shrugs off fevers and hunger (half the danger to the leader).",
  },
  sickly: {
    name: "Sickly",
    cost: -3,
    opposite: "robust",
    text: "Twice the risk of dying of illness or age. −1 to every stat.",
    stats: { dip: -1, mar: -1, ste: -1, int: -1, lea: -1 },
    trail: "Fevers and hunger are twice as dangerous to the leader.",
  },
  educated: {
    name: "Educated",
    cost: 2,
    opposite: null,
    text: "+2 Learning, +1 Stewardship. Fewer settlers die of fever (−25%).",
    stats: { lea: 2, ste: 1 },
    trail:
      "Maps as they go: surveys a wider stretch of land, and treats fevers (+10%).",
  },
  charming: {
    name: "Charming",
    cost: 2,
    opposite: null,
    text: "+2 Diplomacy. Everyone likes you a little more (+5 opinion).",
    stats: { dip: 2 },
    trail: "Wins over natives on the trail (+15%).",
  },
  strong: {
    name: "Strong",
    cost: 2,
    opposite: null,
    text: "+1 Martial. Broad in the shoulder and hard to knock down.",
    stats: { mar: 1 },
  },
  shrewd: {
    name: "Shrewd",
    cost: 2,
    opposite: null,
    text: "+1 Stewardship. Knows the price of everything, and usually the value.",
    stats: { ste: 1 },
  },
  drunkard: {
    name: "Drunkard",
    cost: -2,
    opposite: null,
    text: "−1 Stewardship and Learning. Good company until the bottle runs dry.",
    stats: { ste: -1, lea: -1 },
  },
  scarred: {
    name: "Scarred",
    cost: 0,
    opposite: null,
    text: "+1 Martial. Has been in a fight and has the face to prove it.",
    stats: { mar: 1 },
    acquired: true,
  },
  famous: {
    name: "Famous",
    cost: 0,
    opposite: null,
    text: "+1 Diplomacy. Known in every tavern from Boston to Charles Town.",
    stats: { dip: 1 },
    acquired: true,
  },
  wounded: {
    name: "Wounded",
    cost: 0,
    opposite: null,
    text: "−1 Martial. An old wound that never quite healed.",
    stats: { mar: -1 },
    acquired: true,
  },
  gouty: {
    name: "Gouty",
    cost: 0,
    opposite: null,
    text: "−1 Diplomacy. Too much port and venison, and a foot to show for it.",
    stats: { dip: -1 },
    acquired: true,
  },
};

export const SEAT_NAMES: Record<Seat, string> = {
  treasurer: "Treasurer",
  marshal: "Marshal",
  envoy: "Envoy",
  spymaster: "Spymaster",
  chaplain: "Chaplain",
};

export const SEAT_STAT: Record<Seat, Stat> = {
  treasurer: "ste",
  marshal: "mar",
  envoy: "dip",
  spymaster: "int",
  chaplain: "lea",
};

/** Native leaders' seats go by these names. */
export const NATIVE_SEAT_NAMES: Record<Seat, string> = {
  treasurer: "Keeper of stores",
  marshal: "War chief",
  envoy: "Speaker",
  spymaster: "Scout",
  chaplain: "Healer",
};

/** Yearly chance of dying, by age. */
export function deathRiskByAge(age: number): number {
  if (age < 16) return 0.015;
  if (age < 40) return 0.012;
  if (age < 50) return 0.022;
  if (age < 60) return 0.045;
  if (age < 70) return 0.09;
  return 0.18;
}

/** Yearly chance a married couple has a child, while she's 16 to 42. */
export const BIRTH_CHANCE_PER_YEAR = 0.3;
export const ADULT_AGE = 16;

// ---------------------------------------------------------------- crown

export interface PowerRules {
  /** Settlers at the start, by starting province (in order). */
  startPop: number[];
  /** Colonists from home a month, before crown favor. */
  emigration: number;
  /** The crown's expected share of income. */
  expectedRemit: number;
  /** Gold a month the charter pays in the early years. */
  charterGold: number;
  /** Year the charter money stops. */
  charterUntil: number;
  startGold: number;
  /** Administration the charter grants. */
  admin: number;
  religion: Religion;
  culture: string;
  /** Plain words for the nation picker. */
  pros: string[];
  cons: string[];
  history: string;
  /** Battle discipline for regulars. */
  discipline: number;
  /** Native opinion bonus. */
  nativeOpinion: number;
  /** Merchant shipping bonus (share of freight saved). */
  shipping: number;
}

export const POWER_RULES: Record<string, PowerRules> = {
  england: {
    startPop: [120, 60],
    emigration: 35,
    expectedRemit: 0.1,
    charterGold: 12,
    charterUntil: 1624,
    startGold: 150,
    admin: 8,
    religion: "anglican",
    culture: "english",
    pros: [
      "More settlers sail from home than for anyone else",
      "Tobacco country around Jamestown sells well in London",
    ],
    cons: [
      "Starts with only a hundred-odd settlers and little food",
      "The Powhatan Confederacy surrounds Jamestown",
    ],
    history:
      "The Virginia Company has just landed 104 men at Jamestown. They need a cash crop before the company's patience, and its money, run out.",
    discipline: 1,
    nativeOpinion: -5,
    shipping: 0,
  },
  france: {
    startPop: [60, 80],
    emigration: 10,
    expectedRemit: 0.1,
    charterGold: 10,
    charterUntil: 1627,
    startGold: 160,
    admin: 8,
    religion: "catholic",
    culture: "french",
    pros: [
      "Natives trust the French: +20 opinion with every native nation",
      "The St. Lawrence fur trade is the richest in the north",
    ],
    cons: [
      "Very few settlers come from France",
      "The St. Lawrence freezes: no ships from Quebec in winter",
    ],
    history:
      "Champlain is about to found Quebec. New France will live on furs, missions and friendship with the Wendat and Algonquin, and on very few Frenchmen.",
    discipline: 1,
    nativeOpinion: 20,
    shipping: 0,
  },
  spain: {
    startPop: [600, 4200, 3200],
    emigration: 25,
    expectedRemit: 0.2,
    charterGold: 0,
    charterUntil: 0,
    startGold: 300,
    admin: 10,
    religion: "catholic",
    culture: "spanish",
    pros: [
      "Havana and Santo Domingo are old, rich cities",
      "Veteran tercios: regulars fight 10% harder",
    ],
    cons: [
      "The crown takes a fifth of everything (expects 20% of income)",
      "Every other crown wants a piece of Spain's empire",
    ],
    history:
      "A century into its empire, Spain guards the Caribbean and Florida while silver fleets sail for Seville. Its rivals are circling.",
    discipline: 1.1,
    nativeOpinion: -10,
    shipping: 0,
  },
  netherlands: {
    startPop: [260, 200],
    emigration: 15,
    expectedRemit: 0.15,
    charterGold: 10,
    charterUntil: 1630,
    startGold: 220,
    admin: 8,
    religion: "reformed",
    culture: "dutch",
    pros: [
      "The best merchant fleet in the world: 35% cheaper shipping",
      "Curaçao is a natural trading post",
    ],
    cons: [
      "At war with Spain in Europe (a truce comes in 1609)",
      "Few Dutch want to leave home",
    ],
    history:
      "The Dutch Republic is fighting Spain for its freedom and trading everywhere at once. New Netherland is a fur-trading company post with a harbor no one else has noticed.",
    discipline: 1,
    nativeOpinion: 5,
    shipping: 0.35,
  },
  sweden: {
    startPop: [130, 70],
    emigration: 7,
    expectedRemit: 0.08,
    charterGold: 8,
    charterUntil: 1640,
    startGold: 180,
    admin: 7,
    religion: "lutheran",
    culture: "swedish",
    pros: [
      "Sweden's crown asks the least of its colony",
      "Swedish and Finnish settlers hold winters well: half the winter attrition",
    ],
    cons: [
      "The smallest colony, with the fewest settlers",
      "Dutch and English neighbors on both sides",
    ],
    history:
      "Sweden is becoming a great power in the Baltic. New Sweden on the Delaware is its foothold in the fur and tobacco trade, squeezed between bigger neighbors.",
    discipline: 1.05,
    nativeOpinion: 10,
    shipping: 0,
  },
};

/** Days a crossing to Europe takes from each region, before the season. */
export function crossingDays(lat: number, lon: number): number {
  // Brazil and the Caribbean ride the trade winds; the north fights them.
  if (lat < 0) return 55;
  if (lat < 25) return 50;
  if (lon < -85) return 70;
  return 58;
}

/** Ships don't sail from ports the ice closes (St. Lawrence, Hudson Bay). */
export function iceBound(lat: number, lon: number, month: number): boolean {
  if (lat < 46 || lon > -55) return false;
  return month === 11 || month <= 3;
}

/** Winter storms make crossings slower. */
export function winterStormDays(month: number): number {
  return month >= 10 || month <= 1 ? 18 : 0;
}

/** Days between convoys from a colony. */
export const CONVOY_EVERY_DAYS = 60;

/** Favor and autonomy move this share of the way to their targets a month. */
export const FAVOR_SPEED = 0.1;
export const AUTONOMY_SPEED = 0.06;
export const INDEPENDENCE_AUTONOMY = 60;
/** The crown sends an army to crush a rebellion this often. */
export const EXPEDITION_EVERY_DAYS = 300;
/** A rebellion that lasts this long wins. */
export const REBELLION_WIN_DAYS = 365 * 8;
export const TITLE_NAMES = ["", "Knight", "Baronet", "Baron", "Earl"] as const;

// ---------------------------------------------------------------- europe

/** Tension added a month between two crowns, by their keys. */
export const RIVALRY: Record<string, number> = {
  "england-spain": 0.45,
  "france-spain": 0.4,
  "england-france": 0.3,
  "netherlands-spain": 0.6,
  "england-netherlands": 0.25,
  "netherlands-sweden": 0.1,
  "england-sweden": 0.05,
  "france-sweden": 0.05,
  "spain-sweden": 0.1,
  "france-netherlands": 0.15,
};

/** A crown war in Europe drags on at least this long. */
export const EUROPE_WAR_MIN_DAYS = 365 * 2;

// ---------------------------------------------------------------- difficulty

export interface DifficultyRules {
  /** Gold the computer powers start with, as a share of normal. */
  aiGold: number;
  /** How readily natives go to war over land. */
  nativeAnger: number;
  /** The computer's eagerness to fight. */
  aggression: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { aiGold: 0.8, nativeAnger: 0.7, aggression: 0.6 },
  normal: { aiGold: 1, nativeAnger: 1, aggression: 1 },
  hard: { aiGold: 1.3, nativeAnger: 1.2, aggression: 1.4 },
};

// ---------------------------------------------------------------- exploring

/** Share of provinces with a rich seam, run or soil, waiting to be found. */
export const RICH_SHARE = 0.14;
/** A rich province makes this much more of its good. */
export const RICH_BONUS = 0.5;
/** At the start a colony knows the coasts this far from its ports. */
export const SEEN_BY_SEA_KM = 700;

export const EXPEDITION = {
  gold: 40,
  /** Woodsmen, porters and guides. */
  men: 20,
  kmPerDay: 15,
  minDays: 20,
};

export const OUTPOST = {
  gold: 80,
  goods: { timber: 15, tools: 5 } as Partial<Record<Good, number>>,
  men: 30,
  kmPerDay: 12,
  minDays: 30,
  /** Gold a month to keep it manned. */
  upkeep: 1,
  /** Defenders behind its palisade fight this much harder. */
  defense: 0.15,
  /** Extra thousands of men the land around it can feed. */
  supply: 1,
};
