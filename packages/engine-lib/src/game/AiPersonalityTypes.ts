// AIP (r23): DerpyFront's AI personalities, rules edition 6.
//
// Four personalities, each sold on its own in the Derp Store: Mad Scientist,
// Trader, Aggressive and Protector. Whoever sets up a game (the Solo player,
// or a lobby's host) ticks the ones in play: any they own, plus Normal, which
// is free. Each AI nation is then dealt one of the ticked options at random
// from the game's own seed, so every client deals the same hand. The choice
// travels in GameConfig.aiPersonalities ("normal", "trader", ...).
//
// A personality is a behaviour only: a nation keeps its own name and flag.
// This file is the data the engine, the server and the client all read: the
// ids, the deal, and how each personality tunes a nation. The behaviour that
// reads the tuning is in packages/engine/src/execution/nation and
// execution/utils/AiAttackBehavior.ts. Nothing here draws from a shared
// random stream: the deal seeds its own.
//
// Rules edition 5's personas, packs and temperaments (AiPersonalities.ts)
// are kept for the games played under it.

import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";

/** The rules edition from which nations play these personalities. */
export const AIP_RULES = 6;

/** The four personalities, in store order. */
export const AI_TYPES = [
  "mad_scientist",
  "trader",
  "aggressive",
  "protector",
] as const;
export type AiType = (typeof AI_TYPES)[number];

/** The free default: a nation that plays as nations always have. */
export const NORMAL_AI = "normal";
export type AiChoice = AiType | typeof NORMAL_AI;

/** Everything a host can tick, Normal first. */
export const AI_CHOICES: readonly AiChoice[] = [NORMAL_AI, ...AI_TYPES];

export function isAiType(id: string): id is AiType {
  return (AI_TYPES as readonly string[]).includes(id);
}

export function isAiChoice(id: string): id is AiChoice {
  return id === NORMAL_AI || isAiType(id);
}

/** The Derp Store item that sells a personality ("ai_trader"). */
export function aiTypeItem(type: AiType): string {
  return `ai_${type}`;
}

/** The personality a Derp Store item sells, if it sells one. */
export function aiTypeOfItem(item: string): AiType | undefined {
  const id = item.replace(/^ai_/, "");
  return item.startsWith("ai_") && isAiType(id) ? id : undefined;
}

/**
 * The options a game's config ticks, in a fixed order (Normal, then store
 * order) whatever order they were ticked in. Unknown and repeated ids, such
 * as rules edition 5's pack ids, are dropped.
 */
export function aiChoices(list: readonly string[] | undefined): AiChoice[] {
  if (!list || list.length === 0) return [];
  const ticked = new Set(list);
  return AI_CHOICES.filter((c) => ticked.has(c));
}

/** Whether a config's options give any nation a personality. */
export function dealsPersonalities(
  list: readonly string[] | undefined,
): boolean {
  return aiChoices(list).some((c) => c !== NORMAL_AI);
}

/**
 * Deals the ticked options to the game's AI nations: a deck holding each
 * option in turn, as many times as it takes to cover every nation, is
 * shuffled from a seed made of the nations' own ids (which come from the
 * game's seed), and dealt to the nations sorted by id. So the same game deals
 * the same hand on every client, in any order the nations are listed, and the
 * options come out as evenly as the numbers allow. Only the nations dealt a
 * personality are in the result; the rest play Normal.
 */
export function dealAiTypes(
  nationIds: readonly string[],
  list: readonly string[] | undefined,
): Map<string, AiType> {
  const dealt = new Map<string, AiType>();
  const choices = aiChoices(list);
  if (nationIds.length === 0 || !choices.some((c) => c !== NORMAL_AI)) {
    return dealt;
  }
  const ids = [...new Set(nationIds)].sort();
  const deck: AiChoice[] = [];
  while (deck.length < ids.length) deck.push(...choices);
  const random = new PseudoRandom(simpleHash(`aip:${ids.join(",")}`));
  const hand = random.shuffleArray(deck);
  ids.forEach((id, i) => {
    const choice = hand[i];
    if (choice !== NORMAL_AI) dealt.set(id, choice);
  });
  return dealt;
}

// ---------------------------------------------------------------------------
// How each personality tunes a nation. Percent and percentage points, so the
// numbers a nation ends up with are exact.

