/**
 * DIPLO (r27): courting the neutrals in a Scenario. The sides send a neutral
 * gifts of gold, which raise its goodwill toward them, and invite it to
 * join; a neutral played by a person may ask to join a side. The rules are
 * in packages/engine/src/scenario/ScenarioDiplomacy.ts; this is what the
 * client is shown (PlayerInteraction.scenarioDiplomacy) and the words of the
 * news it is sent.
 */

/** A side's id as an intent carries it ("Allies", "Patriots", "Wei"). */
export const SCENARIO_SIDE_RE = /^[A-Za-z0-9_]{1,32}$/;

/**
 * How a neutral feels toward a side, as players see it: its goodwill there
 * against its price. "ready": it would join if invited; "never": history
 * says it won't, at any price.
 */
export type GoodwillWord = "cold" | "wary" | "friendly" | "ready" | "never";

export interface GoodwillStanding {
  /** The side's id. */
  side: string;
  word: GoodwillWord;
  /** Goodwill as a percent of the price, 0 to 100 (0 when "never"). */
  percent: number;
}

export interface ScenarioCourtView {
  /** The viewer's side. */
  side: string;
  canGift: boolean;
  canInvite: boolean;
  /** Ticks until the side may invite this neutral again (0: now). */
  inviteCooldown: number;
  /** About how much more goodwill (gold) the side needs; 0 when ready. */
  goldToGo: number;
  /** Whether a person plays the neutral (they answer an invitation). */
  personNeutral: boolean;
}

export interface ScenarioAskView {
  /** A side the viewer, a neutral, may ask to join. */
  side: string;
  canAsk: boolean;
  /** Ticks until the viewer may ask this side again (0: now). */
  cooldown: number;
  /** Its people are deciding on an ask right now. */
  pending: boolean;
}

export interface ScenarioDiplomacyView {
  /** The neutral's standing toward each side, in the data's order. */
  standing: GoodwillStanding[];
  /**
   * The war's minute (its timer) before which the neutral joins nobody,
   * while that is still ahead: a big neutral can't be bought at once.
   */
  notBeforeMinute?: number;
  /** When the viewer is on a side and looks at a neutral. */
  court?: ScenarioCourtView;
  /** When the viewer is a neutral (looking at itself or at a side's nation). */
  ask?: ScenarioAskView[];
}

/**
 * The news of courting, as en.json keys. They live in en.json's own
 * scenario_diplomacy section (the client's events panel translates them),
 * with `side` a side's id and `name` a nation's.
 */
export const DIPLOMACY_MESSAGES = {
  /** To the giver: the neutral received the gift. */
  giftSent: "scenario_diplomacy.msg_gift_sent",
  /** To a neutral played by a person: a side sent a gift. */
  giftReceived: "scenario_diplomacy.msg_gift_received",
  /** To a neutral played by a person: an invitation (a yes/no card). */
  invited: "scenario_diplomacy.msg_invited",
  /** To the inviter: the invitation went to a person's neutral. */
  inviteSent: "scenario_diplomacy.msg_invite_sent",
  /** To the inviter: a person's neutral declined or didn't answer. */
  inviteDeclined: "scenario_diplomacy.msg_invite_declined",
  inviteUnanswered: "scenario_diplomacy.msg_invite_unanswered",
  /** To the inviter: a computer-run neutral says no, and why. */
  refusedNever: "scenario_diplomacy.msg_refused_never",
  refusedEarly: "scenario_diplomacy.msg_refused_early",
  refusedCold: "scenario_diplomacy.msg_refused_cold",
  refusedWary: "scenario_diplomacy.msg_refused_wary",
  refusedFriendly: "scenario_diplomacy.msg_refused_friendly",
  /** To a side's people: a neutral asks to join (a yes/no card). */
  asks: "scenario_diplomacy.msg_asks_to_join",
  /** To the asking neutral: its ask went to the side's people. */
  askSent: "scenario_diplomacy.msg_ask_sent",
  /** To the asking neutral: the side said no. */
  askRefused: "scenario_diplomacy.msg_ask_refused",
  /** To everyone: a neutral joins a side. */
  joined: "scenario_diplomacy.msg_joined",
} as const;

/** How long a person's neutral has to answer an invitation: a minute. */
export const INVITE_ANSWER_TICKS = 600;
/** How long a side's people have to answer a neutral's ask: 30 seconds. */
export const ASK_ANSWER_TICKS = 300;
