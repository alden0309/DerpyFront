// Derpy Conquest: the shapes of the map, the game state, player commands
// and what the game reports back. The state is plain JSON so the server can
// save it, send it to players as-is, and players' browsers can run the same
// queries on their copy.

export type Terrain =
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "jungle"
  | "desert"
  | "marsh"
  | "tundra";

/** Everything the colonies make, eat, wear, ship and shoot. */
export type Good =
  | "grain"
  | "fish"
  | "furs"
  | "tobacco"
  | "sugar"
  | "timber"
  | "silver"
  | "tools"
  | "guns"
  | "cloth";

export const GOODS: readonly Good[] = [
  "grain",
  "fish",
  "furs",
  "tobacco",
  "sugar",
  "timber",
  "silver",
  "tools",
  "guns",
  "cloth",
];

/** Goods that come out of the land (a province's resource is one of these). */
export type RawGood =
  | "grain"
  | "fish"
  | "furs"
  | "tobacco"
  | "sugar"
  | "timber"
  | "silver";

/** The old map's goods, as written in americas.json. */
export type MapGood = RawGood | "cotton" | "cattle";

/** A neighbour: [province, km between them, crosses a river, across a strait]. */
export type Neighbour = [number, number, number, number];

export interface ProvinceDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Where the name and armies are drawn, in map units. */
  x: number;
  y: number;
  terrain: Terrain;
  good: MapGood;
  areaKm2: number;
  coastal: boolean;
  /** Who holds it at the start: a power or native nation key, or null. */
  owner: string | null;
  nb: Neighbour[];
  /** Coastal provinces reachable by sea: [province, km], nearest first. */
  sea: [number, number][];
}

export interface PowerDef {
  id: string;
  name: string;
  adjective: string;
  color: string;
  provinces: number[];
}

export interface NativeDef {
  id: string;
  name: string;
  color: string;
  horse: boolean;
  strong: boolean;
  provinces: number[];
}

export interface MapDef {
  version: number;
  width: number;
  height: number;
  /** The longest crossing an army can make by sea. */
  seaLaneKm: number;
  provinces: ProvinceDef[];
  powers: PowerDef[];
  natives: NativeDef[];
}

// ---------------------------------------------------------------- explaining

/** One cause of a number: "+3 Governor's stewardship". */
export interface Part {
  label: string;
  value: number;
  /** A multiplier (×1.2) rather than an amount added. */
  mul?: boolean;
}

/** A number together with everything that made it. */
export interface Breakdown {
  total: number;
  parts: Part[];
}

// ---------------------------------------------------------------- characters

export type Stat = "dip" | "mar" | "ste" | "int" | "lea";
export const STATS: readonly Stat[] = ["dip", "mar", "ste", "int", "lea"];
export type Stats = Record<Stat, number>;

export type TraitId =
  | "ambitious"
  | "content"
  | "honest"
  | "deceitful"
  | "brave"
  | "craven"
  | "greedy"
  | "generous"
  | "diligent"
  | "lazy"
  | "zealous"
  | "tolerant"
  | "just"
  | "cruel"
  | "robust"
  | "sickly"
  | "educated"
  | "charming";

export type Seat = "treasurer" | "marshal" | "envoy" | "spymaster" | "chaplain";
export const SEATS: readonly Seat[] = [
  "treasurer",
  "marshal",
  "envoy",
  "spymaster",
  "chaplain",
];

export type Ambition = "governorship" | "wealth" | "glory" | "faith" | "peace";

export type SchemeKind = "slander" | "embezzle" | "incite" | "murder";

export interface Scheme {
  kind: SchemeKind;
  /** Whose governor it's aimed at. */
  target: number;
  started: number;
  /** 0 to 100; it happens at 100. */
  progress: number;
  /** Found out: the governor knows, and can act. */
  exposed: boolean;
}

/** Something a character remembers about another, for or against. */
export interface Memory {
  /** Who it's about (character id), or -1 for the governor's office. */
  of: number;
  why: string;
  value: number;
  /** Day it's forgotten; 0 = never. */
  until: number;
}

