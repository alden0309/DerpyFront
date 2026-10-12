// LEDGER (r15): the How to Play's chapter on money made plain: the month's
// figure, risk and reward before you commit, the cost on every button, your
// ledger (what's out working, your own news, the month's accounts) and your
// acres. The tables are made from the engine's own tables (BOAT_WORK,
// TRADE_LUCK), so they can't drift from what the game rolls.

import { BOAT_WEAR, BOAT_WORK, BOATS, CREW_WAGE } from "../../engine/Boats";
import { TRADE_LUCK, TRADE_TRIP } from "../../engine/Followers";
import { FARM_ACRES, RENT_YEAR, STATEMENTS_KEPT } from "../../engine/Ledger";
import { LAND_LOT } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import type { Chapter } from "./Chapters";

const n = (v: number) => String(Math.round(v * 10) / 10);
const range = (base: number, s: readonly [number, number]) =>
  `${n(base * s[0])} to ${n(base * (s[0] + s[1]))}`;

/** What each kind of work brings a sloop in a month, with a fair master (×0.9). */
function boatWorkTable(): string {
  const knack = 0.9;
  const sloop = BOATS.sloop;
  const F = BOAT_WORK.fishing;
  const W = BOAT_WORK.whaling;
  const T = BOAT_WORK.trading;
  const S = BOAT_WORK.smuggling;
  const P = BOAT_WORK.privateering;
  const keep = n(sloop.upkeep + sloop.crew * CREW_WAGE);
  const rows = [
    `| **Fishing** | ${range(F.base.sloop * knack, F.spread)} | every month | a squall, ${chanceWords(F.squall.p)} (−${F.squall.damage} soundness) | ×${F.grounds} where fish are thick; ×${F.winter} in a northern winter |`,
    `| **Whaling** | ${range(W.base.sloop * knack, W.luck)} | ${chanceWords(1 - W.empty)} (else nothing) | a boat stove in, ${chanceWords(W.stove.p)} (−${W.stove.damage} soundness, a man lost) | only north of ${W.minLat}° |`,
    `| **Coasting trade** | ${range(sloop.loads * T.perLoad * knack, T.spread)} | every month | lost with her cargo, ${chanceWords(T.lost)} | her hold (${sloop.loads} loads) |`,
    `| **Smuggling** | ${range(sloop.loads * S.perLoad * knack, S.spread)} | every month | seized, ${chanceWords(S.seized)} (+${S.seizedHeat} heat); +${S.heat} heat a month | the heat on you |`,
    `| **Privateering** | ${range(sloop.guns * P.perGun * knack, P.spread)} | a prize ${chanceWords(P.prize)} | a fight, ${chanceWords(P.fight.p)} (−${P.fight.damage} soundness, a fifth of her crew); taken, ${chanceWords(P.taken)} | war: without one it's piracy, +${P.pirateHeat} heat a month |`,
  ];
  return `| Her work | Brings in a month | How often | The dangers | What changes it |
|---|---|---|---|---|
${rows.join("\n")}

For a sloop with a fair master (seamanship 5); her crew and keep cost ${keep} a month besides. A master's seamanship makes it ×0.7 with none up to ×1.5 at 20; bigger boats bring in more. Every month at work wears ${BOAT_WEAR.work} off her soundness (${BOAT_WEAR.idle} laid up), to be mended at a yard.`;
}

/** A clerk's trip: what comes back, and how skill and war turn it. */
function tradeTable(): string {
  const rows = TRADE_LUCK.map(
    (l) =>
      `| ${l.text.replace(/^(\w)/, (m) => m.toUpperCase())} | ${chanceWords(l.p)} | ${l.x ? `${l.x} times the stake` : "nothing"} |`,
  );
  return `| A trip | With an unskilled clerk | What comes back |
|---|---|---|
${rows.join("\n")}

A trip takes ${TRADE_TRIP.days[0]} to ${TRADE_TRIP.days[1]} days. Each point of the clerk's trade turns the odds ${Math.round(TRADE_TRIP.skillStep * 1000) / 10} in 100 towards a rich trip (up to ${Math.round(TRADE_TRIP.skillMax * 100)}); a war turns them ${Math.round(TRADE_TRIP.war * 100)} in 100 the other way. A clerk whose loyalty is under ${TRADE_TRIP.disloyal} keeps the stake ${chanceWords(TRADE_TRIP.runs)}.`;
}

