// Derpy Front's in-game chat: the rules both ends of the wire agree on.
//
// Chat travels as its own server message, never as an intent: it is not in
// the turn, so the simulation, the game hash and every replay are exactly
// what they would be without it (see WireSchemas ClientChatMessageSchema).

/** The longest message, in UTF-16 code units (what the wire schema counts). */
export const CHAT_MAX_LENGTH = 200;

/**
 * At most this many recipients on a team or allies message — a whole team in
 * the biggest lobby fits.
 */
export const CHAT_MAX_RECIPIENTS = 400;

/**
 * The server's chat rate limit, per player: a burst of CHAT_BURST messages,
 * refilled at one every CHAT_REFILL_MS, and never more than
 * CHAT_PER_MINUTE in a minute. The client applies the same numbers so it can
 * say "slow down" instead of silently losing a message.
 */
export const CHAT_BURST = 4;
export const CHAT_REFILL_MS = 2_000;
export const CHAT_PER_MINUTE = 20;

export const CHAT_CHANNELS = ["all", "team", "allies"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

// C0/C1 controls, the bidi overrides and isolates (which can flip the rest of
// the line), zero-width joiners used to smuggle words past the filter, and
// the BOM.
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * What a typed message is sent as: invisible and control characters removed,
 * runs of whitespace (newlines included) collapsed to one space, trimmed, and
 * cut to CHAT_MAX_LENGTH without splitting an emoji in half. Empty means
 * there is nothing to send.
 */
export function normalizeChatText(raw: string): string {
  const text = raw
    .replace(/[\t\n\v\f\r]/g, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= CHAT_MAX_LENGTH) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > CHAT_MAX_LENGTH) break;
    out += ch;
  }
  return out.trimEnd();
}
