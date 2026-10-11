// The rulebook for a life in Derpy Conquest: the skills a character learns,
// the backgrounds they can come from, the trades and their ladders, the
// people of a place, what a way of living costs, arms and names. Plain data,
// read by the engine, the server and the browser alike.

import type {
  BackgroundId,
  Charge,
  Division,
  JobKind,
  KitKey,
  Lifestyle,
  PlaceKind,
  Religion,
  RoleId,
  Skill,
  Skills,
  Stat,
  Tincture,
  TraitId,
} from "./Types";
// LIFE (r11): the new trades, backgrounds, townsfolk and places.
import {
  type JobGroup,
  type JobRequires,
  MORE_BACKGROUNDS,
  MORE_JOBS,
  MORE_PLACES,
  MORE_ROLE_JOBS,
  MORE_ROLES,
} from "./JobsData";

// ---------------------------------------------------------------- skills

export const SKILL_MAX = 20;

export const SKILL_NAMES: Record<Skill, string> = {
  fighting: "Fighting",
  leadership: "Leadership",
  persuasion: "Persuasion",
  trade: "Trade",
  craft: "Craft",
  farming: "Farming",
  seamanship: "Seamanship",
  woodcraft: "Woodcraft",
  letters: "Letters",
  faith: "Faith",
  medicine: "Medicine",
  stealth: "Stealth",
};

export const SKILL_HELP: Record<Skill, string> = {
  fighting:
    "Musket, blade, bow and fists. Soldiers, warriors, and anyone on a dark road.",
  leadership: "Getting others to follow: a squad, a crew, a hunting party.",
  persuasion: "Talking, charming, bargaining and courting.",
  trade: "Buying low, selling high, and knowing a bad bargain.",
  craft: "Hands that make things: smithing, joinery, canoes, pots.",
  farming: "Fields, seasons and livestock; the three sisters or tobacco.",
  seamanship: "Ships and boats: sails, knots, weather and the stars.",
  woodcraft: "Hunting, tracking, trapping and finding your way.",
  letters:
    "Reading, writing and printing; and for speakers, the records of treaties.",
  faith: "Prayer, ceremony, and comfort to others.",
  medicine: "Herbs, physic, setting bones and fevers.",
  stealth: "Not being seen, not being caught, and not saying too much.",
};

/** The attribute that helps each skill along (a point per 3 over 5). */
export const SKILL_STAT: Record<Skill, Stat> = {
  fighting: "mar",
  leadership: "mar",
  persuasion: "dip",
  trade: "ste",
  craft: "ste",
  farming: "ste",
  seamanship: "mar",
  woodcraft: "int",
  letters: "lea",
  faith: "lea",
  medicine: "lea",
  stealth: "int",
};

export const ATTRIBUTE_NAMES: Record<Stat, string> = {
  dip: "Diplomacy",
  mar: "Martial",
  ste: "Stewardship",
  int: "Intrigue",
  lea: "Learning",
};

export const ATTRIBUTE_HELP: Record<Stat, string> = {
  dip: "Charm and tact. Helps persuasion, and how strangers take to you.",
  mar: "Nerve and strength. Helps fighting, leadership and seamanship; commanders need it.",
  ste: "Good sense with money and work. Helps trade, craft and farming.",
  int: "A quick, sly mind. Helps woodcraft and stealth, and rumours and plots.",
  lea: "Book learning and judgement. Helps letters, faith and medicine.",
};

/** XP to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 40 + 12 * level;
}

/** Skill bonuses from traits, on top of their attribute changes. */
export const TRAIT_SKILLS: Partial<Record<TraitId, Partial<Skills>>> = {
  brave: { fighting: 2 },
  craven: { fighting: -2, stealth: 1 },
  charming: { persuasion: 2 },
  deceitful: { stealth: 2, persuasion: 1 },
  honest: { stealth: -2 },
  diligent: { craft: 1, farming: 1 },
  educated: { letters: 2, medicine: 1 },
  zealous: { faith: 2 },
  greedy: { trade: 1 },
  generous: { persuasion: 1 },
  just: { leadership: 1 },
  cruel: { leadership: 1, persuasion: -1 },
  ambitious: { leadership: 1 },
  strong: { fighting: 2, craft: 1 },
  shrewd: { trade: 2, persuasion: 1 },
  drunkard: { persuasion: 1, stealth: -1 },
  scarred: { fighting: 1 },
  famous: { persuasion: 1, leadership: 1 },
  wounded: { fighting: -2 },
};

/** What each trait means for a life (the governor's version is in TRAITS). */
export const LIFE_TRAIT_TEXT: Record<TraitId, string> = {
  ambitious: "+1 Leadership. Promotions come sooner, but stress builds.",
  content: "Less stress every month. Promotions come a little slower.",
  honest: "−2 Stealth. People believe you (+5 opinion of you).",
  deceitful: "+2 Stealth, +1 Persuasion. Found out, people remember.",
  brave: "+2 Fighting. Stands firm when it counts; more glory in battle.",
  craven: "−2 Fighting, +1 Stealth. Lives to run another day.",
  greedy: "+1 Trade. Others like you a little less (−5).",
  generous: "+1 Persuasion. Gifts go further (+50% opinion).",
  diligent: "+1 Craft and Farming. Learns 20% faster at work.",
  lazy: "Learns 20% slower at work, but less stress.",
  zealous: "+2 Faith. Other faiths like you less (−10).",
  tolerant: "Strangers of other peoples and faiths like you better.",
  just: "+1 Leadership. People trust your word (+5).",
  cruel: "+1 Leadership, −1 Persuasion. Feared more than liked (−10).",
  robust: "Rarely ill: half the risk of dying, and health recovers faster.",
  sickly: "Often ill: twice the risk of dying, and health slips.",
  educated: "+2 Letters, +1 Medicine. Learns letters 20% faster.",
  charming: "+2 Persuasion. Everyone likes you a little more (+10).",
  strong: "+2 Fighting, +1 Craft. Hard work wears you less.",
  shrewd: "+2 Trade, +1 Persuasion. Better prices at the market.",
  drunkard: "+1 Persuasion in company; health slips and stress returns.",
  scarred: "+1 Fighting. A veteran's face: some respect, some stares.",
  famous: "+1 Persuasion and Leadership. Everyone has heard of you (+10).",
  wounded: "−2 Fighting. An old wound that aches when it rains.",
  gouty: "Too much of the good life: health slips, tempers fray.",
};

/** Traits a new character can be given at the start (the rest are earned). */
export const CREATION_TRAITS: TraitId[] = [
  "brave",
  "craven",
  "charming",
  "honest",
  "deceitful",
  "diligent",
  "lazy",
  "ambitious",
  "content",
  "generous",
  "greedy",
  "just",
  "cruel",
  "zealous",
  "tolerant",
  "educated",
  "robust",
  "sickly",
  "strong",
  "shrewd",
  "drunkard",
];

export const LIFE_MAX_TRAITS = 3;
/** Trait points at the start; a flaw gives some back. */
export const LIFE_TRAIT_POINTS = 2;

// ---------------------------------------------------------------- making a character

export const LIFE_MIN_AGE = 16;
export const LIFE_MAX_AGE = 40;
/** Highest a skill can be at the start. */
export const START_SKILL_MAX = 12;
/** Where every skill starts before the background. */
export const BASE_SKILL = 1;
/** Attributes start at 5 each; this many points to raise them (more with age). */
export const LIFE_STAT_POINTS = 3;
export const LIFE_STAT_MIN = 2;
export const LIFE_STAT_MAX = 12;

export function statPointsFor(age: number): number {
  return LIFE_STAT_POINTS + (age >= 25 ? 1 : 0) + (age >= 33 ? 1 : 0);
}

/** Skill points to spend at the start: more for an older character. */
export function skillPointsFor(age: number): number {
  if (age < 20) return 8;
  if (age < 25) return 10;
  if (age < 30) return 12;
  if (age < 35) return 14;
  return 16;
}

/** Points to raise a skill from `level` to `level + 1` at the start. */
export function skillStepCost(level: number): number {
  return level < 8 ? 1 : 2;
}

