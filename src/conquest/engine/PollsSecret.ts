// POLLS (r16): what of a player's canvass other players aren't sent. Treating,
// a great man's interest and canvassing are done in public, so they stay (the
// others' pages count them in that player's standing); a present to the
// sheriff is a private bribe, and the canvass's book (the money laid out, the
// week-by-week record, what moved it) is that player's own. IntrigueCore's
// lifeHasSecrets and lifeForOthers call these, so the full state on joining,
// a resync and every delta are scrubbed the same way.

import type { Canvass, PollsLife } from "./Types";

/** Whether a player's polls hold anything only they may see. */
export function pollsHaveSecrets(p: PollsLife | null | undefined): boolean {
  return !!p && (canvassHasSecrets(p.canvass) || !!p.last?.why.length);
}

/** Whether a canvass holds anything only its own player may see. */
export function canvassHasSecrets(cv: Canvass | null | undefined): boolean {
  if (!cv) return false;
  return (
    cv.sheriff >= 0 ||
    Object.keys(cv.spent).length > 0 ||
    cv.weeks.length > 0 ||
    cv.moved.length > 0
  );
}

/** A player's polls as another player may see them. */
export function pollsForOthers(p: PollsLife): PollsLife {
  if (!pollsHaveSecrets(p)) return p;
  const out: PollsLife = { ...p };
  // The result is public; the reckoning of why is the player's own.
  if (p.last?.why.length) out.last = { ...p.last, why: [] };
  const cv = p.canvass;
  if (cv && canvassHasSecrets(cv))
    out.canvass = {
      ...cv,
      sheriff: -1,
      spent: {},
      weeks: [],
      moved: [],
      lastMe: {},
      lastThem: {},
    };
  return out;
}
