// EVENTS (r21): vingt-et-un, the card tables' own bookkeeping: the cards and
// what they count, a deck shuffled on the table's own dice, where the tables
// live in the game, the delta that carries them, each player's view of them
// (their own cards and nobody else's until they're shown, the banker's only
// when he turns them up, never the deck), and the odds a player is shown,
// worked out from the cards they can't see: the same arithmetic the town's
// people play by.

import type { ConquestGame } from "./Game";
import { Rng } from "./Rng";
import type { Card, CardSeat, CardsState, CardTable, GameState } from "./Types";

// ---------------------------------------------------------------- the rules' numbers

/** What a hand is staked at (a table's stake is chosen when it opens). */
export const CARD_STAKES = [1, 2, 5, 10];
/** Punters at a table at most (the banker apart). */
export const MAX_PUNTERS = 5;
/** The banker draws to this, and stands on it (a soft one too). */
export const BANK_STANDS = 17;
/** Real seconds a player has to decide before the table decides for them (in company). */
export const CARD_STALL_SECONDS = 45;
/** Game days a gathering waits for its first deal, and a table between hands for its next. */
export const CARD_IDLE_DAYS = 3;
/** Game days a broken-up table is kept (for its last hand). */
export const CARD_DONE_KEEP = 10;
/** Moves kept for the browser to play back. */
const MAX_CARD_ACTS = 120;

export const SUITS = ["hearts", "diamonds", "spades", "clubs"] as const;
export const RANK_NAMES = [
  "ace",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "knave",
  "queen",
  "king",
];

export const rankOf = (c: Card) => c % 13;
export const suitOf = (c: Card) => Math.floor(c / 13);
/** What a card counts (an ace one here; a hand's total makes it eleven when it can). */
export const valueOf = (c: Card) => Math.min(10, rankOf(c) + 1);

/** "the queen of spades". */
export function cardName(c: Card): string {
  return `the ${RANK_NAMES[rankOf(c)]} of ${SUITS[suitOf(c)]}`;
}

/** A hand's total: an ace counts eleven when that doesn't take it over (a "soft" hand). */
export function handTotal(cards: readonly Card[]): {
  total: number;
  soft: boolean;
} {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += valueOf(c);
    if (rankOf(c) === 0) aces++;
  }
  if (aces && t + 10 <= 21) return { total: t + 10, soft: true };
  return { total: t, soft: false };
}