export interface BackgroundDef {
  name: string;
  native: boolean;
  /** One line under the name. */
  blurb: string;
  /** What it means: where you'll work, what you'll earn. */
  text: string;
  skills: Partial<Skills>;
  purse: number;
  /** The job they start in, if their home has the place for it. */
  job: JobKind | null;
  renown: number;
  lifestyle: Lifestyle;
  /** Spare skill points this background brings (hard lives teach). */
  bonusPoints?: number;
  /** LIFE (r11): a name in the underworld from the start (and the den at home known). */
  notoriety?: number;
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  farmer: {
    name: "Farmer",
    native: false,
    blurb: "A rented plot, a mule, and the weather.",
    text: "Starts as a tenant farmer in the fields of home. Buy your own land as a yeoman, then more.",
    skills: { farming: 5, woodcraft: 2, craft: 1, fighting: 1 },
    purse: 12,
    job: "farmer",
    renown: 0,
    lifestyle: "modest",
  },
  millhand: {
    name: "Mill hand",
    native: false,
    blurb: "The sawmill, the ironworks, the ropewalk or the shipyard.",
    text: "Starts as a hand at the province's mill or yard. Journeyman, foreman, and one day a mill of your own.",
    skills: { craft: 4, fighting: 1, trade: 1, seamanship: 1 },
    purse: 10,
    job: "millhand",
    renown: 0,
    lifestyle: "modest",
  },
  newsman: {
    name: "Printer's devil",
    native: false,
    blurb: "Inky fingers, a sharp ear, and the news before anyone.",
    text: "Starts setting type and crying the news. Journeyman, editor, and a newspaper of your own, which sways movements.",
    skills: { letters: 4, persuasion: 2, stealth: 1 },
    purse: 8,
    job: "newsman",
    renown: 1,
    lifestyle: "modest",
  },
  soldier: {
    name: "Soldier",
    native: false,
    blurb: "A musket, a coat, and a sergeant who shouts.",
    text: "Starts as a private in the garrison, marching with a real army. Corporal, sergeant, then a commission; colonels lead armies.",
    skills: { fighting: 5, leadership: 1, woodcraft: 1 },
    purse: 8,
    job: "soldier",
    renown: 1,
    lifestyle: "modest",
  },
  sailor: {
    name: "Sailor",
    native: false,
    blurb: "Salt pork, tar, and the far side of the sea.",
    text: "Starts as a deckhand at the docks. Passage by sea is free while you sail. Mate, captain, privateer.",
    skills: { seamanship: 5, fighting: 2, trade: 1 },
    purse: 10,
    job: "sailor",
    renown: 0,
    lifestyle: "modest",
  },
  clerk: {
    name: "Merchant's clerk",
    native: false,
    blurb: "Ledgers, bills of lading, and a sharp quill.",
    text: "Starts as a clerk at the market. Factor, then merchant in your own right.",
    skills: { trade: 4, letters: 3, persuasion: 1 },
    purse: 15,
    job: "clerk",
    renown: 1,
    lifestyle: "modest",
  },
  craftsman: {
    name: "Craftsman",
    native: false,
    blurb: "Smith, carpenter or cooper.",
    text: "Starts as an apprentice in a workshop. Journeyman, then master of your own shop.",
    skills: { craft: 5, trade: 1, fighting: 1 },
    purse: 12,
    job: "craftsman",
    renown: 0,
    lifestyle: "modest",
  },
  trapper: {
    name: "Fur trapper",
    native: false,
    blurb: "Beaver, the backcountry, and nobody's orders.",
    text: "Starts trapping out of the woods. Sell furs where they fetch most.",
    skills: { woodcraft: 5, fighting: 2, trade: 1, stealth: 1 },
    purse: 8,
    job: "trapper",
    renown: 0,
    lifestyle: "frugal",
  },
  servant: {
    name: "Indentured servant",
    native: false,
    blurb: "Four years' work for the passage over.",
    text: "Bound to a master for four years: board and bed, no wage. Then freedom dues and a fresh start. Hard lives teach: 3 more skill points.",
    skills: { farming: 2, craft: 2, stealth: 1 },
    purse: 0,
    job: "servant",
    renown: 0,
    lifestyle: "frugal",
    bonusPoints: 3,
  },
  preacher: {
    name: "Preacher's assistant",
    native: false,
    blurb: "Sweeping the church, and the souls in it.",
    text: "Starts serving the church. Reader, curate, and a pulpit of your own.",
    skills: { faith: 5, letters: 3, persuasion: 1 },
    purse: 6,
    job: "preacher",
    renown: 2,
    lifestyle: "frugal",
  },
  physician: {
    name: "Physician's apprentice",
    native: false,
    blurb: "Leeches, lancets and Latin.",
    text: "Starts apprenticed at the apothecary or the fort. Barber-surgeon, then physician.",
    skills: { medicine: 4, letters: 3, faith: 1 },
    purse: 10,
    job: "physician",
    renown: 1,
    lifestyle: "modest",
  },
  lawyer: {
    name: "Law clerk",
    native: false,
    blurb: "Writs, deeds, and other people's quarrels.",
    text: "Starts copying deeds at the courthouse. Attorney, barrister, and the colony's own attorney. Lawyers do well at elections.",
    skills: { letters: 4, persuasion: 3, trade: 1 },
    purse: 12,
    job: "law",
    renown: 2,
    lifestyle: "modest",
  },
  gentry: {
    name: "Gentleman's child",
    native: false,
    blurb: "Money, manners, and no trade at all.",
    text: "A full purse, an allowance for five years, and some renown. No job: find one, buy a commission, or don't.",
    skills: { letters: 3, persuasion: 3, leadership: 2, fighting: 1 },
    purse: 80,
    job: null,
    renown: 10,
    lifestyle: "comfortable",
  },
  hunter: {
    name: "Hunter",
    native: true,
    blurb: "Deer, turkey and beaver, and the paths between.",
    text: "Starts hunting for your people. Lead the hunt in time.",
    skills: { woodcraft: 5, fighting: 2, stealth: 2 },
    purse: 4,
    job: "hunter",
    renown: 1,
    lifestyle: "modest",
  },
  warrior: {
    name: "Warrior",
    native: true,
    blurb: "Defender of the village, and its raids.",
    text: "Starts among the young warriors, marching with your nation's war parties. War leader, then war chief.",
    skills: { fighting: 5, woodcraft: 2, leadership: 1 },
    purse: 3,
    job: "warrior",
    renown: 2,
    lifestyle: "modest",
  },
  grower: {
    name: "Grower",
    native: true,
    blurb: "Corn, beans and squash: the three sisters.",
    text: "Starts tending the fields. Keep the seed and, in time, the fields.",
    skills: { farming: 5, craft: 1, medicine: 1 },
    purse: 4,
    job: "grower",
    renown: 1,
    lifestyle: "modest",
  },
  healer: {
    name: "Healer",
    native: true,
    blurb: "Plants, songs and steady hands.",
    text: "Starts learning from a healer. Your people will come to you.",
    skills: { medicine: 5, faith: 3 },
    purse: 3,
    job: "healer",
    renown: 2,
    lifestyle: "modest",
  },
  trader: {
    name: "Trader",
    native: true,
    blurb: "Furs for kettles, corn for cloth.",
    text: "Starts trading at the village and the posts. Go-between, then trade leader.",
    skills: { trade: 5, persuasion: 2, seamanship: 1 },
    purse: 10,
    job: "trader",
    renown: 1,
    lifestyle: "modest",
  },
  speaker: {
    name: "Speaker",
    native: true,
    blurb: "A runner with a good memory and a better voice.",
    text: "Starts as a runner carrying messages. Speak for your people at councils, and maybe lead them.",
    skills: { persuasion: 5, leadership: 2, letters: 1 },
    purse: 4,
    job: "speaker",
    renown: 2,
    lifestyle: "modest",
  },
  maker: {
    name: "Maker",
    native: true,
    blurb: "Canoes, pots, baskets and beadwork.",
    text: "Starts making for the village. Your work will be traded far away.",
    skills: { craft: 5, trade: 1, woodcraft: 1 },
    purse: 5,
    job: "maker",
    renown: 1,
    lifestyle: "modest",
  },
  ...MORE_BACKGROUNDS,
};