export interface Character {
  id: number;
  first: string;
  family: string;
  /** Shown instead of a personal name (e.g. "the Mamanatowick"). */
  title: string | null;
  female: boolean;
  /** Day they were born (negative: before 1 January 1607). */
  born: number;
  nation: number;
  culture: string;
  religion: Religion;
  stats: Stats;
  traits: TraitId[];
  alive: boolean;
  died: { day: number; cause: string } | null;
  spouse: number;
  father: number;
  mother: number;
  children: number[];
  ambition: Ambition | null;
  scheme: Scheme | null;
  memories: Memory[];
  /** Days a marriage or birth last happened, to space them. */
  lastBirth: number;
  /** A governor the player made (not generated). */
  made: boolean;
  /** The likeness the player chose for them (index into the portraits). */
  face?: number;
}

// ---------------------------------------------------------------- people

export type PopClass =
  | "laborers"
  | "artisans"
  | "merchants"
  | "gentry"
  | "clergy"
  | "tribe";

export const POP_CLASSES: readonly PopClass[] = [
  "laborers",
  "artisans",
  "merchants",
  "gentry",
  "clergy",
  "tribe",
];

export type Religion =
  | "anglican"
  | "puritan"
  | "catholic"
  | "reformed"
  | "lutheran"
  | "native";

export interface Pop {
  cls: PopClass;
  culture: string;
  religion: Religion;
  size: number;
  /** Savings in gold. */
  wealth: number;
  /** Share of needs met last month: [food, everyday, luxury], 0 to 1. */
  met: [number, number, number];
  /** Income last month, in gold. */
  income: number;
}

// ---------------------------------------------------------------- places

export type BuildingKind =
  | "farm"
  | "plantation"
  | "tradingpost"
  | "mine"
  | "lumbercamp"
  | "port"
  | "fort"
  | "smithy"
  | "gunsmith"
  | "weaver"
  | "church"
  | "courthouse";

/** A temporary effect from an event or decision. */
export interface Modifier {
  key: string;
  label: string;
  until: number;
  fx: Partial<Record<ModFx, number>>;
}

export type ModFx =
  | "unrest"
  | "production"
  | "tax"
  | "favor"
  | "colonists"
  | "admin"
  | "morale"
  | "growth"
  | "disease"
  | "opinion"
  | "autonomy";

export interface Province {
  /** Nation index, or -1 for open wilderness. */
  owner: number;
  /** A nation at war with the owner holding it, or -1. */
  occupier: number;
  pops: Pop[];
  /** Building levels. */
  b: Partial<Record<BuildingKind, number>>;
  build: { kind: BuildingKind; start: number; done: number } | null;
  /** A colony being founded: by whom, and the days it started and is done. */
  colony: { by: number; start: number; done: number } | null;
  recruits: { type: RegType; start: number; done: number }[];
  /** A siege under way: by whom, and how far along (0 to 100). */
  siege: { by: number; start: number; progress: number } | null;
  /** 0 to 100; revolt at 100. Set monthly from its causes. */
  unrest: number;
  /** War damage, 0 to 1; production is cut by it, and it heals. */
  devastation: number;
  /** Day it's fully part of its owner's realm; 0 if it is. */
  integrate: number;
  /** How worn out the fur grounds are, 0 to 1. */
  depletion: number;
  /** A palisade outpost someone built here (it may not own the land). */
  outpost: { by: number; since: number } | null;
  /** A rich seam, run or soil: +50% of its good. Found by exploring. */
  rich: boolean;
  /** What it made last month (for the economy view). */
  made: Partial<Record<Good, number>>;
  mods: Modifier[];
}

// ---------------------------------------------------------------- nations

export interface Market {
  /** Price of each good this month. */
  price: Record<Good, number>;
  /** In the warehouses, carried into next month. */
  stock: Record<Good, number>;
  /** Last month: made here, shipped in, and traded in from natives. */
  supply: Record<Good, number>;
  /** Last month: wanted by people, workshops and soldiers. */
  demand: Record<Good, number>;
  /** Last month, good by good: where it came from and where it went. */
  flow: GoodsFlow;
}

