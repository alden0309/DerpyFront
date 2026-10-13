// ECON (r17): the How to Play's chapter on two-way trade (a company's return
// cargo, a sailor's venture for home), bonds (loans on terms) and leave from
// your work. The tables are made from the engine's own (USURY, REPAY_WEIGHTS,
// LEAVE_WEIGHTS, the company's numbers), so they can't drift from what the
// game rolls.

import {
  CO_BACK_FREIGHT,
  CO_EUROPE_PRIME,
  CO_EUROPE_WARE,
  CO_LAY_DAYS,
  CO_MARGIN,
  europeSends,
  goodsName,
} from "../../engine/Company";
import {
  LEAVE_DAYS,
  LEAVE_WEIGHTS,
  OVERSTAY_SACK,
  OVERSTAY_WARN,
} from "../../engine/Leave";
import { AWAY_DAYS } from "../../engine/LifeRules";
import {
  LOAN_MORE,
  LOAN_OFFER_DAYS,
  LOAN_REMIND_DAYS,
  LOAN_SUMS,
  LOAN_TERMS,
  USURY,
} from "../../engine/LoanCore";
import { REPAY_WEIGHTS } from "../../engine/Loans";
import { VENTURE_BACK_MAX_LOADS } from "../../engine/VentureBack";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)} in 100`;
const sg = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

/** The laws against usury, colony by colony and year by year. */
function usuryTable(): string {
  const when = (u: (typeof USURY)[number]) =>
    u.from === 1607 && u.to === 1776
      ? "always"
      : u.from === 1607
        ? `to\u00a0${u.to}`
        : u.to === 1776
          ? `from\u00a0${u.from}`
          : `${u.from} to\u00a0${u.to}`;
  const rows = USURY.map(
    (u) =>
      `| ${u.where} | ${when(u)} | ${Math.round(u.rate * 100)} in 100 a year | ${u.text.replace(/:.*$/, "")} |`,
  );
  return `| Where | When | The lawful rate | The law |
|---|---|---|---|
${rows.join("\n")}
| The native nations' country | always | no interest | a loan is repaid in kind and in goodwill |`;
}

/** What Europe's merchants of each nation ship out to its colonies. */
function europeTable(): string {
  const rows = [
    ["england", "London"],
    ["france", "La Rochelle"],
    ["spain", "Seville, then Cádiz"],
    ["netherlands", "Amsterdam"],
    ["portugal", "Lisbon"],
    ["sweden", "Gothenburg"],
  ].map(
    ([k, port]) =>
      `| ${port} | ${europeSends(k)
        .map((g) => goodsName(g).toLowerCase())
        .join(", ")} |`,
  );
  return `| Home from | Its merchants ship out |
|---|---|
${rows.join("\n")}`;
}

/** What a computer borrower weighs, when a bond is called in. */
function repayTable(): string {
  const W = REPAY_WEIGHTS;
  const means = W.means
    .map((m) => `${m.label.toLowerCase()} (${sg(m.v)})`)
    .join(", ");
  return `| What they weigh | Points |
|---|---|
| Their means against what's owed: ${means} | ${sg(W.means[W.means.length - 1].v)} to ${sg(W.means[0].v)} |
| Honest · slippery (deceitful) · tight-fisted (greedy) · open-handed | ${sg(W.honest)} · ${sg(W.deceitful)} · ${sg(W.greedy)} · ${sg(W.generous)} |
| What they think of you | a point in ${W.opinion.per}, to ${W.opinion.cap} either way |
| Kept up the interest · behind with it | ${sg(W.kept)} · ${sg(W.behind)} |
| Each time it's been put off before | ${sg(W.putOff)} |

They pay 1 in 2, and a point in ${W.scale} more or less (never above ${pct(W.max)} nor below ${pct(W.min)}). Of those who don't, ${pct(W.timeShare.able)} ask for more time if they could find half of it, ${pct(W.timeShare.short)} if they couldn't; the rest can't pay.`;
}

