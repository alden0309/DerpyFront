// CHAIR (r16): the small rules of the road to the governor's chair that other
// tracks' files ask about (the council's seats, the speaker's chair), kept
// apart from the rest of the governorship so they can be imported anywhere
// without pulling the council or the assembly in with them.

import { Check, lifeOfChar, no, yes } from "./LifeQueries";
import { ageOf } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import type { CouncilSeat, GameState } from "./Types";

/**
 * What the governor's friends expect in presents from someone given a seat
 * on his council: about two or three months of its pay, more for the seats
 * that handle money. Nothing at a native council fire, nor where a player
 * governs (he has no friends of his own to be squared).
 */
export const SEAT_PRESENTS: Record<CouncilSeat, number> = {
  treasurer: 15,
  spymaster: 14,
  attorney: 12,
  marshal: 12,
  envoy: 10,
  surveyor: 10,
  chaplain: 6,
  speaker: 0,
};

/** The presents a seat costs in this nation now (0 if none are expected). */
export function seatPresents(
  s: GameState,
  n: number,
  seat: CouncilSeat,
): number {
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return 0;
  if (lifeOfChar(s, nation.ruler)) return 0;
  return SEAT_PRESENTS[seat] ?? 0;
}

/** The speaker's chair: 21 at the least, and two years in the house first under 25. */
export const SPEAKER_AGE = 21;
export const SPEAKER_YOUNG = 25;
export const SPEAKER_YEARS = 2;

/** Whether a member of the house may be chosen speaker (and why not). */
export function speakerOk(s: GameState, c: number): Check {
  const ch = s.chars[c];
  if (!ch?.alive) return no("Gone.");
  const age = ageOf(s, ch);
  if (age < SPEAKER_AGE)
    return no(`The chair wants a man of ${SPEAKER_AGE} at the least.`);
  if (age >= SPEAKER_YOUNG) return yes;
  const life = lifeOfChar(s, c);
  // The computer's members are grown men of standing; a player's years in
  // the house are counted from the day they first sat.
  if (!life) return yes;
  const since = life.chair?.houseSince;
  const years = since === undefined ? 0 : (s.day - since) / DAYS_PER_YEAR;
  if (years >= SPEAKER_YEARS) return yes;
  return no(
    `Under ${SPEAKER_YOUNG}, the chair wants ${SPEAKER_YEARS} years in the house first (you have ${Math.floor(years * 10) / 10}).`,
  );
}