/** A month of goods: made here, used up (eaten, worn out, spoiled, built with), came in, went out. */
export interface GoodsFlow {
  made: Record<Good, number>;
  used: Record<Good, number>;
  /** Shipped in from Europe, traded in from natives or other nations. */
  came: Record<Good, number>;
  /** Shipped to Europe, traded away. */
  went: Record<Good, number>;
}

/** Ships crossing the Atlantic for one of the colonies. */
export interface Convoy {
  id: number;
  /** Port it sails from or back to. */
  port: number;
  /** Heading for Europe (true) or home to the colony (false). */
  out: boolean;
  departed: number;
  arrive: number;
  cargo: Partial<Record<Good, number>>;
  /** What the cargo cost in the colony (out) or in Europe (home). */
  paid: number;
  /** Outbound: what to buy in Europe for the trip home. */
  orders: Partial<Record<Good, number>>;
  /** Goods the governor bought in Europe (already paid for). */
  ordered?: boolean;
}

export interface LedgerLine {
  label: string;
  value: number;
}

export interface Ledger {
  income: LedgerLine[];
  spending: LedgerLine[];
  net: number;
}

export interface NationStats {
  coloniesFounded: number;
  battlesWon: number;
  battlesLost: number;
  provincesConquered: number;
  provincesLost: number;
  goldEarned: number;
  remitted: number;
  peakProvinces: number;
  peakPeople: number;
  landBought: number;
  /** Provinces held when the game began. */
  startProvinces: number;
}

export type TaxLevel = 0 | 1 | 2;

/** What the crown wants from a colony right now. */
export interface CrownDemand {
  key: "money" | "war" | "mission" | "levy";
  label: string;
  /** Gold, or a nation to fight, or a province for a mission. */
  amount: number;
  target: number;
  made: number;
  due: number;
}

export interface EventChoice {
  label: string;
  /** What it does, in words. */
  tip: string;
}

export interface PendingEvent {
  id: number;
  key: string;
  day: number;
  /** Day the council decides for you (the first choice) if you haven't. */
  expires: number;
  title: string;
  body: string;
  choices: EventChoice[];
  ctx: Record<string, number>;
}

/** A party sent into the wilds: to survey land, or to build an outpost. */
export interface Mission {
  id: number;
  kind: "explore" | "outpost";
  /** The character leading it. */
  leader: number;
  /** Where they set out from, and where they're going. */
  from: number;
  target: number;
  start: number;
  /** Day they reach the target, and the day they're home again. */
  arrive: number;
  home: number;
  /** Heading out, or on the way back. */
  stage: "out" | "back";
  /** Men in the party; hardship thins it, and at 0 it's lost. */
  men: number;
  /** Set when something on the way has already happened. */
  incident: boolean;
  /** The way there, province by province (from first, target last). */
  route: number[];
  /** For each hop of the route: by boat (true) or on foot. */
  sea: boolean[];
  /** Days each hop takes. */
  legs: number[];
}

/** One year's mark in a nation's history, for the end-of-game chart. */
export interface YearMark {
  year: number;
  provinces: number;
  settlers: number;
  gold: number;
  score: number;
}

/** Goods and gold changing hands between two nations. */
export interface TradeTerms {
  /** What the proposer hands over. */
  give: Partial<Record<Good, number>>;
  /** What the proposer gets. */
  get: Partial<Record<Good, number>>;
  /** Gold the proposer pays (negative: the other side pays). */
  gold: number;
}

export interface TradeOffer {
  id: number;
  from: number;
  to: number;
  day: number;
  terms: TradeTerms;
}

export type StartYear = 1607 | 1650 | 1700;

export interface Nation {
  id: number;
  key: string;
  /** A crown only enters play to crush a colony's rebellion. */
  kind: "power" | "native" | "crown";
  name: string;
  adjective: string;
  color: string;
  alive: boolean;
  /** Crowns: the colony they rule (-1 otherwise). */
  colony: number;
  /** The seat of the human playing it, or null for the computer. */
  player: string | null;
  playerName: string | null;
  culture: string;
  religion: Religion;
  /** Governor (powers) or chief (natives): a character id. */
  ruler: number;
  heir: number;
  council: Record<Seat, number>;
  /** Notables at court who could serve or scheme. */
  court: number[];
  gold: number;
  capital: number;
  horse: boolean;
  strong: boolean;

