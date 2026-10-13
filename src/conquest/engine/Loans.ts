// ECON (r17): loans on terms. Lending money to someone (a player or one of
// the computer's people), or borrowing it, makes a bond: the sum, a term (a
// year unless you choose another), and interest at the lawful rate of the
// place it's made (LoanCore.ts), paid at each month's turn. The borrower may
// repay early, in whole or in part, whenever they like. A month before it
// falls due they're reminded; on the day, the lender may call it in, or let
// it run on at interest. Called in, the borrower pays, asks for more time
// (which the lender may grant), or can't: and then the lender forgives it,
// takes something in kind, or sues for it at the court-house (the suit for
// debt, Trials.ts).
//
// The computer's people lend and borrow by their means, their nature and
// what they think of you, and repay by their means and their honesty, at
// the odds shown before you act. Every opinion moved says why. A bond is
// its two parties' business only: in company, nobody else is sent it.
//
// Every loan the game had before (borrowing from someone, a loan asked by
// letter, a friend in need, a note of hand) makes a bond now, and old saves'
// debts become bonds the day they're loaded.

import { formatDate } from "./Calendar";
import { meansOf } from "./DiceAi";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { earn, journal, remembers, spend, touchLife } from "./LifeCore";
import {
  Check,
  isChildLife,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  yes,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import {
  bondBetween,
  borrowerLife,
  edice,
  lawfulRate,
  lenderLife,
  LOAN_MORE,
  LOAN_OFFER_DAYS,
  LOAN_REMIND_DAYS,
  LOAN_SUMS,
  LOAN_TERMS,
  loansChanged,
  loansOf,
  loanState,
  monthInterest,
  newLoanId,
  owedNow,
  owing,
  rateWords,
  tidyLoans,
} from "./LoanCore";
import type { World } from "./Map";
import { quote } from "./Markets";
import { ageOf, charName, hasTrait, stat } from "./Queries";
import { openTrial } from "./Trials";
import type {
  AffairItem,
  Breakdown,
  Character,
  EconCommand,
  GameState,
  Good,
  Life,
  LifeCommand,
  Loan,
  Part,
  RoleId,
  Trial,
  WareId,
} from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const MONTH = 30.4;

// ---------------------------------------------------------------- words

/** "a bond for 20 coins at 6 in 100 a year, due 12 May 1701". */
export function bondWords(l: Loan): string {
  return `${l.how === "note" ? "a note of hand" : "a bond"} for ${r1(l.sum)} coins at ${rateWords(l.rate)}, due ${formatDate(l.due)}`;
}

/** "bond at 6 in 100 a year, due 1 January 1703": after a sum already named. */
export function bondTerms(l: Loan): string {
  return `${l.how === "note" ? "a note of hand" : "bond"} at ${rateWords(l.rate)}, due ${formatDate(l.due)}`;
}

/** Who someone is, by name. */
function nameOf(s: GameState, c: number): string {
  return charName(s.chars[c]);
}

/**
 * A line in a party's journal about a bond: their own affairs, and secret
 * (another player is never sent it).
 */
export function note(
  g: ConquestGame,
  life: Life | undefined,
  text: string,
  tone?: "good" | "bad",
): void {
  if (!life || life.watching || life.c < 0) return;
  withFlow(g, { key: "news", label: "", aff: "loan" }, () =>
    journal(g, life, text, tone),
  );
  const last = life.journal[life.journal.length - 1];
  if (last && last.text === text) last.sec = true;
  touchLife(g, life);
}

/** A line in the bond's own record. */
function log(g: ConquestGame, l: Loan, text: string): void {
  l.log.push({ day: g.s.day, text });
  if (l.log.length > 12) l.log.splice(0, l.log.length - 12);
  loansChanged(g);
}

/** What someone thinks of a player, in a word for a memory. */
function minds(
  g: ConquestGame,
  of: Life | undefined,
  who: number,
  why: string,
  value: number,
  years = 3,
): void {
  const c = g.s.chars[who];
  if (!of || of.c < 0 || !c?.alive || c.id === of.c) return;
  remembers(g, of, c, why, value, years);
}

// ---------------------------------------------------------------- the computer's people

/** Callings that live on credit: they take a loan for their trade gladly. */
const TRADING: RoleId[] = [
  "merchant",
  "planter",
  "captain",
  "trader",
  "innkeeper",
  "printer",
  "master",
];

/** What a computer character has to pay with. */
export function meansFor(s: GameState, c: Character | undefined): number {
  return c ? meansOf(s, c) : 0;
}

/** Whether one of the computer's people would lend you this, and why (above nothing, they will). */
export function willLend(
  s: GameState,
  life: Life,
  c: Character,
  sum: number,
  months: number,
  free: boolean,
): Breakdown {
  const me = meOf(s, life);
  const e = new Explain().add("Lending is a risk", -10);
  if (!me) return e.done(0);
  const op = opinionOf(s, c, life).total;
  e.add(`What they think of you (${op})`, Math.max(-30, Math.min(30, op / 2)));
  const means = meansFor(s, c);
  if (sum > means * 0.6) e.add("More than they could spare", -40);
  else e.add("They've money put by", Math.min(10, Math.floor(means / 6)));
  if ((life.property ?? []).length) e.add("You own property", 10);
  const owes = owing(s, life).length;
  if (owes) e.add("You owe others already", -15 * Math.min(2, owes));
  if (hasTrait(c, "greedy")) e.add("Tight-fisted", free ? -20 : -5);
  if (hasTrait(c, "generous")) e.add("Open-handed", 6);
  const kin =
    [me.father, me.mother, me.spouse].includes(c.id) ||
    (me.father >= 0 && c.father === me.father) ||
    (me.mother >= 0 && c.mother === me.mother);
  if (kin) e.add("Family", 20);
  else if (life.ties[c.id] === "friend") e.add("A friend", 12);
  if (free) {
    if (!kin && life.ties[c.id] !== "friend") e.add("Without interest?", -15);
  } else e.add("Interest at the lawful rate", 5);
  if (months >= 36) e.add("Three years is a long while", -10);
  else if (months >= 24) e.add("Two years is a while", -5);
  return e.done(0);
}

/** Whether one of the computer's people would take a loan from you, and why (above nothing, they will). */
export function willBorrow(
  s: GameState,
  life: Life,
  c: Character,
  sum: number,
  months: number,
  free: boolean,
  rate: number,
): Breakdown {
  const e = new Explain();
  const means = meansFor(s, c);
  if (means < sum * 1.5) e.add("Short of ready money", 20);
  else if (means >= sum * 4) e.add("Has no need of it", -25);
  else e.add("Ready money is always useful", 5);
  if (c.role && TRADING.includes(c.role)) e.add("Credit for the trade", 10);
  const op = opinionOf(s, c, life).total;
  e.add(`What they think of you (${op})`, Math.max(-20, Math.min(20, op / 3)));
  if (free) e.add("No interest asked", 10);
  else if (rate > 0)
    e.add(`Interest at ${rateWords(rate)}`, -Math.round(rate * 100));
  if (hasTrait(c, "greedy")) e.add("Likes cheap money", 5);
  if (hasTrait(c, "honest") && means < sum)
    e.add("Won't borrow what they can't repay", -10);
  if (months >= 24) e.add("Time to make it pay", 4);
  return e.done(0);
}

/** How a computer borrower answers when a bond is called in: pay, ask for time, or can't. */
export interface RepayOdds {
  pay: number;
  time: number;
  cannot: number;
  why: Breakdown;
}

/**
 * What a computer borrower weighs when a bond is called in (the guide's
 * table is made from it): their means against what's owed, their nature,
 * what they think of the lender; the chance they pay is 1 in 2 and a point
 * in 100. Of the rest, those who could find half ask for time.
 */
export const REPAY_WEIGHTS = {
  means: [
    { ratio: 2, v: 35, label: "Well able to pay" },
    { ratio: 1, v: 15, label: "Able to pay" },
    { ratio: 0.5, v: -10, label: "It would pinch" },
    { ratio: 0, v: -40, label: "Can't find the money" },
  ],
  honest: 20,
  deceitful: -25,
  greedy: -10,
  generous: 5,
  opinion: { per: 4, cap: 20 },
  behind: -10,
  kept: 5,
  putOff: -8,
  scale: 100,
  min: 0.03,
  max: 0.97,
  /** Of those who don't pay, who ask for time: with half the means, and with less. */
  timeShare: { able: 0.7, short: 0.35 },
};

/** By their means and their honesty (and what they think of the lender): the odds a bond is rolled by. */
export function repayOdds(s: GameState, l: Loan): RepayOdds {
  const W = REPAY_WEIGHTS;
  const c = s.chars[l.borrower];
  const e = new Explain();
  const owed = Math.max(1, owedNow(l));
  const means = meansFor(s, c);
  const ratio = means / owed;
  const m =
    W.means.find((x) => ratio >= x.ratio) ?? W.means[W.means.length - 1];
  e.add(m.label, m.v);
  if (c && hasTrait(c, "honest")) e.add("Honest", W.honest);
  if (c && hasTrait(c, "deceitful")) e.add("Slippery", W.deceitful);
  if (c && hasTrait(c, "greedy")) e.add("Tight-fisted", W.greedy);
  if (c && hasTrait(c, "generous")) e.add("Open-handed", W.generous);
  const lender = lenderLife(s, l);
  if (lender && c) {
    const op = opinionOf(s, c, lender).total;
    e.add(
      `What they think of you (${op})`,
      Math.max(-W.opinion.cap, Math.min(W.opinion.cap, op / W.opinion.per)),
    );
  }
  if (l.arrears > 0) e.add("Behind with the interest", W.behind);
  else if (l.paid > 0) e.add("Has kept up the interest", W.kept);
  if (l.grace) e.add(`Put off before (${l.grace})`, W.putOff * l.grace);
  const why = e.done(0);
  const pay = Math.max(W.min, Math.min(W.max, 0.5 + why.total / W.scale));
  const rest = 1 - pay;
  const timeShare = ratio >= 0.5 ? W.timeShare.able : W.timeShare.short;
  return {
    pay: r2(pay),
    time: r2(rest * timeShare),
    cannot: r2(1 - r2(pay) - r2(rest * timeShare)),
    why,
  };
}

/** A computer borrower comes and pays on the day without being asked: half as often as they'd pay when called. */
export function dueRepayChance(s: GameState, l: Loan): number {
  return r2(repayOdds(s, l).pay * 0.5);
}

/** A computer borrower repays early, a month: honest and flush, now and then. */
export function earlyChance(s: GameState, l: Loan): number {
  const c = s.chars[l.borrower];
  const means = meansFor(s, c);
  const owed = owedNow(l);
  if (!c || means < owed) return 0;
  let p = means >= owed * 2 ? 0.03 : 0.01;
  if (hasTrait(c, "honest")) p *= 1.5;
  if (hasTrait(c, "deceitful") || hasTrait(c, "greedy")) p *= 0.3;
  return r2(p);
}

/** The chance a computer lender grants more time (by what they think of you, and how often they have). */
export function timeChance(s: GameState, l: Loan): number {
  const c = s.chars[l.lender];
  const b = borrowerLife(s, l);
  const op = c && b ? opinionOf(s, c, b).total : 0;
  const rich = meansFor(s, c) >= owedNow(l) * 3 ? 0.1 : 0;
  return r2(
    Math.max(0.05, Math.min(0.95, 0.55 + op / 100 - 0.2 * l.grace + rich)),
  );
}

/** What a computer lender does when a bond falls due: let it run on, or call it in. */
export function lenderAtDue(s: GameState, l: Loan): "renew" | "call" {
  const c = s.chars[l.lender];
  const b = borrowerLife(s, l);
  const op = c && b ? opinionOf(s, c, b).total : 0;
  return op >= 40 && l.arrears <= 0 && l.grace < 2 ? "renew" : "call";
}

/** What a computer lender does when you can't pay. */
export function lenderOnDefault(
  s: GameState,
  w: World,
  l: Loan,
): "time" | "kind" | "sue" | "forgive" {
  const c = s.chars[l.lender];
  const b = borrowerLife(s, l);
  const op = c && b ? opinionOf(s, c, b).total : 0;
  if (op >= 50 && l.grace < 2) return "time";
  if (b && kindWorth(s, w, l) >= owedNow(l) * 0.25) return "kind";
  if (courtFor(s, l) >= 0) return "sue";
  return "forgive";
}

// ---------------------------------------------------------------- where, and the court

/** Where a bond is made, and sued on: the borrower's town. */
export function placeOf(
  s: GameState,
  lender: number,
  borrower: number,
): number {
  const bl = lifeOfChar(s, borrower);
  if (bl) return bl.travel ? bl.home : bl.prov;
  const c = s.chars[borrower];
  if (c?.home !== undefined) return c.home;
  const ll = lifeOfChar(s, lender);
  return ll ? (ll.travel ? ll.home : ll.prov) : 0;
}

/** The nation whose court would hear a suit on a bond (-1: no court of a crown there). */
export function courtFor(s: GameState, l: Loan): number {
  const p = placeOf(s, l.lender, l.borrower);
  const owner = s.provinces[p]?.owner ?? -1;
  return owner >= 0 && s.nations[owner]?.kind === "power" ? owner : -1;
}

/** Roughly how a suit on a bond would go for the lender (a bond in writing is good evidence). */
export function suitOdds(s: GameState, l: Loan): number {
  const d = s.chars[l.borrower];
  const dl = borrowerLife(s, l);
  const evidence = l.how === "bond" || l.how === "letter" ? 10 : 7;
  const defence = dl
    ? Math.min(5, dl.renown / 15) + dl.skills.persuasion / 4 + 1.5
    : d
      ? stat(s, d, "dip") / 2 + (d.role ? ROLES[d.role].status / 2 : 0) + 1.5
      : 3;
  const lean = evidence + 1 - defence;
  return r2(Math.max(0.05, Math.min(0.95, (lean + 3) / 6)));
}

// ---------------------------------------------------------------- in kind

/** Goods a player borrower carries, and what they'd fetch here. */
function carriedGoods(
  s: GameState,
  w: World,
  life: Life,
): { item: Good | WareId; qty: number; worth: number }[] {
  const out: { item: Good | WareId; qty: number; worth: number }[] = [];
  const p = life.travel ? life.home : life.prov;
  const add = (item: Good | WareId, qty: number) => {
    if (qty <= 0) return;
    const worth = quote(s, w, life, p, item, -qty).total;
    if (worth > 0) out.push({ item, qty, worth });
  };
  for (const [g, v] of Object.entries(life.goods)) add(g as Good, v ?? 0);
  for (const [g, v] of Object.entries(life.wares ?? {}))
    add(g as WareId, v ?? 0);
  return out;
}

/** What a lender would get by taking a bond in kind. */
export function kindWorth(s: GameState, w: World, l: Loan): number {
  const b = borrowerLife(s, l);
  if (b)
    return r1(
      Math.min(
        owedNow(l),
        carriedGoods(s, w, b).reduce((m, x) => m + x.worth, 0),
      ),
    );
  // One of the computer's people hands over goods (at a discount) to what they can.
  const c = s.chars[l.borrower];
  return r1(Math.min(owedNow(l), meansFor(s, c) * 0.8) * 0.75);
}

/** What a computer borrower hands over, in words. */
function kindWords(c: Character | undefined): string {
  switch (c?.role) {
    case "planter":
      return "hogsheads of tobacco";
    case "merchant":
    case "trader":
      return "goods from the store";
    case "captain":
      return "a share in a cargo";
    case "innkeeper":
      return "casks from the cellar";
    case "hunter":
      return "a bale of pelts";
    case "master":
    case "maker":
      return "the tools of the trade";
    case "labourer":
      return "a cow and a winter's corn";
    default:
      return "plate, a good coat and what could be sold";
  }
}

// ---------------------------------------------------------------- checks

/** Whether you can lend someone this sum on these terms (they'll still decide). */
export function lendCheck(
  s: GameState,
  life: Life,
  c: Character | undefined,
  sum: number,
  months: number,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (!c?.alive || c.abroad) return no("They're not here to ask.");
  if (c.id === me.id) return no("That's you.");
  if (ageOf(s, c) < 16) return no("They're a child.");
  if (!LOAN_SUMS.includes(sum)) return no("Choose a sum.");
  if (!LOAN_TERMS.includes(months)) return no("Choose a term.");
  if (bondBetween(s, me.id, c.id))
    return no("There's a bond between you already.");
  if (life.purse < sum) return no(`You have ${Math.floor(life.purse)} coins.`);
  return yes;
}

/** Whether you can ask someone for a loan (they'll still decide). */
export function borrowCheck(
  s: GameState,
  life: Life,
  c: Character | undefined,
  sum: number,
  months: number,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (!c?.alive || c.abroad) return no("They're not here to ask.");
  if (c.id === me.id) return no("That's you.");
  if (ageOf(s, c) < 16) return no("They're a child.");
  if (!LOAN_SUMS.includes(sum)) return no("Choose a sum.");
  if (!LOAN_TERMS.includes(months)) return no("Choose a term.");
  if (bondBetween(s, me.id, c.id))
    return no("There's a bond between you already.");
  const other = lifeOfChar(s, c.id);
  if (!other && sum > meansFor(s, c) * 0.6)
    return no("More than they could spare.");
  return yes;
}

// ---------------------------------------------------------------- making a bond

/** A new bond between two people (the money moves elsewhere). */
export function makeLoan(
  g: ConquestGame,
  o: {
    lender: number;
    borrower: number;
    sum: number;
    months: number;
    rate: number;
    how: Loan["how"];
    status?: Loan["status"];
    asked?: Loan["asked"];
    due?: number;
    made?: number;
  },
): Loan {
  const s = g.s;
  const ll = lifeOfChar(s, o.lender);
  const bl = lifeOfChar(s, o.borrower);
  const made = o.made ?? s.day;
  const l: Loan = {
    id: newLoanId(g),
    lender: o.lender,
    borrower: o.borrower,
    ...(ll ? { ls: ll.seat } : {}),
    ...(bl ? { bs: bl.seat } : {}),
    sum: r2(o.sum),
    owed: r2(o.sum),
    rate: o.rate,
    arrears: 0,
    paid: 0,
    made,
    term: o.months,
    due: o.due ?? made + Math.round(o.months * MONTH),
    p: placeOf(s, o.lender, o.borrower),
    status: o.status ?? "running",
    how: o.how,
    ...(o.asked ? { asked: o.asked } : {}),
    grace: 0,
    told: 0,
    log: [],
  };
  loanState(g).list.push(l);
  loansChanged(g);
  return l;
}

/** The lawful rate where a bond between them would be made. */
export function rateFor(
  g: ConquestGame,
  lender: number,
  borrower: number,
): number {
  return lawfulRate(g.s, g.map, placeOf(g.s, lender, borrower)).rate;
}

/** The money moves and the bond runs (a loan agreed). */
function begin(g: ConquestGame, l: Loan): string | null {
  const s = g.s;
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  if (ll && ll.purse < l.sum)
    return `${nameOf(s, l.lender)} hasn't ${r1(l.sum)} coins now.`;
  if (ll)
    withFlow(g, { key: `loan:${l.id}`, label: "Money lent on bond" }, () =>
      spend(g, ll, l.sum),
    );
  if (bl)
    withFlow(g, { key: `loan:${l.id}`, label: "Money borrowed on bond" }, () =>
      earn(g, bl, l.sum),
    );
  l.status = "running";
  l.made = s.day;
  l.due = s.day + Math.round(l.term * MONTH);
  log(g, l, `Lent: ${bondWords(l)}.`);
  note(
    g,
    ll,
    `You lend ${nameOf(s, l.borrower)} ${r1(l.sum)} coins on ${bondTerms(l)}.`,
  );
  note(
    g,
    bl,
    `${nameOf(s, l.lender)} lends you ${r1(l.sum)} coins on ${bondTerms(l)}.`,
    "good",
  );
  // They remember it was a kindness, and more so without interest.
  minds(
    g,
    ll,
    l.borrower,
    l.rate > 0 ? "Lent me money" : "Lent me money, and asked no interest",
    l.rate > 0 ? 8 : 16,
  );
  return null;
}

/** Lend someone money on bond: one of the computer's people answers now; a player is asked. */
export function lendTo(
  g: ConquestGame,
  life: Life,
  cId: number,
  sum: number,
  months: number,
  free: boolean,
): string | null {
  const s = g.s;
  const c = s.chars[cId];
  const check = lendCheck(s, life, c, sum, months);
  if (!check.ok) return check.why;
  const rate = free ? 0 : rateFor(g, life.c, cId);
  const other = lifeOfChar(s, cId);
  if (!other) {
    const b = willBorrow(s, life, c, sum, months, free, rate);
    if (b.total <= 0) {
      note(
        g,
        life,
        `${charName(c)} thanks you, and won't take it: ${b.parts
          .filter((p) => p.value < 0)
          .map((p) => p.label.toLowerCase())
          .join(", ")}.`,
      );
      return null;
    }
  }
  const l = makeLoan(g, {
    lender: life.c,
    borrower: cId,
    sum,
    months,
    rate,
    how: "bond",
    status: other ? "offered" : "running",
    asked: "lender",
  });
  if (other) {
    log(g, l, `Offered: ${bondWords(l)}.`);
    note(
      g,
      life,
      `You offer ${charName(c)} a loan: ${bondWords(l)}. It waits on ${c.female ? "her" : "his"} answer.`,
    );
    raiseEvent(g, other, "loan-offer", { l: l.id, c: life.c });
    return null;
  }
  return begin(g, l);
}

/** Ask someone for a loan on bond: one of the computer's people answers now; a player is asked. */
export function borrowFrom(
  g: ConquestGame,
  life: Life,
  cId: number,
  sum: number,
  months: number,
  free: boolean,
  how: Loan["how"] = "bond",
): string | null {
  const s = g.s;
  const c = s.chars[cId];
  const check = borrowCheck(s, life, c, sum, months);
  if (!check.ok) return check.why;
  const rate = free ? 0 : rateFor(g, cId, life.c);
  const other = lifeOfChar(s, cId);
  if (!other) {
    const b = willLend(s, life, c, sum, months, free);
    if (b.total <= 0) {
      note(
        g,
        life,
        `${charName(c)} won't lend it: ${b.parts
          .filter((p) => p.value < 0)
          .map((p) => p.label.toLowerCase())
          .join(", ")}.`,
        "bad",
      );
      return null;
    }
  }
  const l = makeLoan(g, {
    lender: cId,
    borrower: life.c,
    sum,
    months,
    rate,
    how,
    status: other ? "offered" : "running",
    asked: "borrower",
  });
  if (other) {
    log(g, l, `Asked: ${bondWords(l)}.`);
    note(
      g,
      life,
      `You ask ${charName(c)} for a loan: ${bondWords(l)}. It waits on ${c.female ? "her" : "his"} answer.`,
    );
    raiseEvent(g, other, "loan-ask", { l: l.id, c: life.c });
    return null;
  }
  return begin(g, l);
}

/** A bond made outright (a letter answered, a friend in need): no asking, the money already moved. */
export function bondMade(
  g: ConquestGame,
  lender: number,
  borrower: number,
  sum: number,
  o: { months?: number; free?: boolean; how: Loan["how"] },
): Loan {
  const l = makeLoan(g, {
    lender,
    borrower,
    sum,
    months: o.months ?? 12,
    rate: o.free ? 0 : rateFor(g, lender, borrower),
    how: o.how,
  });
  log(g, l, `Lent: ${bondWords(l)}.`);
  return l;
}

/** A friend in need lent money (an event): a bond without interest, for a year. */
export function lendFriend(
  g: ConquestGame,
  life: Life,
  c: number,
  sum: number,
): Loan | undefined {
  if (!g.s.chars[c] || c === life.c) return undefined;
  const l = bondMade(g, life.c, c, sum, { how: "friend", free: true });
  note(
    g,
    life,
    `You lend ${nameOf(g.s, c)} ${r1(sum)} coins on ${bondTerms(l)}.`,
  );
  return l;
}

/** Lent on a note of hand (an event): at the lawful rate, for a year. */
export function lendNote(
  g: ConquestGame,
  life: Life,
  c: number,
  sum: number,
): Loan | undefined {
  if (!g.s.chars[c] || c === life.c) return undefined;
  const l = bondMade(g, life.c, c, sum, { how: "note" });
  note(
    g,
    life,
    `${nameOf(g.s, c)} signs a note of hand for ${r1(sum)} coins, at ${rateWords(l.rate)}, due ${formatDate(l.due)}.`,
  );
  return l;
}

/** The other player answers an offer (or a request) for a loan. */
export function answerOffer(
  g: ConquestGame,
  life: Life,
  id: number,
  yesA: boolean,
): string | null {
  const s = g.s;
  const l = loansOf(s).find((x) => x.id === id);
  if (!l || l.status !== "offered") return "That's settled already.";
  const mine =
    (l.asked === "lender" && l.borrower === life.c) ||
    (l.asked === "borrower" && l.lender === life.c);
  if (!mine) return "It isn't yours to answer.";
  const asker = l.asked === "lender" ? lenderLife(s, l) : borrowerLife(s, l);
  if (!yesA) {
    l.status = "closed";
    l.end = "declined";
    l.ended = s.day;
    log(g, l, "Declined.");
    note(
      g,
      asker,
      l.asked === "lender"
        ? `${charName(meOf(s, life))} thanks you, and declines your loan.`
        : `${charName(meOf(s, life))} declines to lend you ${r1(l.sum)} coins.`,
    );
    return null;
  }
  return begin(g, l);
}

// ---------------------------------------------------------------- repaying

/** The borrower pays what's owed, or part of it (interest in arrears first). */
export function repay(
  g: ConquestGame,
  life: Life,
  id: number,
  sum?: number,
): string | null {
  const s = g.s;
  const l = loansOf(s).find((x) => x.id === id);
  if (
    !l ||
    l.borrower !== life.c ||
    l.status === "closed" ||
    l.status === "offered"
  )
    return "You owe nothing on that bond.";
  if (l.status === "court") return "It's before the court: settle it there.";
  const all = owedNow(l);
  const pay = r2(Math.min(all, sum === undefined ? all : Math.max(0, sum)));
  if (pay <= 0) return "How much?";
  if (life.purse < pay) return `You have ${Math.floor(life.purse)} coins.`;
  settle(g, l, pay, "paid");
  return null;
}

/** Money paid on a bond (by a player borrower, or one of the computer's people): the lender is paid. */
function settle(
  g: ConquestGame,
  l: Loan,
  pay: number,
  how: "paid" | "kind" | "judgment",
  /** The lender has been told already, in the caller's own words. */
  told = false,
): void {
  const s = g.s;
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  const early = s.day < l.due && l.status === "running";
  if (bl && how !== "kind")
    withFlow(
      g,
      {
        key: `loan:${l.id}`,
        label: how === "judgment" ? "A judgment for debt" : "A bond repaid",
      },
      () => spend(g, bl, pay),
    );
  if (ll)
    withFlow(
      g,
      {
        key: `loan:${l.id}`,
        label:
          how === "kind"
            ? "Goods taken in kind for a bond"
            : how === "judgment"
              ? "A judgment for debt"
              : "A bond repaid to you",
        chance: true,
      },
      () => earn(g, ll, pay),
    );
  const fromArrears = Math.min(l.arrears, pay);
  l.arrears = r2(l.arrears - fromArrears);
  l.owed = r2(Math.max(0, l.owed - (pay - fromArrears)));
  if (owedNow(l) <= 0.005) {
    l.owed = 0;
    l.arrears = 0;
    close(g, l, how === "paid" ? "paid" : how);
    if (how === "paid") {
      log(g, l, `Repaid${early ? " early" : ""}: ${r1(pay)}.`);
      note(
        g,
        bl,
        `You repay ${nameOf(s, l.lender)} the last of your bond: ${r1(pay)} coins.`,
        "good",
      );
      if (!told)
        note(
          g,
          ll,
          `${nameOf(s, l.borrower)} repays ${bl ? "" : "you "}the bond${early ? " before its day" : ""}: ${r1(pay)} coins.`,
          "good",
        );
      minds(
        g,
        bl,
        l.lender,
        early ? "Paid me back early" : "Paid me back",
        early ? 8 : 5,
      );
    }
    return;
  }
  log(
    g,
    l,
    `${r1(pay)} ${how === "kind" ? "in kind" : how === "judgment" ? "by judgment" : "paid"}; ${r1(owedNow(l))} still owed.`,
  );
  if (how !== "paid") return;
  note(
    g,
    bl,
    `You pay ${nameOf(s, l.lender)} ${r1(pay)} on your bond; ${r1(owedNow(l))} still owed.`,
  );
  note(
    g,
    ll,
    `${nameOf(s, l.borrower)} pays ${r1(pay)} on the bond; ${r1(owedNow(l))} still owed.`,
  );
  minds(g, bl, l.lender, "Paying me back", 3);
}

/** Whether a bond is closed (read afresh: the calls above may have closed it). */
function closed(l: Loan): boolean {
  return l.status === "closed";
}

/** A bond closed. */
function close(g: ConquestGame, l: Loan, end: NonNullable<Loan["end"]>): void {
  l.status = "closed";
  l.end = end;
  l.ended = g.s.day;
  delete l.ask;
  loansChanged(g);
  // Any scene of it still waiting is settled now.
  for (const life of [lenderLife(g.s, l), borrowerLife(g.s, l)]) {
    if (!life) continue;
    const before = life.events.length;
    life.events = life.events.filter(
      (e) => !(e.key.startsWith("loan-") && e.ctx.l === l.id),
    );
    if (life.events.length !== before) touchLife(g, life);
  }
}

// ---------------------------------------------------------------- falling due, and calling in

/** The day comes: reminders, a lender's choice, a computer borrower's payment. */
function fallsDue(g: ConquestGame, l: Loan): void {
  const s = g.s;
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  l.status = "due";
  l.told = 2;
  log(g, l, `Fell due: ${r1(owedNow(l))} owed.`);
  if (!bl) {
    // One of the computer's people may come and pay of their own accord.
    if (edice(g).chance(dueRepayChance(s, l))) {
      note(
        g,
        ll,
        `${nameOf(s, l.borrower)} comes to pay the bond on its day: ${r1(owedNow(l))} coins.`,
        "good",
      );
      settle(g, l, owedNow(l), "paid", true);
      return;
    }
  }
  if (!ll) {
    // One of the computer's people lent it: they let it run on, or call it in.
    if (lenderAtDue(s, l) === "renew") {
      l.status = "running";
      l.due = s.day + Math.round(l.term * MONTH);
      l.told = 0;
      l.grace++;
      log(g, l, `Let run on to ${formatDate(l.due)}.`);
      note(
        g,
        bl,
        `${nameOf(s, l.lender)} is content to let your bond run on at interest, to ${formatDate(l.due)}.`,
        "good",
      );
      return;
    }
    callIn(g, null, l);
    return;
  }
  note(
    g,
    bl,
    `Your bond to ${nameOf(s, l.lender)} has fallen due: ${r1(owedNow(l))} coins. It runs on at interest until called in.`,
  );
  raiseEvent(g, ll, "loan-falls", { l: l.id, c: l.borrower });
}

/** The lender calls a bond in (a player from their ledger or the scene; the computer's people at its day). */
export function callIn(
  g: ConquestGame,
  life: Life | null,
  l: Loan,
): string | null {
  const s = g.s;
  if (life && l.lender !== life.c) return "It isn't yours to call in.";
  if (l.status === "running" && s.day < l.due)
    return `It isn't due until ${formatDate(l.due)}.`;
  if (!["running", "due", "time"].includes(l.status))
    return l.status === "called"
      ? "You've called it in already."
      : "It can't be called in now.";
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  l.status = "called";
  delete l.ask;
  log(g, l, "Called in.");
  if (bl) {
    note(
      g,
      ll,
      `You call in ${nameOf(s, l.borrower)}'s bond: ${r1(owedNow(l))} coins.`,
    );
    note(
      g,
      bl,
      `${nameOf(s, l.lender)} calls in your bond: ${r1(owedNow(l))} coins.`,
      "bad",
    );
    minds(g, ll, l.borrower, "Called in my bond", -2, 1);
    raiseEvent(g, bl, "loan-called", { l: l.id, c: l.lender });
    return null;
  }
  // One of the computer's people answers at once, by their means and honesty.
  const o = repayOdds(s, l);
  const u = edice(g).next();
  if (u < o.pay) {
    note(
      g,
      ll,
      `You call in ${nameOf(s, l.borrower)}'s bond, and ${s.chars[l.borrower]?.female ? "she" : "he"} pays: ${r1(owedNow(l))} coins.`,
      "good",
    );
    settle(g, l, owedNow(l), "paid", true);
    return null;
  }
  if (u < o.pay + o.time) {
    const months = LOAN_MORE[0];
    l.ask = months;
    log(g, l, `Asked ${months} months more.`);
    note(
      g,
      ll,
      `You call in ${nameOf(s, l.borrower)}'s bond. ${s.chars[l.borrower]?.female ? "She" : "He"} asks for ${months} months more to find the money.`,
    );
    if (ll)
      raiseEvent(g, ll, "loan-time", { l: l.id, c: l.borrower, m: months });
    else grantTime(g, l, months);
    return null;
  }
  note(
    g,
    ll,
    `You call in ${nameOf(s, l.borrower)}'s bond: ${s.chars[l.borrower]?.female ? "she" : "he"} can't pay.`,
    "bad",
  );
  defaults(g, l);
  return null;
}

/** The borrower can't pay: the lender decides. */
function defaults(g: ConquestGame, l: Loan): void {
  const s = g.s;
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  l.status = "default";
  delete l.ask;
  log(g, l, "Can't pay.");
  if (bl) minds(g, bl, l.lender, "Couldn't pay me", -10, 3);
  if (ll) {
    raiseEvent(g, ll, "loan-default", { l: l.id, c: l.borrower });
    return;
  }
  // One of the computer's people lent it: what they do is shown on your ledger.
  switch (lenderOnDefault(s, g.w, l)) {
    case "time":
      grantTime(g, l, LOAN_MORE[0]);
      return;
    case "kind":
      inKind(g, l);
      return;
    case "sue":
      sueOn(g, l);
      return;
    default:
      forgiven(g, l, true);
  }
}

/** More time is granted (by the lender, or one of the computer's people). */
function grantTime(g: ConquestGame, l: Loan, months: number): void {
  const s = g.s;
  l.status = "time";
  l.due = s.day + Math.round(months * MONTH);
  l.grace++;
  l.told = months >= 2 ? 0 : 1;
  delete l.ask;
  log(g, l, `${months} months more, to ${formatDate(l.due)}.`);
  note(
    g,
    borrowerLife(s, l),
    `${nameOf(s, l.lender)} gives you ${months} months more on your bond, to ${formatDate(l.due)}.`,
    "good",
  );
  note(
    g,
    lenderLife(s, l),
    `You give ${nameOf(s, l.borrower)} ${months} months more on the bond, to ${formatDate(l.due)}.`,
  );
}

/** The borrower asks for more time (a player, from the scene or the ledger). */
export function askTime(
  g: ConquestGame,
  life: Life,
  id: number,
  months: number,
): string | null {
  const s = g.s;
  const l = loansOf(s).find((x) => x.id === id);
  if (!l || l.borrower !== life.c) return "You owe nothing on that bond.";
  if (!LOAN_MORE.includes(months)) return "How long?";
  if (!["called", "due", "running", "time"].includes(l.status))
    return "It can't be put off now.";
  if (l.status === "running" && l.due - s.day > LOAN_REMIND_DAYS)
    return `It isn't due until ${formatDate(l.due)}.`;
  if (l.ask === -1) return `${nameOf(s, l.lender)} has refused more time.`;
  if (l.ask !== undefined && l.ask > 0) return "You've asked already.";
  const ll = lenderLife(s, l);
  if (ll) {
    l.ask = months;
    log(g, l, `Asked ${months} months more.`);
    note(
      g,
      life,
      `You ask ${nameOf(s, l.lender)} for ${months} months more on your bond.`,
    );
    raiseEvent(g, ll, "loan-time", { l: l.id, c: l.borrower, m: months });
    return null;
  }
  const p = timeChance(s, l);
  if (edice(g).chance(p)) {
    grantTime(g, l, months);
    minds(g, life, l.lender, "Asked me for more time", -2, 1);
    return null;
  }
  l.ask = -1;
  log(g, l, "More time refused.");
  note(
    g,
    life,
    `${nameOf(s, l.lender)} won't give you more time: the bond is to be paid.`,
    "bad",
  );
  if (l.status !== "called") {
    l.status = "called";
    raiseEvent(g, life, "loan-called", { l: l.id, c: l.lender });
  }
  return null;
}

/** The lender answers a request for more time. */
export function answerTime(
  g: ConquestGame,
  life: Life,
  id: number,
  grant: boolean,
): string | null {
  const s = g.s;
  const l = loansOf(s).find((x) => x.id === id);
  if (!l || l.lender !== life.c) return "It isn't yours to answer.";
  if (!l.ask || l.ask < 0) return "Nobody has asked.";
  const bl = borrowerLife(s, l);
  if (grant) {
    minds(g, life, l.borrower, "Gave me more time", 8);
    grantTime(g, l, l.ask);
    return null;
  }
  l.ask = -1;
  log(g, l, "More time refused.");
  note(g, life, `You refuse ${nameOf(s, l.borrower)} more time.`);
  minds(g, life, l.borrower, "Wouldn't give me time", -8);
  if (bl) {
    note(
      g,
      bl,
      `${nameOf(s, l.lender)} won't give you more time: the bond is to be paid.`,
      "bad",
    );
    if (l.status !== "called") l.status = "called";
    raiseEvent(g, bl, "loan-called", { l: l.id, c: l.lender });
    return null;
  }
  // One of the computer's people: pay, or can't.
  const o = repayOdds(s, l);
  if (edice(g).chance(o.pay / Math.max(0.01, o.pay + o.cannot))) {
    note(
      g,
      life,
      `${nameOf(s, l.borrower)} finds the money after all: ${r1(owedNow(l))} coins.`,
      "good",
    );
    settle(g, l, owedNow(l), "paid", true);
  } else {
    note(g, life, `${nameOf(s, l.borrower)} can't pay.`, "bad");
    defaults(g, l);
  }
  return null;
}

/** A player borrower pays a bond that's been called in. */
export function payCalled(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  return repay(g, life, id);
}

/** A player borrower says they can't pay. */
export function cantPay(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const l = loansOf(s).find((x) => x.id === id);
  if (!l || l.borrower !== life.c) return "You owe nothing on that bond.";
  if (!["called", "due", "time"].includes(l.status))
    return "It isn't called in.";
  note(
    g,
    life,
    `You tell ${nameOf(s, l.lender)} you can't pay the bond.`,
    "bad",
  );
  note(
    g,
    lenderLife(s, l),
    `${nameOf(s, l.borrower)} can't pay the bond.`,
    "bad",
  );
  defaults(g, l);
  return null;
}

// ---------------------------------------------------------------- the lender's remedies

/** The lender forgives the debt (or one of the computer's people writes it off, `grudge`). */
function forgiven(g: ConquestGame, l: Loan, grudge = false): void {
  const s = g.s;
  const bl = borrowerLife(s, l);
  const ll = lenderLife(s, l);
  const what = r1(owedNow(l));
  close(g, l, "forgiven");
  log(g, l, grudge ? `Written off: ${what}.` : `Forgiven: ${what}.`);
  if (grudge) {
    note(
      g,
      bl,
      `${nameOf(s, l.lender)} writes off your bond (${what} coins), and won't forget it.`,
    );
    minds(g, bl, l.lender, "Never paid me", -20, 6);
    return;
  }
  note(g, ll, `You forgive ${nameOf(s, l.borrower)} the bond: ${what} coins.`);
  note(
    g,
    bl,
    `${nameOf(s, l.lender)} forgives you the bond: ${what} coins.`,
    "good",
  );
  if (ll) {
    const c = s.chars[l.borrower];
    if (c?.alive) remembers(g, ll, c, "Forgave my debt", 30, 10);
  }
}

/** The lender forgives the debt (a player). */
export function forgive(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const l = loansOf(g.s).find((x) => x.id === id);
  if (
    !l ||
    l.lender !== life.c ||
    l.status === "closed" ||
    l.status === "offered"
  )
    return "There's nothing owed you on that bond.";
  if (l.status === "court") return "It's before the court.";
  forgiven(g, l);
  return null;
}

/** Take the debt in kind: what they carry (a player), or goods to what they can (the computer's people). */
function inKind(g: ConquestGame, l: Loan): void {
  const s = g.s;
  const bl = borrowerLife(s, l);
  const ll = lenderLife(s, l);
  const worth = kindWorth(s, g.w, l);
  if (worth <= 0.5) {
    forgiven(g, l, !ll);
    return;
  }
  if (bl) {
    // Their goods, load by load, to the value owed.
    let got = 0;
    const took: string[] = [];
    for (const x of carriedGoods(s, g.w, bl)) {
      if (got >= owedNow(l)) break;
      const per = x.worth / x.qty;
      const qty = Math.min(x.qty, Math.ceil((owedNow(l) - got) / per));
      got += per * qty;
      took.push(`${qty} ${x.item}`);
      touchLife(g, bl);
      if ((bl.goods as Record<string, number>)[x.item] !== undefined)
        (bl.goods as Record<string, number>)[x.item] -= qty;
      else if (bl.wares)
        bl.wares[x.item as WareId] = (bl.wares[x.item as WareId] ?? 0) - qty;
    }
    got = r1(Math.min(owedNow(l), got));
    note(
      g,
      bl,
      `${nameOf(s, l.lender)} takes ${took.join(", ")} in kind for your bond, worth ${got}.`,
      "bad",
    );
    note(
      g,
      ll,
      `You take ${nameOf(s, l.borrower)}'s goods in kind for the bond: ${took.join(", ")}, worth ${got}.`,
    );
    if (ll) remembersOf(g, ll, l.borrower, "Took my goods for a debt", -12);
    const left = r2(owedNow(l) - got);
    settle(g, l, got, "kind");
    if (left > 0.005 && !closed(l)) grantTime(g, l, LOAN_MORE[0]);
    return;
  }
  const c = s.chars[l.borrower];
  note(
    g,
    ll,
    `You take ${nameOf(s, l.borrower)}'s ${kindWords(c)} in kind for the bond: worth about ${worth}, and the bond is cancelled.`,
  );
  if (ll && c?.alive) remembers(g, ll, c, "Took my goods for a debt", -12, 4);
  settle(g, l, worth, "kind");
  if (!closed(l)) close(g, l, "kind");
}

/** A player's character remembers too (for another player's opinion of them). */
function remembersOf(
  g: ConquestGame,
  of: Life,
  who: number,
  why: string,
  value: number,
): void {
  const c = g.s.chars[who];
  if (c?.alive) remembers(g, of, c, why, value, 4);
}

/** The lender takes it in kind (a player). */
export function takeInKind(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const l = loansOf(g.s).find((x) => x.id === id);
  if (!l || l.lender !== life.c || l.status !== "default")
    return "Only a bond its borrower can't pay.";
  if (kindWorth(g.s, g.w, l) <= 0.5) return "They've nothing worth taking.";
  inKind(g, l);
  return null;
}

/** Sue on the bond: a suit for debt at the court-house. */
function sueOn(g: ConquestGame, l: Loan): string | null {
  const s = g.s;
  const nation = courtFor(s, l);
  if (nation < 0) return "There's no court of a crown where they live.";
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  const sum = owedNow(l);
  const t = openTrial(g, {
    kind: "debt",
    defendant: l.borrower,
    accuser: l.lender,
    p: placeOf(s, l.lender, l.borrower),
    nation,
    charge: `a debt of ${Math.round(sum)} coins to ${nameOf(s, l.lender)} on ${l.how === "note" ? "a note of hand" : "a bond"}`,
    grade: sum >= 30 ? 2 : 1,
    evidence: l.how === "bond" || l.how === "letter" ? 10 : 7,
  });
  t.sum = sum;
  l.status = "court";
  l.trial = t.id;
  log(g, l, "Sued for at the court-house.");
  note(
    g,
    ll,
    `You sue ${nameOf(s, l.borrower)} on the bond: ${Math.round(sum)} coins.`,
  );
  note(
    g,
    bl,
    `${nameOf(s, l.lender)} sues you on your bond: ${Math.round(sum)} coins.`,
    "bad",
  );
  if (ll) remembersOf(g, ll, l.borrower, "Took me to law over a debt", -25);
  return null;
}

/** The lender sues (a player). */
export function sue(g: ConquestGame, life: Life, id: number): string | null {
  const l = loansOf(g.s).find((x) => x.id === id);
  if (!l || l.lender !== life.c || l.status !== "default")
    return "Only a bond its borrower can't pay.";
  return sueOn(g, l);
}

/** The lender gives more time after a default (a player). */
export function moreTime(
  g: ConquestGame,
  life: Life,
  id: number,
  months: number,
): string | null {
  const l = loansOf(g.s).find((x) => x.id === id);
  if (!l || l.lender !== life.c) return "It isn't yours.";
  if (!["default", "called", "due"].includes(l.status))
    return "It isn't owed now.";
  if (!LOAN_MORE.includes(months)) return "How long?";
  remembersOf(g, life, l.borrower, "Gave me more time", 8);
  grantTime(g, l, months);
  return null;
}

// ---------------------------------------------------------------- the court's answer

/** A suit for debt is decided (Trials.ts calls it as the sentence is carried out). */
export function loanJudged(g: ConquestGame, t: Trial): void {
  const s = g.s;
  const l = loansOf(s).find((x) => x.trial === t.id && x.status === "court");
  if (!l) return;
  const ll = lenderLife(s, l);
  const bl = borrowerLife(s, l);
  if (t.verdict !== "guilty") {
    l.status = "running";
    l.due = s.day + Math.round(12 * MONTH);
    l.told = 0;
    delete l.trial;
    log(
      g,
      l,
      `The court found for the borrower: it stands over to ${formatDate(l.due)}.`,
    );
    note(
      g,
      ll,
      `The court finds against your suit on ${nameOf(s, l.borrower)}'s bond: it stands over a year.`,
      "bad",
    );
    note(
      g,
      bl,
      `The court finds for you against ${nameOf(s, l.lender)}: your bond stands over a year.`,
      "good",
    );
    return;
  }
  // The court gives judgment for what can be had: a player's purse, or the computer's person's goods.
  const take = r2(
    bl
      ? Math.min(Math.max(0, bl.purse), owedNow(l))
      : Math.min(owedNow(l), meansFor(s, s.chars[l.borrower]) * 0.8),
  );
  log(g, l, `Judgment for the lender: ${r1(take)} seized.`);
  note(
    g,
    ll,
    `Judgment for you on ${nameOf(s, l.borrower)}'s bond: ${r1(take)} coins seized for it.`,
    take > 0 ? "good" : undefined,
  );
  note(
    g,
    bl,
    `Judgment against you on your bond to ${nameOf(s, l.lender)}: ${r1(take)} coins seized.`,
    "bad",
  );
  delete l.trial;
  l.status = "default";
  if (take > 0) settle(g, l, take, "judgment");
  if (!closed(l)) {
    // What's left stands, with six months to find it.
    grantTime(g, l, 6);
    l.grace--;
  } else l.end = "judgment";
}

/** A suit for debt settled out of court: the defendant pays the bond. */
export function loanSettled(g: ConquestGame, t: Trial, fee: number): void {
  const s = g.s;
  const l = loansOf(s).find((x) => x.trial === t.id && x.status === "court");
  if (!l) return;
  const ll = lenderLife(s, l);
  const pay = r2(Math.min(fee, owedNow(l)));
  if (ll)
    withFlow(g, { key: `loan:${l.id}`, label: "A suit for debt settled" }, () =>
      earn(g, ll, pay),
    );
  l.owed = 0;
  l.arrears = 0;
  delete l.trial;
  close(g, l, "paid");
  log(g, l, `Settled out of court: ${r1(pay)}.`);
  note(
    g,
    ll,
    `${nameOf(s, l.borrower)} settles your suit on the bond: ${r1(pay)} coins.`,
    "good",
  );
}

// ---------------------------------------------------------------- the days and the months

/** Each day: offers lapse, reminders go out, bonds fall due, time runs out. */
export function loansDaily(g: ConquestGame): void {
  const s = g.s;
  const list = s.loans?.list;
  if (!list?.length) return;
  for (const l of [...list]) {
    if (l.status === "closed") continue;
    // A line that has ended: the bond lapses with it.
    for (const seat of [l.ls, l.bs]) {
      if (!seat) continue;
      const life = s.lives.find((x) => x.seat === seat);
      if (!life || life.watching || life.c < 0) {
        log(g, l, "Lapsed: the line ended.");
        close(g, l, "lapsed");
      }
    }
    if (closed(l)) continue;
    if (l.status === "offered") {
      if (s.day - l.made > LOAN_OFFER_DAYS) {
        log(g, l, "Lapsed unanswered.");
        close(g, l, "declined");
      }
      continue;
    }
    if (
      l.status === "running" &&
      l.told < 1 &&
      s.day >= l.due - LOAN_REMIND_DAYS
    ) {
      l.told = 1;
      loansChanged(g);
      const bl = borrowerLife(s, l);
      if (bl) raiseEvent(g, bl, "loan-due", { l: l.id, c: l.lender });
      note(
        g,
        lenderLife(s, l),
        `${nameOf(s, l.borrower)}'s bond falls due on ${formatDate(l.due)}: ${r1(owedNow(l))} coins.`,
      );
    }
    if (l.status === "running" && s.day >= l.due) fallsDue(g, l);
    else if (l.status === "time" && s.day >= l.due) {
      // The time granted has run out: it's called in again.
      l.status = "due";
      callIn(g, null, l);
    } else if (l.status === "court" && l.trial !== undefined) {
      const t = s.power?.trials.find((x) => x.id === l.trial);
      if (!t) {
        delete l.trial;
        l.status = "default";
        loansChanged(g);
      }
    }
  }
  if (s.day % 30 === 0) tidyLoans(g);
}

/** At the month's turn, for each life: interest on what it owes (and on what it lent the computer's people). */
function loansMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const list = s.loans?.list;
  if (!list?.length || life.c < 0) return;
  for (const l of list) {
    if (l.status === "closed" || l.status === "offered") continue;
    const interest = monthInterest(l);
    if (l.borrower === life.c) {
      if (interest <= 0) continue;
      const ll = lenderLife(s, l);
      if (life.purse >= interest) {
        withFlow(g, { key: `loan:${l.id}`, label: "Interest on a bond" }, () =>
          spend(g, life, interest),
        );
        if (ll)
          withFlow(
            g,
            { key: `loan:${l.id}`, label: "Interest on a bond lent" },
            () => earn(g, ll, interest),
          );
        l.paid = r2(l.paid + interest);
      } else l.arrears = r2(l.arrears + interest);
      loansChanged(g);
    } else if (l.lender === life.c && !borrowerLife(s, l)) {
      // One of the computer's people owes it: interest while the bond stands,
      // and now and then they repay early.
      if (l.status === "default" || l.status === "court") continue;
      if (interest > 0) {
        withFlow(
          g,
          { key: `loan:${l.id}`, label: "Interest on a bond lent" },
          () => earn(g, life, interest),
        );
        l.paid = r2(l.paid + interest);
        loansChanged(g);
      }
      if (
        (l.status === "running" || l.status === "due") &&
        edice(g).chance(earlyChance(s, l))
      ) {
        note(
          g,
          life,
          `${nameOf(s, l.borrower)} comes to repay the bond${s.day < l.due ? " before its day" : ""}: ${r1(owedNow(l))} coins.`,
          "good",
        );
        settle(g, l, owedNow(l), "paid", true);
      }
    }
  }
}

