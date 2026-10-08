import {
  Difficulty,
  GameMode,
  Relation,
} from "@openfront/engine-api/game/GameTypes";
import type {
  AllianceGate,
  AllianceOutcome,
} from "@openfront/engine-api/game/Opinion";
import { PseudoRandom } from "../PseudoRandom";
import { assertNever } from "../Util";

/**
 * How a nation decides whether to ally with a player: answering their
 * request (or renewal) and choosing whom to ask. NationAllianceBehavior runs
 * decideAlliance with its own PRNG; the player panel runs the very same
 * function through allianceOdds, which follows every random branch instead
 * of drawing, to say how likely a yes is and why.
 *
 * The order of the draws is part of the simulation: a nation shares one PRNG
 * across all its behaviours, so decideAlliance makes exactly the draws, in
 * exactly the order, that the nation always has.
 */

/** What a nation weighs about the other player, evaluated on demand. */
export interface AllianceFacts {
  readonly difficulty: Difficulty;
  readonly gameMode: GameMode;
  /** Answering their request or renewal (true), or thinking of asking. */
  readonly isResponse: boolean;
  readonly ticks: number;
  readonly numSpawnPhaseTurns: number;
  isTraitor(): boolean;
  /** How many alliances the other player has. */
  theirAlliances(): number;
  /** Players in the game that aren't tribes. */
  nonTribePlayers(): number;
  isRunawayLeader(): boolean;
  /** The nation's opinion of the other player. */
  relation(): Relation;
  /** How many alliances the nation has. */
  ourAlliances(): number;
  /** The non-tribe players bordering the nation. */
  neighbours(): AllianceNeighbours;
  strength(): AllianceStrength;
}

export interface AllianceNeighbours {
  count: number;
  /** How many of them are allies or teammates. */
  friendly: number;
  /** Whether the other player is one of them. */
  includesThem: boolean;
}

/** "our" is the nation, "their" the other player. */
export interface AllianceStrength {
  ourTroops: number;
  theirTroops: number;
  ourMaxTroops: number;
  theirMaxTroops: number;
  ourTiles: number;
  theirTiles: number;
  /** Troops in outgoing attacks. */
  ourAttackTroops: number;
  theirAttackTroops: number;
}

/** Where the decision's randomness comes from. */
export interface AllianceDice {
  /** PseudoRandom.chance: true one time in `odds`. */
  chance(odds: number): boolean;
  /** Draws PseudoRandom.nextInt(min, max) and tests it. */
  roll(min: number, max: number, test: (n: number) => boolean): boolean;
  /** A chance that only decides whether to send an emoji. */
  emojiChance(odds: number): boolean;
}

/** The emojis a nation sends while deciding. */
export type AllianceEmoji = "confused" | "scared" | "love" | "handshake";

export interface AllianceDecision {
  /** The step that settled it. */
  gate: AllianceGate;
  accept: boolean;
}

/** One time in this many a nation decides by coin flip (null: never). */
export function confusedOdds(difficulty: Difficulty): number | null {
  switch (difficulty) {
    case Difficulty.Easy:
      return 10;
    case Difficulty.Medium:
      return 20;
    case Difficulty.Hard:
      return 40;
    case Difficulty.Impossible:
      return null;
    default:
      assertNever(difficulty);
  }
}

/** A traitor gets past the traitor check this often (percent). */
export const TRAITOR_PASS_PERCENT = 10;

/**
 * The share of the non-tribe players a player may be allied with before
 * the nation refuses them (null: no limit).
 */
export function allianceCapShare(difficulty: Difficulty): number | null {
  switch (difficulty) {
    case Difficulty.Easy:
    case Difficulty.Medium:
      return null;
    case Difficulty.Hard:
      return 0.5;
    case Difficulty.Impossible:
      return 0.25;
    default:
      assertNever(difficulty);
  }
}

/** Percent of requests refused in team games. */
export function teamRejectPercent(difficulty: Difficulty): number {
  switch (difficulty) {
    case Difficulty.Easy:
      return 25;
    case Difficulty.Medium:
      return 50;
    case Difficulty.Hard:
      return 75;
    case Difficulty.Impossible:
      return 100;
    default:
      assertNever(difficulty);
  }
}