  // Powers.
  favor: number;
  autonomy: number;
  /** Share of income sent home to the crown, 0 to 0.5. */
  remit: number;
  independent: boolean;
  /** At war with its own crown for independence. */
  rebelling: boolean;
  rebellion: {
    since: number;
    /** Armies the crown has sent, and how many were beaten. */
    expeditions: number;
    beaten: number;
    /** Day the crown took the capital, or -1. */
    capitalLost: number;
  } | null;
  /** Royal honours: 0 none, 1 knight, 2 baronet, 3 baron, 4 earl. */
  title: number;
  tax: TaxLevel;
  /** Goods the governor won't let leave, or come in. */
  noExport: Good[];
  noImport: Good[];
  market: Market;
  convoys: Convoy[];
  /** Day the last convoy sailed for Europe. */
  lastConvoy: number;
  colonists: number;
  nextColonist: number;
  demand: CrownDemand | null;
  warExhaustion: number;

  /** How it feels about every other nation (memories, newest last). */
  relations: Record<number, Memory[]>;
  mods: Modifier[];
  events: PendingEvent[];
  /** Provinces this colony has surveyed (it knows what they yield). */
  explored: number[];
  /** Expeditions and outpost parties out in the wilds. */
  missions: Mission[];
  /** Natives: the colony they pay tribute to, or -1. */
  overlord: number;
  /** The big moments of its history, for the end of the game. */
  milestones: GameEvent[];
  /** How it stood on each 1 January. */
  yearly: YearMark[];
  /** Day each event key may fire again. */
  cooldowns: Record<string, number>;
  ledger: Ledger;
  stats: NationStats;
  /** Victory points, updated monthly. */
  score: number;
}

// ---------------------------------------------------------------- armies

export type RegType =
  | "militia"
  | "regulars"
  | "dragoons"
  | "artillery"
  | "warriors"
  | "riders";

export interface Regiment {
  type: RegType;
  men: number;
  /** 0 (broken) to 1 (fresh). */
  morale: number;
  /** The province the men were drafted from (they go home when disbanded). */
  home: number;
}

export interface Army {
  id: number;
  owner: number;
  /** Where it is, or where it's leaving from while on the move. */
  prov: number;
  regs: Regiment[];
  /** Provinces still to go to, next first. */
  path: number[];
  /** Day it left `prov` for path[0], or -1 when not moving. */
  depart: number;
  /** Day it reaches path[0]. */
  arrive: number;
  /** The current hop is by sea. */
  sea: boolean;
  /** Fleeing a lost battle: won't fight until it gets where it's going. */
  retreating: boolean;
  /** Day it arrived where it is (decides who defends in a battle). */
  arrived: number;
  /** Where it came from (-1 if raised here), for river crossings. */
  from: number;
  /** Leading it: a character, or -1. */
  commander: number;
  /** Food on hand, 0 (starving) to 1 (full wagons). */
  supply: number;
}

// ---------------------------------------------------------------- diplomacy

export interface War {
  a: number;
  b: number;
  /** Who declared it. */
  by: number;
  start: number;
  /** Why, in words ("Land encroachment", "War in Europe"). */
  why: string;
  /** Battles won and men lost by each side: [a's, b's]. */
  won: [number, number];
  lost: [number, number];
  /** Declared by the crowns in Europe. */
  europe: boolean;
}

export interface Truce {
  a: number;
  b: number;
  until: number;
}

export type TreatyKind = "trade" | "alliance" | "access";

export interface Treaty {
  kind: TreatyKind;
  a: number;
  b: number;
  since: number;
}

/** What a peace would settle: provinces each side hands over, and gold. */
export interface PeaceTerms {
  /** Provinces the receiver gives to the proposer. */
  take: number[];
  /** Provinces the proposer gives back to the receiver. */
  give: number[];
  /** Gold the receiver pays (negative: the proposer pays). */
  gold: number;
  /** A native receiver becomes the proposer's tributary. */
  subjugate?: boolean;
}

