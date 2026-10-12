// DICE (r14): Liar's dice, the track's own bookkeeping. Where the tables
// live in the game, the delta that carries them to players, each player's
// view of them (everyone's dice hidden but their own until the cups are
// lifted), the table's own dice, the rules' numbers, and the read-only
// sums the engine, the computer players and the browser share: what a bid
// must beat, how many of a face are showing, and how likely a bid is from
// what one player can see.

import type { ConquestGame } from "./Game";
import { Rng } from "./Rng";
import type {
  DiceBid,
  DiceSeat,
  DiceState,
  DiceTable,
  GameState,
} from "./Types";

// ---------------------------------------------------------------- the rules' numbers

/** The buy-ins a table can be opened at (a month's wage is two or three). */
export const STAKES = [2, 5, 10, 25];
/** Dice under each cup at the start. */
export const DICE_EACH = 5;
/** Players at a table, all told. */
export const MIN_SEATS = 2;
export const MAX_SEATS = 6;
/** Real seconds a player has to bid or call before the table bids for them (in company). */
export const STALL_SECONDS = 45;
/** Game days an open table waits for its first roll before it breaks up. */
export const OPEN_DAYS = 3;
/** Game days a finished table is kept (for its end, and "Play again"). */
export const DONE_KEEP_DAYS = 20;
/** Moves kept for the browser to play back. */
const MAX_ACTS = 90;
/** Faces that can be bid on (ones are wild). */
export const FACES = [2, 3, 4, 5, 6];

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

export function diceChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

/** The state, made the first time it's needed. */
export function diceState(g: ConquestGame): DiceState {
  const s = g.s;
  if (!s.dice) {
    s.dice = { tables: [] };
    diceChanged(g);
  }
  return s.dice;
}

/** The tables, when any changed since the last call (and clears it). */
export function takeDiceDelta(g: ConquestGame): DiceState | undefined {
  if (!CHANGED.has(g) || !g.s.dice) return undefined;
  CHANGED.delete(g);
  return g.s.dice;
}

export function applyDiceDelta(s: GameState, d: DiceState): void {
  s.dice = d;
}

/**
 * The tables as one player may see them: their own dice, nobody else's
 * (until a reveal, which is in the moves), only the faces they read
 * themselves, and none of the table's own dice. A copy: the game's own
 * state is never touched. `seat` is the room seat looking (null: nobody's).
 */
export function diceView(
  ds: DiceState | undefined,
  seat: string | null,
): DiceState | undefined {
  if (!ds) return ds;
  return {
    tables: ds.tables.map((t) => {
      const mine = t.seats.find((x) => x.seat !== undefined && x.seat === seat);
      return {
        ...t,
        rng: 0,
        seats: t.seats.map((x) => (x === mine ? x : { ...x, dice: [] })),
        tells: mine ? t.tells.filter((tl) => tl.to === mine.c) : [],
      };
    }),
  };
}

/**
 * The whole game as one player may see it (the full state sent on joining
 * and on a resync): the tables as above, and none of the world's own dice
 * (the browser never rolls them; the server alone does).
 */
export function stateForSeat(s: GameState, seat: string | null): GameState {
  return { ...s, rng: 0, dice: diceView(s.dice, seat) };
}

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The track's own dice for things that aren't a table's (a cheat in the
 * tavern): seeded afresh each day from the game's seed with a salt of its
 * own, so they never touch the world's dice and need nothing saved.
 */
export function ddice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x7feb352d) ^
          Math.imul(s.day + 4241, 0x846ca68b) ^
          0x1d6b9c2f) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

/** A table's own dice: saved with it, so a game reloaded rolls the same. */
export function tableRng(t: DiceTable): Rng {
  return new Rng(t);
}

/** Note a move at a table, keeping the list short. */
export function pushAct(
  t: DiceTable,
  a: Omit<DiceTable["acts"][number], "n">,
): number {
  const n = (t.acts[t.acts.length - 1]?.n ?? 0) + 1;
  t.acts.push({ n, ...a });
  if (t.acts.length > MAX_ACTS) {
    t.acts.splice(0, t.acts.length - MAX_ACTS);
    const first = t.acts[0].n;
    t.tells = t.tells.filter((x) => x.n >= first);
  }
  return n;
}

// ---------------------------------------------------------------- read-only views

export const tablesOf = (s: GameState): DiceTable[] => s.dice?.tables ?? [];

export const tableById = (s: GameState, id: number): DiceTable | undefined =>
  tablesOf(s).find((t) => t.id === id);

/** The game going (or gathering) in a province's tavern. */
export function tableAt(s: GameState, p: number): DiceTable | undefined {
  return tablesOf(s).find((t) => t.prov === p && t.status !== "done");
}

/** The table someone is sitting at now (with dice still, or gathering). */
export function seatedAt(s: GameState, c: number): DiceTable | undefined {
  return tablesOf(s).find(
    (t) =>
      t.status !== "done" && t.seats.some((x) => x.c === c && x.state === "in"),
  );
}