/** Percent of Friendly players still refused at the friendly step. */
export function friendlyRefusePercent(difficulty: Difficulty): number {
  switch (difficulty) {
    case Difficulty.Easy:
    case Difficulty.Medium:
      return 0;
    case Difficulty.Hard:
      return 17;
    case Difficulty.Impossible:
      return 33;
    default:
      assertNever(difficulty);
  }
}

/**
 * The early game: for `ticks` after the spawn phase a nation says yes to
 * `acceptPercent` of the requests that reach this step.
 */
export function earlyGameWindow(difficulty: Difficulty): {
  ticks: number;
  acceptPercent: number;
} {
  switch (difficulty) {
    case Difficulty.Easy:
      // On easy, accept 90% in the first 5 minutes
      return { ticks: 3000, acceptPercent: 90 };
    case Difficulty.Medium:
      // On medium, accept 70% in the first 3 minutes
      return { ticks: 1800, acceptPercent: 70 };
    case Difficulty.Hard:
      // On hard, accept 50% in the first 3 minutes
      return { ticks: 1800, acceptPercent: 50 };
    case Difficulty.Impossible:
      // On impossible, accept 30% in the first minute
      return { ticks: 600, acceptPercent: 30 };
    default:
      assertNever(difficulty);
  }
}

/** Whether the nation thinks the other player is too strong to refuse. */
export function isAllianceThreat(
  difficulty: Difficulty,
  s: AllianceStrength,
): boolean {
  switch (difficulty) {
    case Difficulty.Easy:
      // On easy we are very dumb, we don't see anybody as a threat
      return false;
    case Difficulty.Medium:
      // On medium we just see players with much more troops as a threat
      return s.theirTroops > s.ourTroops * 2.5;
    case Difficulty.Hard:
      // On hard we are smarter, we check for maxTroops to see the actual strength
      return (
        s.theirTroops > s.ourTroops && s.theirMaxTroops > s.ourMaxTroops * 2
      );
    case Difficulty.Impossible: {
      // On impossible we check for multiple factors and try to not mess with stronger players (we want to steamroll over weaklings)
      const otherHasMoreTroops = s.theirTroops > s.ourTroops * 1.5;
      const otherHasMoreMaxTroops =
        s.theirTroops > s.ourTroops && s.theirMaxTroops > s.ourMaxTroops * 1.5;
      const otherHasMoreTiles =
        s.theirTroops > s.ourTroops && s.theirTiles > s.ourTiles * 1.5;
      return otherHasMoreTroops || otherHasMoreMaxTroops || otherHasMoreTiles;
    }
    default:
      assertNever(difficulty);
  }
}

// It would make a lot of sense to use nextFloat here, but "there's a chance floats can cause desyncs"
const TROOP_PERCENT_RANGE = {
  [Difficulty.Easy]: [60, 70],
  [Difficulty.Medium]: [70, 80],
  [Difficulty.Hard]: [75, 85],
  [Difficulty.Impossible]: [80, 90],
} as const;
const TILE_PERCENT_RANGE = {
  [Difficulty.Easy]: [70, 80],
  [Difficulty.Medium]: [80, 90],
  [Difficulty.Hard]: [85, 95],
  [Difficulty.Impossible]: [90, 100],
} as const;

/**
 * Decides one alliance question. Every random draw goes through `dice`, in
 * the order NationAllianceBehavior has always made them, and `emoji` is
 * called where the nation sends one.
 */