export interface PeaceOffer {
  id: number;
  from: number;
  to: number;
  day: number;
  terms: PeaceTerms;
}

export interface Marriage {
  a: number;
  b: number;
  day: number;
}

// ---------------------------------------------------------------- battles

export interface BattleFactor {
  label: string;
  /** Multiplier on that side's strength: 1.2 = +20%. */
  value: number;
}

export interface BattleSide {
  nations: number[];
  commander: string | null;
  regs: Partial<Record<RegType, number>>;
  men: number;
  lost: number;
  moraleEnd: number;
  factors: BattleFactor[];
  /** Fighting strength at the start: men × training × morale × factors. */
  power: number;
}

export interface BattleReport {
  id: number;
  day: number;
  prov: number;
  attacker: BattleSide;
  defender: BattleSide;
  /** Each day's fighting: what each side lost. */
  rounds: { lost: [number, number]; note: string | null }[];
  /** 0: the attacker won; 1: the defender held. */
  winner: 0 | 1;
  /** Luck with a name: the weather and commanders' moments. */
  luck: string[];
  outcome: "retreated" | "destroyed";
}

// ---------------------------------------------------------------- events

export type GameEvent =
  | { k: "colony"; day: number; n: number; p: number }
  | {
      k: "built";
      day: number;
      n: number;
      p: number;
      b: BuildingKind;
      lvl: number;
    }
  | { k: "raised"; day: number; n: number; p: number; t: RegType }
  | {
      k: "battle";
      day: number;
      id: number;
      p: number;
      a: number[];
      d: number[];
      w: 0 | 1;
    }
  | { k: "siege"; day: number; n: number; p: number; from: number }
  | { k: "occupied"; day: number; n: number; p: number; from: number }
  | { k: "freed"; day: number; n: number; p: number }
  | { k: "ceded"; day: number; n: number; p: number; from: number }
  | { k: "razed"; day: number; n: number; p: number; from: number }
  | { k: "war"; day: number; n: number; on: number; why: string }
  | { k: "peace"; day: number; n: number; with: number }
  | { k: "offer"; day: number; n: number; to: number }
  | { k: "refused"; day: number; n: number; by: number }
  | { k: "treaty"; day: number; n: number; with: number; t: TreatyKind }
  | { k: "untreaty"; day: number; n: number; with: number; t: TreatyKind }
  | {
      k: "bought";
      day: number;
      n: number;
      p: number;
      from: number;
      gold: number;
    }
  | { k: "gift"; day: number; n: number; to: number; gold: number }
  | { k: "fallen"; day: number; n: number; by: number }
  | { k: "colonists"; day: number; n: number; count: number }
  | { k: "convoy"; day: number; n: number; out: boolean; gold: number }
  | { k: "revolt"; day: number; n: number; p: number }
  | { k: "died"; day: number; n: number; c: number; cause: string }
  | { k: "born"; day: number; n: number; c: number }
  | { k: "married"; day: number; n: number; a: number; b: number }
  | { k: "succession"; day: number; n: number; c: number; how: string }
  | {
      k: "scheme";
      day: number;
      n: number;
      c: number;
      s: SchemeKind;
      done: boolean;
    }
  | { k: "story"; day: number; n: number; title: string; text: string }
  | { k: "crown"; day: number; n: number; text: string }
  | { k: "europe"; day: number; a: number; b: number; war: boolean }
  | { k: "independence"; day: number; n: number; won: boolean | null }
  | { k: "over"; day: number; winner: number }
  | {
      k: "mission";
      day: number;
      n: number;
      p: number;
      kind: "explore" | "outpost";
      /** "back" (home safe), "done" (arrived), "lost" (never came back). */
      result: "done" | "back" | "lost";
      c: number;
      text: string;
    }
  | {
      k: "deal";
      day: number;
      n: number;
      with: number;
      status: "done" | "refused" | "offered";
      terms: TradeTerms;
    }
  | { k: "tributary"; day: number; n: number; by: number; free: boolean }
  | { k: "abandoned"; day: number; n: number; p: number }
  | {
      k: "ordered";
      day: number;
      n: number;
      goods: Partial<Record<Good, number>>;
      gold: number;
    };

