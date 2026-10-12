// DICE (r14): the town's people at the dice. Who'll sit down when asked,
// and why (CK3 fashion: their means, what they think of you, their nature,
// their calling); how a computer player bids and calls (from their own dice
// and a third of the ones they can't see, bolder or warier by temper,
// sharper with intrigue); what they say as they do it; and the tells a
// sharp-eyed player may read on their faces.

import {
  atLeast,
  bidWords,
  countFace,
  FACES,
  raisesOver,
  totalDice,
} from "./DiceCore";
import { Explain } from "./Explain";
import { charSkill, opinionOf } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { ageOf, hasTrait } from "./Queries";
import type { Rng } from "./Rng";
import type {
  Breakdown,
  Character,
  DiceAct,
  DiceBid,
  DiceTable,
  GameState,
  Life,
} from "./Types";
import { SEATS } from "./Types";

type Mood = NonNullable<DiceAct["mood"]>;

// ---------------------------------------------------------------- sitting down

/** What someone has to play with: their trade's means, or their household's. */
export function meansOf(s: GameState, c: Character): number {
  if (c.role) return ROLES[c.role].wealth;
  // The governor, his council and his court: gentlemen, whatever their trade.
  const n = s.nations[c.nation];
  if (n?.ruler === c.id) return 120;
  if (n && SEATS.some((st) => n.council[st] === c.id)) return 60;
  if (n?.court.includes(c.id)) return 35;
  const sp = s.chars[c.spouse];
  if (sp?.alive && sp.role) return Math.round(ROLES[sp.role].wealth * 0.6);
  const father = s.chars[c.father];
  if (father?.alive && father.role)
    return Math.round(ROLES[father.role].wealth * 0.3);
  return 4;
}

/**
 * Whether a computer character will sit down at your table, and why: more
 * than nothing and they will. Their means against the stake, what they
 * think of you, their nature (a drunkard never says no; a zealot calls the
 * dice the devil's bones) and their calling (a minister doesn't dice).
 */
export function sitAcceptance(
  s: GameState,
  life: Life,
  c: Character,
  stake: number,
): Breakdown {
  const e = new Explain();
  e.add("A game of dice", 8);
  e.add("What they think of you", Math.round(opinionOf(s, c, life).total / 3));
  if (hasTrait(c, "drunkard")) e.add("Never says no to a game", 15);
  if (hasTrait(c, "greedy")) e.add("Likes the look of a pot", 6);
  if (hasTrait(c, "deceitful")) e.add("Enjoys a game of lies", 5);
  if (hasTrait(c, "ambitious")) e.add("A game to be won", 3);
  if (hasTrait(c, "brave")) e.add("Likes a risk", 3);
  if (hasTrait(c, "lazy")) e.add("Nothing better to do", 3);
  if (hasTrait(c, "craven")) e.add("Doesn't care for the risk", -8);
  if (hasTrait(c, "diligent")) e.add("Work in the morning", -6);
  if (hasTrait(c, "honest")) e.add("Doesn't hold with lying, even at dice", -4);
  if (hasTrait(c, "zealous")) e.add("Dice are the devil's bones", -18);
  if (c.role === "preacher") e.add("A minister doesn't dice", -45);
  if (c.role === "innkeeper") e.add("Has the bar to keep", -6);
  const m = meansOf(s, c);
  if (stake > m) e.add("Hasn't the money", -40);
  else if (stake * 3 > m) e.add("More than they can spare", -14);
  else if (stake * 20 <= m) e.add("Hardly worth the candle", -3);
  else if (stake * 8 <= m) e.add("Small stakes to them", 4);
  return e.done(0);
}

/** Old enough, alive, here, and not at another table. */
export function canAsk(s: GameState, c: Character | undefined): string | null {
  if (!c?.alive) return "Gone.";
  if (ageOf(s, c) < 16) return "Too young.";
  return null;
}

// ---------------------------------------------------------------- at the table

interface Temper {
  /** Their intrigue at it (Stealth). */
  skill: number;
  /** How far off their reckoning runs. */
  noise: number;
  /** How often they bid what they don't hold. */
  bluff: number;
  /** Below this a bid looks false enough to call. */
  callAt: number;
  /** They take others' bids as telling something. */
  reads: boolean;
}

