// Derpy Conquest: the shapes of the map, the game state, player commands
// and what the game reports back. The state is plain JSON so the server can
// send it to players as-is and players' browsers can run the same queries
// on their copy.

export type Terrain =
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "jungle"
  | "desert"
  | "marsh"
  | "tundra";

export type Good =
  | "tobacco"
  | "sugar"
  | "furs"
  | "silver"
  | "cotton"
  | "grain"
  | "fish"
  | "timber"
  | "cattle";

export const GOODS: readonly Good[] = [
  "silver",
  "sugar",
  "tobacco",
  "furs",
  "cotton",
  "fish",
  "cattle",
  "timber",
  "grain",
];

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
  good: Good;
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

// ---------------------------------------------------------------- state

export type RegType = "inf" | "cav" | "art" | "war" | "horse";
export type BuildingKind = "farm" | "port" | "fort";
export type Difficulty = "easy" | "normal" | "hard";

export interface Regiment {
  type: RegType;
  men: number;
  /** 0 (broken) to 1 (fresh). */
  morale: number;
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
}

export interface Province {
  /** Nation index, or -1 for open wilderness. */
  owner: number;
  /** Settlers (in a power's province). */
  pop: number;
  /** Native people living there. */
  natives: number;
  farm: number;
  port: number;
  fort: number;
  /** Building under way: what, and the days it started and is done. */
  build: { kind: BuildingKind; start: number; done: number } | null;
  /** A colony being founded: by whom, and the days it started and is done. */
  colony: { by: number; start: number; done: number } | null;
  /** Regiments being raised here. */
  recruits: { type: RegType; start: number; done: number }[];
  /** A siege under way: by whom, and the day the province falls. */
  siege: { by: number; start: number; done: number } | null;
}

export interface NationStats {
  coloniesFounded: number;
  battlesWon: number;
  battlesLost: number;
  provincesConquered: number;
  provincesLost: number;
  goldEarned: number;
  peakProvinces: number;
  landBought: number;
}

export interface MonthlyLedger {
  goods: number;
  tax: number;
  trade: number;
  crown: number;
  upkeep: number;
  total: number;
}

export interface Nation {
  id: number;
  key: string;
  kind: "power" | "native";
  name: string;
  adjective: string;
  color: string;
  alive: boolean;
  /** The seat of the human playing it, or null for the computer. */
  player: string | null;
  playerName: string | null;
  gold: number;
  manpower: number;
  colonists: number;
  /** Day the next colonist arrives from home (powers). */
  nextColonist: number;
  capital: number;
  /** Natives only: how they feel about each power, by its id (-100 to 100). */
  opinion: number[];
  horse: boolean;
  strong: boolean;
  stats: NationStats;
  ledger: MonthlyLedger;
  /** Victory points, updated monthly. */
  score: number;
}

export interface War {
  a: number;
  b: number;
  /** Who declared it. */
  by: number;
  start: number;
  /** Provinces each side has taken: [a's, b's]. */
  gains: [number, number];
}

export interface Truce {
  a: number;
  b: number;
  until: number;
}

export interface TradeDeal {
  power: number;
  native: number;
  since: number;
}

export interface PeaceOffer {
  from: number;
  to: number;
  day: number;
}

export interface BattleSide {
  nations: number[];
  /** Regiments by type at the start. */
  regs: Partial<Record<RegType, number>>;
  men: number;
  lost: number;
  moraleEnd: number;
}

export interface BattleReport {
  id: number;
  day: number;
  prov: number;
  attacker: BattleSide;
  defender: BattleSide;
  rounds: { rolls: [number, number]; lost: [number, number] }[];
  /** 0: the attacker won; 1: the defender held. */
  winner: 0 | 1;
  /** Why the odds weren't even, e.g. "Defenders hold the hills". */
  notes: string[];
  /** What happened to the losers. */
  outcome: "retreated" | "destroyed";
}

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
  | { k: "captured"; day: number; n: number; p: number; from: number }
  | { k: "razed"; day: number; n: number; p: number; from: number }
  | { k: "war"; day: number; n: number; on: number }
  | { k: "peace"; day: number; n: number; with: number }
  | { k: "offer"; day: number; n: number; to: number }
  | { k: "refused"; day: number; n: number; by: number }
  | { k: "trade"; day: number; n: number; with: number }
  | { k: "untrade"; day: number; n: number; with: number }
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
  | { k: "colonist"; day: number; n: number }
  | { k: "angry"; day: number; n: number; at: number }
  | { k: "broke"; day: number; n: number }
  | { k: "over"; day: number; winner: number };

export interface GameSettings {
  /** The game ends on 1 January of this year. */
  endYear: number;
  difficulty: Difficulty;
  seed: number;
}

export interface Seat {
  seat: string;
  name: string;
  /** Power key, e.g. "england". */
  power: string;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  /** Days since 1 January 1607. */
  day: number;
  endDay: number;
  rng: number;
  nextId: number;
  provinces: Province[];
  nations: Nation[];
  armies: Army[];
  wars: War[];
  truces: Truce[];
  deals: TradeDeal[];
  offers: PeaceOffer[];
  /** Price of each good this month. */
  prices: Record<Good, number>;
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
  | { k: "war"; n: number }
  | { k: "peace"; n: number }
  | { k: "answer"; n: number; yes: boolean }
  | { k: "trade"; n: number }
  | { k: "untrade"; n: number }
  | { k: "gift"; n: number; gold: number }
  | { k: "buy"; p: number };

/** What changed since the last delta, for sending to players. */
export interface GameDelta {
  day: number;
  prov?: Record<number, Province>;
  /** Changed armies; null means it's gone. */
  armies?: Record<number, Army | null>;
  nations?: Record<number, Nation>;
  wars?: War[];
  truces?: Truce[];
  deals?: TradeDeal[];
  offers?: PeaceOffer[];
  prices?: Record<Good, number>;
  battles?: BattleReport[];
  events?: GameEvent[];
  over?: { winner: number };
}
