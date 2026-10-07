// Derpy Conquest: the rulebook's numbers. Everything the game balances on
// lives here so it can be tuned in one place.

import {
  BuildingKind,
  Difficulty,
  Good,
  Nation,
  RegType,
  Terrain,
} from "./Types";

export const START_YEAR = 1607;
export const DAYS_PER_YEAR = 365;
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Game days per real second at each speed (1 to 5). */
export const SPEED_DAYS_PER_SECOND = [0, 1, 2, 4, 8, 16];
export const DEFAULT_SPEED = 3;

// ---------------------------------------------------------------- goods

export const GOOD_BASE_PRICE: Record<Good, number> = {
  silver: 6,
  sugar: 4.5,
  tobacco: 4,
  furs: 3.5,
  cotton: 3.5,
  fish: 2.2,
  cattle: 2,
  timber: 1.8,
  grain: 1.6,
};

/** Units a province makes each month per 1,000 settlers. */
export const GOOD_YIELD: Record<Good, number> = {
  silver: 0.6,
  sugar: 0.75,
  tobacco: 0.8,
  furs: 0.9,
  cotton: 0.8,
  fish: 1.25,
  cattle: 1.3,
  timber: 1.4,
  grain: 1.6,
};

/**
 * How much of a good the market takes before its price falls below the
 * base price. Prices run from 1.4x base (nobody selling) towards 0.25x (a
 * flooded market).
 */
export const GOOD_MARKET_DEPTH: Record<Good, number> = {
  silver: 12,
  sugar: 20,
  tobacco: 16,
  furs: 20,
  cotton: 16,
  fish: 30,
  cattle: 35,
  timber: 35,
  grain: 45,
};

export function marketPrice(good: Good, supply: number): number {
  const depth = GOOD_MARKET_DEPTH[good];
  const p = GOOD_BASE_PRICE[good] * (0.25 + (1.15 * depth) / (depth + supply));
  return Math.round(p * 100) / 100;
}

/** Goods that don't reach a port sell for this much less. */
export const LANDLOCKED_SALE = 0.5;
/** Gold a month per 1,000 settlers, besides their goods. */
export const TAX_PER_THOUSAND = 0.5;
/** Gold a month from the crown at home, for every power. */
export const CROWN_SUBSIDY = 8;

// ---------------------------------------------------------------- terrain

export interface TerrainRules {
  /** Settlers 100,000 km² of it can hold before growth stops. */
  capacity: number;
  /** Movement speed, 1 = open plains. */
  speed: number;
  /** Bonus for whoever defends here. */
  defense: number;
  /** Days added to founding a colony here. */
  colonizeDays: number;
  /** Extra gold to found a colony here. */
  colonizeGold: number;
  /** Extra attrition a month for armies away from home. */
  attrition: number;
}

export const TERRAIN: Record<Terrain, TerrainRules> = {
  plains: {
    capacity: 6000,
    speed: 1,
    defense: 0,
    colonizeDays: 0,
    colonizeGold: 0,
    attrition: 0,
  },
  forest: {
    capacity: 4000,
    speed: 0.8,
    defense: 0.1,
    colonizeDays: 15,
    colonizeGold: 5,
    attrition: 0,
  },
  hills: {
    capacity: 3500,
    speed: 0.75,
    defense: 0.2,
    colonizeDays: 20,
    colonizeGold: 10,
    attrition: 0,
  },
  mountains: {
    capacity: 2000,
    speed: 0.55,
    defense: 0.4,
    colonizeDays: 40,
    colonizeGold: 20,
    attrition: 0.02,
  },
  jungle: {
    capacity: 1800,
    speed: 0.5,
    defense: 0.15,
    colonizeDays: 45,
    colonizeGold: 20,
    attrition: 0.03,
  },
  desert: {
    capacity: 1000,
    speed: 0.75,
    defense: 0,
    colonizeDays: 30,
    colonizeGold: 15,
    attrition: 0.03,
  },
  marsh: {
    capacity: 1500,
    speed: 0.6,
    defense: 0.15,
    colonizeDays: 30,
    colonizeGold: 10,
    attrition: 0.02,
  },
  tundra: {
    capacity: 500,
    speed: 0.6,
    defense: 0.05,
    colonizeDays: 45,
    colonizeGold: 20,
    attrition: 0.03,
  },
};

/** How many settlers a province can hold, before farms. */
export function provinceCapacity(terrain: Terrain, areaKm2: number): number {
  const areaFactor = Math.max(0.6, Math.min(2, areaKm2 / 100_000));
  return Math.round(TERRAIN[terrain].capacity * areaFactor);
}

// ---------------------------------------------------------------- colonies