/** Who a nation turns on, among its allies. */
export type Betrayal =
  /** Only a traitor ally much weaker than itself. */
  | "rarely"
  /** Only a traitor ally, or (Easy, Medium) one twenty times weaker. */
  | "less"
  /** As nations always have. */
  | "usual"
  /** Any ally it would gain from turning on, on every difficulty, sooner. */
  | "more";

/** Whom a nation nukes. */
export type NukeStyle =
  /** As nations always have. */
  | "usual"
  /** More often, at those at war with it and the strongest threats. */
  | "focused"
  /** Only those attacking it now. */
  | "answer"
  /** Only whoever attacked it, for as long as it remembers (Protector). */
  | "grudge";

export interface AiTuning {
  /** Percent of the usual ticks between a nation's decisions (80: a fifth faster). */
  ratePct: number;
  /** The same, for the opening minutes after the spawn phase only. */
  openingRatePct: number;
  /** Percentage points added to the troop-cap share it waits for before attacking. */
  triggerPts: number;
  /** Percentage points added to the share of its troop cap it keeps home. */
  reservePts: number;
  /** Percentage points added to the share it may spend taking empty land. */
  expandPts: number;
  /** Percent of the usual structures per city it wants, by type. */
  structuresPct: Partial<Record<UnitType, number>>;
  /** The order it builds ports, factories, SAMs and silos in (cities after). */
  buildOrder: readonly UnitType[];
  /** The most missile silos it builds (3 usually). */
  maxSilos: number;
  /** Percent per city for its first silo (40 usually): higher, sooner. */
  firstSiloPct: number;
  /**
   * Percent of the usual rise in what one more of a building feels like it
   * costs, per one owned, while the nation saves for nukes (100 usually):
   * lower, it builds more of them.
   */
  costRisePct: Partial<Record<UnitType, number>>;
  /** Percent of the usual defense posts on a front (100 usually). */
  defensePostsPct: number;
  /** Percent of the usual incoming-troops share that calls for defense posts. */
  defenseThreatPct: number;
  /** Domes of Alden raised before any nuke lands (3 usually). */
  preemptiveDomes: number;
  /** Percent of the usual worth a Dome's spot needs, and of the wait between Domes. */
  domeBarPct: number;
  /** Percent chance, per decision, that it looks for a fight nobody started. */
  warPct: number;
  /** One time in this many it asks a bordering player to ally (30 usually). */
  allyAskOdds: number;
  betrayal: Betrayal;
  nukes: NukeStyle;
  /**
   * Percent of the usual rise in the gold it waits for before its next bomb,
   * after each one it launches (nations save up for a MIRV: half as much
   * again after an atom bomb, a quarter after a hydrogen bomb). 40: it keeps
   * throwing bombs instead of saving.
   */
  nukeCostRisePct: number;
  /** Answers an attack at once on every difficulty, not only Hard and up. */
  answersAtOnce: boolean;
  /** Prefers an island of its own, and unclaimed land across the sea. */
  islander: boolean;
  /** Remembers who attacked it and turns everything on them (Protector). */
  avenger: boolean;
}

/** How a nation without a personality plays: as nations always have. */
export const NORMAL_TUNING: AiTuning = {
  ratePct: 100,
  openingRatePct: 100,
  triggerPts: 0,
  reservePts: 0,
  expandPts: 0,
  structuresPct: {},
  buildOrder: [
    UnitType.Port,
    UnitType.Factory,
    UnitType.SAMLauncher,
    UnitType.MissileSilo,
  ],
  maxSilos: 3,
  firstSiloPct: 40,
  costRisePct: {},
  defensePostsPct: 100,
  defenseThreatPct: 100,
  preemptiveDomes: 3,
  domeBarPct: 100,
  warPct: 100,
  allyAskOdds: 30,
  betrayal: "usual",
  nukes: "usual",
  nukeCostRisePct: 100,
  answersAtOnce: false,
  islander: false,
  avenger: false,
};