/** Someone's place at a table. */
export function seatOf(t: DiceTable, c: number): DiceSeat | undefined {
  return t.seats.find((x) => x.c === c);
}

/** Those still with dice. */
export function stillIn(t: DiceTable): DiceSeat[] {
  return t.seats.filter((x) => x.state === "in");
}

/** All the dice under all the cups. */
export function totalDice(t: DiceTable): number {
  return stillIn(t).reduce((m, x) => m + x.n, 0);
}

/** How many of a face are showing, ones counted as wild. */
export function countFace(dice: readonly number[], f: number): number {
  let n = 0;
  for (const d of dice) if (d === f || d === 1) n++;
  return n;
}

/** Whether a bid beats the one standing (and could be true at all). */
export function bidProblem(
  t: DiceTable,
  b: { q?: number; f?: number },
): string | null {
  if (!Number.isInteger(b.q) || !Number.isInteger(b.f))
    return "Name a number and a face.";
  const q = b.q as number;
  const f = b.f as number;
  if (f === 1) return "Ones are wild: nobody bids on ones.";
  if (f < 2 || f > 6) return "A face from two to six.";
  if (q < 1) return "At least one die.";
  if (q > totalDice(t))
    return `There are only ${totalDice(t)} dice on the table.`;
  const cur = t.bid;
  if (cur && !(q > cur.q || (q === cur.q && f > cur.f)))
    return `Raise the bid: more than ${bidWords(cur)}, or as many of a higher face.`;
  return null;
}

/** The raises that beat a bid, smallest first (the opening bids, if none). */
export function raisesOver(cur: DiceBid | null, total: number): DiceBid[] {
  const out: DiceBid[] = [];
  const from = cur ? cur.q : 1;
  for (let q = from; q <= total; q++)
    for (const f of FACES)
      if (!cur || q > cur.q || f > cur.f) out.push({ q, f });
  return out;
}

/** The least that beats a bid, or null if nothing can. */
export function smallestRaise(
  cur: DiceBid | null,
  total: number,
): DiceBid | null {
  if (!cur) return total > 0 ? { q: 1, f: 2 } : null;
  if (cur.f < 6) return { q: cur.q, f: cur.f + 1 };
  return cur.q + 1 <= total ? { q: cur.q + 1, f: 2 } : null;
}

/** Whether `a` is higher than `b`. */
export function beats(a: DiceBid, b: DiceBid | null): boolean {
  return !b || a.q > b.q || (a.q === b.q && a.f > b.f);
}

/** Choose(n, k) for small numbers. */
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** The chance at least `k` of `n` unseen dice show a face (or a one): a third each. */
export function atLeast(n: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let p = 0;
  for (let i = k; i <= n; i++)
    p += choose(n, i) * (1 / 3) ** i * (2 / 3) ** (n - i);
  return Math.max(0, Math.min(1, p));
}

/**
 * How likely a bid is from what one player sees: their own dice, and that
 * a third of the dice they can't see (counting wilds) show any face.
 */
export function bidChance(
  own: readonly number[],
  hidden: number,
  b: DiceBid,
): number {
  return atLeast(hidden, b.q - countFace(own, b.f));
}

/** "certain", "likely", "a stretch", "a long shot". */
export function chanceWord(p: number): string {
  // Certain only when your own dice make the bid already.
  if (p >= 1) return "certain";
  if (p >= 0.55) return "likely";
  if (p >= 0.25) return "a stretch";
  return "a long shot";
}

const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

const FACE_ONE = ["", "one", "two", "three", "four", "five", "six"];
const FACE_MANY = ["", "ones", "twos", "threes", "fours", "fives", "sixes"];

/** "a five", "fives". */
export function faceName(f: number, many: boolean): string {
  return many ? FACE_MANY[f] : FACE_ONE[f];
}

/** "four fives", "one six". */
export function bidWords(b: DiceBid): string {
  return `${numberWord(b.q)} ${faceName(b.f, b.q !== 1)}`;
}

/** The next with dice after seat `i`, going round the table. */
export function nextIn(t: DiceTable, i: number): number {
  for (let k = 1; k <= t.seats.length; k++) {
    const j = (i + k) % t.seats.length;
    if (t.seats[j].state === "in") return j;
  }
  return i;
}

/**
 * DICE (r14): who's sitting at a table in a province's tavern, with what
 * they're doing there, for the tavern's list of people (Areas.ts).
 */
export function diceSeatedIn(s: GameState, p: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const t of tablesOf(s)) {
    if (t.prov !== p || t.status === "done") continue;
    for (const x of t.seats)
      if (x.state === "in")
        out.set(
          x.c,
          t.status === "open"
            ? "waiting at the dice table"
            : "at the dice table",
        );
  }
  return out;
}