export const COLONY_BASE_DAYS = 75;
export const COLONY_BASE_GOLD = 30;
export const COLONY_START_POP = 300;
/** Colonists can sail this far from one of your coasts to found a colony. */
export const COLONIZE_SEA_KM = 1800;
/** Every 100 km at sea adds this many days to founding a colony. */
export const COLONY_DAYS_PER_100KM = 3;
export const MAX_COLONISTS = 3;

export function colonyDays(terrain: Terrain, seaKm: number): number {
  return (
    COLONY_BASE_DAYS +
    TERRAIN[terrain].colonizeDays +
    Math.round((seaKm / 100) * COLONY_DAYS_PER_100KM)
  );
}

/** Each province you already hold makes the next colony dearer. */
export const COLONY_GOLD_PER_PROVINCE = 2;

export function colonyGold(terrain: Terrain, provincesHeld: number): number {
  return (
    COLONY_BASE_GOLD +
    TERRAIN[terrain].colonizeGold +
    COLONY_GOLD_PER_PROVINCE * provincesHeld
  );
}

// ---------------------------------------------------------------- powers

export interface PowerRules {
  /** Days between colonists from home, before growth speeds it up. */
  colonistDays: number;
  /** Settlers arriving from home each month. */
  immigrants: number;
  /** Starting settlers in each of its first provinces. */
  startPop: number;
  /** Multiplies its goods income. */
  trade: number;
  /** Multiplies its regiments' fighting strength. */
  discipline: number;
  /** Natives take kindly to it: opinion bonus for trade and gifts. */
  diplomacy: number;
  /** Multiplies the price of silver and sugar it sells. */
  goodBonus: Partial<Record<Good, number>>;
  /** One line for the lobby. */
  blurb: string;
}

export const POWER_RULES: Record<string, PowerRules> = {
  england: {
    colonistDays: 140,
    immigrants: 130,
    startPop: 900,
    trade: 1,
    discipline: 1,
    diplomacy: 0,
    goodBonus: { tobacco: 1.2 },
    blurb: "More colonists and settlers than anyone. Tobacco sells for more.",
  },
  france: {
    colonistDays: 190,
    immigrants: 45,
    startPop: 700,
    trade: 1.05,
    discipline: 1.05,
    diplomacy: 25,
    goodBonus: { furs: 1.3 },
    blurb:
      "Natives like you: easier trade deals and gifts go further. Furs sell for more.",
  },
  spain: {
    colonistDays: 170,
    immigrants: 80,
    startPop: 1000,
    trade: 1,
    discipline: 1.1,
    diplomacy: -10,
    goodBonus: { silver: 1.25 },
    blurb: "Three footholds and tough soldiers. Silver sells for more.",
  },
  portugal: {
    colonistDays: 170,
    immigrants: 75,
    startPop: 1000,
    trade: 1.05,
    discipline: 1,
    diplomacy: 0,
    goodBonus: { sugar: 1.25 },
    blurb: "Brazil's sugar coast to start. Sugar sells for more.",
  },
  netherlands: {
    colonistDays: 190,
    immigrants: 60,
    startPop: 900,
    trade: 1.2,
    discipline: 1,
    diplomacy: 10,
    goodBonus: {},
    blurb: "Master traders: every good sells for 20% more.",
  },
  sweden: {
    colonistDays: 210,
    immigrants: 35,
    startPop: 700,
    trade: 1,
    discipline: 1.2,
    diplomacy: 5,
    goodBonus: { timber: 1.3 },
    blurb: "Few settlers, the best soldiers. Timber sells for more.",
  },
};

export function powerRules(n: Nation): PowerRules {
  return POWER_RULES[n.key] ?? POWER_RULES.england;
}

export const START_GOLD = 200;
export const START_MANPOWER = 3000;
export const START_REGIMENTS = 2;
export const MANPOWER_BASE_MONTHLY = 250;
export const MANPOWER_PER_POP = 0.005;

// ---------------------------------------------------------------- buildings