export const COLONIST_BACKGROUNDS = (
  Object.keys(BACKGROUNDS) as BackgroundId[]
).filter((b) => !BACKGROUNDS[b].native);
export const NATIVE_BACKGROUNDS = (
  Object.keys(BACKGROUNDS) as BackgroundId[]
).filter((b) => BACKGROUNDS[b].native);

/** Faiths a character of each people could hold. */
export const FAITHS: Record<string, Religion[]> = {
  england: ["anglican", "puritan", "catholic"],
  france: ["catholic", "reformed"],
  spain: ["catholic"],
  portugal: ["catholic"],
  netherlands: ["reformed", "lutheran"],
  sweden: ["lutheran"],
  native: ["native", "catholic"],
};

export function faithsFor(origin: string, native: boolean): Religion[] {
  return native ? FAITHS.native : (FAITHS[origin] ?? ["anglican"]);
}

/** Years the first press runs in a colony of each culture (none before). */
export const PRESS_YEAR: Record<string, number> = {
  english: 1640,
  dutch: 1690,
  spanish: 1720,
  portuguese: 1750,
  french: 1764,
  swedish: 9999,
};

// ---------------------------------------------------------------- jobs

export interface RankDef {
  title: string;
  /** Coins a month. */
  wage: number;
  /** Months in the rank below before this one can come. */
  months: number;
  /** The job's main skill this rank needs. */
  skill: number;
  /** The job's second skill this rank needs. */
  second?: number;
  renown: number;
  /** Opinion the employer (or your patron) must have of you. */
  opinion?: number;
  /** Bought rather than earned: land, a shop, a press, a commission. */
  buy?: { cost: number; what: string };
  /** An officer's commission: given by the colony's marshal or governor. */
  commission?: boolean;
  /** LIFE (r11): a name in the underworld this rung needs. */
  notoriety?: number;
  /** LIFE (r11): something you must keep for this rung (a highwayman's horse). */
  kit?: KitKey;
}

export interface JobDef {
  name: string;
  /** Native jobs, colonists' jobs, or (null) either. */
  native: boolean | null;
  /** Places that offer it. */
  places: PlaceKind[];
  main: Skill;
  second: Skill;
  ranks: RankDef[];
  /** Yearly chance the work kills you (soldiers and warriors: more at war). */
  danger: number;
  /** Stress the work adds each month. */
  stress: number;
  /** Skills needed to be taken on at all. */
  need?: Partial<Skills>;
  /** Only serves the province's owner (soldiers, officials). */
  ownNation?: boolean;
  /** Only in a church of your own faith. */
  ownFaith?: boolean;
  /** Who takes people on. */
  employer?: RoleId;
  /** Renown a month at the top rungs (publishers, ministers, officers). */
  fame?: number;
  /** You can set up on your own (traplines), without anyone taking you on. */
  selfStart?: boolean;
  /** What your own business is called once you've bought into it. */
  business?: string;
  text: string;
  /** LIFE (r11): its kind of work, for the register and the list of trades. */
  group?: JobGroup;
  /** LIFE (r11): what it's good for, in a line. */
  good?: string;
  /** LIFE (r11): what it takes before anyone will have you (or you can set up). */
  requires?: JobRequires;
  /** LIFE (r11): work done at sea (or at the docks), on the road, or wherever you are. */
  post?: "sea" | "road" | "anywhere";
  /** LIFE (r11): a crooked living: how grave (1 petty, 3 a hanging matter), and the heat a day's work draws. */
  crime?: { grade: number; heat: number };
  /** LIFE (r11): keeps the peace (the watch, thief-takers). */
  law?: boolean;
}

const rk = (
  title: string,
  wage: number,
  months: number,
  skill: number,
  renown: number,
  extra: Partial<RankDef> = {},
): RankDef => ({ title, wage, months, skill, renown, ...extra });

