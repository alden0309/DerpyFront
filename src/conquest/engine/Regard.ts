// LIFE (r21): opinion that has to be earned, after Crusader Kings III. Three
// rules, the same for every kindness a player shows the computer's people:
//
// - each kind of kindness is worth less than it was (a chat, flattery, a
//   gift, courting, a round for the house, alms), and has a most it can come
//   to with one person (`WARMTH`);
// - doing it again while they still remember the last time adds less each
//   time: 3 in 5 of what the last one added (`REGARD.again`), so a gift a
//   month comes to 4, then 6.4, 7.8... and never past its most;
// - everything kind someone remembers of you, all together, counts in full to
//   25 and half beyond (`REGARD.soft`): "kindnesses only go so far".
//
// Friendship asks more too: they must know you (a few conversations), and it
// takes time. Unkindness isn't softened: an insult, a lie, a bribe refused
// count in full as they always did.

import type { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { remembers } from "./LifeCore";
import type { Character, Life } from "./Types";

export const REGARD = {
  /** Each time again (while it's remembered) adds this share of what the time before added. */
  again: 0.6,
  /** Kindnesses remembered count in full up to this... */
  soft: 25,
  /** ...and this share of each point past it. */
  softRate: 0.5,
  /** Friendship: what it takes (for the acceptance). */
  friendTime: -20,
  /** Conversations before they feel they know you. */
  knowTalks: 3,
  /** Not knowing you yet. */
  stranger: -15,
  /** Conversations after which "you've passed many an hour" (and what it's worth). */
  manyTalks: 6,
  manyHours: 8,
};

/** Each kindness: what the first time is worth, the most it comes to, and how long it's remembered. */
export const WARMTH: Record<
  string,
  { act: string; base: number; cap: number; years: number; was: string }
> = {
  "Good company": {
    act: "Talk",
    base: 1.5,
    cap: 5,
    years: 1,
    was: "+3 each time, at most 3",
  },
  "Flattered me": {
    act: "Flatter (when it lands)",
    base: 6,
    cap: 8,
    years: 2,
    was: "+10, at most 10",
  },
  "A generous gift": {
    act: "A gift (5 coins to a townsman)",
    base: 4,
    cap: 12,
    years: 2,
    was: "+7 (up to +30 for a big one), at most 30",
  },
  "Courted me": {
    act: "Court (when it goes well)",
    base: 8,
    cap: 20,
    years: 2,
    was: "+12, at most 12",
  },
  "Stood us a round": {
    act: "Stand a round (each of ten there)",
    base: 3,
    cap: 6,
    years: 1,
    was: "+6, at most 6",
  },
  "Generous to the poor": {
    act: "Alms (the minister)",
    base: 5,
    cap: 10,
    years: 2,
    was: "+8, at most 8",
  },
  "Brought gifts to the council": {
    act: "Tobacco for the council fire (each elder)",
    base: 5,
    cap: 10,
    years: 2,
    was: "+8, at most 8",
  },
};

/** What a gift is worth to someone (the first time): by its size against their standing. */
export function giftWorth(
  amount: number,
  status: number,
  mult: number,
): number {
  return Math.min(12, Math.round(((amount * 1.5) / (status + 1)) * mult) + 1);
}

/** What doing a kindness again would add now (for a forecast), and its total after. */
export function warmthNext(
  c: Character,
  me: number,
  why: string,
  base: number,
  day: number,
): { add: number; total: number; n: number } {
  const w = WARMTH[why];
  const cap = w?.cap ?? base;
  const old = c.memories.find(
    (m) => m.of === me && m.why === why && (m.until === 0 || m.until > day),
  );
  const n = old ? (old.n ?? 1) : 0;
  const was = old?.value ?? 0;
  const total = Math.min(
    Math.max(cap, was),
    Math.round((was + base * REGARD.again ** n) * 10) / 10,
  );
  return { add: Math.max(0, total - was), total, n };
}

/**
 * A kindness remembered: added to what they remember of the last (less each
 * time), up to its most. `base` overrides the table's (a gift's size).
 */
export function warm(
  g: ConquestGame,
  life: Life,
  c: Character,
  why: string,
  base?: number,
): void {
  if (life.c < 0) return;
  const w = WARMTH[why];
  const b = base ?? w?.base ?? 1;
  const next = warmthNext(c, life.c, why, b, g.s.day);
  remembers(g, life, c, why, next.total, w?.years ?? 1);
  const m = c.memories.find((x) => x.of === life.c && x.why === why);
  if (m) m.n = next.n + 1;
}

/** How many times you've talked with them, as they remember it. */
export function talksWith(c: Character, me: number, day: number): number {
  const m = c.memories.find(
    (x) =>
      x.of === me &&
      x.why === "Good company" &&
      (x.until === 0 || x.until > day),
  );
  return m ? (m.n ?? 1) : 0;
}

/**
 * Kindnesses only go so far: everything kind they remember of you counts in
 * full to 25, and half beyond. Adds the line that takes the rest away.
 */
export function softenKindness(e: Explain, kind: number): void {
  if (kind <= REGARD.soft) return;
  const over = kind - REGARD.soft;
  e.add(
    "Kindnesses only go so far",
    -Math.round(over * (1 - REGARD.softRate) * 10) / 10,
  );
}
