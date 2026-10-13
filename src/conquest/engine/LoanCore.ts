// ECON (r17): what the loan modules share. The bonds kept outside the lives,
// what changed for the players, the track's own dice, the lawful rate of
// interest where a bond is made, and the secrecy: a bond is the business of
// its two parties, and each player is sent only their own.
//
// The lawful rate follows the laws against usury of the colony and the
// crown a province is under, by the year:
// - England: 8 in 100 by the act of 1624 (21 Jac. I c. 17); 6 by the act
//   against excessive usury of 1660 (12 Car. II c. 13). The Statute of Anne's
//   5 (1713) was England's own; the colonies made their own acts on its
//   model, most at 6 and some as high as 8.
// - Massachusetts: 8 in 100 from 1641, 6 from the act of 1693.
// - Virginia: 5 in 100 from the act to restrain the taking of excessive
//   usury of 1748 (Hening vi, 101-4), with double forfeiture.
// - Pennsylvania: brought down from 8 in 100 to 6 by the act of 14 October
//   1722.
// - France and her colonies: the king's rate, the denier vingt, 5 in 100.
// - Spain and the Indies: censos at no less than 20,000 maravedís the
//   thousand, 5 in 100, by the pragmática of 1608.
// - The Dutch and Swedish colonies, and anywhere else the crown's law runs
//   without an act of its own: 6 in 100, the colonies' common rate.
// - Among the native nations nobody takes interest: a loan is repaid in
//   kind and in goodwill.

import { colonyOf, lawOf, type Colony, type LawOf } from "./BondLaw";
import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { lifeOfChar, lifeOfSeat } from "./LifeQueries";
import { Rng } from "./Rng";
import type {
  GameDelta,
  GameState,
  Life,
  Loan,
  LoanState,
  MapDef,
} from "./Types";

// ---------------------------------------------------------------- the rules' numbers

/** A bond's terms to choose from, in months (a year by default). */
export const LOAN_TERMS = [6, 12, 24, 36];
export const LOAN_TERM_DEFAULT = 12;
/** Sums to lend or borrow. */
export const LOAN_SUMS = [5, 10, 20, 40, 80, 150];
/** Days before a bond falls due that the borrower is reminded. */
export const LOAN_REMIND_DAYS = 30;
/** More time to choose from, in months. */
export const LOAN_MORE = [3, 6];
/** An offer between two players lapses after this many days unanswered. */
export const LOAN_OFFER_DAYS = 30;
/** Bonds settled longer ago than this are dropped from the record. */
const LOAN_KEEP_DAYS = 730;

/** The law against usury where a bond is made: the rate, and which law. */
export interface LawfulRate {
  /** Interest a year (0.06 for six in a hundred). */
  rate: number;
  /** The law, in words. */
  law: string;
}

/** One law against usury: where it ran, from when to when, and its rate. */
export interface UsuryLaw {
  /** In words, for the guide. */
  where: string;
  /** English colonies by name, or the whole of a crown's law. */
  colonies?: Colony[];
  law?: LawOf;
  from: number;
  to: number;
  rate: number;
  text: string;
}

/**
 * The laws against usury the game follows (the guide's table is made from
 * these): an English colony's own act first, then England's; then each
 * crown's law.
 */