export const JOBS: Record<JobKind, JobDef> = {
  farmer: {
    name: "Farming",
    native: false,
    places: ["fields"],
    main: "farming",
    second: "trade",
    ranks: [
      rk("Tenant farmer", 2.5, 0, 0, 0),
      rk("Yeoman", 4.5, 12, 6, 0, {
        buy: { cost: 20, what: "a freehold of your own" },
      }),
      rk("Freeholder", 6.5, 24, 9, 6),
      rk("Planter", 11, 36, 11, 15, {
        buy: { cost: 90, what: "a plantation" },
      }),
    ],
    danger: 0,
    stress: 1,
    employer: "planter",
    business: "farm",
    text: "Sowing, reaping and praying for rain. Land of your own makes you a voter and, in time, a burgess.",
  },
  millhand: {
    name: "The mill",
    native: false,
    places: ["workshop"],
    main: "craft",
    second: "leadership",
    ranks: [
      rk("Mill hand", 2.5, 0, 0, 0),
      rk("Journeyman", 4, 12, 6, 0),
      rk("Foreman", 6, 24, 9, 4, { second: 4 }),
      rk("Mill owner", 10, 36, 11, 12, {
        buy: { cost: 70, what: "a mill of your own" },
      }),
    ],
    danger: 0.004,
    stress: 3,
    employer: "master",
    business: "mill",
    text: "Sawing, hammering, twisting rope or caulking hulls. Hard, steady pay.",
  },
  newsman: {
    name: "News and print",
    native: false,
    places: ["press"],
    main: "letters",
    second: "persuasion",
    ranks: [
      rk("Printer's devil", 2, 0, 0, 0),
      rk("Journeyman printer", 3.5, 12, 6, 0),
      rk("Editor", 6, 24, 10, 10),
      rk("Publisher", 9, 30, 12, 20, {
        buy: { cost: 60, what: "a press and a newspaper of your own" },
      }),
    ],
    danger: 0,
    stress: 2,
    need: { letters: 2 },
    employer: "printer",
    business: "printing house",
    fame: 0.6,
    text: "News is carried, cried and printed. A newspaper of your own brings renown and sways movements.",
  },
  soldier: {
    name: "The army",
    native: false,
    places: ["fort"],
    main: "fighting",
    second: "leadership",
    ranks: [
      rk("Private", 2.5, 0, 0, 0),
      rk("Corporal", 3.5, 8, 6, 0),
      rk("Sergeant", 5, 16, 8, 3, { second: 4 }),
      rk("Lieutenant", 8, 18, 9, 10, {
        second: 6,
        commission: true,
        buy: { cost: 40, what: "a lieutenant's commission" },
      }),
      rk("Captain", 11, 24, 10, 18, {
        second: 8,
        commission: true,
        buy: { cost: 110, what: "a captain's commission" },
      }),
      rk("Major", 15, 30, 11, 30, {
        second: 10,
        commission: true,
        buy: { cost: 240, what: "a major's commission" },
      }),
      rk("Colonel", 19, 30, 12, 45, { second: 12, commission: true }),
      rk("General", 30, 36, 13, 65, { second: 14, commission: true }),
    ],
    danger: 0.01,
    stress: 2,
    ownNation: true,
    employer: "sergeant",
    fame: 0.25,
    text: "Drill, guard duty and, when war comes, the line of battle. You march with a real army; colonels and generals lead one.",
  },
  sailor: {
    name: "The sea",
    native: null,
    places: ["docks"],
    main: "seamanship",
    second: "fighting",
    ranks: [
      rk("Deckhand", 2.8, 0, 0, 0),
      rk("Able seaman", 4.5, 10, 6, 0),
      rk("Mate", 8, 20, 9, 5),
      rk("Ship's captain", 11, 30, 12, 15, {
        buy: { cost: 90, what: "a ship of your own" },
      }),
      rk("Privateer", 15, 24, 13, 25, { second: 9 }),
    ],
    danger: 0.012,
    stress: 3,
    employer: "captain",
    business: "ship",
    fame: 0.2,
    text: "Coasting trips and ocean crossings. Sea passage is free while you sail. A privateer's letter of marque pays in wartime.",
  },
  clerk: {
    name: "Commerce",
    native: false,
    places: ["market"],
    main: "trade",
    second: "letters",
    ranks: [
      rk("Clerk", 3, 0, 0, 0),
      rk("Factor", 5, 12, 7, 0),
      rk("Merchant", 9, 24, 10, 12, {
        buy: { cost: 50, what: "a counting house of your own" },
      }),
      rk("Merchant prince", 16, 48, 14, 30),
    ],
    danger: 0,
    stress: 2,
    need: { letters: 2 },
    employer: "merchant",
    business: "counting house",
    fame: 0.2,
    text: "Bills, cargoes and credit. Merchants are the colony's quiet power.",
  },
  official: {
    name: "Government",
    native: false,
    places: ["governor"],
    main: "letters",
    second: "persuasion",
    ranks: [
      rk("Copying clerk", 2.5, 0, 0, 0),
      rk("Deputy secretary", 4.5, 12, 7, 5),
      rk("Collector of customs", 8, 24, 10, 15, { opinion: 20 }),
      rk("Secretary of the colony", 14, 36, 12, 25, { opinion: 35 }),
    ],
    danger: 0,
    stress: 2,
    need: { letters: 3 },
    ownNation: true,
    employer: "official",
    fame: 0.3,
    text: "Copying letters, collecting customs and keeping the governor's secrets. The road to the council runs through here.",
  },
  law: {
    name: "The law",
    native: false,
    places: ["governor"],
    main: "letters",
    second: "persuasion",
    ranks: [
      rk("Law clerk", 2, 0, 0, 0),
      rk("Attorney", 5, 18, 8, 3, { second: 5 }),
      rk("Barrister", 9, 30, 11, 15, { second: 8 }),
      rk("Attorney-general", 15, 36, 13, 25, { opinion: 30 }),
    ],
    danger: 0,
    stress: 2,
    need: { letters: 3 },
    employer: "lawyer",
    fame: 0.3,
    text: "Deeds, debts and disputes. Lawyers win elections and lose friends.",
  },
  craftsman: {
    name: "A craft",
    native: false,
    places: ["workshop"],
    main: "craft",
    second: "trade",
    ranks: [
      rk("Apprentice", 1.5, 0, 0, 0),
      rk("Journeyman", 3.5, 18, 6, 0),
      rk("Master", 6, 30, 10, 5, {
        buy: { cost: 30, what: "a shop of your own" },
      }),
      rk("Guild master", 9, 48, 13, 15),
    ],
    danger: 0,
    stress: 1,
    employer: "master",
    business: "shop",
    text: "A smith's forge, a carpenter's bench or a cooper's barrels.",
  },
  trapper: {
    name: "The fur trade",
    native: null,
    places: ["woods"],
    main: "woodcraft",
    second: "trade",
    ranks: [
      rk("Trapper", 3, 0, 0, 0),
      rk("Woodsman", 4.5, 12, 7, 0),
      rk("Fur trader", 7, 24, 9, 8, { second: 6 }),
      rk("Company partner", 13, 36, 11, 20, {
        buy: { cost: 60, what: "a partner's share in the company" },
      }),
    ],
    danger: 0.008,
    stress: 1,
    employer: "trader",
    selfStart: true,
    business: "trading company",
    text: "Beaver pelts from the backcountry. Better where the furs are thick. Anyone may set their own traplines.",
  },
  servant: {
    name: "Indenture",
    native: false,
    places: ["fields"],
    main: "farming",
    second: "craft",
    ranks: [rk("Indentured servant", 0.5, 0, 0, 0)],
    danger: 0.004,
    stress: 4,
    employer: "planter",
    text: "Bed and board but no wage until the term is served. Running away is a crime.",
  },
  preacher: {
    name: "The church",
    native: false,
    places: ["church"],
    main: "faith",
    second: "letters",
    ranks: [
      rk("Sexton", 1.5, 0, 0, 0),
      rk("Reader", 3, 12, 6, 0),
      rk("Curate", 5, 24, 9, 8),
      rk("Minister", 8, 36, 12, 18),
    ],
    danger: 0,
    stress: 1,
    need: { faith: 3 },
    ownFaith: true,
    employer: "preacher",
    fame: 0.4,
    text: "Bells, burials and sermons. The church is the town's ear, and its conscience.",
  },
  physician: {
    name: "Physic",
    native: false,
    places: ["apothecary"],
    main: "medicine",
    second: "letters",
    ranks: [
      rk("Apprentice", 1.5, 0, 0, 0),
      rk("Barber-surgeon", 4, 18, 6, 0),
      rk("Physician", 8, 30, 10, 10),
      rk("Physician-general", 13, 36, 13, 25),
    ],
    danger: 0.006,
    stress: 2,
    need: { letters: 2 },
    employer: "physician",
    fame: 0.3,
    text: "Bleeding, bonesetting and fever. Fevers are catching.",
  },
  innkeeper: {
    name: "The tavern",
    native: null,
    places: ["tavern"],
    main: "trade",
    second: "persuasion",
    ranks: [
      rk("Tapster", 2, 0, 0, 0),
      rk("Innkeeper", 4.5, 12, 6, 0, {
        buy: { cost: 35, what: "the lease of an inn" },
      }),
      rk("Proprietor", 8, 30, 9, 10),
    ],
    danger: 0.002,
    stress: 2,
    employer: "innkeeper",
    business: "inn",
    text: "Ale, beds and gossip. Everyone comes through the tavern eventually, assemblymen included.",
  },
  hunter: {
    name: "The hunt",
    native: true,
    places: ["woods"],
    main: "woodcraft",
    second: "fighting",
    ranks: [
      rk("Hunter", 2, 0, 0, 0),
      rk("Skilled hunter", 3.5, 12, 7, 0),
      rk("Hunt leader", 5, 24, 10, 8, { second: 5 }),
    ],
    danger: 0.008,
    stress: 1,
    employer: "hunter",
    text: "Meat and hides for your people, furs for trade.",
  },
  warrior: {
    name: "War",
    native: true,
    places: ["councilfire"],
    main: "fighting",
    second: "leadership",
    ranks: [
      rk("Young warrior", 1.5, 0, 0, 0),
      rk("Warrior", 3, 10, 6, 0),
      rk("War leader", 4.5, 24, 9, 15, { second: 6 }),
      rk("War chief", 7, 36, 11, 35, { second: 10, commission: true }),
    ],
    danger: 0.01,
    stress: 2,
    ownNation: true,
    employer: "warleader",
    fame: 0.3,
    text: "Defending the village, raids, and when war comes, battle with your nation's war parties. War chiefs lead them.",
  },
  grower: {
    name: "The fields",
    native: true,
    places: ["fields"],
    main: "farming",
    second: "leadership",
    ranks: [
      rk("Grower", 1.5, 0, 0, 0),
      rk("Seed keeper", 3, 12, 7, 0),
      rk("Field elder", 4, 30, 10, 10),
    ],
    danger: 0,
    stress: 1,
    employer: "elder",
    text: "Corn, beans and squash, and the seed for next year.",
  },
  healer: {
    name: "Healing",
    native: true,
    places: ["village"],
    main: "medicine",
    second: "faith",
    ranks: [
      rk("Healer's helper", 1.5, 0, 0, 0),
      rk("Healer", 3, 18, 7, 0),
      rk("Elder healer", 5, 36, 11, 12),
    ],
    danger: 0.004,
    stress: 2,
    employer: "healer",
    fame: 0.2,
    text: "Plants, songs and care. Strangers' sicknesses are the hardest.",
  },
  trader: {
    name: "Trade",
    native: true,
    places: ["village", "market"],
    main: "trade",
    second: "persuasion",
    ranks: [
      rk("Trader", 2.5, 0, 0, 0),
      rk("Go-between", 4, 12, 7, 0),
      rk("Trade leader", 7, 30, 10, 12),
    ],
    danger: 0.004,
    stress: 2,
    employer: "trader",
    text: "Furs, corn and wampum for kettles, cloth and tools.",
  },
  speaker: {
    name: "Council",
    native: true,
    places: ["councilfire"],
    main: "persuasion",
    second: "leadership",
    ranks: [
      rk("Runner", 1.5, 0, 0, 0),
      rk("Speaker", 3, 18, 7, 5),
      rk("Elder speaker", 5, 36, 11, 18),
    ],
    danger: 0.002,
    stress: 2,
    employer: "sachem",
    fame: 0.3,
    text: "Messages carried, words remembered, councils addressed. Elder speakers may sit at the council fire, and lead.",
  },
  maker: {
    name: "Making",
    native: true,
    places: ["village"],
    main: "craft",
    second: "trade",
    ranks: [
      rk("Maker", 1.5, 0, 0, 0),
      rk("Skilled maker", 3, 12, 7, 0),
      rk("Master maker", 5, 30, 10, 8),
    ],
    danger: 0,
    stress: 1,
    employer: "maker",
    text: "Canoes, pots, baskets and beadwork, for use and for trade.",
  },
  ...MORE_JOBS,
};