export const LEDGER_CHAPTER: Chapter = {
  id: "ledger",
  part: "living",
  title: "Your ledger: money made plain",
  line: "The month's figure (and what runs on luck), the odds before you put money to work, the cost on every button, the months' accounts, and your own news apart from the world's.",
  where:
    "The purse in the banner (point at it); Estate › Purse; Estate › Ledger; Estate › House & land for your acres; the coin on every button that spends.",
  body: `## The month's figure
The small figure beside your purse is what a month comes to, **all told**: wages, dues and how you live; rents, a business's takings and a house's keep; your boats' crews and keep; your people's wages (a boat's skipper too); a company's pay; an officer's keep; a debt that falls due; school bills; your share of a firm; a newspaper's profit. Buy a boat and sign her crew, and it changes at once. Your wage is reckoned by the days the month should come to at the pace you work.

What runs on **luck** is kept apart, as **what's expected** and its range from worst to best: what a boat brings in at her work, a clerk's trading (expected a month; the range is a trip's), dividends, a cargo due home, and the land's rents (tenants pay by the harvest: ${RENT_YEAR[0]} to ${RENT_YEAR[1]} of the rent, ${LAND_LOT.rent} a month a lot on average). A figure marked **≈** has luck in it. Point at the purse for every line, or open Estate › Purse.

## Risk and reward, before you commit
- **A boat** (Estate › Boats, or at the docks): under her work, what she should make a month after her crew, keep and skipper; and **Risk and reward of each kind of work**: every kind she can do, side by side, then the one she's at in full, each way it can go with its chance, the dangers to her and her crew, and what changes the odds.

${boatWorkTable()}

- **A clerk's trading** (People › Your people): pick a stake (10, 25, 50, 100) and the trip's odds show before you send them: what comes back each way, what's expected a trip and a month after their wages, and the chance a disloyal clerk runs off with it.

${tradeTable()}

- **People for hire** say what they'd bring: a clerk, what trading for you would make with a stake; a mate, what your boat would make with them as her skipper. **The boatyard** says what a new boat could do at her best from that port, with a full crew.

## The cost on every button
Every button that spends money shows the sum **on the button**, in a gold coin, before you click: a house, ten acres, a boat, her crew, a hand hired, a bribe, a gift, a letter's postage, a school, a stake at the dice, a fare, an event's choice. **Red** means you haven't the money (point at it for how short you are). **Green** is what a sale would bring. **"a month"** is a cost that comes every month, like a servant's or a clerk's wages.

## Estate › Ledger
- **Out working**: your boats and their work, cargoes at sea and shares, clerks trading and anyone you've sent off, a band on a job, your partnerships, a company, a newspaper, contracts in hand. Each says how it stands, when it's due back (or when its month is reckoned), what it costs to keep and what it's expected to bring, with a warning if something's wrong (a crew unpaid, a boat short-handed or battered, a clerk who might run).
- **News of your affairs**: what your boats, cargoes, traders and partnerships came to, kept apart from the news of the world. It comes as **its own notice** (gilt-edged, it stays longer; click it for the ledger), is kept in the News under **Yours** (The world shows the rest), and in the Journal under **Your affairs**. A mark on the Estate tab counts what you haven't looked at.
- **The month's accounts**: at each month's turn, a statement. What came in and went out at the turn (with what was expected beside it), what came by luck, and what you spent and took in during the month, by what it was (boats, your people, buying and selling, events, letters...). The last ${STATEMENTS_KEPT} months are kept; the newest is open.

## Your acres
Estate › House & land: the acres you own **in each province**, with a subtotal for each, and **all told**. Land let to tenants counts its lots of ten; a farm of your own counts ${FARM_ACRES[1]} acres as a freehold, ${FARM_ACRES[2]} once grown, ${FARM_ACRES[3]} as a plantation.

## Two things put right
- A business of your own is paid the takings its budget promised. (Until now it was always paid as if you'd been away from it.)
- A clerk's skill turns a trip towards a rich one, and a war against it. (It used to run the other way: the better the clerk, the likelier the stake was lost.)

> Tip: Before you put a boat to work, open **Risk and reward of each kind of work**: a sloop that fishes steadily may make more, after her crew, than one sent whaling in the wrong waters. A clerk pays when the stake is big enough to cover their wages: compare "a month after wages" for 25 and for 50.

! Pitfall: Luck evens out over months, not in one. Count on the "for certain" figure, and treat the rest as what it is.`,
  glossary: [
    [
      "The month's figure",
      "What a month comes to, all told: everything that comes and goes each month, with what runs on luck counted as what's expected.",
      "ledger",
    ],
    [
      "By luck",
      "Money that depends on chance (a voyage, a cargo, a dividend, the rents): shown as what's expected, with the worst and the best.",
      "ledger",
    ],
    [
      "Out working",
      "Everything of yours away earning: boats, cargoes, shares, traders, partnerships, a company, a newspaper.",
      "ledger",
    ],
    [
      "The month's accounts",
      "A statement at each month's turn of every coin that came in and went out, line by line (Estate › Ledger).",
      "ledger",
    ],
  ],
};

/** For the boats chapter: what each kind of work brings, from the engine's table. */
export { boatWorkTable };
