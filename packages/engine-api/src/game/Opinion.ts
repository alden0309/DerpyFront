import type { Relation } from "./GameTypes";

/**
 * Why one player's opinion of another moved, named from the side of the
 * player being judged ("you"). Every relation change in the engine names
 * one. The engine keeps the breakdown for the player panel only; nothing in
 * the simulation reads it.
 */
export const RELATION_REASONS = [
  // +100 to both sides when an alliance forms.
  "alliance",
  // You broke your alliance with them.
  "broke_alliance",
  // You broke an alliance with someone, and they live next to you.
  "saw_betrayal",
  // Your nuke hit them hard enough to break an alliance, or your MIRV was
  // aimed at them.
  "nuked",
  // They aimed a MIRV at you (the launcher sours on its target).
  "mirv_at_you",
  // You attacked them by land or by boat.
  "attacked",
  // Your transport ship sailed at them and they sent a warship.
  "boats",
  // You captured one of their trade ships and they sent a warship.
  "captured_trade",
  // You stopped trading with them.
  "embargo",
  // You started trading with them again.
  "embargo_lifted",
  // You marked them as a target.
  "targeted",
  // As your ally they joined an attack on your target, which costs them.
  "favor",
  "gift_gold",
  "gift_troops",
  "kind_emoji",
  "rude_emoji",
  // A change from before reasons were kept.
  "other",
] as const;
export type RelationReason = (typeof RELATION_REASONS)[number];

export interface OpinionReason {
  reason: RelationReason;
  /** Whole points; an opinion's reasons add up to its value. */
  amount: number;
}

/**
 * The steps of a nation's alliance decision, in the order it takes them
 * (engine-lib execution/AllianceRules). The first step that settles the
 * question names the outcome.
 */
export const ALLIANCE_GATES = [
  // On Easy, Medium and Hard a nation now and then decides by coin flip.
  "confused",
  // You're a traitor: refused 9 times in 10.
  "traitor",
  // You're allied with too many of the players (Hard and Impossible).
  "too_many_alliances",
  // You're running away with the game (Medium and up, free for all).
  "runaway_leader",
  // You're much stronger than them: they accept out of fear.
  "threat",
  // Team games: refused some of the time, always on Impossible.
  "team_game",
  // Their opinion of you is below Neutral.
  "relation_low",
  // They're Friendly toward you (on Hard and Impossible, most of the time).
  "friendly",
  // They won't ally with all of their neighbours (Hard and Impossible).
  "allied_neighbours",
  // They already have as many alliances as they want.
  "enough_alliances",
  // Early in the game they're open to allies.
  "early_game",
  // Otherwise: yes if you're about as strong as they are.
  "similar_strength",
] as const;
export type AllianceGate = (typeof ALLIANCE_GATES)[number];

/** One way the decision can go, and how likely it is. */
export interface AllianceOutcome {
  gate: AllianceGate;
  accept: boolean;
  /** 0..1; a decision's outcomes add up to 1. */
  chance: number;
}

/** Why no alliance request can be made at all. */
export type AllianceBlocker =
  | "alliances_disabled"
  | "same_team"
  | "spawn_phase"
  | "disconnected";

export type AllianceSituation =
  // You can ask now; `outcomes` is how they'd answer.
  | "request"
  // You've asked; they answer on their next turn by `outcomes`.
  | "pending"
  // You asked recently and must wait `cooldownTicks`; `outcomes` is how
  // they'd answer now.
  | "cooldown"
  // They've asked you: asking back (or accepting) forms the alliance.
  | "they_asked"
  // You're allies; when you ask to renew they decide by `outcomes`, again
  // on each of their turns until it runs out.
  | "renewal"
  // No request is possible (`blocker` says why).
  | "blocked";

/** Whether a nation or tribe would ally with you, and why. */
export interface AllianceOutlook {
  situation: AllianceSituation;
  blocker?: AllianceBlocker;
  cooldownTicks?: number;
  /** Tribes accept every request and every renewal. */
  tribe?: true;
  /** 0..1: how likely they are to say yes. */
  chance: number;
  /**
   * The nation's decision, largest first (one outcome when it's certain);
   * empty for tribes and when no request is possible.
   */
  outcomes: AllianceOutcome[];
  /** The alliance count at which they refuse you (too_many_alliances). */
  allianceCap?: number;
}

/** A nation's or tribe's opinion of a player, for the player panel. */
export interface Opinion {
  /** -100..100, rounded down so it agrees with `relation`. */
  value: number;
  relation: Relation;
  /** Non-zero shares of `value`, largest first; they add up to it. */
  reasons: OpinionReason[];
  /** What one attack on them costs (negative). */
  attackPenalty: number;
  /** Gold that buys +5 if gifted right now (one gift gives at most +100). */
  goldPerStep: number;
  /** A troop gift at least this big always gives +50. */
  troopsForBonus: number;
  alliance: AllianceOutlook;
}