export const JOB_KINDS = Object.keys(JOBS) as JobKind[];

/** Indentures run this long. */
export const INDENTURE_YEARS = 4;
/** What a freed servant is given when the term is served. */
export const FREEDOM_DUES = 15;
/** Allowance a gentleman's child gets each month, and for how long. */
export const ALLOWANCE = 3;
export const ALLOWANCE_YEARS = 5;
/** Days at the post that earn a full month's wage (Sundays are off). */
export const WORK_DAYS = 24;
/** Days away in a row before your master writes, and before you're let go. */
export const AWAY_WARN_DAYS = 21;
export const AWAY_DAYS = 42;
/** Chance a month your own business grows a rung, once you qualify. */
export const PROMOTION_CHANCE = 0.35;
/** Chance a month a master calls you in to offer the next rung, once you qualify. */
export const OFFER_CHANCE = 0.3;
/** Bounties and muskets for five hundred volunteers raised by a commander. */
export const RECRUIT_COST = 30;
/** Rank at which a soldier may take command of an army (Colonel), or a warrior (War chief). */
export const COMMAND_RANK: Partial<Record<JobKind, number>> = {
  soldier: 6,
  warrior: 3,
};

// ---------------------------------------------------------------- townsfolk

export interface RoleDef {
  /** Their title. */
  title: string;
  native: boolean;
  place: PlaceKind;
  /** The job they take people on for. */
  job: JobKind | null;
  /** Every trade they take people on for (the first is `job`). */
  jobs?: JobKind[];
  /** What they're doing at their place, a few ways. */
  doing?: string[];
  /** The skill they're known for. */
  skill: Skill;
  /** How they're placed in the world: weighs marriages, loans and elections. */
  status: number;
  /** Coins they could lend you. */
  wealth: number;
  /** What a player taking them over would do, and at which rank. */
  becomes: [JobKind, number] | null;
}

export const ROLES: Record<RoleId, RoleDef> = {
  innkeeper: {
    jobs: ["innkeeper"],
    doing: ["keeping the bar", "drawing ale", "counting the take"],
    title: "Innkeeper",
    native: false,
    place: "tavern",
    job: "innkeeper",
    skill: "trade",
    status: 2,
    wealth: 25,
    becomes: ["innkeeper", 2],
  },
  preacher: {
    jobs: ["preacher"],
    doing: ["at the pulpit", "writing a sermon", "tending the churchyard"],
    title: "Minister",
    native: false,
    place: "church",
    job: "preacher",
    skill: "faith",
    status: 3,
    wealth: 15,
    becomes: ["preacher", 3],
  },
  merchant: {
    jobs: ["clerk"],
    doing: ["at the counting table", "weighing goods", "haggling"],
    title: "Merchant",
    native: false,
    place: "market",
    job: "clerk",
    skill: "trade",
    status: 4,
    wealth: 60,
    becomes: ["clerk", 2],
  },
  captain: {
    jobs: ["sailor"],
    doing: [
      "seeing to the cargo",
      "reading the weather",
      "swearing at the crew",
    ],
    title: "Ship's captain",
    native: false,
    place: "docks",
    job: "sailor",
    skill: "seamanship",
    status: 3,
    wealth: 40,
    becomes: ["sailor", 3],
  },
  sergeant: {
    jobs: ["soldier"],
    doing: ["drilling the men", "on the ramparts", "inspecting muskets"],
    title: "Sergeant",
    native: false,
    place: "fort",
    job: "soldier",
    skill: "fighting",
    status: 2,
    wealth: 10,
    becomes: ["soldier", 2],
  },
  master: {
    jobs: ["craftsman", "millhand"],
    doing: ["at the forge", "at the bench", "setting the saw"],
    title: "Master craftsman",
    native: false,
    place: "workshop",
    job: "craftsman",
    skill: "craft",
    status: 2,
    wealth: 25,
    becomes: ["craftsman", 2],
  },
  printer: {
    jobs: ["newsman"],
    doing: ["setting type", "at the press", "reading proofs"],
    title: "Printer",
    native: false,
    place: "press",
    job: "newsman",
    skill: "letters",
    status: 3,
    wealth: 20,
    becomes: ["newsman", 3],
  },
  planter: {
    jobs: ["farmer"],
    doing: ["overseeing the fields", "counting hogsheads", "walking the rows"],
    title: "Planter",
    native: false,
    place: "fields",
    job: "farmer",
    skill: "farming",
    status: 4,
    wealth: 50,
    becomes: ["farmer", 3],
  },
  physician: {
    jobs: ["physician"],
    doing: ["mixing physic", "bleeding a patient", "reading Galen"],
    title: "Physician",
    native: false,
    place: "apothecary",
    job: "physician",
    skill: "medicine",
    status: 3,
    wealth: 30,
    becomes: ["physician", 2],
  },
  official: {
    jobs: ["official"],
    doing: ["at the secretary's desk", "sealing letters", "keeping the rolls"],
    title: "Secretary",
    native: false,
    place: "governor",
    job: "official",
    skill: "letters",
    status: 5,
    wealth: 40,
    becomes: ["official", 2],
  },
  lawyer: {
    jobs: ["law"],
    doing: ["drawing up a deed", "pleading a case", "reading the statutes"],
    title: "Attorney",
    native: false,
    place: "governor",
    job: "law",
    skill: "persuasion",
    status: 4,
    wealth: 35,
    becomes: ["law", 2],
  },
  sachem: {
    jobs: ["speaker"],
    doing: ["presiding at the fire", "hearing a dispute", "receiving visitors"],
    title: "Sachem",
    native: true,
    place: "councilfire",
    job: "speaker",
    skill: "persuasion",
    status: 5,
    wealth: 20,
    becomes: ["speaker", 2],
  },
  warleader: {
    jobs: ["warrior"],
    doing: ["with the young men", "making arrows", "telling of old raids"],
    title: "War leader",
    native: true,
    place: "councilfire",
    job: "warrior",
    skill: "fighting",
    status: 4,
    wealth: 10,
    becomes: ["warrior", 2],
  },
  healer: {
    jobs: ["healer"],
    doing: ["tending the sick", "drying herbs", "singing over a patient"],
    title: "Healer",
    native: true,
    place: "village",
    job: "healer",
    skill: "medicine",
    status: 3,
    wealth: 8,
    becomes: ["healer", 2],
  },
  hunter: {
    jobs: ["hunter"],
    doing: ["dressing hides", "reading tracks", "mending snares"],
    title: "Hunt leader",
    native: true,
    place: "woods",
    job: "hunter",
    skill: "woodcraft",
    status: 2,
    wealth: 8,
    becomes: ["hunter", 2],
  },
  elder: {
    jobs: ["grower"],
    doing: [
      "among the corn hills",
      "sorting seed",
      "directing the women's work",
    ],
    title: "Clan mother",
    native: true,
    place: "fields",
    job: "grower",
    skill: "farming",
    status: 4,
    wealth: 10,
    becomes: ["grower", 2],
  },
  trader: {
    jobs: ["trader", "trapper"],
    doing: ["laying out trade goods", "counting furs", "bargaining"],
    title: "Trader",
    native: true,
    place: "village",
    job: "trader",
    skill: "trade",
    status: 3,
    wealth: 30,
    becomes: ["trader", 1],
  },
  maker: {
    jobs: ["maker"],
    doing: ["shaping a canoe", "firing pots", "weaving a basket"],
    title: "Master maker",
    native: true,
    place: "village",
    job: "maker",
    skill: "craft",
    status: 2,
    wealth: 10,
    becomes: ["maker", 2],
  },
  soldier: {
    title: "Private soldier",
    native: false,
    place: "fort",
    job: null,
    doing: [
      "on guard",
      "cleaning his musket",
      "at drill",
      "dicing in the guardroom",
    ],
    skill: "fighting",
    status: 1,
    wealth: 3,
    becomes: ["soldier", 0],
  },
  sailor: {
    title: "Seaman",
    native: false,
    place: "docks",
    job: null,
    doing: [
      "mending sail",
      "hauling cargo",
      "splicing rope",
      "spinning a yarn",
    ],
    skill: "seamanship",
    status: 1,
    wealth: 4,
    becomes: ["sailor", 1],
  },
  labourer: {
    title: "Labourer",
    native: false,
    place: "fields",
    job: null,
    doing: ["hoeing", "hauling", "mending a fence", "carting dung"],
    skill: "farming",
    status: 1,
    wealth: 2,
    becomes: ["farmer", 0],
  },
  youngwarrior: {
    title: "Young warrior",
    native: true,
    place: "councilfire",
    job: null,
    doing: ["practising with the bow", "racing the others", "boasting"],
    skill: "fighting",
    status: 1,
    wealth: 2,
    becomes: ["warrior", 1],
  },
  ...MORE_ROLES,
};