export const USURY: UsuryLaw[] = [
  {
    where: "Massachusetts (and Maine)",
    colonies: ["massachusetts", "maine"],
    from: 1607,
    to: 1692,
    rate: 0.08,
    text: "Massachusetts' law of 1641: 8 in 100 a year",
  },
  {
    where: "Massachusetts (and Maine)",
    colonies: ["massachusetts", "maine"],
    from: 1693,
    to: 1776,
    rate: 0.06,
    text: "Massachusetts' act of 1693: 6 in 100 a year",
  },
  {
    where: "Virginia",
    colonies: ["virginia"],
    from: 1748,
    to: 1776,
    rate: 0.05,
    text: "Virginia's act to restrain the taking of excessive usury (1748): 5 in 100 a year",
  },
  {
    where: "Pennsylvania",
    colonies: ["pennsylvania"],
    from: 1607,
    to: 1722,
    rate: 0.08,
    text: "Pennsylvania's law before 1722: 8 in 100 a year",
  },
  {
    where: "Pennsylvania",
    colonies: ["pennsylvania"],
    from: 1723,
    to: 1776,
    rate: 0.06,
    text: "Pennsylvania's act of 1722, from eight in a hundred to six",
  },
  {
    where: "England's other colonies",
    law: "english",
    from: 1607,
    to: 1659,
    rate: 0.08,
    text: "The act against usury of 1624: 8 in 100 a year",
  },
  {
    where: "England's other colonies",
    law: "english",
    from: 1660,
    to: 1776,
    rate: 0.06,
    text: "The act against excessive usury of 1660: 6 in 100 a year",
  },
  {
    where: "France's colonies",
    law: "french",
    from: 1607,
    to: 1776,
    rate: 0.05,
    text: "The king's rate, the denier vingt: 5 in 100 a year",
  },
  {
    where: "Spain's colonies",
    law: "spanish",
    from: 1607,
    to: 1776,
    rate: 0.05,
    text: "The pragmática of 1608: censos at no less than 20,000 maravedís the thousand, 5 in 100 a year",
  },
  {
    where: "The Dutch and Swedish colonies",
    law: "dutch",
    from: 1607,
    to: 1776,
    rate: 0.06,
    text: "The colonies' common rate: 6 in 100 a year",
  },
  {
    where: "The Dutch and Swedish colonies",
    law: "swedish",
    from: 1607,
    to: 1776,
    rate: 0.06,
    text: "The colonies' common rate: 6 in 100 a year",
  },
];

/** The lawful rate of interest in a province, by its law and the year. */
export function lawfulRate(
  s: GameState,
  map: MapDef,
  p: number,
  day = s.day,
): LawfulRate {
  const y = dateOf(day).year;
  const { law: l, adjective } = lawOf(s, p);
  if (l === "native")
    return {
      rate: 0,
      law: `Among the ${adjective} nobody takes interest: a loan is repaid in kind and in goodwill`,
    };
  const law = l === "none" ? "english" : l;
  const col = colonyOf(map, p);
  const inYear = (u: UsuryLaw) => y >= u.from && y <= u.to;
  const rule =
    (law === "english"
      ? USURY.find((u) => u.colonies?.includes(col) && inYear(u))
      : undefined) ?? USURY.find((u) => u.law === law && inYear(u));
  return rule
    ? { rate: rule.rate, law: rule.text }
    : { rate: 0.06, law: "The colonies' common rate: 6 in 100 a year" };
}

/** "6 in 100 a year", "no interest". */
export function rateWords(rate: number): string {
  return rate > 0
    ? `${Math.round(rate * 1000) / 10} in 100 a year`
    : "no interest";
}

/** A month's interest on what's owed. */
export function monthInterest(l: Pick<Loan, "owed" | "rate">): number {
  return Math.round(((l.owed * l.rate) / 12) * 100) / 100;
}

/** All a borrower must pay to be clear of a bond now. */
export function owedNow(l: Pick<Loan, "owed" | "arrears">): number {
  return Math.round((l.owed + l.arrears) * 100) / 100;
}

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

export function loansChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

/** The state, made the first time it's needed. */
export function loanState(g: ConquestGame): LoanState {
  const s = g.s;
  if (!s.loans) {
    s.loans = { list: [] };
    loansChanged(g);
  }
  return s.loans;
}

/** Read-only, for queries (and the browser). */
export function loansOf(s: GameState): Loan[] {
  return s.loans?.list ?? [];
}

/** What changed since the last call (the whole of it: it's small), and clears it. */
export function takeLoanDelta(g: ConquestGame): LoanState | undefined {
  if (!CHANGED.has(g) || !g.s.loans) return undefined;
  CHANGED.delete(g);
  return g.s.loans;
}

export function applyLoanDelta(s: GameState, d: LoanState): void {
  s.loans = d;
}

/** Drop bonds settled long ago, so the state stays small. */
export function tidyLoans(g: ConquestGame): void {
  const st = g.s.loans;
  if (!st) return;
  const n = st.list.length;
  st.list = st.list.filter(
    (l) =>
      l.status !== "closed" || g.s.day - (l.ended ?? l.made) <= LOAN_KEEP_DAYS,
  );
  if (st.list.length !== n) loansChanged(g);
}

// ---------------------------------------------------------------- who's in it