/** The month's figure: interest on each bond, in and out. */
function loansForecast(s: GameState, life: Life): Part[] {
  const out: Part[] = [];
  for (const l of s.loans?.list ?? []) {
    if (l.status === "closed" || l.status === "offered") continue;
    const interest = monthInterest(l);
    if (interest <= 0) continue;
    if (l.borrower === life.c) {
      if (life.purse >= interest)
        out.push({
          key: `loan:${l.id}`,
          label: `Interest on your bond to ${nameOf(s, l.lender)}`,
          value: -interest,
        });
    } else if (l.lender === life.c) {
      const bl = borrowerLife(s, l);
      if (
        bl
          ? bl.purse >= interest
          : l.status !== "default" && l.status !== "court"
      )
        out.push({
          key: `loan:${l.id}`,
          label: `Interest on ${nameOf(s, l.borrower)}'s bond`,
          value: interest,
        });
    }
  }
  return out;
}

/** Money lent out, for the tracker (Estate › Ledger, Out working). */
function loansAffairs(s: GameState, _w: World, life: Life): AffairItem[] {
  const out: AffairItem[] = [];
  for (const l of s.loans?.list ?? []) {
    if (l.lender !== life.c || l.status === "closed" || l.status === "offered")
      continue;
    const interest = monthInterest(l);
    out.push({
      kind: "loan",
      id: `loan:${l.id}`,
      title: `Lent to ${nameOf(s, l.borrower)}`,
      what: `${bondWords(l)}; ${r1(owedNow(l))} owed`,
      status:
        l.status === "running"
          ? "running"
          : l.status === "due"
            ? "due"
            : l.status === "called"
              ? "called in"
              : l.status === "time"
                ? "more time"
                : l.status === "court"
                  ? "at law"
                  : "can't pay",
      ...(l.status === "default"
        ? {
            warn: `${nameOf(s, l.borrower)} can't pay: forgive it, take it in kind, or sue.`,
          }
        : {}),
      due: l.due,
      ...(interest > 0
        ? {
            expected: {
              value: interest,
              lo: interest,
              hi: interest,
              per: "month" as const,
            },
          }
        : {}),
      go: { tab: "estate", sub: "ledger" },
    });
  }
  return out;
}

