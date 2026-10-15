// Derpy Front: OpenFront features switched off on this site (r24, the
// owner's call). Each flag is checked where its feature starts, so upstream's
// own code stays as it is and later merges stay simple. Turning a flag on
// brings that feature back as upstream ships it.

/**
 * XP, levels, prestige, the reward track, the Legend ceremony and sharing a
 * milestone or a profile link. They all live on OpenFront's API: while off,
 * nothing asks it about XP (not at death, not at the end of a game), and no
 * XP section, level badge or Progression tab shows.
 */
export const PROGRESSION_ENABLED: boolean = false;

/**
 * OpenFront's preset-phrase quick chat on R, and the chat and emoji buttons
 * on the hover panel. Our typed chat (Enter) and the emoji key (F) stay.
 */
export const QUICK_CHAT_SHORTCUTS_ENABLED: boolean = false;