export function decideAlliance(
  f: AllianceFacts,
  dice: AllianceDice,
  emoji: (e: AllianceEmoji) => void = () => {},
): AllianceDecision {
  const d = f.difficulty;

  // Easy (dumb) nations sometimes get confused and accept/reject randomly (Just like dumb humans do)
  const confused = confusedOdds(d);
  if (confused !== null && dice.chance(confused)) {
    return { gate: "confused", accept: dice.chance(2) };
  }
  // Nearly always reject traitors
  if (f.isTraitor() && dice.roll(0, 100, (n) => n >= TRAITOR_PASS_PERCENT)) {
    if (f.isResponse && dice.emojiChance(3)) emoji("confused");
    return { gate: "traitor", accept: false };
  }
  // Reject if they have allied with a lot of players (Hard and Impossible only)
  // To make sure there are enough non-friendly players in the game to stop the crown with nukes
  const capShare = allianceCapShare(d);
  if (
    capShare !== null &&
    f.theirAlliances() >= f.nonTribePlayers() * capShare
  ) {
    return { gate: "too_many_alliances", accept: false };
  }
  // Don't help a runaway leader grow even further (Medium and up)
  if (f.isRunawayLeader()) {
    return { gate: "runaway_leader", accept: false };
  }
  // Before caring about the relation, first check if they are a threat
  // Easy (dumb) nations are blinded by hatred, they don't care about threats, they care about the relation
  // Impossible (smart) nations on the other hand are analyzing the facts
  if (d !== Difficulty.Easy && isAllianceThreat(d, f.strength())) {
    if (!f.isResponse && dice.emojiChance(6)) emoji("scared");
    if (f.isResponse && dice.emojiChance(6)) emoji("love");
    return { gate: "threat", accept: true };
  }
  // Maybe reject if we are in a team game (allying makes less sense there)
  if (f.gameMode === GameMode.Team) {
    const reject = teamRejectPercent(d);
    if (reject >= 100 || dice.roll(0, 100, (n) => n < reject)) {
      return { gate: "team_game", accept: false };
    }
  }
  // Reject if relation is bad
  if (f.relation() < Relation.Neutral) {
    if (f.isResponse && dice.emojiChance(3)) emoji("confused");
    return { gate: "relation_low", accept: false };
  }
  // Maybe accept if relation is friendly
  const friendlyRefuse = friendlyRefusePercent(d);
  if (
    f.relation() === Relation.Friendly &&
    (friendlyRefuse === 0 || dice.roll(0, 100, (n) => n >= friendlyRefuse))
  ) {
    if (dice.emojiChance(3)) emoji("handshake");
    return { gate: "friendly", accept: true };
  }
  // Reject if we already have some alliances, we don't want to ally with the entire map
  const enough = alreadyEnoughAlliances(f, dice);
  if (enough !== null) return { gate: enough, accept: false };
  // Maybe accept if we are in the earlygame
  const early = earlyGameWindow(d);
  if (
    f.ticks < early.ticks + f.numSpawnPhaseTurns &&
    dice.roll(0, 100, (n) => n >= 100 - early.acceptPercent)
  ) {
    return { gate: "early_game", accept: true };
  }
  // Accept if we are similarly strong
  return {
    gate: "similar_strength",
    accept: isSimilarlyStrong(f, dice),
  };
}

function alreadyEnoughAlliances(
  f: AllianceFacts,
  dice: AllianceDice,
): "allied_neighbours" | "enough_alliances" | null {
  const enough = (min: number, max: number) =>
    dice.roll(min, max, (n) => f.ourAlliances() >= n)
      ? "enough_alliances"
      : null;
  switch (f.difficulty) {
    case Difficulty.Easy:
      return null; // On easy we never think we have enough alliances
    case Difficulty.Medium:
      return enough(4, 6);
    case Difficulty.Hard:
    case Difficulty.Impossible: {
      // On hard and impossible we try to not ally with all our neighbors (If we have 2+ neighbors)
      const n = f.neighbours();
      if (n.count >= 2 && n.includesThem) {
        return n.count <= n.friendly + 1 ? "allied_neighbours" : null;
      }
      return f.difficulty === Difficulty.Hard ? enough(3, 5) : enough(2, 4);
    }
    default:
      assertNever(f.difficulty);
  }
}