// ---------------------------------------------------------------- lines that pass and end

/** An heir takes up the line: its bonds are theirs (owed to them, or by them). */
function loansToHeir(g: ConquestGame, life: Life): void {
  for (const l of g.s.loans?.list ?? []) {
    if (l.status === "closed") continue;
    if (l.ls === life.seat && l.lender !== life.c) {
      l.lender = life.c;
      log(g, l, `Passed to ${nameOf(g.s, life.c)}, the heir.`);
    }
    if (l.bs === life.seat && l.borrower !== life.c) {
      l.borrower = life.c;
      log(g, l, `Owed now by ${nameOf(g.s, life.c)}, the heir.`);
    }
  }
}

/** One of the computer's people dies: their bonds pass to an heir, or their estate pays what it can. */
function loansOnDeath(g: ConquestGame, c: Character): void {
  const s = g.s;
  for (const l of s.loans?.list ?? []) {
    if (l.status === "closed" || l.status === "offered") continue;
    if (l.lender === c.id && !l.ls) {
      const heir = c.children
        .map((id) => s.chars[id])
        .filter(
          (x): x is Character => !!x?.alive && !x.abroad && ageOf(s, x) >= 16,
        )
        .sort((a, b) => ageOf(s, b) - ageOf(s, a))[0];
      if (heir && !lifeOfChar(s, heir.id)) {
        l.lender = heir.id;
        log(g, l, `${charName(c)} is dead: owed now to ${charName(heir)}.`);
        note(
          g,
          borrowerLife(s, l),
          `${charName(c)} is dead; your bond is owed now to ${charName(heir)}, ${c.female ? "her" : "his"} heir.`,
        );
      } else {
        log(g, l, `${charName(c)} is dead, and nobody claims it.`);
        note(
          g,
          borrowerLife(s, l),
          `${charName(c)} is dead, and nobody claims your bond: it dies with ${c.female ? "her" : "him"}.`,
          "good",
        );
        close(g, l, "lapsed");
      }
    } else if (l.borrower === c.id && !l.bs) {
      const ll = lenderLife(s, l);
      const pay = r2(Math.min(owedNow(l), meansOf(s, c)));
      if (ll && pay > 0)
        withFlow(
          g,
          {
            key: `loan:${l.id}`,
            label: "A bond paid by an estate",
            chance: true,
          },
          () => earn(g, ll, pay),
        );
      log(g, l, `${charName(c)} is dead: the estate pays ${r1(pay)}.`);
      note(
        g,
        ll,
        `${charName(c)} is dead. ${pay >= owedNow(l) ? `The estate pays the bond: ${r1(pay)} coins.` : `The estate pays what it can of the bond: ${r1(pay)} of ${r1(owedNow(l))}.`}`,
        pay >= owedNow(l) ? undefined : "bad",
      );
      l.owed = 0;
      l.arrears = 0;
      close(g, l, pay > 0 ? "paid" : "lapsed");
    }
  }
}