/** What a master weighs, giving leave. */
function leaveTable(): string {
  const W = LEAVE_WEIGHTS;
  const length = W.length.map((x) => `${x.days} days ${sg(x.v)}`).join(", ");
  return `| What they weigh | Points |
|---|---|
| A fair request | ${sg(W.fair)} |
| What they think of you | a point in ${W.opinion.per}, to ${W.opinion.cap} either way |
| How long: ${length}; past that, a point more against every ${W.beyond} days | |
| Your place on the ladder | ${sg(W.rank)} a rung |
| A soldier or the militia in wartime | ${sg(W.war)} |
| A farm at the harvest · at the planting | ${sg(W.harvest)} · ${sg(W.planting)} |
| New to the place (under three months) | ${sg(W.newHand)} |
| Often away · never misses a day | ${sg(W.oftenAway)} · ${sg(W.neverMisses)} |
| Known to shirk · works harder than anyone | ${sg(W.shirk)} · ${sg(W.hard)} |
| Hard-working · idle · fond of the bottle | ${sg(W.diligent)} · ${sg(W.lazy)} · ${sg(W.drunkard)} |
| Leave already this year | ${sg(W.lately)} |
| (An office) its duty done lately · neglected | ${sg(W.dutyDone)} · ${sg(W.dutyNeglected)} |

They give it 1 in 2, and a point in ${W.scale} more or less (between ${pct(W.min)} and ${pct(W.max)}).`;
}