// ---------------------------------------------------------------- the game

export type Difficulty = "easy" | "normal" | "hard";

export interface GameSettings {
  /** The game ends on 1 January of this year. */
  endYear: number;
  difficulty: Difficulty;
  seed: number;
  /** The year it begins (1 January); 1607 if not given. */
  start?: StartYear;
}

/** The governor a player made before the game began. */
export interface GovernorPlan {
  first: string;
  family: string;
  female: boolean;
  age: "young" | "prime" | "seasoned";
  stats: Stats;
  traits: TraitId[];
  /** Which of the portraits for their nation, sex and age to wear. */
  face?: number;
}

export interface PlayerSeat {
  seat: string;
  name: string;
  /** Power key, e.g. "england". */
  power: string;
  governor: GovernorPlan | null;
}

export interface Europe {
  /** Price of each good on the home markets. */
  price: Record<Good, number>;
  /** How much of each good reached Europe lately (prices sag under it). */
  glut: Record<Good, number>;
  /** Tension between the crowns, by power index pair "a-b", 0 to 100. */
  tension: Record<string, number>;
  /** Crowns at war in Europe: "a-b" pairs and when it started. */
  wars: Record<string, number>;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  /** Days since 1 January 1607. */
  day: number;
  /** The day the game began. */
  startDay: number;
  endDay: number;
  rng: number;
  nextId: number;
  provinces: Province[];
  nations: Nation[];
  chars: Record<number, Character>;
  armies: Army[];
  wars: War[];
  truces: Truce[];
  treaties: Treaty[];
  offers: PeaceOffer[];
  /** Trade proposals waiting on another player. */
  deals: TradeOffer[];
  europe: Europe;
  /** Most recent battles, newest last. */
  battles: BattleReport[];
  over: boolean;
  winner: number;
}

// ---------------------------------------------------------------- commands

export type Command =
  | { k: "colonize"; p: number }
  | { k: "build"; p: number; b: BuildingKind }
  | { k: "recruit"; p: number; t: RegType }
  | { k: "move"; a: number; to: number }
  | { k: "stop"; a: number }
  | { k: "split"; a: number }
  | { k: "merge"; a: number; b: number }
  | { k: "disband"; a: number }
  | { k: "lead"; a: number; c: number }
  | { k: "war"; n: number }
  | { k: "peace"; n: number; terms: PeaceTerms }
  | { k: "answer"; offer: number; yes: boolean }
  | { k: "treaty"; n: number; t: TreatyKind }
  | { k: "untreaty"; n: number; t: TreatyKind }
  | { k: "gift"; n: number; gold: number }
  | { k: "buy"; p: number }
  | { k: "tax"; level: TaxLevel }
  | { k: "remit"; share: number }
  | { k: "ban"; good: Good; export: boolean; on: boolean }
  | { k: "appoint"; seat: Seat; c: number }
  | { k: "dismiss"; seat: Seat }
  | { k: "marry"; a: number; b: number }
  | { k: "confront"; c: number }
  | { k: "event"; id: number; choice: number }
  | { k: "demand"; pay: boolean }
  | { k: "independence" }
  | { k: "expedition"; c: number; p: number }
  | { k: "outpost"; c: number; p: number }
  | { k: "deal"; n: number; terms: TradeTerms }
  | { k: "dealAnswer"; deal: number; yes: boolean }
  | { k: "order"; goods: Partial<Record<Good, number>> }
  | { k: "abandon"; p: number }
  | { k: "tribute"; n: number }
  | { k: "release"; n: number };

/** What changed since the last delta, for sending to players. */
export interface GameDelta {
  day: number;
  prov?: Record<number, Province>;
  /** Changed armies; null means it's gone. */
  armies?: Record<number, Army | null>;
  nations?: Record<number, Nation>;
  chars?: Record<number, Character>;
  wars?: War[];
  truces?: Truce[];
  treaties?: Treaty[];
  offers?: PeaceOffer[];
  deals?: TradeOffer[];
  europe?: Europe;
  battles?: BattleReport[];
  events?: GameEvent[];
  over?: { winner: number };
}