// ---------------------------------------------------------------- old saves

/** An old save's debts (a fifth again within the year) become bonds, owed as they were. */
function oldDebts(g: ConquestGame, life: Life): void {
  if (!life.debts?.length) return;
  const s = g.s;
  for (const d of life.debts) {
    if (d.amount <= 0 || !s.chars[d.to]) continue;
    const l = makeLoan(g, {
      lender: d.to,
      borrower: life.c,
      sum: d.amount,
      months: 12,
      rate: 0,
      how: "old",
      due: d.due,
      made: Math.min(s.day, d.due - 365),
    });
    if (s.day >= d.due) l.status = "due";
    l.told = s.day >= d.due - LOAN_REMIND_DAYS ? 1 : 0;
    log(
      g,
      l,
      `A debt of ${r1(d.amount)} coins (a fifth again within the year), kept as a bond.`,
    );
  }
  touchLife(g, life).debts = [];
}

// ---------------------------------------------------------------- commands

function loanCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "econ") return undefined;
  const x = c as EconCommand;
  const l =
    x.id !== undefined ? loansOf(g.s).find((y) => y.id === x.id) : undefined;
  switch (x.act) {
    case "lend":
      return lendTo(g, life, x.c ?? -1, x.sum ?? 0, x.months ?? 12, !!x.free);
    case "borrow":
      return borrowFrom(
        g,
        life,
        x.c ?? -1,
        x.sum ?? 0,
        x.months ?? 12,
        !!x.free,
      );
    case "accept":
    case "decline":
      return answerOffer(g, life, x.id ?? -1, x.act === "accept");
    case "repay":
      return repay(g, life, x.id ?? -1, x.sum);
    case "call":
      if (!l) return "No such bond.";
      return callIn(g, life, l);
    case "time":
      return askTime(g, life, x.id ?? -1, x.months ?? LOAN_MORE[0]);
    case "grant":
    case "refuse":
      if (l && l.status === "default" && x.act === "grant")
        return moreTime(g, life, l.id, x.months ?? LOAN_MORE[0]);
      return answerTime(g, life, x.id ?? -1, x.act === "grant");
    case "cant":
      return cantPay(g, life, x.id ?? -1);
    case "forgive":
      return forgive(g, life, x.id ?? -1);
    case "kind":
      return takeInKind(g, life, x.id ?? -1);
    case "sue":
      return sue(g, life, x.id ?? -1);
  }
  return undefined;
}

hooks.command.push(loanCommand);
hooks.daily.push(loansDaily);
hooks.lifeMonthly.push(loansMonthly);
hooks.lifeDaily.push(oldDebts);
hooks.forecast.push((s, life) => loansForecast(s, life));
hooks.affairs.push(loansAffairs);
hooks.heir.push((g, life) => loansToHeir(g, life));
hooks.death.push((g, c) => loansOnDeath(g, c));
