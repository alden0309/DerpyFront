// LEDGER (r15): the month's books. Every coin that goes into or out of a
// player's purse (through earn and spend) is written in the month's books
// under the name of where it came from: a wage, a boat's crew, a cargo come
// home, a hand at the dice. The name is whatever flow is current when the
// money moves: the month's reckonings name theirs with `withFlow`, a command
// is named by its kind, and anything else is "other". Nothing here touches
// the dice: it only writes down what happened.
//
// Kept apart from Ledger.ts (the forecast, the statements, the tracker) so
// that LifeCore can call it without pulling in the rest of the game.

import type { ConquestGame } from "./Game";
import type { AffairKind, BookLine, Life, MonthBooks } from "./Types";

/** A name for the money moving now. */
export interface FlowTag {
  /** A stable key, the same as its forecast line's ("b:12", "m:Living"). */
  key: string;
  /** What it is, in words, for the statement. */
  label: string;
  /** It ran on luck (a voyage, a cargo, a dividend). */
  chance?: boolean;
  /** News written while it's current is news of your own affairs, of this kind. */
  aff?: AffairKind;
}

interface FlowState {
  tag: FlowTag | null;
  /** The month's turn is being reckoned (wages, keep, rents, voyages). */
  turn: boolean;
  /** A command's tag holds for the day it was given only (-1: until unset). */
  day: number;
}

const states = new WeakMap<object, FlowState>();

function stateOf(g: ConquestGame): FlowState {
  let st = states.get(g);
  if (!st) {
    st = { tag: null, turn: false, day: -1 };
    states.set(g, st);
  }
  return st;
}

/** The flow current now (a command's lapses when the day turns). */
function current(g: ConquestGame): FlowTag | null {
  const st = stateOf(g);
  if (st.tag && st.day >= 0 && st.day !== g.s.day) {
    st.tag = null;
    st.day = -1;
  }
  return st.tag;
}

/** Run `fn` with the money it moves written under `tag` (nests). */
export function withFlow<T>(g: ConquestGame, tag: FlowTag, fn: () => T): T {
  const st = stateOf(g);
  const prev = current(g);
  const prevDay = st.day;
  st.tag = tag;
  st.day = -1;
  try {
    return fn();
  } finally {
    st.tag = prev;
    st.day = prevDay;
  }
}

/**
 * Name the money moving from now on (in a loop, before each item); returns
 * the name it replaced, to put back when the loop is done.
 */
export function setFlow(g: ConquestGame, tag: FlowTag | null): FlowTag | null {
  const st = stateOf(g);
  const prev = current(g);
  st.tag = tag;
  st.day = -1;
  return prev;
}

/** A command's name for its money: it holds until the command is done (or the day turns). */
export function commandFlow(g: ConquestGame, tag: FlowTag | null): void {
  const st = stateOf(g);
  st.tag = tag;
  st.day = tag ? g.s.day : -1;
}

/** The month's turn begins (true) or is done (false). */
export function turnFlows(g: ConquestGame, on: boolean): void {
  const st = stateOf(g);
  st.turn = on;
  st.tag = null;
  st.day = -1;
}

/** Whether the month's turn is being reckoned now. */
export function inTurn(g: ConquestGame): boolean {
  return stateOf(g).turn;
}

/** The kind of affair the news written now is about, if any. */
export function flowAff(g: ConquestGame): AffairKind | undefined {
  return current(g)?.aff;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A fresh month's books, opened now. */
export function openBooks(g: ConquestGame, life: Life): MonthBooks {
  return { from: g.s.day, open: r2(life.purse), lines: [] };
}

/** Write a coin's move in the month's books (called by earn; the purse has moved already). */
export function noteFlow(g: ConquestGame, life: Life, coins: number): void {
  if (!coins || !Number.isFinite(coins)) return;
  const b = (life.books ??= {
    from: g.s.day,
    open: r2(life.purse - coins),
    lines: [],
  });
  const st = stateOf(g);
  const tag = current(g);
  const key = tag?.key ?? (st.turn ? "turn" : "other");
  const turn = st.turn;
  let line: BookLine | undefined;
  for (const l of b.lines)
    if (l.k === key && !!l.t === turn) {
      line = l;
      break;
    }
  if (!line) {
    line = {
      k: key,
      l:
        tag?.label ??
        (turn ? "Other at the month's turn" : "Other comings and goings"),
      v: 0,
    };
    if (turn) line.t = 1;
    if (tag?.chance) line.c = 1;
    b.lines.push(line);
  }
  line.v = r2(line.v + coins);
}

// ---------------------------------------------------------------- names for the month's lines

/** "Wage: clerk (24 of 30 days)" and "Wage: clerk" are the same line. */
export function budgetKey(label: string): string {
  return `m:${label.replace(/ \([^)]*\)$/, "")}`;
}

/** A line of the month's reckoning (wages, dues, living, school), under its own name. */
export function budgetFlow(part: { label: string; key?: string }): FlowTag {
  return { key: part.key ?? budgetKey(part.label), label: part.label };
}

/** A debt paid when it falls due (to someone, by name). */
export function debtFlow(to: number, who: string): FlowTag {
  return { key: `debt:${to}`, label: `A debt repaid to ${who}` };
}