/** The trades a role takes people on for. */
export function roleJobs(role: RoleId | undefined): JobKind[] {
  if (!role) return [];
  const r = ROLES[role];
  const old = r.jobs ?? (r.job ? [r.job] : []);
  // LIFE (r11): the new trades, taken on by the same masters.
  const more = MORE_ROLE_JOBS[role];
  return more ? [...old, ...more] : old;
}

/** Townsfolk kept per province, at most (LIFE r11: room for the constable and the fence). */
export const LOCALS_CAP = 14;

// ---------------------------------------------------------------- places

export interface PlaceDef {
  name: string;
  /** What it's called in a native village, if different. */
  nativeName?: string;
  text: string;
}

export const PLACES: Record<PlaceKind, PlaceDef> = {
  tavern: {
    name: "The tavern",
    text: "Ale, gossip, cards and candidates. Every rumour in the province passes through.",
  },
  market: {
    name: "The market",
    nativeName: "The trading ground",
    text: "Goods bought and sold, debts made and paid, and a merchant or two to work for.",
  },
  church: {
    name: "The church",
    text: "Sunday sermons, Monday gossip, and the town's poor fed at the door.",
  },
  councilfire: {
    name: "The council fire",
    text: "Where the elders sit, speakers speak, and war and peace are decided.",
  },
  docks: {
    name: "The docks",
    text: "Ships in from Europe and the islands, passage to anywhere, and work hauling cargo.",
  },
  fort: {
    name: "The fort",
    text: "The garrison, the drill yard and the recruiting sergeant.",
  },
  workshop: {
    name: "The workshops",
    text: "Smithies, sawmills, ropewalks and cooperages. Hard work, steady pay.",
  },
  press: {
    name: "The printing house",
    text: "Gazettes, almanacs, sermons and seditious pamphlets.",
  },
  fields: {
    name: "The fields",
    text: "Corn, tobacco, wheat or cane: planting and harvest, and land for sale.",
  },
  governor: {
    name: "The governor's house",
    text: "Petitions, appointments, levees and the courthouse. Power lives here.",
  },
  village: {
    name: "The village",
    text: "Longhouses or wigwams, cookfires, makers at work and children at play.",
  },
  woods: {
    name: "The woods",
    text: "Deer, beaver, herbs, and paths only some can follow.",
  },
  apothecary: {
    name: "The apothecary",
    text: "Physic, bark for fevers, and a physician who may need an apprentice.",
  },
  home: {
    name: "Home",
    nativeName: "Your lodge",
    text: "Your own fire, your own people, and nobody's business but yours.",
  },
  ...MORE_PLACES,
};

// ---------------------------------------------------------------- property

export interface HouseDef {
  name: string;
  cost: number;
  /** Coins a month to keep it up. */
  upkeep: number;
  /** Renown a month, from being seen to live there. */
  renown: number;
  /** Stress a month (a good roof eases the mind). */
  stress: number;
  health: number;
}

/** Houses, from a cottage to a mansion (level 1 to 4). */
export const HOUSES: HouseDef[] = [
  { name: "Cottage", cost: 20, upkeep: 0.2, renown: 0, stress: -1, health: 0 },
  { name: "House", cost: 60, upkeep: 0.6, renown: 0.1, stress: -2, health: 0 },
  {
    name: "Fine house",
    cost: 160,
    upkeep: 1.6,
    renown: 0.3,
    stress: -3,
    health: 1,
  },
  { name: "Mansion", cost: 400, upkeep: 4, renown: 0.6, stress: -4, health: 1 },
];

/** Native families build their own: a bark lodge, a longhouse of your own. */
export const LODGES: HouseDef[] = [
  { name: "Wigwam", cost: 4, upkeep: 0.1, renown: 0, stress: -1, health: 0 },
  { name: "Lodge", cost: 12, upkeep: 0.2, renown: 0.1, stress: -2, health: 0 },
  {
    name: "Longhouse",
    cost: 30,
    upkeep: 0.4,
    renown: 0.3,
    stress: -3,
    health: 1,
  },
  {
    name: "Great longhouse",
    cost: 70,
    upkeep: 0.8,
    renown: 0.5,
    stress: -4,
    health: 1,
  },
];

/** Land in lots of ten acres: what a lot costs, and rents from tenants a month. */
export const LAND_LOT = { cost: 22, rent: 0.3, upkeep: 0.05, max: 20 };

/** A hired hand: their wage a month, and the takings they bring in. */
export const HAND_WAGE = 2;
export const HAND_TAKINGS = 3.2;
/** Hands a business can use at each size; and what growing it costs. */
export const BUSINESS_HANDS = [0, 2, 4, 7];
export const EXPAND_COST = [0, 45, 120];

/** Gifts to the town: what they cost, and what they bring. */
export const ENDOWMENTS: Record<
  string,
  { label: string; cost: number; renown: number; favor: number; text: string }
> = {
  church: {
    label: "Endow the church",
    cost: 25,
    renown: 4,
    favor: 1,
    text: "A new bell, a silver cup, or a roof that doesn't leak. Your name on a brass plate.",
  },
  school: {
    label: "Found a free school",
    cost: 60,
    renown: 8,
    favor: 3,
    text: "A schoolmaster and a room for the children of the poor. They'll learn to read your name first.",
  },
  road: {
    label: "Pay for the road to be mended",
    cost: 35,
    renown: 5,
    favor: 2,
    text: "Gravel, ditches and a bridge that won't drown anyone. Every carter blesses you.",
  },
  feast: {
    label: "Give a feast for the village",
    cost: 15,
    renown: 4,
    favor: 1,
    text: "Venison, corn and maple sugar for everyone. Generosity is how standing is measured here.",
  },
};

// ---------------------------------------------------------------- living

export const LIFESTYLES: Lifestyle[] = [
  "frugal",
  "modest",
  "comfortable",
  "genteel",
  "grand",
];

export interface LifestyleDef {
  name: string;
  /** Among native peoples standing is measured by what you give. */
  nativeName: string;
  nativeText: string;
  /** Coins a month, for colonists and for native peoples (who share more). */
  cost: number;
  nativeCost: number;
  health: number;
  stress: number;
  renown: number;
  text: string;
}