export const ECON_CHAPTER: Chapter = {
  id: "econ",
  part: "living",
  title: "Two-way trade, bonds and leave",
  line: "A company's return cargo and a sailor's venture for home; lending and borrowing on bond at the lawful rate; leave from your work.",
  where:
    "Start a business… › A trading company (or its card on Estate › Business: Change its trade); anyone's card › Money between you; Estate › Ledger › Bonds; Work › Your work › Ask for leave; the travel choices.",
  body: `## A company's return cargo
A trading company can bring goods **home** as well as send them out: Jamestown's tobacco to Havana, and Havana's cochineal back to Jamestown; tobacco to London, and English woollens home.
- **The plan** names the goods **outward** and the goods **home with**, and either may be **nothing**: nothing outward (in ballast) means its factor at the far port buys the return cargo on the company's bills; nothing home is the one-way trade as before. Each leg has its own loads.
- **Each leg is priced at its two ends:** bought at the far port's market (its buying dears the price there) and sold at home (its selling cheapens it there). From Europe, its correspondent buys what its nation's merchants ship out at prime cost (${pct(CO_EUROPE_PRIME)} of Europe's price; wares ${pct(CO_EUROPE_WARE)} of theirs), with his commission.
- **The return cargo** is bought with what the outward cargo fetched, when she gets there (a ship wrecked, taken or seized brings nothing home), and sails ${CO_LAY_DAYS} days later. In the ship chartered for the round voyage its freight is ${pct(CO_BACK_FREIGHT)} of a cargo's own. Its factors buy it only if it would make ${pct(CO_MARGIN)} of its cost, risks and all, and only what the chest can pay for; with a return cargo, the outward cargo sails if the round voyage pays.
- **Each leg's own odds** are shown before you commit (wrecked, taken in a war, seized where the laws of trade forbid it, spoiled in part), from the same table each is rolled from; and the round voyage's month all told.
- **The ledger:** each cargo at sea is in Estate › Ledger's **Out working** (outward, or homeward), each leg's sale is in your own news ("outward: …", "homeward: …"), and Estate › Business keeps each leg's record.

${europeTable()}

## A sailor's venture for home
A merchant sailor's ship lies a few days at the far port. The sailor's privilege runs both ways: buy a venture there, up to your rank's stake and ${VENTURE_BACK_MAX_LOADS} loads, and it's sold at home's market when she's in, at your own merchant's cut each side. The scene shows the three that would pay, each with its odds. Left behind when she sails, it comes home without you, less the master's trouble.

## Bonds
Money lent or borrowed makes a **bond**: the sum, a term (a year unless you choose another), and interest at the **lawful rate** of the place it's made.
- **Lend or borrow** from anyone's card: **Money between you** › **Lend money…** or **Borrow money…** (${LOAN_SUMS.join(", ")} coins; ${LOAN_TERMS.map((m) => (m < 12 ? `${m} months` : m === 12 ? "a year" : `${m / 12} years`)).join(", ")}; or without interest, as a friend). The window shows the law, the interest a month, and their likely answer with its reasons. Another player is asked, and answers for themselves within ${LOAN_OFFER_DAYS} days. A loan asked by letter, a friend in need and a note of hand make bonds too.
- **The interest** is paid at each month's turn, and is in the month's figure. A borrower who can't pay it falls behind, and owes it with the rest.
- **Repaying:** the borrower may repay at any time, half or all of it, from Estate › Ledger.
- **Its day:** ${LOAN_REMIND_DAYS} days before, the borrower is reminded. On the day, the lender may **call it in**, or let it run on at interest and call it in when they like.
- **Called in**, the borrower pays, asks for ${LOAN_MORE.join(" or ")} months more (the lender decides), or can't. Then the lender **forgives** it, takes it **in kind** (goods to the value, at less than they'd fetch), or **sues** for it at the court-house (the suit for debt: judgment for what can be had, the debtors' prison, and what's left stands six months more).

${usuryTable()}

### The computer's people
As borrowers they repay by their means and their honesty: on its day half as often as they would if called; now and then early, when they're honest and flush; and, called in, at these odds (shown on the bond):

${repayTable()}

As lenders, they let a bond run on at interest if they think well of you (40) and you've kept up the interest; give more time by what they think of you and how often they have; and if you can't pay, give you time, take the goods you carry, or sue.

Opinions move with reasons: a loan is a kindness (more so without interest), early repayment is remembered, calling it in a little, refusing time or suing a great deal; forgiving a debt is never forgotten.

**In company**, a bond is its two parties' business: nobody else is sent it, its scenes or its lines in the books.

## Leave from your work
- **Ask for leave** on Work › Your work (${LEAVE_DAYS.join(", ")} days). Your master agrees or refuses, at the odds shown:

${leaveTable()}

- **On leave** you aren't counted as away from your post. You're paid nothing, or **half pay** in an officer's rank.
- **Overstay it** and a letter comes after ${OVERSTAY_WARN} days; after ${OVERSTAY_SACK}, your place is gone. (Without leave, it's gone after ${AWAY_DAYS} days away.)
- **Setting off** on a journey longer than your place allows, the travel choices offer **Ask for leave first**, with your master's likely answer.
- **A county office**: ask leave of whoever appointed you (an elected officer gives the county notice); its duty isn't counted as neglected while you're away.
- **A business of your own** needs no leave, but someone to mind it: put a manager in (Estate › Business).

> Tip: A return cargo pays best where the two ports want each other's goods: the islands' sugar for New England's fish, Havana's cochineal for the Chesapeake. Small cargoes spare the markets at both ends.

! Pitfall: The lender calls in a bond, not the calendar: one left running pays interest until it's called. And the computer's lenders sue when they're crossed.`,
  glossary: [
    [
      "Bond",
      "Money lent on terms: the sum, its day, and interest at the lawful rate. The lender may call it in on its day.",
      "econ",
    ],
    [
      "The lawful rate",
      "The most interest the law allows where a bond is made (6 in 100 a year in most English colonies).",
      "econ",
    ],
    [
      "Return cargo",
      "Goods a company buys where its cargo is sold, and brings home.",
      "econ",
    ],
    [
      "Leave",
      "Days away from your post your master has agreed to: you aren't counted as away, and are paid nothing (an officer half).",
      "econ",
    ],
  ],
};
