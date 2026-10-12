// CHAMBER (r16): the chamber's own bookkeeping. Its dice (a side stream per
// decision, salted, so the council's business never shifts the world's luck
// or the POWER track's), a few small words, and who sits where.

import { dateOf } from "./Calendar";
import { seatHolderId, seatsOf } from "./CouncilTitles";
import type { Rng } from "./Rng";
import type { GameState, Life } from "./Types";
import { worldRng } from "./WorldRng";

/** The chamber's salt: every decision of the track rolls on its own stream. */
const SALT = 0x3c4a1;

/**
 * Dice for one decision: the same game, day and `key` always roll the same,
 * and nothing else's dice are touched.
 */
export function cdice(s: GameState, ...key: number[]): Rng {
  let h = SALT;
  for (const k of key) h = (Math.imul(h ^ (k | 0), 0x01000193) + 0x9e37) | 0;
  return worldRng(s, h);
}

/** A whole number for a string (a line's key, a matter's key). */
export function strHash(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++)
    h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h | 0;
}

export const yearOf = (day: number) => dateOf(day).year;

/** Whether a character is someone's played character. */
export function playedC(s: GameState, c: number): boolean {
  return c >= 0 && s.lives.some((l) => l.c === c);
}

export function lifeOfC(s: GameState, c: number): Life | undefined {
  return c >= 0 ? s.lives.find((l) => l.c === c) : undefined;
}

/** Whether someone sits on a nation's council now. */
export function onCouncil(s: GameState, n: number, c: number): boolean {
  if (c < 0) return false;
  for (const seat of seatsOf(s.nations[n]))
    if (seatHolderId(s, n, seat) === c) return true;
  return false;
}

/** Whether someone sits in a nation's assembly now. */
export function inHouse(s: GameState, n: number, c: number): boolean {
  return c >= 0 && (s.polities[n]?.assembly ?? []).includes(c);
}

/** A title mid-sentence: only its first letter lowered ("presents for the Haudenosaunee"). */
export const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export const upperFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "a, b and c". */
export function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