/** The life of a bond's lender, if a player lends. */
export function lenderLife(s: GameState, l: Loan): Life | undefined {
  return l.ls ? lifeOfSeat(s, l.ls) : lifeOfChar(s, l.lender);
}

/** The life of a bond's borrower, if a player owes. */
export function borrowerLife(s: GameState, l: Loan): Life | undefined {
  return l.bs ? lifeOfSeat(s, l.bs) : lifeOfChar(s, l.borrower);
}

/** Bonds still open (offered, running, due, called...) a character is in. */
export function openLoans(s: GameState, c: number): Loan[] {
  return loansOf(s).filter(
    (l) => l.status !== "closed" && (l.lender === c || l.borrower === c),
  );
}

/** What a life owes on bond (open bonds where it borrowed). */
export function owing(s: GameState, life: Life): Loan[] {
  return loansOf(s).filter(
    (l) =>
      l.status !== "closed" && l.status !== "offered" && l.borrower === life.c,
  );
}

/** What a life has lent on bond (open bonds where it lent). */
export function lent(s: GameState, life: Life): Loan[] {
  return loansOf(s).filter(
    (l) =>
      l.status !== "closed" && l.status !== "offered" && l.lender === life.c,
  );
}

/** The open bond between two people, either way, if there is one. */
export function bondBetween(
  s: GameState,
  a: number,
  b: number,
): Loan | undefined {
  return loansOf(s).find(
    (l) =>
      l.status !== "closed" &&
      ((l.lender === a && l.borrower === b) ||
        (l.lender === b && l.borrower === a)),
  );
}

// ---------------------------------------------------------------- the track's dice

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The track's own dice: seeded afresh each day from the game's seed with a
 * salt of its own, so bonds and leave never disturb the world's dice (or
 * anyone else's), and nothing extra needs saving.
 */
export function edice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x2c1b3c6d) ^
          Math.imul(s.day + 4177, 0x297a2d39) ^
          0x10a7e5c0) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

// ---------------------------------------------------------------- secrets

/** A bond a seat may know of: its own, as lender or borrower. */
export function seesLoan(l: Loan, seat: string | null): boolean {
  return seat !== null && (l.ls === seat || l.bs === seat);
}

/** The bonds as one seat may see them. */
export function loanView(
  st: LoanState | undefined,
  seat: string | null,
): LoanState | undefined {
  if (!st) return st;
  return { list: st.list.filter((l) => seesLoan(l, seat)) };
}

/** Whether a delta carries bonds (sent to each seat as its own). */
export function loanDeltaSecret(d: GameDelta): boolean {
  return !!d.loans;
}

/** A delta as one seat may see it. */
export function loanDeltaForSeat(d: GameDelta, seat: string | null): GameDelta {
  return d.loans ? { ...d, loans: loanView(d.loans, seat) } : d;
}

/** The whole game as one seat may see it (on joining, and on a resync). */
export function loanStateForSeat(s: GameState, seat: string | null): GameState {
  return s.loans ? { ...s, loans: loanView(s.loans, seat) } : s;
}

/** Scenes and cooldowns that are a bond's (its parties' business only). */
export function loanKey(key: string): boolean {
  return key.startsWith("loan-");
}

const loanLine = (k: string) => k.startsWith("loan:");

/** Whether a life's books carry a bond's money (lent, borrowed, interest, repaid). */
export function booksHaveLoans(l: Partial<Life>): boolean {
  if (l.books?.lines.some((x) => loanLine(x.k))) return true;
  return !!l.statements?.some((st) => st.lines.some((x) => loanLine(x.k)));
}

/** A life's books as anyone else is sent them: a bond's lines taken out. */
export function booksForOthers<T extends Partial<Life>>(l: T, out: T): void {
  const strip = <
    B extends { lines: { k: string }[]; exp?: Record<string, number> },
  >(
    b: B,
  ): B => ({
    ...b,
    lines: b.lines.filter((x) => !loanLine(x.k)),
    ...(b.exp
      ? {
          exp: Object.fromEntries(
            Object.entries(b.exp).filter(([k]) => !loanLine(k)),
          ),
        }
      : {}),
  });
  if (l.books) out.books = strip(l.books);
  if (l.statements) out.statements = l.statements.map(strip);
}