export const LIFESTYLE: Record<Lifestyle, LifestyleDef> = {
  frugal: {
    name: "Frugal",
    nativeName: "Sparing",
    nativeText: "Little but what the day brings in. Saves; wears you down.",
    cost: 1,
    nativeCost: 0.5,
    health: -1,
    stress: 2,
    renown: 0,
    text: "Bread, beer and a straw bed. Saves money; wears you down.",
  },
  modest: {
    name: "Modest",
    nativeName: "Modest",
    nativeText: "Enough for your own fire and your family.",
    cost: 2,
    nativeCost: 1,
    health: 0,
    stress: 0,
    renown: 0,
    text: "Enough of everything, and a Sunday coat.",
  },
  comfortable: {
    name: "Comfortable",
    nativeName: "Comfortable",
    nativeText: "A full kettle, warm furs, and a fire anyone may sit at.",
    cost: 5.5,
    nativeCost: 2.5,
    health: 1,
    stress: -3,
    renown: 0.5,
    text: "Good food, a warm house and a servant. People notice.",
  },
  genteel: {
    name: "Genteel",
    nativeName: "Generous",
    nativeText:
      "Your kettle feeds half the village and gifts go out with every visitor. Expected of those who lead.",
    cost: 10,
    nativeCost: 4.5,
    health: 1,
    stress: -4,
    renown: 0.9,
    text: "A wig from London, wine at dinner, servants in livery, a seat at the assembly balls. Expected of the better sort.",
  },
  grand: {
    name: "Grand",
    nativeName: "Open-handed",
    nativeText:
      "Feasts, and wampum, cloth and kettles for every guest: nobody leaves your fire with empty hands. Expected of the great.",
    cost: 19,
    nativeCost: 8,
    health: 1,
    stress: -5,
    renown: 1.4,
    text: "Silver plate, a coach and four, a great table every night and half the colony at it. Expected of the great.",
  },
};

/** A way of living as it's known among your people: its name, words and cost. */
export function livingOf(
  native: boolean,
  l: Lifestyle,
): { name: string; text: string; cost: number } {
  const d = LIFESTYLE[l];
  return native
    ? { name: d.nativeName, text: d.nativeText, cost: d.nativeCost }
    : { name: d.name, text: d.text, cost: d.cost };
}

/** A wife and children cost something too: per head, a month (times the way you live). */
export const FAMILY_COST = 0.3;
export const FAMILY_MULT: Record<Lifestyle, number> = {
  frugal: 0.6,
  modest: 1,
  comfortable: 1.25,
  genteel: 1.5,
  grand: 2,
};

// ---------------------------------------------------------------- station

/**
 * Where you stand: labouring folk, the middling sort, gentlefolk, the better
 * sort, the great. Your work, offices, renown and house set it, and it sets
 * how people expect you to live. Living beneath it costs stress and renown.
 */
export const STATION_NAMES = [
  "labouring folk",
  "the middling sort",
  "gentlefolk",
  "the better sort",
  "the great",
];
/** The same, among native peoples. */
export const NATIVE_STATION_NAMES = [
  "the ordinary folk",
  "the respected",
  "those of standing",
  "those of high standing",
  "the great",
];
/** A rung paying this much a month or more puts you a station up. */
export const STATION_WAGE = [3, 7, 13, 21];
/** The way of living expected at each station. */
export const STATION_LIFESTYLE: Lifestyle[] = [
  "frugal",
  "modest",
  "comfortable",
  "genteel",
  "grand",
];
/** The house expected at each station: a roof of your own, a fine house, a mansion. */
export const STATION_HOUSE = [0, 0, 1, 3, 4];
/** How you're expected to live, said that way: "comfortably". */
export const LIVING_HOW: Record<Lifestyle, string> = {
  frugal: "frugally",
  modest: "modestly",
  comfortable: "comfortably",
  genteel: "genteelly",
  grand: "grandly",
};
/** A month beneath your station, for each step beneath. */
export const BENEATH_STRESS = 3;
export const BENEATH_RENOWN = 0.4;

// ---------------------------------------------------------------- dues

/** Tithes and church rates: a share of what you earn (Christian colonists). */
export const TITHE = 0.06;
/** The colony's taxes on what you earn, by its tax level (low, normal, high). */
export const TAX_RATES = [0.02, 0.04, 0.07];
/** Rates on a house, a month, by its size. */
export const HOUSE_RATES = [0.1, 0.25, 0.6, 1.2];
/** Excise and duties on a business's takings. */
export const EXCISE = 0.08;
/** A business's upkeep a month by its size (a ship costs more to keep). */
export const BUSINESS_UPKEEP = [0, 0.8, 2, 4];
export const SHIP_UPKEEP_MULT = 1.8;

// ---------------------------------------------------------------- things to buy

export interface KitDef {
  name: string;
  /** Coins to buy (natives pay less: trade goods). */
  cost: number;
  /** Coins a month to keep. */
  upkeep: number;
  /** Days it lasts (tools wear out), or 0 for as long as you keep it. */
  lasts: number;
  /** Colonists only. */
  colonist?: boolean;
  text: string;
}

export const KIT: Record<KitKey, KitDef> = {
  tools: {
    name: "Good tools",
    cost: 8,
    upkeep: 0,
    lasts: 5 * 365,
    text: "The best tools of your trade: a point of skill in it for five years.",
  },
  horse: {
    name: "A horse",
    cost: 25,
    upkeep: 0.6,
    lasts: 0,
    text: "Ride rather than walk: overland journeys take two thirds the time. Fodder and the farrier cost something every month.",
  },
  carriage: {
    name: "A carriage",
    cost: 140,
    upkeep: 2.5,
    lasts: 0,
    colonist: true,
    text: "A coach and pair, a coachman, and the road to yourself: journeys take half the time, people notice you pass, and it does half the work of living genteelly.",
  },
  pew: {
    name: "A pew of your own",
    cost: 4,
    upkeep: 0.5,
    lasts: 0,
    colonist: true,
    text: "Your own box pew near the pulpit, with your name on the door. Seen every Sunday, at peace with the parish.",
  },
};

/** Journeys overland go this much faster mounted. */
export const HORSE_PACE = 1.5;
export const CARRIAGE_PACE = 2;

/** A tutor or a master paid to teach you: coins, experience, and how often. */
export const LESSONS = { cost: 10, xp: 30, cooldown: 60 };

/** A cargo ventured: the stake by station, and what can come of it. */
export const VENTURE_STAKES = [10, 20, 40, 80, 160];
export const VENTURE_DAYS = [120, 300];
/** Lost, a poor market, a fair one, a rich one: chance and what it returns. */
export const VENTURE_LUCK: { p: number; x: number; text: string }[] = [
  { p: 0.14, x: 0, text: "lost at sea" },
  { p: 0.24, x: 0.6, text: "sold into a glutted market" },
  { p: 0.42, x: 1.35, text: "sold at a fair price" },
  { p: 0.2, x: 2.1, text: "sold for a fortune" },
];
/** In wartime privateers take more ships. */
export const VENTURE_WAR_LOSS = 0.26;
/** Shares in a company: the stake by station (none for labouring folk). */
export const SHARE_STAKES = [0, 25, 50, 100, 200];
/** A month: dividends, how far the price swings, and the chance of a crash. */
export const SHARE_DIVIDEND = 0.005;
export const SHARE_SWING = [-0.045, 0.055];
export const SHARE_CRASH = 0.004;
export const MAX_VENTURES = 4;

/** A dinner (or a ball) for the town, by station. */
export const DINNER_COST = [5, 10, 20, 40, 80];

/** A headright: fifty acres for the patent fees, if the governor will. */
export const LAND_GRANT = { fee: 20, lots: 5, opinion: 15, every: 3 * 365 };

/** Great works for the town: cost, renown, the crown's favour, and who may. */
export const WORKS: Record<
  string,
  {
    label: string;
    cost: number;
    renown: number;
    favor: number;
    /** Renown needed to be taken seriously. */
    need: number;
    text: string;
  }
