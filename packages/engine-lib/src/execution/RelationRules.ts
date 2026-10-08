import { Difficulty } from "@openfront/engine-api/game/GameTypes";
import { assertNever } from "../Util";

/**
 * How much the things a player does move a nation's opinion of them. The
 * executions apply these, and the player panel quotes them in its "How to
 * improve it" tips, so the two can't drift apart.
 */

/** Both sides, when an alliance forms. */
export const ALLIANCE_RELATION = 100;
/** Breaking an alliance, to the betrayed ally. */
export const BROKE_ALLIANCE_RELATION = -100;
/** Breaking an alliance, to everyone next to the traitor. */
export const SAW_BETRAYAL_RELATION = -40;
/** A nuke hitting a player hard, or a MIRV aimed at them. */
export const NUKED_RELATION = -100;
/** Marking a player as a target. */
export const TARGETED_RELATION = -40;
/** Stopping trade with a nation; given back when trade starts again. */
export const EMBARGO_RELATION = -20;
/** The middle-finger emoji. */
export const INSULT_EMOJI_RELATION = -100;
/** The clown emoji. */
export const CLOWN_EMOJI_RELATION = -10;
/** A kind emoji, on Easy only. */
export const KIND_EMOJI_RELATION = 15;
/** The emojis a nation takes kindly (on Easy they raise its opinion). */
export const KIND_EMOJIS: readonly string[] = ["🕊️", "🏳️", "❤️", "🥰", "👏"];
/** A nation's warship answering your transport ship. */
export const BOATS_RELATION = -15;
/** A nation's warship answering your capture of its trade ship. */
export const CAPTURED_TRADE_RELATION = -7.5;
/** What a nation's opinion of an ally loses each time it joins their attack. */
export const FAVOR_RELATION = -20;
/** Relation points per gold step (see goldPerRelationStep). */
export const GOLD_RELATION_STEP = 5;
/** The most one gold gift can add. */
export const MAX_GOLD_GIFT_RELATION = 100;
/** Relation points a big enough troop gift gives. */
export const TROOP_GIFT_RELATION = 50;
/**
 * Every tick each relation moves this much toward 0 (PlayerImpl
 * decayRelations), so 30 points a minute; within twice this of 0 it snaps.
 */
export const RELATION_DECAY_PER_TICK = 0.05;

/** Each land or boat attack on a player. */
export function attackRelationPenalty(difficulty: Difficulty): number {
  switch (difficulty) {
    case Difficulty.Easy:
      return -60;
    case Difficulty.Medium:
      return -70;
    case Difficulty.Hard:
      return -80;
    case Difficulty.Impossible:
      return -100;
    default:
      assertNever(difficulty);
  }
}

function baseGoldStep(difficulty: Difficulty): number {
  switch (difficulty) {
    case Difficulty.Easy:
      return 2_500;
    case Difficulty.Medium:
      return 5_000;
    case Difficulty.Hard:
      return 12_500;
    case Difficulty.Impossible:
      return 25_000;
    default:
      assertNever(difficulty);
  }
}

/**
 * Gold that earns GOLD_RELATION_STEP points at `ticks`: a base amount by
 * difficulty, growing by itself every 3000 ticks (5 minutes) after spawn.
 */
export function goldPerRelationStep(
  difficulty: Difficulty,
  ticks: number,
  numSpawnPhaseTurns: number,
): bigint {
  const chunkSize = baseGoldStep(difficulty);
  // For every 5 minutes that pass, multiply the chunk size to scale with game progression
  const chunkSizeMultiplier = ticks / (3000 + numSpawnPhaseTurns);
  return BigInt(Math.round(chunkSize + chunkSize * chunkSizeMultiplier));
}

/** Relation points a gift of `gold` earns at `ticks`. */
export function goldGiftRelation(
  gold: bigint,
  difficulty: Difficulty,
  ticks: number,
  numSpawnPhaseTurns: number,
): number {
  const step = goldPerRelationStep(difficulty, ticks, numSpawnPhaseTurns);
  // Each complete step gives GOLD_RELATION_STEP points, capped.
  const points = Number(gold / step) * GOLD_RELATION_STEP;
  return Math.min(points, MAX_GOLD_GIFT_RELATION);
}

/**
 * Bounds of the troop gift that earns TROOP_GIFT_RELATION points. Each gift
 * draws its own minimum with PseudoRandom.nextInt(min, max), so a gift of
 * Math.floor(max) troops or more always counts.
 */
export function troopGiftRelationRange(
  difficulty: Difficulty,
  recipientMaxTroops: number,
): [min: number, max: number] {
  switch (difficulty) {
    // ~7.7k - ~9.1k troops (for 100k troops)
    case Difficulty.Easy:
      return [recipientMaxTroops / 13, recipientMaxTroops / 11];
    // ~9.1k - ~11.1k troops (for 100k troops)
    case Difficulty.Medium:
      return [recipientMaxTroops / 11, recipientMaxTroops / 9];
    // ~11.1k - ~14.3k troops (for 100k troops)
    case Difficulty.Hard:
      return [recipientMaxTroops / 9, recipientMaxTroops / 7];
    // ~14.3k - ~20k troops (for 100k troops)
    case Difficulty.Impossible:
      return [recipientMaxTroops / 7, recipientMaxTroops / 5];
    default:
      assertNever(difficulty);
  }
}