export const AI_TUNING: Record<AiType, AiTuning> = {
  // Factories, and a lot more SAMs, silos and Domes; nukes more, at real
  // enemies.
  mad_scientist: {
    ...NORMAL_TUNING,
    // SAMs are the dearest of these (up to $3M each), so they get the most
    // room and come first; measured, it ends up with about twice Normal's
    // SAMs and silos per city on Medium
    structuresPct: {
      [UnitType.Factory]: 200,
      [UnitType.SAMLauncher]: 300,
      [UnitType.MissileSilo]: 250,
    },
    // Its SAMs and silos before its trade
    buildOrder: [
      UnitType.SAMLauncher,
      UnitType.MissileSilo,
      UnitType.Factory,
      UnitType.Port,
    ],
    maxSilos: 8,
    firstSiloPct: 80,
    costRisePct: {
      [UnitType.SAMLauncher]: 30,
      [UnitType.MissileSilo]: 30,
    },
    preemptiveDomes: 5,
    domeBarPct: 50,
    nukes: "focused",
    nukeCostRisePct: 40,
  },
  // Factories and ports; slow to start a fight but answers one, keeps a big
  // army home, rarely turns on an ally, and keeps to an island if it can.
  trader: {
    ...NORMAL_TUNING,
    triggerPts: 15,
    reservePts: 15,
    structuresPct: {
      [UnitType.Port]: 160,
      [UnitType.Factory]: 200,
    },
    warPct: 25,
    allyAskOdds: 15,
    betrayal: "less",
    nukes: "answer",
    answersAtOnce: true,
    islander: true,
  },
  // A fifth faster, attacks sooner, keeps less home, turns on allies when it
  // pays, and grows a bigger army (cities over SAMs).
  aggressive: {
    ...NORMAL_TUNING,
    ratePct: 80,
    openingRatePct: 80,
    triggerPts: -12,
    reservePts: -8,
    structuresPct: { [UnitType.SAMLauncher]: 75 },
    costRisePct: { [UnitType.City]: 50 },
    betrayal: "more",
  },
  // A little slower in the opening, then digs in: twice the SAMs, silos,
  // defense posts and Domes, lots of cities. Rarely starts a war; once
  // attacked, it turns its army and its nukes on the attacker.
  protector: {
    ...NORMAL_TUNING,
    openingRatePct: 125,
    triggerPts: 20,
    reservePts: 18,
    structuresPct: {
      [UnitType.SAMLauncher]: 200,
      [UnitType.MissileSilo]: 200,
    },
    // Its defenses before its trade
    buildOrder: [
      UnitType.SAMLauncher,
      UnitType.MissileSilo,
      UnitType.Port,
      UnitType.Factory,
    ],
    maxSilos: 6,
    // Saves least against cities (measured: about a fifth more cities than
    // Normal, still two to three times its SAMs per city on Medium; at 0 it
    // would buy cities with everything and hardly any SAMs)
    costRisePct: {
      [UnitType.City]: 35,
      [UnitType.SAMLauncher]: 50,
      [UnitType.MissileSilo]: 50,
    },
    defensePostsPct: 200,
    defenseThreatPct: 60,
    preemptiveDomes: 5,
    domeBarPct: 50,
    warPct: 10,
    allyAskOdds: 15,
    betrayal: "rarely",
    nukes: "grudge",
    answersAtOnce: true,
    avenger: true,
  },
};

export function aiTuning(type: AiType | null | undefined): AiTuning {
  return type ? AI_TUNING[type] : NORMAL_TUNING;
}

/** Ticks after the spawn phase that count as the opening (3 minutes). */
export const OPENING_TICKS = 1800;

/** How long a Protector remembers an attack on it (5 minutes after the last). */
export const GRUDGE_TICKS = 3000;

/**
 * A nation's attack ratios in whole percent, leaned by its personality: the
 * usual draws are 50-59 (trigger), 30-39 (reserve) and 10-19 (expand). The
 * reserve stays at least 5 points under the trigger, and each stays inside
 * sensible bounds. Divide by 100 for the ratios the nation plays by.
 */
export function tunedRatioPercents(
  t: AiTuning,
  pct: { trigger: number; reserve: number; expand: number },
): { trigger: number; reserve: number; expand: number } {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  const trigger = clamp(pct.trigger + t.triggerPts, 30, 85);
  const reserve = clamp(pct.reserve + t.reservePts, 15, trigger - 5);
  const expand = clamp(pct.expand + t.expandPts, 5, 30);
  return { trigger, reserve, expand };
}

/** Ticks between decisions, leaned by a percent (never under 10). */
export function tunedRate(rate: number, pct: number): number {
  if (pct === 100) return rate;
  return Math.max(10, Math.round((rate * pct) / 100));
}