> = {
  almshouse: {
    label: "Build an almshouse",
    cost: 150,
    renown: 12,
    favor: 2,
    need: 0,
    text: "Twelve rooms for the old and the poor, and a plaque with your name over the door.",
  },
  church: {
    label: "Build a church",
    cost: 260,
    renown: 20,
    favor: 4,
    need: 20,
    text: "Brick, a steeple, a bell from England. They'll call it after you, or after a saint, which comes to the same thing.",
  },
  college: {
    label: "Found a college",
    cost: 600,
    renown: 40,
    favor: 10,
    need: 50,
    text: "A charter, a hall, a library and a president in a gown. Your name on the gate for as long as there are students to walk under it.",
  },
};

/** What a child takes into a marriage from a family of each station. */
export const PORTIONS = [3, 10, 30, 80, 200];
/** What your own wedding costs, by station. */
export const WEDDINGS = [4, 8, 20, 50, 120];

/** Health and stress run 0 to 100. */
export const START_HEALTH = 85;
export const START_STRESS = 15;
/** Stress at which things start to go wrong. */
export const STRESS_HIGH = 70;
/** Renown at which a character is noticed by people of rank. */
export const RENOWN_NOTICED = 20;

// ---------------------------------------------------------------- travel

/** People on foot cover more ground than an army. */
export const WALK_SPEED = 1.25;
/** Food and lodging on the road, a day. */
export const ROAD_COST_PER_DAY = 0.12;
/** A passage by sea: a base fare and so much per 100 km. */
export const SEA_FARE_BASE = 2;
export const SEA_FARE_PER_100KM = 0.8;
/** The longest single passage by sea along the coast. */
export const SEA_PASSAGE_KM = 1600;
/** Days and coins to sail to Europe and set yourself up there. */
export const EUROPE_PASSAGE = 25;
export const EUROPE_FORTUNE = 300;

/** Chance a day of something happening on the road. */
export const ROAD_RISK = {
  base: 0.006,
  wild: 0.012,
  hostile: 0.02,
  sea: 0.008,
};

// ---------------------------------------------------------------- checks and people

/**
 * The chance a skill check succeeds: 60% at equal skill and difficulty,
 * 7% a point either way, never certain and never hopeless.
 */
export function checkChance(skill: number, difficulty: number): number {
  return Math.max(0.08, Math.min(0.95, 0.6 + (skill - difficulty) * 0.07));
}

/** Days before the same thing can be done again with the same person. */
export const PERSON_COOLDOWN = 30;
/** Opinion at which someone counts as a friend, or a rival. */
export const FRIEND = 40;
export const RIVAL = -40;
/** Opinion needed before someone will marry you. */
export const MARRY_OPINION = 45;
/** What a wedding costs. */
export const WEDDING_COST = 8;
/** Opinion a patron needs of you. */
export const PATRON_OPINION = 40;

// ---------------------------------------------------------------- arms

export const TINCTURES: Record<Tincture, { name: string; color: string }> = {
  or: { name: "Or (gold)", color: "#d9a72e" },
  argent: { name: "Argent (silver)", color: "#efe9dc" },
  gules: { name: "Gules (red)", color: "#b3242a" },
  azure: { name: "Azure (blue)", color: "#2a5aa8" },
  vert: { name: "Vert (green)", color: "#2f7a3d" },
  sable: { name: "Sable (black)", color: "#262019" },
  purpure: { name: "Purpure (purple)", color: "#6e3a7f" },
  tenne: { name: "Tenné (orange)", color: "#c8682a" },
};

export const DIVISIONS: Record<Division, string> = {
  plain: "Plain",
  pale: "Per pale",
  fess: "Per fess",
  bend: "Per bend",
  chevron: "A chevron",
  quarterly: "Quarterly",
  saltire: "A saltire",
  cross: "A cross",
  chief: "A chief",
};

export const CHARGES: Record<Charge, string> = {
  none: "None",
  star: "A mullet (star)",
  lion: "A lion",
  fleur: "A fleur-de-lis",
  anchor: "An anchor",
  tree: "A tree",
  ship: "A ship",
  key: "A key",
  crescent: "A crescent",
  heart: "A heart",
  bird: "A martlet",
  wheat: "A garb (sheaf)",
  tower: "A tower",
  sword: "A sword",
  beaver: "A beaver",
  turtle: "A turtle",
  wolf: "A wolf",
  bear: "A bear",
  deer: "A deer",
  feather: "A feather",
};

/** Clan signs native characters choose from. */
export const CLAN_CHARGES: Charge[] = [
  "turtle",
  "wolf",
  "bear",
  "deer",
  "bird",
  "beaver",
  "feather",
  "crescent",
  "star",
];

/** Frame ribbon and dress colours to choose from. */
export const FRAME_COLORS: string[] = [
  "#7a1f1c",
  "#1f3f73",
  "#2f5a33",
  "#5a2d6b",
  "#2b2420",
  "#a0702a",
  "#8c4a24",
  "#3e6d78",
];

export const MOTTO_MAX = 60;

// ---------------------------------------------------------------- native names

/** Personal names for native characters (from period records, many nations). */
export const NATIVE_NAMES = {
  male: [
    "Wahunsenacawh",
    "Opechancanough",
    "Massasoit",
    "Metacom",
    "Canonicus",
    "Miantonomo",
    "Uncas",
    "Tisquantum",
    "Samoset",
    "Wingina",
    "Manteo",
    "Wanchese",
    "Kiotseaeton",
    "Garakontié",
    "Teganissorens",
    "Theyanoguin",
    "Thayendanegea",
    "Obwandiyag",
    "Attakullakulla",
    "Oconostota",
    "Ostenaco",
    "Tomochichi",
    "Chekilli",
    "Kondiaronk",
    "Po'pay",
    "Ayenwatha",
    "Annawon",
    "Ninigret",
    "Tamanend",
    "Shingas",
    "Tanaghrisson",
    "Scarouady",
    "Pemisapan",
    "Nemattanew",
    "Sassacus",
    "Mishikinakwa",
    "Askuwheteau",
    "Paspahegh",
    "Totopotomoy",
    "Necotowance",
    "Hobomok",
    "Wequash",
    "Sagamore",
    "Teedyuscung",
  ],
  female: [
    "Matoaka",
    "Weetamoo",
    "Awashonks",
    "Quaiapen",
    "Nanyehi",
    "Tekakwitha",
    "Cockacoeske",
    "Coosaponakeesa",
    "Kanenstenhawi",
    "Oninoa",
    "Nonhelema",
    "Aliquippa",
    "Wanetta",
    "Wahbanosay",
    "Tahmeroo",
    "Mattachanna",
    "Wonnesha",
    "Ahyoka",
    "Tsiyahi",
    "Onita",
    "Wenonah",
    "Chepi",
  ],
};

/** Clans, which pass from mother to child in many nations. */
export const NATIVE_CLANS = [
  "Turtle",
  "Wolf",
  "Bear",
  "Deer",
  "Heron",
  "Beaver",
  "Hawk",
  "Snipe",
  "Eel",
  "Bird",
  "Paint",
  "Long Hair",
  "Potato",
  "Wind",
];

/** A native family name: "of the Turtle clan". */
export function clanName(clan: string): string {
  return `of the ${clan} clan`;
}

// ---------------------------------------------------------------- coins

/** Derp Coins for a seat's line. Tuned to land where the old game did. */
export const LIFE_COINS = {
  /** Game days a seat must have played for coins at all. */
  minDays: 730,
  played: 5,
  perTenYears: 2,
  maxYears: 12,
  perRank: 2,
  maxRank: 14,
  office: [0, 4, 8, 15] as readonly number[],
  perTenRenown: 1,
  maxRenown: 12,
  perGeneration: 3,
  maxGenerations: 12,
  perChild: 0.5,
  maxChildren: 5,
  perBattleWon: 1,
  maxBattles: 10,
  risingWon: 8,
  europe: 6,
  reached1776: 5,
} as const;