function isSimilarlyStrong(f: AllianceFacts, dice: AllianceDice): boolean {
  const s = f.strength();
  const troopRange = TROOP_PERCENT_RANGE[f.difficulty];
  const tileRange = TILE_PERCENT_RANGE[f.difficulty];
  const playerTotalTroops = s.ourTroops + s.ourAttackTroops;
  const otherTotalTroops = s.theirTroops + s.theirAttackTroops;
  // Both thresholds are drawn before either is compared.
  const hasComparableTroops = dice.roll(
    troopRange[0],
    troopRange[1],
    (n) => otherTotalTroops > playerTotalTroops * (n / 100),
  );
  const hasComparableTiles = dice.roll(
    tileRange[0],
    tileRange[1],
    (n) =>
      s.theirTiles > s.ourTiles * (n / 100) &&
      otherTotalTroops > playerTotalTroops * 0.5,
  );
  return hasComparableTroops || hasComparableTiles;
}

/** Draws from a nation's PRNG exactly as the decision always has. */
export function allianceDice(random: PseudoRandom): AllianceDice {
  return {
    chance: (odds) => random.chance(odds),
    roll: (min, max, test) => test(random.nextInt(min, max)),
    emojiChance: (odds) => random.chance(odds),
  };
}

/** Facts read once each, however often the decision is replayed. */
function memoFacts(f: AllianceFacts): AllianceFacts {
  const memo = <T>(get: () => T): (() => T) => {
    let done = false;
    let value: T;
    return () => {
      if (!done) {
        value = get();
        done = true;
      }
      return value;
    };
  };
  return {
    difficulty: f.difficulty,
    gameMode: f.gameMode,
    isResponse: f.isResponse,
    ticks: f.ticks,
    numSpawnPhaseTurns: f.numSpawnPhaseTurns,
    isTraitor: memo(() => f.isTraitor()),
    theirAlliances: memo(() => f.theirAlliances()),
    nonTribePlayers: memo(() => f.nonTribePlayers()),
    isRunawayLeader: memo(() => f.isRunawayLeader()),
    relation: memo(() => f.relation()),
    ourAlliances: memo(() => f.ourAlliances()),
    neighbours: memo(() => f.neighbours()),
    strength: memo(() => f.strength()),
  };
}

/**
 * Every way decideAlliance can go for these facts and how likely each is,
 * largest first. Instead of drawing, it replays the decision down every
 * branch of every draw that could change the answer (a draw whose outcome
 * is certain isn't a branch, and emoji draws never are), weighting each
 * path by the odds PseudoRandom gives it. Nothing is drawn, so the
 * simulation is untouched.
 */
export function allianceOdds(facts: AllianceFacts): AllianceOutcome[] {
  const f = memoFacts(facts);
  const totals = new Map<string, AllianceOutcome>();
  // Each entry: the branch taken at each draw so far, true first.
  const todo: boolean[][] = [[]];
  while (todo.length > 0) {
    const path = todo.pop()!;
    let depth = 0;
    let weight = 1;
    const branch = (p: number): boolean => {
      if (p <= 0) return false;
      if (p >= 1) return true;
      let take: boolean;
      if (depth < path.length) {
        take = path[depth];
      } else {
        todo.push([...path, false]);
        path.push(true);
        take = true;
      }
      depth++;
      weight *= take ? p : 1 - p;
      return take;
    };
    const dice: AllianceDice = {
      // PseudoRandom.chance(odds) is nextInt(0, odds) === 0.
      chance: (odds) => branch(1 / Math.floor(odds)),
      roll: (min, max, test) => {
        const lo = Math.floor(min);
        const hi = Math.floor(max);
        let hits = 0;
        for (let n = lo; n < hi; n++) if (test(n)) hits++;
        return branch(hits / (hi - lo));
      },
      emojiChance: () => false,
    };
    const { gate, accept } = decideAlliance(f, dice);
    const key = `${gate}:${accept}`;
    const total = totals.get(key);
    if (total === undefined) totals.set(key, { gate, accept, chance: weight });
    else total.chance += weight;
  }
  return [...totals.values()].sort((a, b) => b.chance - a.chance);
}

/** The chance of a yes, 0..1. */
export function acceptChance(outcomes: readonly AllianceOutcome[]): number {
  let yes = 0;
  for (const o of outcomes) if (o.accept) yes += o.chance;
  // Paths add up to 1 only up to float error; keep certainties exact.
  if (yes > 1 - 1e-9) return 1;
  if (yes < 1e-9) return 0;
  return yes;
}
