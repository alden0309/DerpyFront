import { DisplayMessageUpdate } from "@openfront/engine-api/game/GameUpdates";
import {
  ASK_ANSWER_TICKS,
  GoodwillWord,
  INVITE_ANSWER_TICKS,
  DIPLOMACY_MESSAGES as M,
} from "@openfront/engine-api/game/ScenarioDiplomacy";
import {
  ScenarioAskJoinIntent,
  ScenarioGiftIntent,
  ScenarioInviteIntent,
  ScenarioJoinReplyIntent,
} from "@openfront/engine-api/Schemas";
import { translateText } from "../Utils";
import { sideName } from "./ScenarioText";

/**
 * DIPLO (r27): courting the neutrals in a Scenario, the client's half: the
 * intent event Transport sends, and the words (en.json's scenario_diplomacy
 * section). The rules are the engine's (engine/scenario/ScenarioDiplomacy.ts).
 */

export type DiplomacyIntent =
  | ScenarioGiftIntent
  | ScenarioInviteIntent
  | ScenarioAskJoinIntent
  | ScenarioJoinReplyIntent;

/** A courting intent for the server (Transport sends it as it is). */
export class SendScenarioDiplomacyIntentEvent {
  constructor(public readonly intent: DiplomacyIntent) {}
}

function tr(key: string, fallback: string, params?: Record<string, string>) {
  const t = translateText(key, params);
  return t === key ? fallback : t;
}

/**
 * A side's name as it reads in a sentence: "the Allies", "Sardinia and
 * France", "Wei".
 */
export function sideInSentence(side: string): string {
  return tr(`scenario_diplomacy.side_${side.toLowerCase()}`, sideName(side));
}

/** How a neutral feels toward a side, in words ("Wary"). */
export function goodwillWordText(word: GoodwillWord): string {
  return translateText(`scenario_diplomacy.word_${word}`);
}

const KEYS = new Set<string>(Object.values(M));

/** Whether an engine message is courting news (scenario_diplomacy.msg_*). */
export function isDiplomacyMessage(key: string): boolean {
  return KEYS.has(key);
}

/**
 * The messages that come as a yes/no card (actionable-events), not as a
 * line in the events panel.
 */
export function isDiplomacyCard(key: string): boolean {
  return key === M.invited || key === M.asks;
}

/** A courting message's params, with its side as it reads in a sentence. */
export function diplomacyParams(
  update: DisplayMessageUpdate,
): Record<string, string | number> {
  const params = { ...(update.params ?? {}) };
  if (typeof params.side === "string") {
    params.side = sideInSentence(params.side);
  }
  return params;
}

/** A yes/no card for actionable-events (an invitation, or a neutral's ask). */
export interface DiplomacyCard {
  description: string;
  /** Who the card is from (the inviter, or the asking neutral). */
  focusID: number;
  /** The neutral it is about (small id): its joining closes the card. */
  neutral: number;
  duration: number;
  buttons: {
    text: string;
    className: string;
    action: () => void;
    preventClose?: boolean;
  }[];
}

/**
 * The card for a courting message to this player, or null: "Germany invites
 * you to join the Axis" (Join / Decline), "Spain asks to join the Allies"
 * (Accept / Refuse). `focus` shows the other nation on the map.
 */
export function diplomacyCard(
  update: DisplayMessageUpdate,
  me: { smallID(): number },
  other: { id(): string; displayName(): string } | null,
  emit: (event: SendScenarioDiplomacyIntentEvent) => void,
  focus: () => void,
): DiplomacyCard | null {
  if (!isDiplomacyCard(update.message) || other === null) return null;
  if (update.playerID !== me.smallID() || update.focusPlayerID === undefined) {
    return null;
  }
  const side = String(update.params?.side ?? "");
  const invited = update.message === M.invited;
  const reply = (accept: boolean) => () =>
    emit(
      new SendScenarioDiplomacyIntentEvent({
        type: "scenario_join_reply",
        other: other.id(),
        accept,
      }),
    );
  return {
    description: translateText(update.message, {
      name: other.displayName(),
      side: sideInSentence(side),
    }),
    focusID: update.focusPlayerID,
    neutral: invited ? me.smallID() : update.focusPlayerID,
    duration: invited ? INVITE_ANSWER_TICKS : ASK_ANSWER_TICKS,
    buttons: [
      {
        text: translateText("events_display.focus"),
        className: "btn-gray",
        action: focus,
        preventClose: true,
      },
      {
        text: invited
          ? translateText("scenario_diplomacy.join", {
              side: sideInSentence(side),
            })
          : translateText("scenario_diplomacy.accept"),
        className: "btn",
        action: reply(true),
      },
      {
        text: invited
          ? translateText("scenario_diplomacy.decline")
          : translateText("scenario_diplomacy.refuse"),
        className: "btn-info",
        action: reply(false),
      },
    ],
  };
}

/**
 * The neutral (small id) whose open cards a courting message closes: it
 * joined a side, so no invitation or ask about it is open any more.
 */
export function diplomacyCardsClosedBy(
  update: DisplayMessageUpdate,
): number | null {
  if (update.message !== M.joined) return null;
  return update.focusPlayerID ?? null;
}