function temperOf(s: GameState, c: Character): Temper {
  const skill = charSkill(s, c, "stealth");
  const t = (k: Parameters<typeof hasTrait>[1]) => hasTrait(c, k);
  const bluff =
    0.12 +
    (t("deceitful") ? 0.14 : 0) +
    (t("ambitious") ? 0.06 : 0) +
    (t("brave") ? 0.06 : 0) -
    (t("honest") ? 0.08 : 0) -
    (t("craven") ? 0.06 : 0);
  // There's no "paranoid" in the game: the shrewd see through bids, and a
  // liar suspects everyone else of lying.
  const callAt =
    0.36 +
    (t("shrewd") ? 0.08 : 0) +
    (t("deceitful") ? 0.04 : 0) -
    (t("honest") ? 0.03 : 0);
  return {
    skill,
    noise: Math.max(0.03, 0.2 - 0.013 * skill) + (t("drunkard") ? 0.08 : 0),
    bluff: Math.max(0.02, Math.min(0.42, bluff)),
    callAt: Math.max(0.25, Math.min(0.5, callAt)),
    reads: skill >= 6,
  };
}

export interface ComputerMove {
  liar?: true;
  bid?: DiceBid;
  say: string;
  mood: Mood;
  /** They believe their own bid (for the tells). */
  sure: boolean;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const OPENING: ((b: DiceBid) => string)[] = [
  (b) => `${cap(bidWords(b))}, to begin.`,
  (b) => `I'll say ${bidWords(b)}.`,
  (b) => `${cap(bidWords(b))}. Let's see who flinches.`,
  (b) => `${cap(bidWords(b))}, for a start.`,
];
const RAISE: ((b: DiceBid) => string)[] = [
  (b) => `${cap(bidWords(b))}.`,
  (b) => `Make it ${bidWords(b)}.`,
  (b) => `${cap(bidWords(b))}, and I'll stand by it.`,
  (b) => `${cap(bidWords(b))}. Your move, friend.`,
  (b) => `I'll go ${bidWords(b)}, God help me.`,
  (b) => `${cap(bidWords(b))}, and not a pip fewer.`,
];
const JUMP: ((b: DiceBid) => string)[] = [
  (b) => `Let's not dither: ${bidWords(b)}!`,
  (b) => `${cap(bidWords(b))}! Beat that.`,
];
const LIAR = [
  "Liar!",
  "I don't believe a word of it. Lift your cup!",
  "That's a lie, and I'll see it.",
  "Liar, by God! Show them.",
  "Never in this world. Liar!",
];

/**
 * A computer player's turn: a bid or "Liar!". They reckon from their own
 * dice and a third of the dice they can't see (ones wild), off by a margin
 * that shrinks with their intrigue; the sharp take others' bids as telling
 * something; and they bluff now and then by temper. Beatable, not random.
 */
export function computerMove(
  s: GameState,
  t: DiceTable,
  i: number,
  r: Rng,
): ComputerMove {
  const me = t.seats[i];
  const c = s.chars[me.c];
  const tm = temperOf(s, c);
  const own = me.dice;
  const total = totalDice(t);
  const hidden = total - own.length;
  const pick = <T>(xs: readonly T[]): T => xs[r.int(0, xs.length - 1)];
  // What others have bid this round, face by face (the sharp count it).
  const claims = new Map<number, number>();
  if (tm.reads)
    for (const a of t.acts)
      if (a.round === t.round && a.k === "bid" && a.c !== me.c && a.bid)
        claims.set(a.bid.f, (claims.get(a.bid.f) ?? 0) + 1);
  const est = (b: DiceBid): number => {
    const k = b.q - countFace(own, b.f);
    const credit = Math.min(1, 0.45 * (claims.get(b.f) ?? 0));
    const lo = Math.floor(credit);
    const fr = credit - lo;
    return (
      (1 - fr) * atLeast(hidden, k - lo) + fr * atLeast(hidden, k - lo - 1)
    );
  };
  const noisy = (p: number) =>
    Math.max(0, Math.min(1, p + (r.next() * 2 - 1) * tm.noise));
  const exact = (b: DiceBid) => atLeast(hidden, b.q - countFace(own, b.f));
  const cur = t.bid;
  // Opening a round: their best face, a little under what they'd expect.
  if (!cur) {
    const counts = FACES.map((f) => ({ f, n: countFace(own, f) }));
    const most = Math.max(...counts.map((x) => x.n));
    let f = pick(counts.filter((x) => x.n === most)).f;
    let q = Math.max(1, Math.floor(most + (hidden / 3) * 0.7));
    if (r.chance(tm.bluff * 0.6)) {
      const least = Math.min(...counts.map((x) => x.n));
      f = pick(counts.filter((x) => x.n === least)).f;
      q = Math.max(1, Math.round((hidden / 3) * 0.75));
    }
    q = Math.min(q, total);
    const bid = { q, f };
    return {
      bid,
      say: pick(OPENING)(bid),
      mood: r.chance(0.5) ? "smile" : "neutral",
      sure: exact(bid) >= 0.5,
    };
  }
  const liar = (): ComputerMove => ({
    liar: true,
    say: pick(LIAR),
    mood: r.chance(0.6) ? "angry" : "frown",
    sure: true,
  });
  // A bid that can't be true from what they hold: called, always.
  if (exact(cur) <= 0) return liar();
  const raises = raisesOver(cur, total).filter((b) => b.q <= cur.q + 2);
  if (!raises.length) return liar();
  const scored = raises.map((b) => ({
    b,
    p: noisy(est(b)),
    step: (b.q - cur.q) * 5 + (b.f - cur.f),
  }));
  const best = scored.reduce((a, x) =>
    x.p - 0.035 * x.step > a.p - 0.035 * a.step ? x : a,
  );
  const believe = noisy(est(cur));
  if (believe < tm.callAt) return liar();
  if (best.p < 0.3 && believe < 0.62) return liar();
  let bid = best.b;
  // Now and then, a bluff: a face they hardly hold, if it isn't absurd.
  if (r.chance(tm.bluff)) {
    const bluffs = scored
      .filter((x) => x.p >= 0.2 && countFace(own, x.b.f) <= 1)
      .sort((a, x) => a.step - x.step);
    if (bluffs.length) bid = bluffs[0].b;
  }
  const jump = bid.q - cur.q >= 2;
  return {
    bid,
    say: pick(jump ? JUMP : RAISE)(bid),
    mood: jump || r.chance(0.35) ? "smile" : "neutral",
    sure: exact(bid) >= 0.5,
  };
}

// ---------------------------------------------------------------- tells

const UNSURE: ((n: string, he: string, his: string) => string)[] = [
  (n, he, his) => `${n}'s hand strays to ${his} cup: ${he} isn't sure of it.`,
  (n, he) =>
    `${n} wets ${he === "she" ? "her" : "his"} lips before speaking: reaching, you'd say.`,
  (n) => `${n} won't quite meet your eye on that one.`,
  (n) => `${n} laughs a beat too loud.`,
  (n, he, his) => `${n} drums ${his} fingers on the board while ${he} waits.`,
];
const SURE: ((n: string, he: string, his: string) => string)[] = [
  (n, he, his) => `${n} sits back easy: ${he} likes ${his} dice.`,
  (n, he, his) => `${n} doesn't so much as glance at ${his} cup.`,
  (n) => `${n} says it flat and steady, like a bill of lading read aloud.`,
  (n, he) =>
    `${n} reaches for ${he === "she" ? "her" : "his"} pot of ale, unhurried.`,
];

/**
 * The faces players at the table may read when a computer player bids.
 * Whether you notice anything, and whether you read it right, goes by your
 * Stealth against theirs (a drunkard is an open book); right more often
 * than not, never certain.
 */
export function readFaces(
  s: GameState,
  t: DiceTable,
  by: number,
  sure: boolean,
  r: Rng,
): { to: number; text: string }[] {
  const bidder = s.chars[by];
  if (!bidder) return [];
  const theirs = charSkill(s, bidder, "stealth");
  const out: { to: number; text: string }[] = [];
  for (const x of t.seats) {
    if (x.state !== "in" || x.seat === undefined || x.c === by) continue;
    const reader = s.chars[x.c];
    if (!reader) continue;
    const edge =
      charSkill(s, reader, "stealth") -
      theirs +
      (hasTrait(bidder, "drunkard") ? 2 : 0) -
      (hasTrait(reader, "drunkard") ? 1 : 0);
    const notice = Math.max(0.1, Math.min(0.65, 0.3 + 0.04 * edge));
    if (!r.chance(notice)) continue;
    const right = Math.max(0.55, Math.min(0.88, 0.68 + 0.025 * edge));
    const shown = r.chance(right) ? sure : !sure;
    const list = shown ? SURE : UNSURE;
    const he = bidder.female ? "she" : "he";
    const his = bidder.female ? "her" : "his";
    out.push({
      to: x.c,
      text: list[r.int(0, list.length - 1)](bidder.first, he, his),
    });
  }
  return out;
}

/** What a computer player says when the cups come up. */
export function revealLine(lost: boolean, r: Rng): string {
  const LOST = [
    "Damnation.",
    "Well, the dice are honest, at least.",
    "Hm. Pour me another.",
    "That's the way of it.",
  ];
  const WON = [
    "As I said.",
    "Ha! Give it here.",
    "The dice don't lie, friend.",
    "There it is.",
  ];
  const xs = lost ? LOST : WON;
  return xs[r.int(0, xs.length - 1)];
}