/** A natural: an ace and a ten or a court card, the first two cards. */
export function isNatural(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

/** A fresh deck of fifty-two, shuffled on the table's dice (top last). */
export function shuffled(r: Rng): Card[] {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

export function cardsChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

export function cardsState(g: ConquestGame): CardsState {
  const s = g.s;
  if (!s.cards) {
    s.cards = { tables: [] };
    cardsChanged(g);
  }
  return s.cards;
}

/** The tables, when any changed since the last call (and clears it). */
export function takeCardsDelta(g: ConquestGame): CardsState | undefined {
  if (!CHANGED.has(g) || !g.s.cards) return undefined;
  CHANGED.delete(g);
  return g.s.cards;
}

export function applyCardsDelta(s: GameState, d: CardsState): void {
  s.cards = d;
}

/** A table's own dice: saved with it, so a game reloaded deals the same. */
export function cardRng(t: CardTable): Rng {
  return new Rng(t);
}

/** Note a move at a table, keeping the list short. */
export function pushCardAct(
  t: CardTable,
  a: Omit<CardTable["acts"][number], "n">,
): number {
  const n = (t.acts[t.acts.length - 1]?.n ?? 0) + 1;
  t.acts.push({ n, ...a });
  if (t.acts.length > MAX_CARD_ACTS)
    t.acts.splice(0, t.acts.length - MAX_CARD_ACTS);
  return n;
}

// ---------------------------------------------------------------- what each may see

/** Whether a seat's cards are shown to everyone now (a bust or a natural is turned up). */
const shownNow = (x: CardSeat) => x.state === "bust" || x.state === "natural";

/**
 * The tables as one player may see them: their own cards; nobody else's
 * until they're turned up (a bust, a natural, or the hand settled, when the
 * settling move shows them all); the banker's only once he's played; and
 * never the deck or the table's dice. A copy: the game's own is untouched.
 * `seat` is the room seat looking (null: nobody's, a watcher).
 */
export function cardsView(
  cs: CardsState | undefined,
  seat: string | null,
): CardsState | undefined {
  if (!cs) return cs;
  return {
    tables: cs.tables.map((t) => ({
      ...t,
      rng: 0,
      deck: [],
      bankCards: t.status === "hand" ? [] : t.bankCards,
      seats: t.seats.map((x) =>
        (x.seat !== undefined && x.seat === seat) ||
        shownNow(x) ||
        t.status !== "hand"
          ? x
          : { ...x, cards: [] },
      ),
    })),
  };
}

/** The whole game as one player may see it, as far as the cards go. */
export function cardsStateForSeat(
  s: GameState,
  seat: string | null,
): GameState {
  return s.cards ? { ...s, cards: cardsView(s.cards, seat) } : s;
}

// ---------------------------------------------------------------- read-only views

export const cardTables = (s: GameState): CardTable[] => s.cards?.tables ?? [];

export const cardTableById = (s: GameState, id: number) =>
  cardTables(s).find((t) => t.id === id);

/** The game going (or gathering) in a province's tavern. */
export function cardTableAt(s: GameState, p: number): CardTable | undefined {
  return cardTables(s).find((t) => t.prov === p && t.status !== "done");
}

/** Whether someone's place at a table is still theirs (in a hand, or between). */
export const seated = (x: CardSeat) => x.state !== "gone";

/** The table someone sits at now. */
export function cardSeatedAt(s: GameState, c: number): CardTable | undefined {
  return cardTables(s).find(
    (t) => t.status !== "done" && t.seats.some((x) => x.c === c && seated(x)),
  );
}

export function cardSeatOf(t: CardTable, c: number): CardSeat | undefined {
  return t.seats.find((x) => x.c === c);
}

/** Those at the table (not gone). */
export function punters(t: CardTable): CardSeat[] {
  return t.seats.filter(seated);
}

/** Who's sitting at the cards in a province's tavern, for the tavern's list of people. */
export function cardsSeatedIn(s: GameState, p: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const t of cardTables(s)) {
    if (t.prov !== p || t.status === "done") continue;
    for (const x of punters(t)) out.set(x.c, "at the card table");
    if (t.bank >= 0) out.set(t.bank, "keeping the bank at cards");
  }
  return out;
}

// ---------------------------------------------------------------- the odds

/**
 * The cards a player can't see, by what they count (index 1 the aces, 10
 * every ten and court card): the deck less their own cards and whatever has
 * been turned up this hand.
 */
export function unseenOf(known: readonly Card[]): number[] {
  const n = Array.from({ length: 11 }, (_, v) =>
    v === 0 ? 0 : v === 10 ? 16 : 4,
  );
  for (const c of known) n[valueOf(c)]--;
  return n.map((x) => Math.max(0, x));
}

/** The chance the next card takes a hand over twenty-one. */
export function bustChance(cards: readonly Card[], unseen: number[]): number {
  const all = unseen.reduce((a, b) => a + b, 0);
  if (!all) return 0;
  // Only a hard total can bust (a soft one drops its ace to one).
  let hard = 0;
  for (const c of cards) hard += valueOf(c);
  let bad = 0;
  for (let v = 1; v <= 10; v++) if (hard + v > 21) bad += unseen[v];
  return bad / all;
}

/** The banker's final count: 17 to 21, or over (22). */
export type BankDist = Record<17 | 18 | 19 | 20 | 21 | 22, number>;

const BANK_MEMO = new Map<string, BankDist>();

/**
 * How the banker's hand ends, from the cards a player can't see: he draws to
 * seventeen and stands there (a soft seventeen too). The first two cards are
 * his; a natural he'd have shown at the deal, so this is given he hasn't one.
 * Exact, card by card from what's left (not a deck that never runs down).
 */
export function bankOdds(unseen: number[]): BankDist {
  const key = unseen.join(",");
  const memo = BANK_MEMO.get(key);
  if (memo) return memo;
  const out: BankDist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, 22: 0 };
  const left = [...unseen];
  let all = left.reduce((a, b) => a + b, 0);
  const walk = (hard: number, ace: boolean, n: number, p: number) => {
    const tot = ace && hard + 10 <= 21 ? hard + 10 : hard;
    if (n >= 2 && tot >= BANK_STANDS) {
      out[Math.min(22, tot) as keyof BankDist] += p;
      return;
    }
    if (hard > 21) {
      out[22] += p;
      return;
    }
    for (let v = 1; v <= 10; v++) {
      const k = left[v];
      if (!k) continue;
      const q = p * (k / all);
      const h = hard + v;
      const a = ace || v === 1;
      // Two cards that make a natural: shown at the deal, so not this hand.
      if (n === 1 && a && h + 10 === 21) continue;
      left[v]--;
      all--;
      walk(h, a, n + 1, q);
      left[v]++;
      all++;
    }
  };
  walk(0, false, 0, 1);
  // Given no natural: what's left shares the whole.
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum > 0)
    for (const k of Object.keys(out) as unknown as (keyof BankDist)[])
      out[k] /= sum;
  if (BANK_MEMO.size > 400) BANK_MEMO.clear();
  BANK_MEMO.set(key, out);
  return out;
}

/** Standing on a total: the chance the banker loses (or goes over), ties, or beats it. */
export function standOdds(
  total: number,
  bank: BankDist,
): { win: number; tie: number; lose: number } {
  if (total > 21) return { win: 0, tie: 0, lose: 1 };
  let win = bank[22];
  let tie = 0;
  let lose = 0;
  for (const t of [17, 18, 19, 20, 21] as const) {
    if (t < total) win += bank[t];
    else if (t === total) tie += bank[t];
    else lose += bank[t];
  }
  return { win, tie, lose };
}