export interface BuildingRules {
  max: number;
  gold: number[];
  days: number[];
  /** Gold a month per level to keep it up. */
  upkeep: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingRules> = {
  farm: { max: 3, gold: [60, 120, 200], days: [60, 90, 120], upkeep: 0 },
  port: { max: 1, gold: [90], days: [120], upkeep: 0 },
  fort: { max: 2, gold: [120, 250], days: [150, 240], upkeep: 1 },
};

/** Pop growth a month, before farms (+0.15% a farm level). */
export const POP_GROWTH = 0.003;
export const POP_GROWTH_PER_FARM = 0.0015;
/** Each farm level raises how many settlers a province can hold. */
export const CAPACITY_PER_FARM = 0.4;

// ---------------------------------------------------------------- armies

export interface RegimentRules {
  gold: number;
  days: number;
  upkeep: number;
  attack: number;
  defense: number;
  speed: number;
  native: boolean;
}

export const REGIMENT_MEN = 1000;

export const REGIMENTS: Record<RegType, RegimentRules> = {
  inf: {
    gold: 60,
    days: 30,
    upkeep: 1,
    attack: 1,
    defense: 1,
    speed: 1,
    native: false,
  },
  cav: {
    gold: 90,
    days: 40,
    upkeep: 1.6,
    attack: 1.4,
    defense: 0.9,
    speed: 1.3,
    native: false,
  },
  art: {
    gold: 120,
    days: 50,
    upkeep: 2,
    attack: 1.2,
    defense: 1.4,
    speed: 0.8,
    native: false,
  },
  war: {
    gold: 20,
    days: 20,
    upkeep: 0.4,
    attack: 1,
    defense: 0.85,
    speed: 1.2,
    native: true,
  },
  horse: {
    gold: 35,
    days: 25,
    upkeep: 0.7,
    attack: 1.3,
    defense: 0.8,
    speed: 1.4,
    native: true,
  },
};

/** Km a day an army marches across open plains. */
export const MARCH_KM_PER_DAY = 22;
export const RIVER_CROSSING_DAYS = 2;
export const STRAIT_CROSSING_DAYS = 2;
export const SEA_KM_PER_DAY = 80;
export const EMBARK_DAYS = 4;

/** Morale an army gets back every 5 days, at home and away. */
export const MORALE_RECOVERY_HOME = 0.1;
export const MORALE_RECOVERY_AWAY = 0.04;
/** Men a regiment gets back each month at home (from manpower). */
export const REINFORCE_PER_MONTH = 150;
/** Share of men lost a month away from home. */
export const ATTRITION_AWAY = 0.02;
/** Armies smaller than this break up. */
export const MIN_ARMY_MEN = 250;

export const BATTLE_MAX_ROUNDS = 10;
export const BATTLE_CASUALTIES = 45;
export const BATTLE_BREAK_MORALE = 0.2;
export const FORT_DEFENSE_PER_LEVEL = 0.25;
export const RIVER_PENALTY = 0.2;
export const CAVALRY_OPEN_BONUS = 0.25;
export const NATIVE_AMBUSH_BONUS = 0.25;

/** Days to take a province by siege, by its fort level. */
export const SIEGE_DAYS = [30, 90, 160];
/** Men needed to besiege a fort, per fort level. */
export const SIEGE_MEN_PER_FORT = 1000;

// ---------------------------------------------------------------- diplomacy

export const TRUCE_DAYS = 5 * DAYS_PER_YEAR;
export const TRADE_MIN_OPINION = 0;
export const BUY_MIN_OPINION = 25;
export const GIFT_SIZES = [25, 50, 100];
export const GIFT_OPINION: Record<number, number> = { 25: 10, 50: 18, 100: 30 };
/** Every two colonies on a native nation's border cost this much opinion a month. */
export const BORDER_PRESSURE = 1;
/** Most opinion border pressure costs in a month. */
export const MAX_BORDER_PRESSURE = 4;
/** Natives this angry may raid you. */
export const RAID_OPINION = -70;
/** Natives warn you when they get this angry. */
export const ANGRY_OPINION = -50;
export const TRADE_OPINION_PER_MONTH = 2;
/** Trade deal gold a month, per square root of each province's natives (in thousands). */
export const TRADE_GOLD_PER_SQRT = 0.35;

export function landPrice(natives: number, areaKm2: number): number {
  return Math.round(40 + natives / 30 + areaKm2 / 4000);
}

// ---------------------------------------------------------------- natives

/** Natives in a province at the start, as a share of what the land holds. */
export const NATIVES_OWNED = 2.2;
export const NATIVES_WILD = 0.5;
export const NATIVE_GROWTH = 0.002;
export const NATIVE_MANPOWER_PER_POP = 0.004;
export const NATIVE_MANPOWER_CAP = 0.08;

// ---------------------------------------------------------------- the computer

export interface DifficultyRules {
  /** Multiplies the computer's income. */
  income: number;
  /** Chance a month the computer starts a war it can win. */
  aggression: number;
  /** Multiplies natives' starting warriors. */
  nativeArmies: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { income: 0.85, aggression: 0.04, nativeArmies: 0.7 },
  normal: { income: 1, aggression: 0.1, nativeArmies: 1 },
  hard: { income: 1.25, aggression: 0.2, nativeArmies: 1.25 },
};

// ---------------------------------------------------------------- score

export function scoreOf(n: Nation, provinces: number, pop: number): number {
  return Math.round(
    provinces * 10 +
      pop / 250 +
      n.stats.goldEarned / 100 +
      n.stats.battlesWon * 4 +
      n.stats.provincesConquered * 6 +
      n.stats.coloniesFounded * 2,
  );
}
